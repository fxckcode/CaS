import { MemoryItem, MemoryItemType } from '../shared/types';

export interface MemorySearchQuery {
  orgId?: string;
  projectId?: string;
  domain?: string;
  tags?: string[];
  keywords?: string;
  type?: MemoryItemType;
  limit?: number;
  offset?: number;
}

export interface MemorySearchResult {
  items: MemoryItem[];
  total: number;
  query: MemorySearchQuery;
}

export interface IMemoryStore {
  store(item: MemoryItem): Promise<MemoryItem>;
  get(id: string): Promise<MemoryItem | undefined>;
  search(query: MemorySearchQuery): Promise<MemorySearchResult>;
  delete(id: string): Promise<boolean>;
  getByProject(projectId: string): Promise<MemoryItem[]>;
  getByOrg(orgId: string, domain?: string): Promise<MemoryItem[]>;
}
