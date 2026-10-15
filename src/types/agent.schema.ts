import { z } from 'zod';

export type AgentRole = 'planner' | 'developer' | 'tester';

export type PodStatus =
  | 'IDLE'
  | 'STARTING'
  | 'DEVELOPING'
  | 'TESTING'
  | 'FIXING'
  | 'PASSED'
  | 'FAILED';

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.any()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  name: z.string(),
  output: z.string(),
  isError: z.boolean().default(false),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.any()),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ImplementationHandoffSchema = z.object({
  summary: z.string().describe('Summary of the changes implemented'),
  filesChanged: z.array(z.string()).describe('List of files modified or created'),
  contractComplianceNotes: z.string().describe('Explanation of how shared contracts were fulfilled'),
  notesForTester: z.string().describe('Notes for the tester agent highlighting test areas'),
});
export type ImplementationHandoff = z.infer<typeof ImplementationHandoffSchema>;

export const TestFailureSchema = z.object({
  testName: z.string().describe('Name or path of failing test'),
  error: z.string().describe('Failure message or stack trace'),
  file: z.string().optional().describe('Test file where failure occurred'),
});

export const TestVerdictSchema = z.object({
  status: z.enum(['PASSED', 'FAILED']).describe('Overall verdict: PASSED if all criteria met and tests green, else FAILED'),
  testCount: z.number().int().describe('Total number of tests executed'),
  passedCount: z.number().int().describe('Total tests passed'),
  failedCount: z.number().int().describe('Total tests failed'),
  failures: z.array(TestFailureSchema).describe('Details of any failures'),
  summary: z.string().describe('Verdict analysis summary'),
  recommendations: z.array(z.string()).describe('Actionable feedback or bugfix instructions for the developer agent if FAILED'),
});
export type TestVerdict = z.infer<typeof TestVerdictSchema>;

export interface PodIterationRecord {
  iteration: number;
  developerSummary?: string;
  filesChanged?: string[];
  testVerdict?: TestVerdict;
  startedAt: string;
  completedAt?: string;
}
