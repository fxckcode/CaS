import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OrchestratorService } from '../orchestrator/orchestrator.service';

@WebSocketGateway({ namespace: '/ws', cors: true })
export class ApiGatewayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ApiGatewayGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly orchestrator: OrchestratorService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('goal:create')
  async handleGoalCreate(
    client: Socket,
    payload: { goal: string; projectId: string; autonomyMode?: string },
  ): Promise<void> {
    try {
      const goal = await this.orchestrator.createGoal({
        goal: payload.goal,
        projectId: payload.projectId,
        autonomyMode: payload.autonomyMode as any,
      });
      client.emit('goal:created', {
        id: goal.id,
        description: goal.description,
        status: goal.status,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      client.emit('goal:error', { error: message });
    }
  }
}
