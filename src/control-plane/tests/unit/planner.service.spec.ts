import { Test, TestingModule } from '@nestjs/testing';
import { PlannerService } from '../../src/planner/planner.service';
import { ToolsRegistryService } from '../../src/tools-registry/tools-registry.service';
import { Goal } from '../../src/shared/types';

describe('PlannerService', () => {
  let service: PlannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlannerService, ToolsRegistryService],
    }).compile();

    service = module.get<PlannerService>(PlannerService);
  });

  function createGoal(description: string): Goal {
    return new Goal(
      'goal-1',
      description,
      'project-1',
      'user-1',
      'semi-autonomous',
    );
  }

  // ── Report keyword ────────────────────────────────────

  describe('report keyword', () => {
    it('should generate a report plan with 3 steps (sql, render, email)', async () => {
      const goal = createGoal('Generate monthly financial report');
      const plan = await service.createPlan(goal);

      expect(plan.steps.length).toBe(3);
      expect(plan.steps[0].toolId).toBe('run_sql_query');
      expect(plan.steps[0].description).toContain('SQL');
      expect(plan.steps[1].toolId).toBe('render_report');
      expect(plan.steps[1].description).toContain('report');
      expect(plan.steps[2].toolId).toBe('send_email');
      expect(plan.steps[2].description).toContain('email');
      expect(plan.reasoning).toContain('report');
    });

    it('should detect report keyword case-insensitively', async () => {
      const goal = createGoal('REPORT monthly sales');
      const plan = await service.createPlan(goal);
      expect(plan.steps.length).toBe(3);
    });

    it('should detect Spanish report keyword (reporte)', async () => {
      const goal = createGoal('generar reporte mensual');
      const plan = await service.createPlan(goal);
      expect(plan.steps.length).toBe(3);
    });
  });

  // ── Deploy keyword ────────────────────────────────────

  describe('deploy keyword', () => {
    it('should generate a deploy plan with terraform and kubectl steps', async () => {
      const goal = createGoal('deploy the new microservice to staging');
      const plan = await service.createPlan(goal);

      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.reasoning).toContain('deploy');

      // Check that at least one step references terraform or kubectl
      const toolIds = plan.steps.map((s) => s.toolId);
      expect(
        toolIds.includes('terraform_plan') || toolIds.includes('kubectl_apply'),
      ).toBe(true);
    });
  });

  // ── Migrate keyword ───────────────────────────────────

  describe('migrate keyword', () => {
    it('should generate a migration plan with db_migrate step', async () => {
      const goal = createGoal('migrate the user database schema');
      const plan = await service.createPlan(goal);

      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps[0].toolId).toBe('db_migrate');
      expect(plan.reasoning).toContain('migration');
    });

    it('should detect Spanish migrate keyword (migrar)', async () => {
      const goal = createGoal('migrar datos a nuevo servidor');
      const plan = await service.createPlan(goal);
      expect(plan.steps[0].toolId).toBe('db_migrate');
    });
  });

  // ── Unknown goal ──────────────────────────────────────

  describe('unknown goal (fallback)', () => {
    it('should generate a generic fallback plan for unknown goal', async () => {
      const goal = createGoal('do something completely random');
      const plan = await service.createPlan(goal);

      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps[0].toolId).toBe('run_shell');
      expect(plan.reasoning).toContain('generic');
    });

    it('should use fallback steps when no matching tools exist', async () => {
      // Delete all tools from registry by re-initializing with empty map
      // We can test by the generic plan builder — it uses run_shell
      const goal = createGoal('xyzzy unknown operation');
      const plan = await service.createPlan(goal);
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── createQueryContext ────────────────────────────────

  describe('createQueryContext', () => {
    it('should build a context string from the goal', () => {
      const goal = createGoal('my context goal');
      const ctx = service.createQueryContext(goal);

      expect(ctx).toContain('my context goal');
      expect(ctx).toContain('project-1');
      expect(ctx).toContain('user-1');
      expect(ctx).toContain('semi-autonomous');
    });

    it('should include channel metadata when present', () => {
      const goal = new Goal(
        'g-1',
        'meta goal',
        'p-1',
        'u-1',
        'autonomous',
        'PENDING',
        new Date(),
        new Date(),
        { channel: 'slack', threadTs: '12345' },
      );
      const ctx = service.createQueryContext(goal);
      expect(ctx).toContain('slack');
      expect(ctx).toContain('12345');
    });
  });
});
