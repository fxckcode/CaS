import { Injectable } from '@nestjs/common';
import { Plan } from '../shared/types';

/**
 * In-memory store for Plans, keyed by goalId.
 * Populated by OrchestratorService after each planning cycle.
 */
@Injectable()
export class PlanStore {
  private readonly store = new Map<string, Plan>();

  set(plan: Plan): void {
    this.store.set(plan.goalId, plan);
  }

  getByGoalId(goalId: string): Plan | undefined {
    return this.store.get(goalId);
  }

  list(): Plan[] {
    return Array.from(this.store.values());
  }

  delete(goalId: string): boolean {
    return this.store.delete(goalId);
  }
}
