import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { ToolsRegistryModule } from '../tools-registry/tools-registry.module';
import { MemoryModule } from '../memory/memory.module';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayGateway } from './api-gateway.gateway';
import { ApiGatewayService } from './api-gateway.service';

@Module({
  imports: [OrchestratorModule, ToolsRegistryModule, MemoryModule],
  controllers: [ApiGatewayController],
  providers: [ApiGatewayGateway, ApiGatewayService],
})
export class ApiGatewayModule {}
