import { Injectable, Logger } from '@nestjs/common';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { GoalStore } from '../orchestrator/goal.store';
import { PlanStore } from '../orchestrator/plan.store';
import {
  Goal,
  GoalResponseDto,
  Plan,
  AutonomyMode,
  MemoryItem,
} from '../shared/types';
import { CreateGoalDto } from './api-gateway.dto';
import { IMemoryStore, MEMORY_STORE } from '../memory/memory.types';
import { Inject } from '@nestjs/common';

@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name);

  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly goalStore: GoalStore,
    private readonly planStore: PlanStore,
    @Inject(MEMORY_STORE) private readonly memoryStore: IMemoryStore,
  ) {}

  async submitGoal(dto: CreateGoalDto): Promise<GoalResponseDto> {
    const goal = await this.orchestrator.createGoal({
      goal: dto.goal,
      projectId: dto.projectId,
      autonomyMode: (dto.autonomyMode as AutonomyMode) ?? 'semi-autonomous',
      userId: dto.channelMetadata?.['userId'] as string | undefined,
    });

    return {
      id: goal.id,
      description: goal.description,
      status: goal.status,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }

  getGoalStatus(goalId: string): GoalResponseDto | undefined {
    const goal = this.goalStore.get(goalId);
    if (!goal) {
      return undefined;
    }
    return {
      id: goal.id,
      description: goal.description,
      status: goal.status,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }

  listGoals(): GoalResponseDto[] {
    return this.goalStore.list().map((g) => ({
      id: g.id,
      description: g.description,
      status: g.status,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  }

  getPlanForGoal(goalId: string): Plan | undefined {
    return this.planStore.getByGoalId(goalId);
  }

  async searchMemory(params: {
    projectId?: string;
    type?: string;
    keywords?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: MemoryItem[]; total: number }> {
    return this.memoryStore.search({
      projectId: params.projectId,
      type: params.type as any,
      keywords: params.keywords,
      limit: params.limit,
      offset: params.offset,
    });
  }
}
