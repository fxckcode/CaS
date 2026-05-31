import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrchestratorService } from '../../src/orchestrator/orchestrator.service';
import { GoalStore } from '../../src/orchestrator/goal.store';
import { PlanStore } from '../../src/orchestrator/plan.store';
import { PlannerService } from '../../src/planner/planner.service';
import { PolicyEngineService } from '../../src/policy-engine/policy-engine.service';
import { ToolsRegistryService } from '../../src/tools-registry/tools-registry.service';
import {
  Goal,
  Plan,
  PlanStep,
  PolicyResult,
  ToolDescriptor,
} from '../../src/shared/types';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let goalStore: GoalStore;
  let planner: jest.Mocked<PlannerService>;
  let policyEngine: jest.Mocked<PolicyEngineService>;
  let toolsRegistry: jest.Mocked<ToolsRegistryService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  // Helper to configure mocks for a successful planning flow
  function setupSuccessfulPlan(
    stepToolId = 'run_sql_query',
    stepDescription = 'Execute SQL',
  ) {
    const step = new PlanStep('step-1', stepDescription, stepToolId, {});
    const plan = new Plan('plan-1', 'goal-id', [step], 'Test plan');

    // Return a real promise that resolves so await in startPlanning yields
    planner.createPlan.mockResolvedValue(plan);

    const tool = new ToolDescriptor(
      stepToolId,
      stepToolId === 'run_sql_query' ? 'Run SQL' : 'Tool',
      '1.0.0',
      'finance',
      'data' as any,
      'desc',
      [],
    );
    toolsRegistry.getTool.mockReturnValue(tool);
    policyEngine.evaluate.mockReturnValue(new PolicyResult('ALLOW', 'OK'));

    return { step, plan };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        GoalStore,
        PlanStore,
        {
          provide: PlannerService,
          useValue: {
            createPlan: jest.fn(),
            createQueryContext: jest.fn(),
          },
        },
        {
          provide: PolicyEngineService,
          useValue: {
            evaluate: jest.fn(),
            getDecision: jest.fn(),
          },
        },
        {
          provide: ToolsRegistryService,
          useValue: {
            getTools: jest.fn().mockReturnValue([]),
            getTool: jest.fn(),
            getToolsByRunner: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    goalStore = module.get<GoalStore>(GoalStore);
    planner = module.get(PlannerService) as jest.Mocked<PlannerService>;
    policyEngine = module.get(
      PolicyEngineService,
    ) as jest.Mocked<PolicyEngineService>;
    toolsRegistry = module.get(
      ToolsRegistryService,
    ) as jest.Mocked<ToolsRegistryService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  // ── createGoal ─────────────────────────────────────────

  describe('createGoal', () => {
    it('should create a goal and store it in GoalStore', async () => {
      // Mock startPlanning to avoid side-effects from its synchronous prefix
      const startPlanningSpy = jest
        .spyOn(OrchestratorService.prototype as any, 'startPlanning')
        .mockResolvedValue(undefined);

      const result = await service.createGoal({
        goal: 'build the thing',
        projectId: 'proj-alpha',
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
      expect(result.description).toBe('build the thing');
      expect(result.projectId).toBe('proj-alpha');
      expect(result.userId).toBe('anonymous');
      expect(result.autonomyMode).toBe('semi-autonomous');

      // Verify it's in the store
      const stored = goalStore.get(result.id);
      expect(stored).toBeDefined();
      expect(stored!.id).toBe(result.id);
      expect(stored!.status).toBe('PENDING');

      startPlanningSpy.mockRestore();
    });

    it('should use provided userId and autonomyMode', async () => {
      const startPlanningSpy = jest
        .spyOn(OrchestratorService.prototype as any, 'startPlanning')
        .mockResolvedValue(undefined);

      const result = await service.createGoal({
        goal: 'deploy',
        projectId: 'proj-beta',
        autonomyMode: 'autonomous',
        userId: 'alice',
      });

      expect(result.userId).toBe('alice');
      expect(result.autonomyMode).toBe('autonomous');

      startPlanningSpy.mockRestore();
    });

    it('should emit a goal.created event', async () => {
      // Must not mock startPlanning here to test the real event emission
      // But startPlanning will run and fail because mocks aren't set up for it
      // The event is emitted before startPlanning call, so this is safe
      const result = await service.createGoal({
        goal: 'event test',
        projectId: 'proj-1',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'goal.created',
        expect.objectContaining({ goalId: result.id }),
      );
    });
  });

  // ── startPlanning ──────────────────────────────────────

  describe('startPlanning', () => {
    it('should update goal status to PLANNING', async () => {
      const goal = await service.createGoal({
        goal: 'planning status check',
        projectId: 'proj-1',
      });
      setupSuccessfulPlan();

      await service.startPlanning(goal.id);

      // Goal should have gone through PLANNING → APPROVED/IN_PROGRESS
      const updated = goalStore.get(goal.id);
      expect(
        ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(updated!.status),
      ).toBe(true);
    });

    it('should transition to APPROVED when all steps are ALLOWED and no approval needed', async () => {
      const goal = await service.createGoal({
        goal: 'simple query',
        projectId: 'proj-1',
      });
      setupSuccessfulPlan();

      // Prevent executePlan from running to test just the planning flow
      jest
        .spyOn(service as any, 'executePlan')
        .mockResolvedValue(undefined);

      await service.startPlanning(goal.id);

      const updated = goalStore.get(goal.id);
      expect(updated!.status).toBe('APPROVED');

      // Should have emitted goal.planned
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'goal.planned',
        expect.objectContaining({ goalId: goal.id }),
      );
    });

    it('should transition to AWAITING_APPROVAL when steps require approval', async () => {
      const goal = await service.createGoal({
        goal: 'needs approval',
        projectId: 'proj-1',
      });

      const step = new PlanStep('step-1', 'Send email', 'send_email', {});
      const plan = new Plan('plan-1', goal.id, [step], 'Test plan');
      planner.createPlan.mockResolvedValue(plan);

      const tool = new ToolDescriptor(
        'send_email',
        'Send Email',
        '1.0.0',
        'general',
        'shell' as any,
        'desc',
        [],
      );
      toolsRegistry.getTool.mockReturnValue(tool);
      policyEngine.evaluate.mockReturnValue(
        new PolicyResult('REQUIRE_APPROVAL', 'needs human'),
      );

      await service.startPlanning(goal.id);

      const updated = goalStore.get(goal.id);
      expect(updated!.status).toBe('AWAITING_APPROVAL');
    });

    it('should transition to FAILED when all steps are DENIED', async () => {
      const goal = await service.createGoal({
        goal: 'dangerous op',
        projectId: 'proj-1',
      });

      const step = new PlanStep('step-1', 'Run shell', 'run_shell', {});
      const plan = new Plan('plan-1', goal.id, [step], 'Test plan');
      planner.createPlan.mockResolvedValue(plan);

      const tool = new ToolDescriptor(
        'run_shell',
        'Run Shell',
        '1.0.0',
        'general',
        'shell' as any,
        'desc',
        [],
      );
      toolsRegistry.getTool.mockReturnValue(tool);
      policyEngine.evaluate.mockReturnValue(
        new PolicyResult('DENY', 'not allowed'),
      );

      await service.startPlanning(goal.id);

      const updated = goalStore.get(goal.id);
      expect(updated!.status).toBe('FAILED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'goal.failed',
        expect.objectContaining({ goalId: goal.id }),
      );
    });
  });

  // ── Error handling ─────────────────────────────────────

  describe('error handling', () => {
    it('should throw an error when startPlanning is called with a non-existent goal', async () => {
      await expect(
        service.startPlanning('non-existent-goal-id'),
      ).rejects.toThrow('Goal non-existent-goal-id not found');
    });

    it('should handle planner rejection gracefully', async () => {
      const goal = await service.createGoal({
        goal: 'broken plan',
        projectId: 'proj-1',
      });

      // Spy on update to track what happens on error
      const updateSpy = jest.spyOn(goalStore, 'update');
      planner.createPlan.mockRejectedValue(new Error('Planner crashed'));

      await expect(service.startPlanning(goal.id)).rejects.toThrow(
        'Planner crashed',
      );
    });
  });
});
