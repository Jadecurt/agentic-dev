import { GeminiClient } from '../llm/gemini-client.js';
import { ExecutionPlan, ExecutionPlanSchema, RepoTopology } from '../types/plan.schema.js';
import { config } from '../config/env.js';

export class PlannerAgent {
  private client: GeminiClient;

  constructor(client: GeminiClient) {
    this.client = client;
  }

  async createPlan(userPrompt: string, topology: RepoTopology): Promise<ExecutionPlan> {
    const topologySummary = this.formatTopologySummary(topology);

    const systemInstruction = `You are an elite Principal Software Architect orchestrating changes across a multi-service monorepo.
Your job is to analyze a feature request or bugfix prompt and the repository topology, and produce a rigorous ExecutionPlan.

Key Architectural Principles:
1. CONTRACT-FIRST SYNCHRONIZATION:
   - Identify cross-service interactions and define 'sharedContracts' upfront with EXACT TypeScript interfaces or API schemas.
   - Identify which service produces the contract and which services consume it.
2. WAVE-BASED EXECUTION:
   - Assign executionWave (Wave 0 for shared packages or foundational libraries, Wave 1 for independent services, Wave 2 for downstream consumers).
3. GRANULAR ACCEPTANCE CRITERIA:
   - Provide concrete, testable acceptance criteria and tester scenarios for each affected service.
4. ISOLATION:
   - Limit developerTasks strictly to the affected service directory.`;

    const prompt = `FEATURE / BUGFIX REQUEST:
"${userPrompt}"

REPOSITORY TOPOLOGY:
${topologySummary}

Produce an ExecutionPlan conforming strictly to the requested schema.`;

    const plan = await this.client.generateStructured<ExecutionPlan>({
      model: config.plannerModel,
      prompt,
      systemInstruction,
      schema: ExecutionPlanSchema,
      schemaName: 'ExecutionPlan',
    });

    return plan;
  }

  private formatTopologySummary(topology: RepoTopology): string {
    const lines: string[] = [];
    lines.push(`Monorepo: ${topology.isMonorepo ? 'Yes' : 'No (Single project)'}`);
    lines.push(`Shared root files: ${topology.sharedFiles.join(', ')}`);
    lines.push('');

    if (topology.packages.length > 0) {
      lines.push('--- Shared Packages ---');
      for (const pkg of topology.packages) {
        lines.push(`- Package: ${pkg.name} (${pkg.relPath})`);
        lines.push(`  Entrypoints: ${pkg.entrypoints.join(', ') || 'none'}`);
        lines.push(`  Key Files: ${pkg.fileTree.slice(0, 8).join(', ')}`);
      }
      lines.push('');
    }

    lines.push('--- Discovered Services ---');
    for (const svc of topology.services) {
      lines.push(`- Service ID: ${svc.id} (${svc.relPath})`);
      lines.push(`  Package Name: ${svc.name}`);
      lines.push(`  Has Tests: ${svc.hasTests}`);
      lines.push(`  Scripts: ${JSON.stringify(svc.packageJson?.scripts || {})}`);
      lines.push(`  Entrypoints: ${svc.entrypoints.join(', ') || 'none'}`);
      lines.push(`  Files (${svc.fileTree.length} total): ${svc.fileTree.slice(0, 10).join(', ')}`);
    }

    return lines.join('\n');
  }
}
