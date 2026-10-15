import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ServiceIndexer } from '../src/workspace/service-indexer.js';

describe('ServiceIndexer', () => {
  it('correctly discovers monorepo services and packages in demo-monorepo', async () => {
    const demoPath = path.resolve('examples/demo-monorepo');
    const topology = await ServiceIndexer.indexWorkspace(demoPath);

    expect(topology.isMonorepo).toBe(true);
    expect(topology.services.length).toBe(3);

    const serviceIds = topology.services.map((s) => s.id);
    expect(serviceIds).toContain('auth-service');
    expect(serviceIds).toContain('billing-service');
    expect(serviceIds).toContain('gateway-service');

    const authSvc = topology.services.find((s) => s.id === 'auth-service');
    expect(authSvc?.hasTests).toBe(true);
    expect(authSvc?.packageJson?.scripts?.test).toBe('vitest run');

    expect(topology.packages.length).toBe(1);
    expect(topology.packages[0].name).toBe('@demo/shared-types');
  });
});
