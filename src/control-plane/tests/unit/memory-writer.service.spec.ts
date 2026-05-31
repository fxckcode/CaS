import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MemoryWriterService } from '../../src/memory/memory-writer.service';
import { MemoryStoreService } from '../../src/memory/memory-store.service';
import { MEMORY_STORE } from '../../src/memory/memory.types';
import { Goal, Plan, PlanStep, MemoryItem } from '../../src/shared/types';

/**
 * Helper: flush pending microtasks so async operations kicked off by
 * the event handler (which does not return its promise) settle before
 * we run assertions.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('MemoryWriterService', () => {
  let service: MemoryWriterService;
  let memoryStore: MemoryStoreService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    // Create a full mock of EventEmitter2
    eventEmitter = {
      on: jest.fn(),
      emit: jest.fn(),
      // Minimal mock for the EventEmitter2 interface used by the service
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryWriterService,
        MemoryStoreService,
        { provide: MEMORY_STORE, useExisting: MemoryStoreService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<MemoryWriterService>(MemoryWriterService);
    memoryStore = module.get<MemoryStoreService>(MemoryStoreService);
  });

  function createGoal(overrides: Partial<{
    id: string;
    description: string;
    projectId: string;
    userId: string;
    autonomyMode: 'consultative' | 'semi-autonomous' | 'autonomous';
    status: 'PENDING' | 'PLANNING' | 'AWAITING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  }> = {}): Goal {
    return new Goal(
      overrides.id ?? 'goal-1',
      overrides.description ?? 'Test goal completed',
      overrides.projectId ?? 'proj-1',
      overrides.userId ?? 'user-1',
      overrides.autonomyMode ?? 'semi-autonomous',
      overrides.status ?? 'COMPLETED',
    );
  }

  function createPlanStep(id: string): PlanStep {
    return new PlanStep(
      id,
      `Step ${id} description`,
      'run_shell',
      { command: 'echo hello' },
      [],
      'completed',
    );
  }

  function createPlan(goalId: string, stepCount: number = 2): Plan {
    const steps = Array.from({ length: stepCount }, (_, i) =>
      createPlanStep(`step-${i + 1}`),
    );
    return new Plan('plan-1', goalId, steps, 'Executed test plan');
  }

  /**
   * Retrieve the callback that MemoryWriterService registered with the
   * EventEmitter2 mock for a given event name.
   */
  function getEventHandler(
    eventName: string,
  ): (payload: { goal: Goal; plan: Plan }) => void {
    const entry = eventEmitter.on.mock.calls.find(
      ([event]) => event === eventName,
    );
    if (!entry) throw new Error(`No listener registered for "${eventName}"`);
    return entry[1] as (payload: { goal: Goal; plan: Plan }) => void;
  }

  it('should write a MemoryItem on goal.completed event', async () => {
    const goal = createGoal();
    const plan = createPlan('goal-1', 1);

    // Trigger the handler — the MemoryWriter stores items with
    // projectId = goal.id (not goal.projectId), so we look up by goal.id
    getEventHandler('goal.completed')({ goal, plan });
    await flushMicrotasks();

    const allItems = await memoryStore.getByProject('goal-1');
    // 1 goal item + 1 step item
    expect(allItems.length).toBe(2);

    const goalItem = allItems.find((i) => i.source === 'goal');
    expect(goalItem).toBeDefined();
    expect(goalItem!.summary).toContain('Goal completed');
    expect(goalItem!.summary).toContain('Test goal completed');
  });

  it('should write one item per plan step', async () => {
    const goal = createGoal();
    const plan = createPlan('goal-1', 3); // 3 steps

    getEventHandler('goal.completed')({ goal, plan });
    await flushMicrotasks();

    const allItems = await memoryStore.getByProject('goal-1');
    // 1 goal item + 3 step items = 4
    expect(allItems.length).toBe(4);

    const stepItems = allItems.filter((i) => i.source === 'plan');
    expect(stepItems.length).toBe(3);

    const stepSummaries = stepItems.map((i) => i.summary);
    expect(stepSummaries).toContain('Step: Step step-1 description');
    expect(stepSummaries).toContain('Step: Step step-3 description');
  });

  it('should allow manual writes via writeManual()', async () => {
    const item = new MemoryItem(
      'manual-1',
      'org-1',
      'proj-1',
      'Manual write test',
      'artifact',
      'manual',
      'written by user',
      ['manual-tag'],
    );

    const stored = await service.writeManual(item);
    expect(stored.id).toBe('manual-1');

    const retrieved = await memoryStore.get('manual-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.summary).toBe('Manual write test');
    expect(retrieved!.source).toBe('manual');
  });

  it('should not crash if goal.completed fires with null plan', () => {
    const goal = createGoal();

    // The handler catches errors internally via .catch() — no crash
    expect(() => {
      getEventHandler('goal.completed')({ goal, plan: null as unknown as Plan });
    }).not.toThrow();
  });

  it('should use correct MemoryItemType and source', async () => {
    const goal = createGoal({ description: 'Deploy to production' });
    const plan = createPlan('goal-1', 2);

    getEventHandler('goal.completed')({ goal, plan });
    await flushMicrotasks();

    const allItems = await memoryStore.getByProject('goal-1');

    // Goal item
    const goalItem = allItems.find((i) => i.source === 'goal')!;
    expect(goalItem.type).toBe('artifact');
    expect(goalItem.source).toBe('goal');
    expect(goalItem.tags).toContain('cas');
    expect(goalItem.tags).toContain('goal-completed');

    // Step item
    const stepItem = allItems.find((i) => i.source === 'plan')!;
    expect(stepItem.type).toBe('decision');
    expect(stepItem.source).toBe('plan');
    expect(stepItem.tags).toContain('cas');
    expect(stepItem.tags).toContain('plan-step');
    expect(stepItem.tags).toContain('completed');
  });

  it('should handle multiple consecutive writes', async () => {
    const goal1 = createGoal({ id: 'goal-1', description: 'First goal' });
    const goal2 = createGoal({ id: 'goal-2', description: 'Second goal' });
    const plan1 = createPlan('goal-1', 1);
    const plan2 = createPlan('goal-2', 2);

    getEventHandler('goal.completed')({ goal: goal1, plan: plan1 });
    getEventHandler('goal.completed')({ goal: goal2, plan: plan2 });
    await flushMicrotasks();

    const allGoal1Items = await memoryStore.getByProject('goal-1');
    // 1 goal item + 1 step item = 2
    expect(allGoal1Items.length).toBe(2);

    const allGoal2Items = await memoryStore.getByProject('goal-2');
    // 1 goal item + 2 step items = 3
    expect(allGoal2Items.length).toBe(3);

    const allSources = [
      ...allGoal1Items.filter((i) => i.source === 'goal'),
      ...allGoal2Items.filter((i) => i.source === 'goal'),
    ];
    expect(allSources.length).toBe(2);
  });
});
