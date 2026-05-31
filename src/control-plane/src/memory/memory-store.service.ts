import { Injectable } from '@nestjs/common';
import { MemoryItem } from '../shared/types';
import { IMemoryStore, MemorySearchQuery, MemorySearchResult } from './memory.types';

@Injectable()
export class MemoryStoreService implements IMemoryStore {
  private readonly items = new Map<string, MemoryItem>();

  async store(item: MemoryItem): Promise<MemoryItem> {
    this.items.set(item.id, item);
    return item;
  }

  async get(id: string): Promise<MemoryItem | undefined> {
    return this.items.get(id);
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult> {
    let allItems = Array.from(this.items.values());

    // Filtrar por orgId
    if (query.orgId) {
      allItems = allItems.filter((i) => i.orgId === query.orgId);
    }

    // Filtrar por projectId
    if (query.projectId) {
      allItems = allItems.filter((i) => i.projectId === query.projectId);
    }

    // Filtrar por domain (en tags)
    if (query.domain) {
      allItems = allItems.filter((i) => i.tags.includes(query.domain!));
    }

    // Filtrar por tags (intersección)
    if (query.tags && query.tags.length > 0) {
      allItems = allItems.filter((i) => query.tags!.some((t) => i.tags.includes(t)));
    }

    // Filtrar por type
    if (query.type) {
      allItems = allItems.filter((i) => i.type === query.type);
    }

    // Búsqueda por keywords en summary/content
    if (query.keywords) {
      const kw = query.keywords.toLowerCase();
      allItems = allItems.filter(
        (i) =>
          i.summary.toLowerCase().includes(kw) ||
          (i.content && i.content.toLowerCase().includes(kw)),
      );
    }

    const total = allItems.length;

    // Paginación
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    allItems = allItems.slice(offset, offset + limit);

    return { items: allItems, total, query };
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async getByProject(projectId: string): Promise<MemoryItem[]> {
    return Array.from(this.items.values()).filter(
      (i) => i.projectId === projectId,
    );
  }

  async getByOrg(orgId: string, domain?: string): Promise<MemoryItem[]> {
    let result = Array.from(this.items.values()).filter(
      (i) => i.orgId === orgId,
    );
    if (domain) {
      result = result.filter((i) => i.tags.includes(domain));
    }
    return result;
  }
}
