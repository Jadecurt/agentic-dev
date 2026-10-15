import { GeminiClient } from './gemini-client.js';
import { ToolCall, ToolResult } from '../types/agent.schema.js';

export interface ToolLoopOptions {
  client: GeminiClient;
  model: string;
  systemInstruction: string;
  initialPrompt: string;
  toolDeclarations: any[];
  toolHandlers: Map<string, (args: any) => Promise<string>>;
  maxTurns?: number;
  terminalTools?: string[];
  onAgentMessage?: (message: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
}

export interface ToolLoopResult {
  turnsExecuted: number;
  finalText?: string;
  terminalResult?: any;
  history: any[];
}

export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    client,
    model,
    systemInstruction,
    initialPrompt,
    toolDeclarations,
    toolHandlers,
    maxTurns = 15,
    terminalTools = [],
    onAgentMessage,
    onToolCall,
    onToolResult,
  } = options;

  const contents: any[] = [
    {
      role: 'user',
      parts: [{ text: initialPrompt }],
    },
  ];

  let turnsExecuted = 0;
  let terminalResult: any = null;
  let finalText: string | undefined;

  while (turnsExecuted < maxTurns) {
    turnsExecuted++;

    const turn = await client.generateTurn({
      model,
      contents,
      systemInstruction,
      tools: toolDeclarations.length > 0 ? toolDeclarations : undefined,
    });

    // Build the assistant parts
    const assistantParts: any[] = [];
    if (turn.text) {
      assistantParts.push({ text: turn.text });
      finalText = turn.text;
      onAgentMessage?.(turn.text);
    }

    if (turn.functionCalls && turn.functionCalls.length > 0) {
      for (const fc of turn.functionCalls) {
        assistantParts.push({
          functionCall: {
            id: fc.id,
            name: fc.name,
            args: fc.args,
          },
        });
      }
    }

    if (assistantParts.length > 0) {
      contents.push({
        role: 'model',
        parts: assistantParts,
      });
    }

    // If no function calls were made, model completed its turn
    if (!turn.functionCalls || turn.functionCalls.length === 0) {
      break;
    }

    // Execute function calls
    const responseParts: any[] = [];
    let shouldTerminate = false;

    for (const fc of turn.functionCalls) {
      const toolCall: ToolCall = {
        id: fc.id || `call_${Date.now()}`,
        name: fc.name,
        args: fc.args,
      };

      onToolCall?.(toolCall);

      // Check if it's a terminal submission tool
      if (terminalTools.includes(fc.name)) {
        terminalResult = fc.args;
        shouldTerminate = true;
      }

      let outputStr = '';
      let isError = false;

      const handler = toolHandlers.get(fc.name);
      if (!handler) {
        outputStr = `Error: Tool '${fc.name}' is not recognized or not available in this context.`;
        isError = true;
      } else {
        try {
          outputStr = await handler(fc.args);
        } catch (err: any) {
          outputStr = `Tool execution error: ${err?.message || String(err)}`;
          isError = true;
        }
      }

      const toolResult: ToolResult = {
        toolCallId: toolCall.id,
        name: fc.name,
        output: outputStr,
        isError,
      };

      onToolResult?.(toolResult);

      responseParts.push({
        functionResponse: {
          id: toolCall.id,
          name: fc.name,
          response: {
            output: outputStr,
            isError,
          },
        },
      });
    }

    contents.push({
      role: 'user',
      parts: responseParts,
    });

    if (shouldTerminate) {
      break;
    }
  }

  return {
    turnsExecuted,
    finalText,
    terminalResult,
    history: contents,
  };
}
