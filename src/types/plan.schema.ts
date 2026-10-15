import { z } from 'zod';

export const SharedContractSchema = z.object({
  contractName: z.string().describe('Unique name of the interface or REST/event contract'),
  description: z.string().describe('Purpose and usage notes for this shared contract'),
  schemaDefinition: z.string().describe('Exact TypeScript interface or JSON schema contract'),
  producerService: z.string().describe('The primary service producing or exposing this contract'),
  consumerServices: z.array(z.string()).describe('List of services consuming this contract'),
});

export type SharedContract = z.infer<typeof SharedContractSchema>;

export const AffectedServiceSchema = z.object({
  serviceId: z.string().describe('Identifier of the affected service (e.g. auth-service)'),
  servicePath: z.string().describe('Relative path to the service folder in the repo (e.g. services/auth-service)'),
  impactReason: z.string().describe('Explanation of why this service needs modifications'),
  executionWave: z.number().int().describe('Wave index (0 for core/shared packages, 1 for services, etc.)'),
  developerTasks: z.array(z.string()).describe('Step-by-step implementation tasks for the developer agent'),
  testerScenarios: z.array(z.string()).describe('Specific test cases and verification requirements for the tester agent'),
  acceptanceCriteria: z.array(z.string()).describe('Strict criteria that must be verified and passing before completion'),
});

export type AffectedService = z.infer<typeof AffectedServiceSchema>;

export const ExecutionPlanSchema = z.object({
  goalSummary: z.string().describe('High-level executive summary of the changes to be implemented'),
  architecturalNotes: z.string().describe('Detailed architectural design decisions and cross-service sync strategy'),
  sharedContracts: z.array(SharedContractSchema).describe('Locked shared API/type contracts across services'),
  affectedServices: z.array(AffectedServiceSchema).describe('List of affected services with their sub-plans'),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

export interface RepoTopology {
  rootPath: string;
  isMonorepo: boolean;
  services: ServiceMetadata[];
  packages: ServiceMetadata[];
  sharedFiles: string[];
}

export interface ServiceMetadata {
  id: string;
  name: string;
  relPath: string;
  absPath: string;
  packageJson?: {
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  hasTests: boolean;
  testScript?: string;
  buildScript?: string;
  typecheckScript?: string;
  entrypoints: string[];
  fileTree: string[];
}
