import { Module } from '@nestjs/common';
import { ToolsRegistryModule } from '../tools-registry/tools-registry.module';
import { PlannerService } from './planner.service';

@Module({
  imports: [ToolsRegistryModule],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
