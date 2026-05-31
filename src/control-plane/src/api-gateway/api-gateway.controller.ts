import {
  Controller,
  Get,
  Post,
  Param,
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

  @Get('goals/:id')
  async getGoal(@Param('id') id: string): Promise<GoalResponseDto> {
    const result = this.apiGatewayService.getGoalStatus(id);
    if (!result) {
      throw new NotFoundException(`Goal ${id} not found`);
    }
    return result;
  }

  @Get('tools')
  async listTools(): Promise<ToolListResponseDto> {
    const tools = this.toolsRegistry.getTools();
    return { tools, total: tools.length };
  }

  @Get('health')
  async health(): Promise<{ status: string; timestamp: number }> {
    return { status: 'ok', timestamp: Date.now() };
  }
}
