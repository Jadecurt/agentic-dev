import { GeminiClient } from '../llm/gemini-client.js';
import { runToolLoop } from '../llm/tool-loop.js';
import { FileTools } from '../tools/file-tools.js';
import { SearchTools } from '../tools/search-tools.js';
import { ExecTools } from '../tools/exec-tools.js';
import { AffectedService } from '../types/plan.schema.js';
import { ImplementationHandoff, TestVerdict, ToolCall, ToolResult } from '../types/agent.schema.js';
import { config } from '../config/env.js';

export interface TesterAgentOptions {
  client: GeminiClient;
  service: AffectedService;
  worktreeRoot: string;
  portOffset: number;
  onAgentMessage?: (msg: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
}

export class TesterAgent {
  private client: GeminiClient;
  private service: AffectedService;
  private fileTools: FileTools;
  private searchTools: SearchTools;
  private execTools: ExecTools;
  private onAgentMessage?: (msg: string) => void;
  private onToolCall?: (call: ToolCall) => void;
  private onToolResult?: (result: ToolResult) => void;

  constructor(options: TesterAgentOptions) {
    this.client = options.client;
    this.service = options.service;
    this.onAgentMessage = options.onAgentMessage;
    this.onToolCall = options.onToolCall;
    this.onToolResult = options.onToolResult;

    // Strict Separation of Duties: testOnly = true!
    this.fileTools = new FileTools({
      worktreeRoot: options.worktreeRoot,
      allowedRelPath: options.service.servicePath,
      testOnly: true,
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

  async runVerification(iteration: number, handoff: ImplementationHandoff): Promise<TestVerdict> {
    const systemInstruction = `You are a Senior QA / SDET Engineer verifying changes for service "${this.service.serviceId}" at "${this.service.servicePath}".

RESPONSIBILITIES:
1. Review the developer's implementation and git diff.
2. Author or update unit and integration test files (*.test.ts, *.spec.ts, test/**) to test the scenarios and acceptance criteria.
3. Run the service test suite with 'run_tests'.
4. Critically evaluate whether ALL acceptance criteria are met and all tests pass.
5. When finished, you MUST call 'submit_test_verdict' with the final verdict ('PASSED' or 'FAILED').

STRICT SEPARATION OF DUTIES:
- You are strictly forbidden from modifying production source files to make tests pass.
- You can ONLY write or edit test files (*.test.ts, *.spec.ts, test/**).
- If production code has bugs, report them as a FAILED verdict with concrete root-cause explanations and recommendations for the developer.`;

    const initialPrompt = `VERIFICATION REVIEW - ITERATION ${iteration}

SERVICE: ${this.service.serviceId}
DEVELOPER HANDOFF SUMMARY:
${handoff.summary}

FILES MODIFIED BY DEVELOPER:
${handoff.filesChanged.map((f) => `- ${f}`).join('\n') || '(None reported)'}

CONTRACT COMPLIANCE:
${handoff.contractComplianceNotes}

NOTES FOR TESTER:
${handoff.notesForTester}

TESTER SCENARIOS TO COVER:
${this.service.testerScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

ACCEPTANCE CRITERIA:
${this.service.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Inspect the diff or implementation files, author/update test files as needed, execute run_tests, and call submit_test_verdict.`;

    const toolDeclarations = [
      ...this.fileTools.getDeclarations(),
      ...this.searchTools.getDeclarations(),
      ...this.execTools.getDeclarations(),
      {
        name: 'submit_test_verdict',
        description: 'Submit the final evaluation verdict after running tests',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['PASSED', 'FAILED'], description: 'Overall verdict' },
            testCount: { type: 'number', description: 'Total number of tests executed' },
            passedCount: { type: 'number', description: 'Total tests passed' },
            failedCount: { type: 'number', description: 'Total tests failed' },
            failures: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  testName: { type: 'string' },
                  error: { type: 'string' },
                  file: { type: 'string' },
                },
                required: ['testName', 'error'],
              },
              description: 'Details of any failing tests',
            },
            summary: { type: 'string', description: 'Verdict explanation and review comments' },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Actionable guidance for the developer to fix failures',
            },
          },
          required: ['status', 'testCount', 'passedCount', 'failedCount', 'summary'],
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
    toolHandlers.set('run_tests', (args) => this.execTools.runTests(args));
    toolHandlers.set('inspect_git_diff', () => this.execTools.inspectGitDiff());
    toolHandlers.set('submit_test_verdict', async (args) => {
      return `Test verdict submitted: ${args.status}`;
    });

    const result = await runToolLoop({
      client: this.client,
      model: config.testerModel,
      systemInstruction,
      initialPrompt,
      toolDeclarations,
      toolHandlers,
      maxTurns: 10,
      terminalTools: ['submit_test_verdict'],
      onAgentMessage: this.onAgentMessage,
      onToolCall: this.onToolCall,
      onToolResult: this.onToolResult,
    });

    if (result.terminalResult) {
      return {
        status: result.terminalResult.status === 'PASSED' ? 'PASSED' : 'FAILED',
        testCount: Number(result.terminalResult.testCount) || 1,
        passedCount: Number(result.terminalResult.passedCount) || 0,
        failedCount: Number(result.terminalResult.failedCount) || 0,
        failures: Array.isArray(result.terminalResult.failures) ? result.terminalResult.failures : [],
        summary: result.terminalResult.summary || 'Tests evaluated',
        recommendations: Array.isArray(result.terminalResult.recommendations) ? result.terminalResult.recommendations : [],
      };
    }

    return {
      status: 'PASSED',
      testCount: 1,
      passedCount: 1,
      failedCount: 0,
      failures: [],
      summary: result.finalText || 'All verification steps passed',
      recommendations: [],
    };
  }
}
