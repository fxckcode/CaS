import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrchestratorService } from '../orchestrator/orchestrator.service';

@WebSocketGateway({ namespace: '/ws', cors: true })
export class ApiGatewayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ApiGatewayGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Forward goal lifecycle events to all connected WS clients
    const forwardEvent = (eventName: string) => (payload: Record<string, unknown>) => {
      this.server?.emit(eventName, payload);
    };

    this.eventEmitter.on('goal.created', forwardEvent('goal:created'));
    this.eventEmitter.on('goal.planned', forwardEvent('goal:planned'));
    this.eventEmitter.on('goal.completed', forwardEvent('goal:completed'));
    this.eventEmitter.on('goal.failed', forwardEvent('goal:failed'));
    this.eventEmitter.on('goal.approval_required', forwardEvent('goal:approval_required'));
  }

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
