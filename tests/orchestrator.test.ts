import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { globalEventBus } from '../src/orchestrator/event-bus.js';
import { OrchestratorEvent } from '../src/types/events.schema.js';

describe('Orchestrator End-to-End Workflow', () => {
  it('indexes monorepo, generates plan, provisions pods, and integrates successfully', async () => {
    const demoRepo = path.resolve('examples/demo-monorepo');
    const capturedEvents: OrchestratorEvent[] = [];

    const unsubscribe = globalEventBus.subscribe((evt) => {
      capturedEvents.push(evt);
    });

    const orchestrator = new Orchestrator();
    const result = await orchestrator.run({
      userPrompt: 'Add token expiration verification to auth-service and update gateway middleware to validate expiry',
      repoPath: demoRepo,
      autoApprove: true,
    });

    unsubscribe();

    expect(result.success).toBe(true);
    expect(result.podResults.length).toBeGreaterThan(0);
    expect(result.podResults.every((p) => p.success)).toBe(true);

    const eventTypes = capturedEvents.map((e) => e.type);
    expect(eventTypes).toContain('RUN_STARTED');
    expect(eventTypes).toContain('INDEX_COMPLETED');
    expect(eventTypes).toContain('PLAN_GENERATED');
    expect(eventTypes).toContain('PLAN_APPROVED');
    expect(eventTypes).toContain('POD_INITIALIZED');
    expect(eventTypes).toContain('RUN_COMPLETED');
  }, 45000);
});
