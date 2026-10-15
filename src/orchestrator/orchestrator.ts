import crypto from 'node:crypto';
import { GeminiClient } from '../llm/gemini-client.js';
import { ServiceIndexer } from '../workspace/service-indexer.js';
import { WorktreeManager } from '../workspace/worktree-manager.js';
import { PlannerAgent } from '../agents/planner.agent.js';
import { ServicePod, ServicePodResult } from './service-pod.js';
import { EventBus, globalEventBus } from './event-bus.js';
import { ExecutionPlan } from '../types/plan.schema.js';
import { config } from '../config/env.js';

export interface RunOptions {
  userPrompt: string;
  repoPath: string;
  autoApprove?: boolean;
  onPlanApprovalRequired?: (plan: ExecutionPlan) => Promise<boolean>;
}

export interface RunResult {
  runId: string;
  success: boolean;
  plan?: ExecutionPlan;
  podResults: ServicePodResult[];
  integrationBranch?: string;
  summary: string;
  error?: string;
}

export class Orchestrator {
  private client: GeminiClient;
  private eventBus: EventBus;

  constructor(client?: GeminiClient, eventBus?: EventBus) {
    this.client = client || new GeminiClient();
    this.eventBus = eventBus || globalEventBus;
  }

  async run(options: RunOptions): Promise<RunResult> {
    const runId = `run_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const autoApprove = options.autoApprove ?? config.autoApprovePlan;

    this.eventBus.emit({
      runId,
      timestamp: new Date().toISOString(),
      type: 'RUN_STARTED',
      userPrompt: options.userPrompt,
      repoPath: options.repoPath,
    });

    const worktreeManager = new WorktreeManager(options.repoPath);

    try {
      // Step 1: Initialize Git and Index Repository
      await worktreeManager.initialize();
      const topology = await ServiceIndexer.indexWorkspace(options.repoPath);

      this.eventBus.emit({
        runId,
        timestamp: new Date().toISOString(),
        type: 'INDEX_COMPLETED',
        topology,
      });

      // Step 2: Generate Architectural Plan via Planner Agent
      const planner = new PlannerAgent(this.client);
      const plan = await planner.createPlan(options.userPrompt, topology);

      this.eventBus.emit({
        runId,
        timestamp: new Date().toISOString(),
        type: 'PLAN_GENERATED',
        plan,
      });

      // Step 3: Approval Gate (Human in the Loop or Auto)
      if (!autoApprove && options.onPlanApprovalRequired) {
        const approved = await options.onPlanApprovalRequired(plan);
        if (!approved) {
          const abortMsg = 'Execution plan rejected by user.';
          this.eventBus.emit({
            runId,
            timestamp: new Date().toISOString(),
            type: 'RUN_COMPLETED',
            success: false,
            summary: abortMsg,
          });
          return { runId, success: false, plan, podResults: [], summary: abortMsg };
        }
      }

      this.eventBus.emit({
        runId,
        timestamp: new Date().toISOString(),
        type: 'PLAN_APPROVED',
      });

      // Step 4: Setup Integration Branch
      const integrationBranch = await worktreeManager.setupIntegrationBranch(runId);

      // Step 5: Wave-based Parallel Pod Execution
      const allPodResults: ServicePodResult[] = [];
      const mergedBranches: string[] = [];

      // Group affected services by execution wave
      const wavesMap = new Map<number, typeof plan.affectedServices>();
      for (const svc of plan.affectedServices) {
        const wave = svc.executionWave ?? 1;
        if (!wavesMap.has(wave)) {
          wavesMap.set(wave, []);
        }
        wavesMap.get(wave)!.push(svc);
      }

      const sortedWaves = Array.from(wavesMap.keys()).sort((a, b) => a - b);

      for (const waveIndex of sortedWaves) {
        const servicesInWave = wavesMap.get(waveIndex)!;

        // Provision worktrees and initialize pods in this wave
        const podPromises = servicesInWave.map(async (service, idx) => {
          const worktreeInfo = await worktreeManager.createServiceWorktree(
            runId,
            service.serviceId,
            service.servicePath
          );

          this.eventBus.emit({
            runId,
            timestamp: new Date().toISOString(),
            type: 'POD_INITIALIZED',
            serviceId: service.serviceId,
            executionWave: waveIndex,
            worktreePath: worktreeInfo.worktreePath,
          });

          const pod = new ServicePod({
            runId,
            service,
            sharedContracts: plan.sharedContracts,
            worktreeRoot: worktreeInfo.worktreePath,
            portOffset: waveIndex * 10 + idx,
            eventBus: this.eventBus,
            worktreeManager,
            client: this.client,
          });

          return pod.run();
        });

        // Run all pods in current wave concurrently
        const waveSettled = await Promise.allSettled(podPromises);

        let waveSuccess = true;
        for (const res of waveSettled) {
          if (res.status === 'fulfilled') {
            allPodResults.push(res.value);
            if (!res.value.success) {
              waveSuccess = false;
            } else {
              // Merge into integration branch
              const mergeRes = await worktreeManager.mergeServiceIntoIntegration(runId, res.value.serviceId);
              if (mergeRes.success) {
                mergedBranches.push(`agent-run/${runId}/${res.value.serviceId}`);
              }
            }
          } else {
            waveSuccess = false;
            allPodResults.push({
              serviceId: 'unknown',
              success: false,
              totalIterations: 1,
              handoffs: [],
              verdicts: [],
              error: res.reason?.message || String(res.reason),
            });
          }
        }

        if (!waveSuccess) {
          console.warn(`Wave ${waveIndex} completed with failures. Halting subsequent waves.`);
          break;
        }
      }

      this.eventBus.emit({
        runId,
        timestamp: new Date().toISOString(),
        type: 'INTEGRATION_MERGED',
        integrationBranch,
        mergedBranches,
      });

      // Step 6: Cleanup worktrees
      await worktreeManager.cleanup(runId);

      const overallSuccess = allPodResults.length > 0 && allPodResults.every((r) => r.success);
      const summary = overallSuccess
        ? `Successfully completed all ${allPodResults.length} services across waves. Changes integrated into branch "${integrationBranch}".`
        : `Execution ended with errors in ${allPodResults.filter((r) => !r.success).length} service(s).`;

      this.eventBus.emit({
        runId,
        timestamp: new Date().toISOString(),
        type: 'RUN_COMPLETED',
        success: overallSuccess,
        summary,
      });

      return {
        runId,
        success: overallSuccess,
        plan,
        podResults: allPodResults,
        integrationBranch,
        summary,
      };
    } catch (err: any) {
      const errorMsg = `Orchestrator failure: ${err?.message || String(err)}`;
      this.eventBus.emit({
        runId,
        timestamp: new Date().toISOString(),
        type: 'RUN_ERROR',
        error: errorMsg,
      });

      await worktreeManager.cleanup(runId);
      return {
        runId,
        success: false,
        podResults: [],
        summary: errorMsg,
        error: errorMsg,
      };
    }
  }
}
