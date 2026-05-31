import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  goal!: string;

  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  @IsIn(['consultative', 'semi-autonomous', 'autonomous'])
  autonomyMode?: string;

  @IsOptional()
  channelMetadata?: Record<string, unknown>;
}

export class GoalIdParam {
  @IsString()
  id!: string;
}
