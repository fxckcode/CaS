import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { Goal, MemoryItem, Plan } from '../shared/types';
import { MemoryStoreService } from './memory-store.service';

@Injectable()
export class MemoryWriterService {
  private readonly logger = new Logger(MemoryWriterService.name);

  constructor(
    private readonly memoryStore: MemoryStoreService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Escuchar 'goal.completed'
    this.eventEmitter.on(
      'goal.completed',
      (payload: { goal: Goal; plan: Plan }) => {
        this.onGoalCompleted(payload.goal, payload.plan).catch((err) => {
          this.logger.error(
            `Failed to write memory for completed goal: ${err.message}`,
          );
        });
      },
    );
  }

  private async onGoalCompleted(goal: Goal, plan: Plan): Promise<void> {
    this.logger.log(`Writing memory for completed goal ${goal.id}`);

    // Crear un MemoryItem resumiendo qué se hizo
    const item = new MemoryItem(
      uuid(),
      goal.projectId,
      goal.id,
      `Goal completed: ${goal.description}`,
      'artifact',
      'goal',
      `Plan: ${plan.reasoning}. Steps: ${plan.steps.length}`,
      ['cas', 'goal-completed', goal.status.toLowerCase()],
    );
    await this.memoryStore.store(item);

    // También crear items individuales por cada step del plan
    for (const step of plan.steps) {
      const stepItem = new MemoryItem(
        uuid(),
        goal.projectId,
        goal.id,
        `Step: ${step.description}`,
        'decision',
        'plan',
        `Tool: ${step.toolId}, Status: ${step.status}`,
        ['cas', 'plan-step', step.status],
      );
      await this.memoryStore.store(stepItem);
    }

    this.logger.log(
      `Stored ${1 + plan.steps.length} memory items for goal ${goal.id}`,
    );
  }

  async writeManual(item: MemoryItem): Promise<MemoryItem> {
    return this.memoryStore.store(item);
  }
}
