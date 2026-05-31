import { Inject, Injectable, Logger } from '@nestjs/common';
import { Goal } from '../shared/types';
import { IMemoryStore, MEMORY_STORE } from './memory.types';

@Injectable()
export class MemoryReaderService {
  private readonly logger = new Logger(MemoryReaderService.name);

  constructor(@Inject(MEMORY_STORE) private readonly memoryStore: IMemoryStore) {}

  async getContextForPlanning(goal: Goal): Promise<string> {
    // Buscar memorias relevantes al nuevo Goal
    const result = await this.memoryStore.search({
      projectId: goal.projectId,
      keywords: goal.description,
      limit: 5,
    });

    if (result.items.length === 0) {
      this.logger.log(
        `No relevant memory found for goal ${goal.id} (project: ${goal.projectId})`,
      );
      return '';
    }

    // Construir string de contexto para el planner
    const lines = result.items.map(
      (item, i) =>
        `[${i + 1}] ${item.summary}${item.content ? ` — ${item.content}` : ''}`,
    );

    const context = `## Contexto de memoria recuperado\n\nSe encontraron ${result.total} items relevantes:\n\n${lines.join('\n')}`;

    this.logger.log(
      `Retrieved ${result.total} memory items as context for goal ${goal.id}`,
    );

    return context;
  }

  async getProjectHistory(projectId: string): Promise<string> {
    const items = await this.memoryStore.getByProject(projectId);
    if (items.length === 0) {
      return 'No previous history found for this project.';
    }

    return items
      .map((i) => `- ${i.type}: ${i.summary}`)
      .join('\n');
  }
}
