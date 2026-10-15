import { GeminiClient } from '../llm/gemini-client.js';
import { DeveloperAgent } from '../agents/developer.agent.js';
import { TesterAgent } from '../agents/tester.agent.js';
import { AffectedService, SharedContract } from '../types/plan.schema.js';
import { PodStatus, PodIterationRecord, TestVerdict, ImplementationHandoff } from '../types/agent.schema.js';
import { EventBus } from './event-bus.js';
import { WorktreeManager } from '../workspace/worktree-manager.js';
import { config } from '../config/env.js';

export interface ServicePodOptions {
  runId: string;
  service: AffectedService;
  sharedContracts: SharedContract[];
  worktreeRoot: string;
  portOffset: number;
  eventBus: EventBus;
  worktreeManager: WorktreeManager;
  client: GeminiClient;
  maxIterations?: number;
}

export interface ServicePodResult {
  serviceId: string;
  success: boolean;
  totalIterations: number;
  handoffs: ImplementationHandoff[];
  verdicts: TestVerdict[];
  error?: string;
}

export class ServicePod {
  public readonly serviceId: string;
  private runId: string;
  private service: AffectedService;
  private eventBus: EventBus;
  private worktreeManager: WorktreeManager;
  private maxIterations: number;
  private status: PodStatus = 'IDLE';

  private developer: DeveloperAgent;
  private tester: TesterAgent;

  constructor(options: ServicePodOptions) {
    this.runId = options.runId;
    this.service = options.service;
    this.serviceId = options.service.serviceId;
    this.eventBus = options.eventBus;
    this.worktreeManager = options.worktreeManager;
    this.maxIterations = options.maxIterations || config.maxPodIterations;

    const emitAgentMsg = (role: 'developer' | 'tester', content: string) => {
      this.eventBus.emit({
        runId: this.runId,
        timestamp: new Date().toISOString(),
        type: 'AGENT_MESSAGE',
        serviceId: this.serviceId,
        agentRole: role,
        content,
      });
    };

    const emitToolCall = (role: 'developer' | 'tester', call: any) => {
      this.eventBus.emit({
        runId: this.runId,
        timestamp: new Date().toISOString(),
        type: 'TOOL_CALLED',
        serviceId: this.serviceId,
        agentRole: role,
        toolCall: call,
      });
    };

    const emitToolResult = (role: 'developer' | 'tester', result: any) => {
      this.eventBus.emit({
        runId: this.runId,
        timestamp: new Date().toISOString(),
        type: 'TOOL_RESULT',
        serviceId: this.serviceId,
        agentRole: role,
        toolResult: result,
      });
    };

    this.developer = new DeveloperAgent({
      client: options.client,
      service: options.service,
      sharedContracts: options.sharedContracts,
      worktreeRoot: options.worktreeRoot,
      portOffset: options.portOffset,
      onAgentMessage: (msg) => emitAgentMsg('developer', msg),
      onToolCall: (call) => emitToolCall('developer', call),
      onToolResult: (res) => emitToolResult('developer', res),
    });

    this.tester = new TesterAgent({
      client: options.client,
      service: options.service,
      worktreeRoot: options.worktreeRoot,
      portOffset: options.portOffset,
      onAgentMessage: (msg) => emitAgentMsg('tester', msg),
      onToolCall: (call) => emitToolCall('tester', call),
      onToolResult: (res) => emitToolResult('tester', res),
    });
  }

  private setStatus(status: PodStatus, iteration: number, message?: string) {
    this.status = status;
    this.eventBus.emit({
      runId: this.runId,
      timestamp: new Date().toISOString(),
      type: 'POD_STATUS_CHANGED',
      serviceId: this.serviceId,
      status,
      iteration,
      message,
    });
  }

