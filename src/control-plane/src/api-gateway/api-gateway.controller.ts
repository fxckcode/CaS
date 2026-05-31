import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ToolsRegistryService } from '../tools-registry/tools-registry.service';
import { ApiGatewayService } from './api-gateway.service';
import { CreateGoalDto } from './api-gateway.dto';
import { GoalResponseDto, ToolListResponseDto } from '../shared/types';

@Controller()
export class ApiGatewayController {
  constructor(
    private readonly apiGatewayService: ApiGatewayService,
    private readonly toolsRegistry: ToolsRegistryService,
  ) {}

  @Post('goals')
  async createGoal(
    @Body(new ValidationPipe({ transform: true })) dto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    return this.apiGatewayService.submitGoal(dto);
  }

  @Get('goals')
  async listGoals(): Promise<GoalResponseDto[]> {
    return this.apiGatewayService.listGoals();
  }

  @Get('goals/:id')
  async getGoal(@Param('id') id: string): Promise<GoalResponseDto> {
    const result = this.apiGatewayService.getGoalStatus(id);
    if (!result) {
      throw new NotFoundException(`Goal ${id} not found`);
    }
    return result;
  }

  @Get('goals/:id/plan')
  async getGoalPlan(@Param('id') id: string) {
    const plan = this.apiGatewayService.getPlanForGoal(id);
    if (!plan) {
      throw new NotFoundException(`No plan found for goal ${id}`);
    }
    return plan;
  }

  @Get('tools')
  async listTools(): Promise<ToolListResponseDto> {
    const tools = this.toolsRegistry.getTools();
    return { tools, total: tools.length };
  }

  @Get('memory')
  async listMemory(
    @Query('projectId') projectId?: string,
    @Query('type') type?: string,
    @Query('keywords') keywords?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.apiGatewayService.searchMemory({
      projectId,
      type,
      keywords,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('health')
  async health(): Promise<{ status: string; timestamp: number }> {
    return { status: 'ok', timestamp: Date.now() };
  }
}
