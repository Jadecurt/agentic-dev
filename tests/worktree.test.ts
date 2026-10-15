import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { WorktreeManager } from '../src/workspace/worktree-manager.js';

describe('WorktreeManager', () => {
  const repoPath = path.resolve('examples/demo-monorepo');
  const manager = new WorktreeManager(repoPath);
  const testRunId = `test_run_${Date.now()}`;

  afterAll(async () => {
    await manager.cleanup(testRunId);
  });

  it('initializes git environment in target directory if needed', async () => {
    await manager.initialize();
    const integrationBranch = await manager.setupIntegrationBranch(testRunId);
    expect(integrationBranch).toBe(`agent-run/${testRunId}/integration`);
  });

  it('provisions isolated worktree directory for a service', async () => {
    const info = await manager.createServiceWorktree(testRunId, 'auth-service', 'services/auth-service');
    expect(info.serviceId).toBe('auth-service');
    expect(fs.existsSync(info.worktreePath)).toBe(true);

    const diff = await manager.inspectDiff('auth-service');
    expect(typeof diff).toBe('string');
  });

  it('cleans up worktree directory after run', async () => {
    await manager.cleanup(testRunId);
    const worktreeDir = path.join(repoPath, '.worktrees', testRunId);
    expect(fs.existsSync(worktreeDir)).toBe(false);
  });
});
