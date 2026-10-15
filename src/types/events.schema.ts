import { z } from 'zod';
import { ExecutionPlan, RepoTopology } from './plan.schema.js';
import { AgentRole, ImplementationHandoff, PodStatus, TestVerdict, ToolCall, ToolResult } from './agent.schema.js';

export type EventType =
  | 'RUN_STARTED'
  | 'INDEX_COMPLETED'
  | 'PLAN_GENERATED'
  | 'PLAN_APPROVED'
  | 'POD_INITIALIZED'
  | 'POD_STATUS_CHANGED'
  | 'AGENT_MESSAGE'
  | 'TOOL_CALLED'
  | 'TOOL_RESULT'
  | 'HANDOFF_PRODUCED'
  | 'TEST_VERDICT'
  | 'POD_COMPLETED'
  | 'INTEGRATION_MERGED'
  | 'RUN_COMPLETED'
  | 'RUN_ERROR';

export interface BaseEvent {
  runId: string;
  timestamp: string;
  type: EventType;
}

export interface RunStartedEvent extends BaseEvent {
  type: 'RUN_STARTED';
  userPrompt: string;
  repoPath: string;
}

export interface IndexCompletedEvent extends BaseEvent {
  type: 'INDEX_COMPLETED';
  topology: RepoTopology;
}

export interface PlanGeneratedEvent extends BaseEvent {
  type: 'PLAN_GENERATED';
  plan: ExecutionPlan;
}

export interface PlanApprovedEvent extends BaseEvent {
  type: 'PLAN_APPROVED';
}

export interface PodInitializedEvent extends BaseEvent {
  type: 'POD_INITIALIZED';
  serviceId: string;
  executionWave: number;
  worktreePath: string;
}

export interface PodStatusChangedEvent extends BaseEvent {
  type: 'POD_STATUS_CHANGED';
  serviceId: string;
  status: PodStatus;
  iteration: number;
  message?: string;
}

export interface AgentMessageEvent extends BaseEvent {
  type: 'AGENT_MESSAGE';
  serviceId?: string;
  agentRole: AgentRole;
  content: string;
}

export interface ToolCalledEvent extends BaseEvent {
  type: 'TOOL_CALLED';
  serviceId?: string;
  agentRole: AgentRole;
  toolCall: ToolCall;
}

export interface ToolResultEvent extends BaseEvent {
  type: 'TOOL_RESULT';
  serviceId?: string;
  agentRole: AgentRole;
  toolResult: ToolResult;
}

export interface HandoffProducedEvent extends BaseEvent {
  type: 'HANDOFF_PRODUCED';
  serviceId: string;
  iteration: number;
  handoff: ImplementationHandoff;
}

export interface TestVerdictEvent extends BaseEvent {
  type: 'TEST_VERDICT';
  serviceId: string;
  iteration: number;
  verdict: TestVerdict;
}

export interface PodCompletedEvent extends BaseEvent {
  type: 'POD_COMPLETED';
  serviceId: string;
  success: boolean;
  totalIterations: number;
  error?: string;
}

export interface IntegrationMergedEvent extends BaseEvent {
  type: 'INTEGRATION_MERGED';
  integrationBranch: string;
  mergedBranches: string[];
}

export interface RunCompletedEvent extends BaseEvent {
  type: 'RUN_COMPLETED';
  success: boolean;
  summary: string;
  error?: string;
}

export interface RunErrorEvent extends BaseEvent {
  type: 'RUN_ERROR';
  error: string;
}

export type OrchestratorEvent =
  | RunStartedEvent
  | IndexCompletedEvent
  | PlanGeneratedEvent
  | PlanApprovedEvent
  | PodInitializedEvent
  | PodStatusChangedEvent
  | AgentMessageEvent
  | ToolCalledEvent
  | ToolResultEvent
  | HandoffProducedEvent
  | TestVerdictEvent
  | PodCompletedEvent
  | IntegrationMergedEvent
  | RunCompletedEvent
  | RunErrorEvent;
