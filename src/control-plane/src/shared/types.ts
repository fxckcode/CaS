// Core domain types for CaS Control Plane

export type GoalStatus =
  | 'PENDING'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AutonomyMode = 'consultative' | 'semi-autonomous' | 'autonomous';

export type PolicyDecision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export type RunnerType = 'shell' | 'cicd' | 'data';

export type MemoryItemType = 'decision' | 'convention' | 'artifact';

export type MemorySource = 'goal' | 'plan' | 'job' | 'manual';

// --- Goal ---
export class Goal {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly autonomyMode: AutonomyMode,
    public status: GoalStatus = 'PENDING',
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    public readonly channelMetadata?: Record<string, unknown>,
  ) {}
}

// --- Plan (DAG of tasks) ---
export class PlanStep {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly toolId: string,
    public readonly parameters: Record<string, unknown>,
    public readonly dependencies: string[] = [],
    public status: 'pending' | 'in_progress' | 'completed' | 'failed' = 'pending',
  ) {}
}

export class Plan {
  constructor(
    public readonly id: string,
    public readonly goalId: string,
    public readonly steps: PlanStep[],
    public readonly reasoning: string,
    public readonly createdAt: Date = new Date(),
  ) {}
}

// --- Tool ---
export class ToolParameter {
  constructor(
    public readonly name: string,
    public readonly type: string,
    public readonly required: boolean,
    public readonly description?: string,
  ) {}
}

export class ToolSecurity {
  constructor(
    public readonly network: 'none' | 'outbound-only' | 'full' = 'outbound-only',
    public readonly cpu?: string,
    public readonly memory?: string,
    public readonly timeout?: number,
  ) {}
}

export class ToolDescriptor {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly version: string,
    public readonly domain: string,
    public readonly runner: RunnerType,
    public readonly description: string,
    public readonly parameters: ToolParameter[],
    public readonly security: ToolSecurity = new ToolSecurity(),
    public readonly entrypoint?: string,
    public readonly image?: string,
  ) {}
}

// --- Policy ---
export class PolicyInput {
  constructor(
    public readonly userId: string,
    public readonly role: string,
    public readonly domain: string,
    public readonly tool: ToolDescriptor,
    public readonly environment: string,
    public readonly autonomyMode: AutonomyMode,
    public readonly riskLevel?: 'low' | 'medium' | 'high',
  ) {}
}

export class PolicyResult {
  constructor(
    public readonly decision: PolicyDecision,
    public readonly reason: string,
    public readonly evaluatedAt: Date = new Date(),
  ) {}
}

// --- Job ---
export class Job {
  constructor(
    public readonly id: string,
    public readonly planId: string,
    public readonly stepId: string,
    public readonly toolId: string,
    public readonly parameters: Record<string, unknown>,
    public readonly runnerType: RunnerType,
    public status: 'pending' | 'running' | 'completed' | 'failed' = 'pending',
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    public result?: Record<string, unknown>,
    public error?: string,
  ) {}
}

// --- Memory ---
export class MemoryItem {
  constructor(
    public readonly id: string,
    public readonly orgId: string,
    public readonly projectId: string,
    public readonly summary: string,
    public readonly type: MemoryItemType,
    public readonly source: MemorySource,
    public readonly content?: string,
    public readonly tags: string[] = [],
    public readonly link?: string,
    public readonly createdAt: Date = new Date(),
  ) {}
}

// --- API DTOs ---
export class CreateGoalDto {
  constructor(
    public readonly goal: string,
    public readonly projectId: string,
    public readonly autonomyMode: AutonomyMode = 'semi-autonomous',
    public readonly channelMetadata?: Record<string, unknown>,
  ) {}
}

export class GoalResponseDto {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly status: GoalStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly plan?: Plan,
  ) {}
}

export class ToolListResponseDto {
  constructor(
    public readonly tools: ToolDescriptor[],
    public readonly total: number,
  ) {}
}
