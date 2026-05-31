import { Injectable, Logger } from '@nestjs/common';
import Database from 'better-sqlite3';
import { MemoryItem } from '../shared/types';
import { IMemoryStore, MemorySearchQuery, MemorySearchResult } from './memory.types';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL,
  project_id TEXT NOT NULL,
  summary   TEXT NOT NULL,
  type      TEXT NOT NULL CHECK(type IN ('decision', 'convention', 'artifact')),
  source    TEXT NOT NULL CHECK(source IN ('goal', 'plan', 'job', 'manual')),
  content   TEXT,
  tags      TEXT NOT NULL DEFAULT '[]',
  link      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_org_id ON memories(org_id);
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
`;

@Injectable()
export class SqliteMemoryStoreService implements IMemoryStore {
  private readonly logger = new Logger(SqliteMemoryStoreService.name);
  private db: Database.Database;

  constructor() {
    const dbPath = process.env.MEMORY_DB_PATH || './data/cas-memory.db';
    this.logger.log(`Initializing SQLite memory store at: ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
    this.logger.log('SQLite memory store ready');
  }

  async store(item: MemoryItem): Promise<MemoryItem> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, org_id, project_id, summary, type, source, content, tags, link, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      item.id,
      item.orgId,
      item.projectId,
      item.summary,
      item.type,
      item.source,
      item.content ?? null,
      JSON.stringify(item.tags),
      item.link ?? null,
      item.createdAt.toISOString(),
    );
    this.logger.debug(`Stored memory item ${item.id}`);
    return item;
  }

  async get(id: string): Promise<MemoryItem | undefined> {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToItem(row) : undefined;
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.orgId) {
      conditions.push('org_id = ?');
      params.push(query.orgId);
    }
    if (query.projectId) {
      conditions.push('project_id = ?');
      params.push(query.projectId);
    }
    if (query.type) {
      conditions.push('type = ?');
      params.push(query.type);
    }
    if (query.tags && query.tags.length > 0) {
      const clauses = query.tags.map(() => `tags LIKE ?`);
      conditions.push(`(${clauses.join(' OR ')})`);
      for (const tag of query.tags) {
        params.push(`%"${tag}"%`);
      }
    }
    if (query.domain) {
      params.push(`%"${query.domain}"%`);
      conditions.push('tags LIKE ?');
    }
    if (query.keywords) {
      conditions.push('(summary LIKE ? OR content LIKE ?)');
      const kw = `%${query.keywords}%`;
      params.push(kw, kw);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM memories ${whereClause}`)
      .get(...(params as [])) as { count: number };

    const total = countRow.count;

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const rows = this.db
      .prepare(
        `SELECT * FROM memories ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...(params as []), limit, offset) as Record<string, unknown>[];

    return {
      items: rows.map((r) => this.rowToItem(r)),
      total,
      query,
    };
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async getByProject(projectId: string): Promise<MemoryItem[]> {
    const rows = this.db
      .prepare('SELECT * FROM memories WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToItem(r));
  }

  async getByOrg(orgId: string, domain?: string): Promise<MemoryItem[]> {
    let sql = 'SELECT * FROM memories WHERE org_id = ?';
    const params: unknown[] = [orgId];
    if (domain) {
      sql += ' AND tags LIKE ?';
      params.push(`%"${domain}"%`);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...(params as [])) as Record<string, unknown>[];
    return rows.map((r) => this.rowToItem(r));
  }

  /** Close the database connection (useful for testing/cleanup). */
  close(): void {
    this.db.close();
  }

  private rowToItem(row: Record<string, unknown>): MemoryItem {
    return new MemoryItem(
      row.id as string,
      row.org_id as string,
      row.project_id as string,
      row.summary as string,
      row.type as 'decision' | 'convention' | 'artifact',
      row.source as 'goal' | 'plan' | 'job' | 'manual',
      (row.content as string) ?? undefined,
      JSON.parse((row.tags as string) || '[]') as string[],
      (row.link as string) ?? undefined,
      new Date(row.created_at as string),
    );
  }
}
