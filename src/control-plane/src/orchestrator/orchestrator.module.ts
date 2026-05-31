import { Module } from '@nestjs/common';
import { PlannerModule } from '../planner/planner.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';
import { ToolsRegistryModule } from '../tools-registry/tools-registry.module';
import { RunnersModule } from '../runners/runners.module';
import { MemoryModule } from '../memory/memory.module';
import { OrchestratorService } from './orchestrator.service';
import { GoalStore } from './goal.store';
import { PlanStore } from './plan.store';
import { OrchestratorProcessor } from './orchestrator.processor';

@Module({
  imports: [PlannerModule, PolicyEngineModule, ToolsRegistryModule, RunnersModule, MemoryModule],
  providers: [OrchestratorService, GoalStore, PlanStore, OrchestratorProcessor],
  exports: [OrchestratorService, GoalStore, PlanStore],
})
export class OrchestratorModule {}
