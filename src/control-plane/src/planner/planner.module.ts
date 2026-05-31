import { Module } from '@nestjs/common';
import { ToolsRegistryModule } from '../tools-registry/tools-registry.module';
import { MemoryModule } from '../memory/memory.module';
import { PlannerService } from './planner.service';

@Module({
  imports: [ToolsRegistryModule, MemoryModule],
  providers: [PlannerService],
  exports: [PlannerService],
})
export class PlannerModule {}