  async run(): Promise<ServicePodResult> {
    const handoffs: ImplementationHandoff[] = [];
    const verdicts: TestVerdict[] = [];
    let currentVerdict: TestVerdict | undefined;

    this.setStatus('STARTING', 0, `Initializing Pod for ${this.serviceId}`);

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      // 1. Developer Phase
      const devStatus: PodStatus = iteration === 1 ? 'DEVELOPING' : 'FIXING';
      this.setStatus(devStatus, iteration, `Developer implementing tasks (Iteration ${iteration}/${this.maxIterations})`);

      let handoff: ImplementationHandoff;
      try {
        handoff = await this.developer.runImplementation(iteration, currentVerdict);
        handoffs.push(handoff);

        this.eventBus.emit({
          runId: this.runId,
          timestamp: new Date().toISOString(),
          type: 'HANDOFF_PRODUCED',
          serviceId: this.serviceId,
          iteration,
          handoff,
        });
      } catch (err: any) {
        const errorMsg = `Developer agent error: ${err.message || String(err)}`;
        this.setStatus('FAILED', iteration, errorMsg);
        this.eventBus.emit({
          runId: this.runId,
          timestamp: new Date().toISOString(),
          type: 'POD_COMPLETED',
          serviceId: this.serviceId,
          success: false,
          totalIterations: iteration,
          error: errorMsg,
        });
        return { serviceId: this.serviceId, success: false, totalIterations: iteration, handoffs, verdicts, error: errorMsg };
      }

      // 2. Tester Phase
      this.setStatus('TESTING', iteration, `Tester verifying implementation against acceptance criteria (Iteration ${iteration})`);

      try {
        currentVerdict = await this.tester.runVerification(iteration, handoff);
        verdicts.push(currentVerdict);

        this.eventBus.emit({
          runId: this.runId,
          timestamp: new Date().toISOString(),
          type: 'TEST_VERDICT',
          serviceId: this.serviceId,
          iteration,
          verdict: currentVerdict,
        });
      } catch (err: any) {
        const errorMsg = `Tester agent error: ${err.message || String(err)}`;
        this.setStatus('FAILED', iteration, errorMsg);
        this.eventBus.emit({
          runId: this.runId,
          timestamp: new Date().toISOString(),
          type: 'POD_COMPLETED',
          serviceId: this.serviceId,
          success: false,
          totalIterations: iteration,
          error: errorMsg,
        });
        return { serviceId: this.serviceId, success: false, totalIterations: iteration, handoffs, verdicts, error: errorMsg };
      }

      // Check verdict outcome
      if (currentVerdict.status === 'PASSED') {
        // Commit changes to worktree branch
        await this.worktreeManager.commitWorktree(
          this.serviceId,
          `feat(${this.serviceId}): pass acceptance criteria (Iteration ${iteration})`
        );

        this.setStatus('PASSED', iteration, `Service ${this.serviceId} successfully passed all tests!`);
        this.eventBus.emit({
          runId: this.runId,
          timestamp: new Date().toISOString(),
          type: 'POD_COMPLETED',
          serviceId: this.serviceId,
          success: true,
          totalIterations: iteration,
        });

        return {
          serviceId: this.serviceId,
          success: true,
          totalIterations: iteration,
          handoffs,
          verdicts,
        };
      }

      // If failed and still have iterations left, continue loop
      if (iteration < this.maxIterations) {
        this.setStatus('FIXING', iteration, `Test failures detected. Triggering fix cycle ${iteration + 1}...`);
      }
    }

    // Exhausted iterations without passing
    const finalErr = `Exhausted ${this.maxIterations} iterations without passing all test criteria.`;
    this.setStatus('FAILED', this.maxIterations, finalErr);
    this.eventBus.emit({
      runId: this.runId,
      timestamp: new Date().toISOString(),
      type: 'POD_COMPLETED',
      serviceId: this.serviceId,
      success: false,
      totalIterations: this.maxIterations,
      error: finalErr,
    });

    return {
      serviceId: this.serviceId,
      success: false,
      totalIterations: this.maxIterations,
      handoffs,
      verdicts,
      error: finalErr,
    };
  }
}
