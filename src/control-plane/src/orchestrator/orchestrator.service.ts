import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import {
  Goal,
  Plan,
  PlanStep,
  AutonomyMode,
  PolicyInput,
  PolicyDecision,
} from '../shared/types';
import { GoalStore } from './goal.store';
import { PlannerService } from '../planner/planner.service';
import { PolicyEngineService } from '../policy-engine/policy-engine.service';
import { ToolsRegistryService } from '../tools-registry/tools-registry.service';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly goalStore: GoalStore,
    private readonly planner: PlannerService,
    private readonly policyEngine: PolicyEngineService,
    private readonly toolsRegistry: ToolsRegistryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createGoal(dto: {
    goal: string;
    projectId: string;
    autonomyMode?: AutonomyMode;
    userId?: string;
  }): Promise<Goal> {
    const goal = new Goal(
      uuid(),
      dto.goal,
      dto.projectId,
      dto.userId ?? 'anonymous',
      dto.autonomyMode ?? 'semi-autonomous',
      'PENDING',
      new Date(),
      new Date(),
    );

    this.goalStore.create(goal);

    this.logger.log(`Goal created: ${goal.id}`);

    // Emit goal.created event
    this.eventEmitter.emit('goal.created', { goalId: goal.id });

    // Start planning asynchronously (fire and forget)
    this.startPlanning(goal.id).catch((err) => {
      this.logger.error(`Planning failed for goal ${goal.id}: ${err.message}`);
      this.goalStore.update(goal.id, { status: 'FAILED' });
      this.eventEmitter.emit('goal.failed', { goalId: goal.id, error: err.message });
    });

    return goal;
  }

  async startPlanning(goalId: string): Promise<void> {
    const goal = this.goalStore.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    this.logger.log(`Starting planning for goal ${goalId}`);
    this.goalStore.update(goalId, { status: 'PLANNING' });

    // Get all available tools
    const tools = this.toolsRegistry.getTools();

    // Create plan
    const plan = await this.planner.createPlan(goal, tools);

    // Evaluate policies for each step
    let requiresApproval = false;
    let allDenied = true;

    for (const step of plan.steps) {
      const tool = this.toolsRegistry.getTool(step.toolId);
      if (!tool) {
        this.logger.warn(`Tool ${step.toolId} not found for step ${step.id}, skipping policy evaluation`);
        continue;
      }

      const policyInput = new PolicyInput(
        goal.userId,
        'developer', // default role
        'general',   // default domain
        tool,
        goal.projectId,
        goal.autonomyMode,
      );

      const policyResult = this.policyEngine.evaluate(policyInput);

      if (policyResult.decision === 'DENY') {
        step.status = 'failed';
        this.logger.warn(`Step ${step.id}: ${policyResult.reason}`);
        continue;
      }

      allDenied = false;

      if (policyResult.decision === 'REQUIRE_APPROVAL') {
        requiresApproval = true;
        this.logger.log(`Step ${step.id} requires approval: ${policyResult.reason}`);
      }
    }

    if (allDenied || plan.steps.every((s) => s.status === 'failed')) {
      this.goalStore.update(goalId, { status: 'FAILED' });
      this.eventEmitter.emit('goal.planned', { goalId, plan });
      this.eventEmitter.emit('goal.failed', {
        goalId,
        error: 'All steps were denied by policy engine',
      });
      return;
    }

    if (requiresApproval) {
      this.goalStore.update(goalId, { status: 'AWAITING_APPROVAL' });
      this.eventEmitter.emit('goal.approval_required', { goalId, plan });
    } else {
      this.goalStore.update(goalId, { status: 'APPROVED' });
      // Auto-execute if no approval needed
      this.executePlan(goalId, plan).catch((err) => {
        this.logger.error(`Execution failed for goal ${goalId}: ${err.message}`);
      });
    }

    this.eventEmitter.emit('goal.planned', { goalId, plan });
  }

  async executePlan(goalId: string, plan: Plan): Promise<void> {
    const goal = this.goalStore.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    this.logger.log(`Starting execution for goal ${goalId}`);
    this.goalStore.update(goalId, { status: 'IN_PROGRESS' });

    const completed = new Set<string>();
    const failed = new Set<string>();
    const steps = [...plan.steps];

    while (completed.size + failed.size < steps.length) {
      const ready = steps.filter(
        (s) =>
          s.status === 'pending' &&
          (s.dependencies.length === 0 ||
            s.dependencies.every((d) => completed.has(d))),
      );

      if (ready.length === 0 && completed.size + failed.size < steps.length) {
        // Circular dependency or all remaining depend on failed steps
        const stuck = steps.filter((s) => s.status === 'pending');
        for (const s of stuck) {
          s.status = 'failed';
          failed.add(s.id);
        }
        break;
      }

      // Execute ready steps in parallel
      await Promise.all(
        ready.map(async (step) => {
          step.status = 'in_progress';

          const tool = this.toolsRegistry.getTool(step.toolId);

          // Build job
          const jobId = uuid();
          const job = {
            id: jobId,
            planId: plan.id,
            stepId: step.id,
            toolId: step.toolId,
            parameters: step.parameters,
            runnerType: tool?.runner ?? 'shell',
            status: 'pending' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Publish job
          this.eventEmitter.emit('job.published', { goalId, job });

          // Wait for job result via event
          const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
            const onCompleted = (payload: { jobId: string; result?: Record<string, unknown> }) => {
              if (payload.jobId === jobId) {
                this.eventEmitter.off('job.completed', onCompleted);
                this.eventEmitter.off('job.failed', onFailed);
                resolve({ success: true });
              }
            };
            const onFailed = (payload: { jobId: string; error: string }) => {
              if (payload.jobId === jobId) {
                this.eventEmitter.off('job.completed', onCompleted);
                this.eventEmitter.off('job.failed', onFailed);
                resolve({ success: false, error: payload.error });
              }
            };
            this.eventEmitter.on('job.completed', onCompleted);
            this.eventEmitter.on('job.failed', onFailed);
          });

          if (result.success) {
            step.status = 'completed';
            completed.add(step.id);
          } else {
            step.status = 'failed';
            failed.add(step.id);
          }
        }),
      );
    }

    // Determine final status
    if (failed.size > 0 && completed.size === 0) {
      this.goalStore.update(goalId, { status: 'FAILED' });
      this.eventEmitter.emit('goal.failed', { goalId, error: 'All steps failed' });
    } else if (failed.size > 0) {
      // Partial completion — still mark as completed for MVP
      this.goalStore.update(goalId, { status: 'COMPLETED' });
      this.eventEmitter.emit('goal.completed', { goalId, plan, partial: true });
    } else {
      this.goalStore.update(goalId, { status: 'COMPLETED' });
      this.eventEmitter.emit('goal.completed', { goalId, plan });
    }
  }
}
