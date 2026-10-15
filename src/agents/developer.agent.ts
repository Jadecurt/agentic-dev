import { GeminiClient } from '../llm/gemini-client.js';
import { runToolLoop } from '../llm/tool-loop.js';
import { FileTools } from '../tools/file-tools.js';
import { SearchTools } from '../tools/search-tools.js';
import { ExecTools } from '../tools/exec-tools.js';
import { AffectedService, SharedContract } from '../types/plan.schema.js';
import { ImplementationHandoff, TestVerdict, ToolCall, ToolResult } from '../types/agent.schema.js';
import { config } from '../config/env.js';

export interface DeveloperAgentOptions {
  client: GeminiClient;
  service: AffectedService;
  sharedContracts: SharedContract[];
  worktreeRoot: string;
  portOffset: number;
  onAgentMessage?: (msg: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
}

export class DeveloperAgent {
  private client: GeminiClient;
  private service: AffectedService;
  private sharedContracts: SharedContract[];
  private fileTools: FileTools;
  private searchTools: SearchTools;
  private execTools: ExecTools;
  private onAgentMessage?: (msg: string) => void;
  private onToolCall?: (call: ToolCall) => void;
  private onToolResult?: (result: ToolResult) => void;

  constructor(options: DeveloperAgentOptions) {
    this.client = options.client;
    this.service = options.service;
    this.sharedContracts = options.sharedContracts;
    this.onAgentMessage = options.onAgentMessage;
    this.onToolCall = options.onToolCall;
    this.onToolResult = options.onToolResult;

    this.fileTools = new FileTools({
      worktreeRoot: options.worktreeRoot,
      allowedRelPath: options.service.servicePath,
      testOnly: false,
    });

    this.searchTools = new SearchTools({
      worktreeRoot: options.worktreeRoot,
      allowedRelPath: options.service.servicePath,
    });

    this.execTools = new ExecTools({
      worktreeRoot: options.worktreeRoot,
      allowedRelPath: options.service.servicePath,
      portOffset: options.portOffset,
    });
  }

  async runImplementation(iteration: number, previousVerdict?: TestVerdict): Promise<ImplementationHandoff> {
    const relevantContracts = this.sharedContracts.filter(
      (c) => c.producerService === this.service.serviceId || c.consumerServices.includes(this.service.serviceId)
    );

    const contractsDoc = relevantContracts.length > 0
      ? relevantContracts
          .map((c) => `### Contract: ${c.contractName} (${c.producerService} -> ${c.consumerServices.join(', ')})\n${c.description}\n\`\`\`typescript\n${c.schemaDefinition}\n\`\`\``)
          .join('\n\n')
      : 'No shared contracts explicitly assigned to this service.';

    const systemInstruction = `You are a Senior TypeScript Software Engineer implementing features for service "${this.service.serviceId}" located at "${this.service.servicePath}".

RESPONSIBILITIES:
1. Implement all assigned developer tasks cleanly and correctly.
2. Comply strictly with all shared contracts (exact interface names, properties, and types).
3. Ensure the service compiles cleanly without type errors using 'run_typecheck' or 'run_build'.
4. When finished, you MUST call 'submit_implementation' with a summary and list of modified files.

STRICT CONSTRAINTS:
- You may only inspect and edit files inside "${this.service.servicePath}".
- Always read existing files before editing to maintain styling and avoid overwriting needed code.`;

    let initialPrompt = `SERVICE IMPLEMENTATION - ITERATION ${iteration}

SERVICE ID: ${this.service.serviceId}
PATH: ${this.service.servicePath}
IMPACT REASON: ${this.service.impactReason}

DEVELOPER TASKS:
${this.service.developerTasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

SHARED CONTRACTS:
${contractsDoc}

ACCEPTANCE CRITERIA:
${this.service.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}
`;

    if (previousVerdict && previousVerdict.status === 'FAILED') {
      initialPrompt += `\n\n--- PREVIOUS TEST FAILURE FEEDBACK ---
The tester reported failures in iteration ${iteration - 1}:
Summary: ${previousVerdict.summary}
Failed Tests (${previousVerdict.failedCount}):
${previousVerdict.failures.map((f) => `- [${f.file || 'unknown'}] ${f.testName}: ${f.error}`).join('\n')}
Recommendations:
${previousVerdict.recommendations.map((r) => `- ${r}`).join('\n')}

Please fix these defects, run typecheck, and call submit_implementation.`;
    } else {
      initialPrompt += '\nPlease inspect existing files, implement the changes, run typecheck, and call submit_implementation.';
    }

    // Assemble tool declarations & handlers
    const toolDeclarations = [
      ...this.fileTools.getDeclarations(),
      ...this.searchTools.getDeclarations(),
      ...this.execTools.getDeclarations(),
      {
        name: 'submit_implementation',
        description: 'Submit your completed changes for review and testing by the tester agent',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Concise summary of implementation changes' },
            filesChanged: {
              type: 'array',
              items: { type: 'string' },
              description: 'Relative paths of all modified or created files',
            },
            contractComplianceNotes: { type: 'string', description: 'How shared contracts were fulfilled' },
            notesForTester: { type: 'string', description: 'Key test scenarios or edge cases to verify' },
          },
          required: ['summary', 'filesChanged', 'contractComplianceNotes', 'notesForTester'],
        },
      },
    ];

    const toolHandlers = new Map<string, (args: any) => Promise<string>>();
    toolHandlers.set('read_file', (args) => this.fileTools.readFile(args));
    toolHandlers.set('write_file', (args) => this.fileTools.writeFile(args));
    toolHandlers.set('edit_file', (args) => this.fileTools.editFile(args));
    toolHandlers.set('list_files', (args) => this.fileTools.listFiles(args));
    toolHandlers.set('grep_search', (args) => this.searchTools.grepSearch(args));
    toolHandlers.set('find_by_name', (args) => this.searchTools.findByName(args));
    toolHandlers.set('run_typecheck', () => this.execTools.runTypecheck());
    toolHandlers.set('run_build', () => this.execTools.runBuild());
    toolHandlers.set('run_tests', (args) => this.execTools.runTests(args));
    toolHandlers.set('inspect_git_diff', () => this.execTools.inspectGitDiff());
    toolHandlers.set('submit_implementation', async (args) => {
      return `Implementation submitted for review: ${args.summary}`;
    });

    const result = await runToolLoop({
      client: this.client,
      model: config.devModel,
      systemInstruction,
      initialPrompt,
      toolDeclarations,
      toolHandlers,
      maxTurns: 12,
      terminalTools: ['submit_implementation'],
      onAgentMessage: this.onAgentMessage,
      onToolCall: this.onToolCall,
      onToolResult: this.onToolResult,
    });

    if (result.terminalResult) {
      return {
        summary: result.terminalResult.summary || 'Implementation completed',
        filesChanged: Array.isArray(result.terminalResult.filesChanged) ? result.terminalResult.filesChanged : [],
        contractComplianceNotes: result.terminalResult.contractComplianceNotes || 'Compliant with contracts',
        notesForTester: result.terminalResult.notesForTester || 'Ready for test verification',
      };
    }

    return {
      summary: result.finalText || 'Changes implemented',
      filesChanged: [],
      contractComplianceNotes: 'Compliant with shared contracts',
      notesForTester: 'Review diff and run tests',
    };
  }
}
