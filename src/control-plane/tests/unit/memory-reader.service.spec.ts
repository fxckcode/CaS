import { Test, TestingModule } from '@nestjs/testing';
import { MemoryReaderService } from '../../src/memory/memory-reader.service';
import { MemoryStoreService } from '../../src/memory/memory-store.service';
import { MEMORY_STORE } from '../../src/memory/memory.types';
import { Goal, MemoryItem } from '../../src/shared/types';

describe('MemoryReaderService', () => {
  let service: MemoryReaderService;
  let memoryStore: MemoryStoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryReaderService,
        MemoryStoreService,
        { provide: MEMORY_STORE, useExisting: MemoryStoreService },
      ],
    }).compile();

    service = module.get<MemoryReaderService>(MemoryReaderService);
    memoryStore = module.get<MemoryStoreService>(MemoryStoreService);
  });

  function createGoal(overrides: Partial<{
    id: string;
    description: string;
    projectId: string;
    userId: string;
    autonomyMode: 'consultative' | 'semi-autonomous' | 'autonomous';
  }> = {}): Goal {
    return new Goal(
      overrides.id ?? 'goal-1',
      overrides.description ?? 'Test goal for context',
      overrides.projectId ?? 'proj-1',
      overrides.userId ?? 'user-1',
      overrides.autonomyMode ?? 'semi-autonomous',
    );
  }

  function seedItem(
    id: string,
    projectId: string,
    summary: string,
    content?: string,
    type: 'decision' | 'convention' | 'artifact' = 'decision',
    source: 'goal' | 'plan' | 'job' | 'manual' = 'manual',
    tags: string[] = [],
  ): Promise<MemoryItem> {
    return memoryStore.store(
      new MemoryItem(id, 'org-1', projectId, summary, type, source, content, tags),
    );
  }

  // ── getContextForPlanning ────────────────────────────────────
  //
  // Internally calls memoryStore.search({ projectId, keywords: goal.description, limit: 5 })
  // so seeded items must have matching projectId AND their summary/content must
  // contain the goal.description text (case-insensitive).

  it('should return context string with relevant memories for planning', async () => {
    // Seed items whose summaries contain the keyword we'll search for
    await seedItem(
      'm1', 'proj-1',
      'Deployment of API gateway completed',
      'using Helm',
      'artifact', 'goal',
    );
    await seedItem(
      'm2', 'proj-1',
      'Authentication bug fixed in deployment',
      'JWT expiry handled',
      'decision', 'plan',
    );

    // The keyword "deployment" appears in both seeded summaries
    const goal = createGoal({ description: 'deployment' });
    const context = await service.getContextForPlanning(goal);

    expect(context).toBeTruthy();
    expect(context).toContain('## Contexto de memoria recuperado');
    expect(context).toContain('Deployment of API gateway completed');
    expect(context).toContain('Authentication bug fixed in deployment');
  });

  it('should return empty string when no relevant memories found', async () => {
    const goal = createGoal({ description: 'something completely unrelated' });
    const context = await service.getContextForPlanning(goal);

    expect(context).toBe('');
  });

  it('should include formatted items in context', async () => {
    await seedItem('m1', 'proj-1', 'Rolled out new feature', 'behind feature flag');

    const goal = createGoal({ description: 'feature' });
    const context = await service.getContextForPlanning(goal);

    expect(context).toContain('[1]');
    expect(context).toContain('Rolled out new feature');
    expect(context).toContain('behind feature flag');
    expect(context).toMatch(/\[1\] .+ — .+/); // formatted with content separator
  });

  it('should limit results to top 5', async () => {
    // Seed 10 items all about "database migration"
    for (let i = 0; i < 10; i++) {
      await seedItem(
        `mem-${i}`,
        'proj-1',
        `Database migration step ${i}`,
        `migration ${i}`,
      );
    }

    const goal = createGoal({ description: 'database migration' });
    const context = await service.getContextForPlanning(goal);

    // The search uses limit: 5 internally, so at most 5 items in context
    const matchCount = (context.match(/\[\d+\]/g) || []).length;
    expect(matchCount).toBeLessThanOrEqual(5);
    // Verify the 5th exists but the 6th does not
    expect(context).toContain('[5]');
    expect(context).not.toContain('[6]');
  });

  // ── getProjectHistory ────────────────────────────────────────

  it('should return project history as formatted string', async () => {
    await seedItem('m1', 'proj-history', 'First action', undefined, 'decision');
    await seedItem('m2', 'proj-history', 'Second action', undefined, 'artifact');

    const history = await service.getProjectHistory('proj-history');

    expect(history).toContain('- decision: First action');
    expect(history).toContain('- artifact: Second action');
  });

  it("should return 'No previous history' for empty projects", async () => {
    const history = await service.getProjectHistory('non-existent-project');

    expect(history).toBe('No previous history found for this project.');
  });
});
