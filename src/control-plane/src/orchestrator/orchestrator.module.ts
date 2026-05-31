import { Module } from '@nestjs/common';
import { PlannerModule } from '../planner/planner.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';
import { ToolsRegistryModule } from '../tools-registry/tools-registry.module';
import { RunnersModule } from '../runners/runners.module';
import { OrchestratorService } from './orchestrator.service';
import { GoalStore } from './goal.store';
import { OrchestratorProcessor } from './orchestrator.processor';

@Module({
  imports: [PlannerModule, PolicyEngineModule, ToolsRegistryModule, RunnersModule],
  providers: [OrchestratorService, GoalStore, OrchestratorProcessor],
  exports: [OrchestratorService, GoalStore],
})
export class OrchestratorModule {}
