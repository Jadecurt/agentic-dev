import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { ServiceIndexer } from '../workspace/service-indexer.js';
import { globalEventBus } from '../orchestrator/event-bus.js';
import { ExecutionPlan } from '../types/plan.schema.js';

interface StartRunBody {
  userPrompt: string;
  repoPath?: string;
  autoApprove?: boolean;
}

// In-memory run tracking & pending approvals
const activeRuns = new Map<string, {
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  plan?: ExecutionPlan;
  approveResolver?: (approved: boolean) => void;
}>();

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const orchestrator = new Orchestrator();

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Preview monorepo topology
  app.get('/api/topology', async (request: FastifyRequest<{ Querystring: { repo?: string } }>, reply: FastifyReply) => {
    const repoPath = request.query.repo || process.cwd();
    try {
      const topology = await ServiceIndexer.indexWorkspace(repoPath);
      return topology;
    } catch (err: any) {
      reply.status(400);
      return { error: err.message || 'Failed to index workspace' };
    }
  });

  // Start a new orchestrator run
  app.post('/api/runs', async (request: FastifyRequest<{ Body: StartRunBody }>, reply: FastifyReply) => {
    const { userPrompt, repoPath = process.cwd(), autoApprove = true } = request.body || {};

    if (!userPrompt || typeof userPrompt !== 'string') {
      reply.status(400);
      return { error: 'userPrompt is required' };
    }

    // Run asynchronously so response returns immediately with runId
    let runIdPromiseResolve: (id: string) => void;
    const runIdPromise = new Promise<string>((res) => {
      runIdPromiseResolve = res;
    });

    const unsubscribe = globalEventBus.subscribe((evt) => {
      if (evt.type === 'RUN_STARTED') {
        runIdPromiseResolve(evt.runId);
        unsubscribe();
      }
    });

    // Launch orchestrator in background
    (async () => {
      try {
        await orchestrator.run({
          userPrompt,
          repoPath,
          autoApprove,
          onPlanApprovalRequired: async (plan) => {
            const currentRunId = await runIdPromise;
            return new Promise<boolean>((resolve) => {
              activeRuns.set(currentRunId, {
                status: 'PENDING',
                plan,
                approveResolver: resolve,
              });
            });
          },
        });
      } catch (err) {
        console.error('Run execution error:', err);
      }
    })();

    const runId = await runIdPromise;
    activeRuns.set(runId, { status: 'RUNNING' });

    return {
      runId,
      status: 'STARTED',
      message: 'Run initiated successfully',
    };
  });

  // Approve a pending plan
  app.post('/api/runs/:id/approve', async (request: FastifyRequest<{ Params: { id: string }; Body: { approved: boolean } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const approved = request.body?.approved ?? true;

    const record = activeRuns.get(id);
    if (!record || !record.approveResolver) {
      reply.status(404);
      return { error: `No pending approval found for run ${id}` };
    }

    record.approveResolver(approved);
    activeRuns.delete(id);
    return { runId: id, approved, message: 'Approval processed' };
  });

  // Get historical events for a run
  app.get('/api/runs/:id/events', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    const { id } = request.params;
    const events = globalEventBus.getEventsForRun(id);
    return { runId: id, events };
  });

  // WebSocket endpoint for real-time event streaming
  app.get('/ws/events', { websocket: true }, (socket, req) => {
    // Send existing history first
    const history = globalEventBus.getAllEvents();
    for (const evt of history.slice(-50)) {
      socket.send(JSON.stringify(evt));
    }

    const unsubscribe = globalEventBus.subscribe((evt) => {
      try {
        socket.send(JSON.stringify(evt));
      } catch {
        // ignore closed socket errors
      }
    });

    socket.on('close', () => {
      unsubscribe();
    });
  });
}
