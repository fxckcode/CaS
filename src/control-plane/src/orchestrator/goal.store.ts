import { Injectable } from '@nestjs/common';
import { Goal } from '../shared/types';

@Injectable()
export class GoalStore {
  private store = new Map<string, Goal>();

  create(goal: Goal): Goal {
    this.store.set(goal.id, goal);
    return goal;
  }

  get(id: string): Goal | undefined {
    return this.store.get(id);
  }

  update(id: string, updates: Partial<Goal>): Goal {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`Goal ${id} not found`);
    }
    const updated = Object.assign(existing, updates, { updatedAt: new Date() });
    this.store.set(id, updated);
    return updated;
  }

  list(): Goal[] {
    return Array.from(this.store.values());
  }
}
