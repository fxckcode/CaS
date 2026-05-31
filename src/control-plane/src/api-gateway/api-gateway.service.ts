import { Injectable, Logger } from '@nestjs/common';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { GoalStore } from '../orchestrator/goal.store';
import { GoalResponseDto, AutonomyMode } from '../shared/types';
import { CreateGoalDto } from './api-gateway.dto';

@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name);

  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly goalStore: GoalStore,
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
}
