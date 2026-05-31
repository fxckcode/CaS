import { SqliteMemoryStoreService } from '../../src/memory/sqlite-memory-store.service';
import { MemoryItem } from '../../src/shared/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SqliteMemoryStoreService', () => {
  let service: SqliteMemoryStoreService;
  let dbPath: string;

  beforeEach(() => {
    // Use a unique temp file per test so parallel tests don't collide
    dbPath = path.join(os.tmpdir(), `cas-sqlite-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.MEMORY_DB_PATH = dbPath;
    service = new SqliteMemoryStoreService();
  });

  afterEach(() => {
    service.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore — may be WAL files left behind
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      // ignore
    }
  });

  function createItem(
    overrides: Partial<{
      id: string;
      orgId: string;
      projectId: string;
      summary: string;
      type: 'decision' | 'convention' | 'artifact';
      source: 'goal' | 'plan' | 'job' | 'manual';
      content: string;
      tags: string[];
    }> = {},
  ): MemoryItem {
    return new MemoryItem(
      overrides.id ?? 'mem-1',
      overrides.orgId ?? 'org-1',
      overrides.projectId ?? 'proj-1',
      overrides.summary ?? 'Test memory item',
      overrides.type ?? 'decision',
      overrides.source ?? 'manual',
      overrides.content,
      overrides.tags,
    );
  }

  // ── store / get ──────────────────────────────────────────────

  it('should store a MemoryItem and retrieve it by id', async () => {
    const item = createItem({ id: 'mem-1' });
    await service.store(item);
    const retrieved = await service.get('mem-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('mem-1');
    expect(retrieved!.summary).toBe('Test memory item');
  });

  it('should return undefined for non-existent id', async () => {
    const retrieved = await service.get('non-existent');
    expect(retrieved).toBeUndefined();
  });

  // ── search ───────────────────────────────────────────────────

  it('should search by orgId', async () => {
    await service.store(createItem({ id: 'a', orgId: 'org-1', summary: 'item A' }));
    await service.store(createItem({ id: 'b', orgId: 'org-2', summary: 'item B' }));

    const result = await service.search({ orgId: 'org-1' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('a');
  });

  it('should search by projectId', async () => {
    await service.store(createItem({ id: 'a', projectId: 'proj-1' }));
    await service.store(createItem({ id: 'b', projectId: 'proj-2' }));

    const result = await service.search({ projectId: 'proj-1' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('a');
  });

  it('should search by type', async () => {
    await service.store(createItem({ id: 'a', type: 'decision' }));
    await service.store(createItem({ id: 'b', type: 'artifact' }));

    const result = await service.search({ type: 'artifact' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('b');
  });

  it('should search by keywords in summary', async () => {
    await service.store(createItem({ id: 'a', summary: 'deployment config updated' }));
    await service.store(createItem({ id: 'b', summary: 'user authentication fixed' }));

    const result = await service.search({ keywords: 'deployment' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('a');
  });

  it('should search by keywords in content', async () => {
    await service.store(createItem({ id: 'a', summary: 'summary a', content: 'deep secret content' }));
    await service.store(createItem({ id: 'b', summary: 'summary b', content: 'other stuff' }));

    const result = await service.search({ keywords: 'secret' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('a');
  });

  it('should search by tags (any matching)', async () => {
    await service.store(createItem({ id: 'a', tags: ['frontend', 'react'] }));
    await service.store(createItem({ id: 'b', tags: ['backend', 'node'] }));
    await service.store(createItem({ id: 'c', tags: ['frontend', 'vue'] }));

    const result = await service.search({ tags: ['frontend'] });
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.id).sort()).toEqual(['a', 'c']);
  });

  it('should search by domain (in tags)', async () => {
    await service.store(createItem({ id: 'a', tags: ['domain:security', 'auth'] }));
    await service.store(createItem({ id: 'b', tags: ['domain:data', 'etl'] }));

    const result = await service.search({ domain: 'domain:security' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('a');
  });

  it('should return paginated results with limit/offset', async () => {
    for (let i = 0; i < 10; i++) {
      await service.store(createItem({ id: `mem-${i}`, projectId: 'proj-paginate' }));
    }

    const page1 = await service.search({ projectId: 'proj-paginate', limit: 3, offset: 0 });
    expect(page1.items.length).toBe(3);
    expect(page1.total).toBe(10);

    const page2 = await service.search({ projectId: 'proj-paginate', limit: 3, offset: 3 });
    expect(page2.items.length).toBe(3);
  });

  // ── delete ───────────────────────────────────────────────────

  it('should delete an existing item', async () => {
    const item = createItem({ id: 'mem-to-delete' });
    await service.store(item);

    const deleted = await service.delete('mem-to-delete');
    expect(deleted).toBe(true);

    const retrieved = await service.get('mem-to-delete');
    expect(retrieved).toBeUndefined();
  });

  it('should return false when deleting non-existent item', async () => {
    const deleted = await service.delete('does-not-exist');
    expect(deleted).toBe(false);
  });

  // ── getByProject ─────────────────────────────────────────────

  it('should get all items by project', async () => {
    await service.store(createItem({ id: 'a', projectId: 'proj-xyz' }));
    await service.store(createItem({ id: 'b', projectId: 'proj-xyz' }));
    await service.store(createItem({ id: 'c', projectId: 'proj-other' }));

    const items = await service.getByProject('proj-xyz');
    expect(items.length).toBe(2);
    expect(items.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  // ── getByOrg ─────────────────────────────────────────────────

  it('should get all items by org', async () => {
    await service.store(createItem({ id: 'a', orgId: 'org-alpha' }));
    await service.store(createItem({ id: 'b', orgId: 'org-beta' }));

    const items = await service.getByOrg('org-alpha');
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('a');
  });

  it('should filter by domain in getByOrg', async () => {
    await service.store(createItem({ id: 'a', orgId: 'org-1', tags: ['domain:deploy'] }));
    await service.store(createItem({ id: 'b', orgId: 'org-1', tags: ['domain:test'] }));

    const items = await service.getByOrg('org-1', 'domain:deploy');
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('a');
  });

  // ── Persistence (SQLite-specific) ────────────────────────────

  it('should persist data across instances when using file-based DB', async () => {
    // Store something in the current instance
    const item = createItem({ id: 'persist-1', summary: 'I shall persist!' });
    await service.store(item);
    service.close();

    // Open a new service pointing at the same file
    const service2 = new SqliteMemoryStoreService();
    try {
      const retrieved = await service2.get('persist-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.summary).toBe('I shall persist!');
    } finally {
      service2.close();
    }
  });

  it('should preserve correct types on round-trip', async () => {
    const item = createItem({
      id: 'roundtrip-1',
      orgId: 'my-org',
      projectId: 'my-proj',
      summary: 'Round trip test',
      type: 'artifact',
      source: 'goal',
      content: 'rich content with üñí©ödé',
      tags: ['a', 'b', 'c'],
    });
    await service.store(item);

    const retrieved = await service.get('roundtrip-1');
    expect(retrieved!.orgId).toBe('my-org');
    expect(retrieved!.projectId).toBe('my-proj');
    expect(retrieved!.type).toBe('artifact');
    expect(retrieved!.source).toBe('goal');
    expect(retrieved!.content).toBe('rich content with üñí©ödé');
    expect(retrieved!.tags).toEqual(['a', 'b', 'c']);
    expect(retrieved!.createdAt).toBeInstanceOf(Date);
  });
});
