import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ApiGatewayModule } from './api-gateway/api-gateway.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { PlannerModule } from './planner/planner.module';
import { PolicyEngineModule } from './policy-engine/policy-engine.module';
import { ToolsRegistryModule } from './tools-registry/tools-registry.module';

@Module({
  imports: [
    EventEmitterModule.forRoot({ wildcard: true }),
    ApiGatewayModule,
    OrchestratorModule,
    PlannerModule,
    PolicyEngineModule,
    ToolsRegistryModule,
  ],
})
export class AppModule {}
