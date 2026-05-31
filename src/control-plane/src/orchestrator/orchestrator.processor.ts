import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Job } from '../shared/types';
import { RunnerOrchestratorService } from '../runners/runner-orchestrator.service';

@Injectable()
export class OrchestratorProcessor {
  private readonly logger = new Logger(OrchestratorProcessor.name);

  constructor(
    private readonly runnerOrchestrator: RunnerOrchestratorService,
  ) {}

  @OnEvent('job.published')
  async handleJobPublished(payload: { goalId: string; job: Record<string, unknown> }): Promise<void> {
    const jobData = payload.job;

    // Reconstruct a Job instance from the event payload
    const job = new Job(
      jobData['id'] as string,
      jobData['planId'] as string,
      jobData['stepId'] as string,
      jobData['toolId'] as string,
      jobData['parameters'] as Record<string, unknown>,
      jobData['runnerType'] as 'shell' | 'cicd' | 'data',
      'pending',
      jobData['createdAt'] as Date,
      jobData['updatedAt'] as Date,
    );

    this.logger.log(
      `Received job ${job.id} (${job.runnerType}) for tool ${job.toolId}`,
    );

    try {
      await this.runnerOrchestrator.executeJob(job);
      this.logger.log(`Job ${job.id} processed by runner orchestrator`);
    } catch (err: unknown) {
      // RunnerOrchestratorService already emits job.failed on errors,
      // but if executeJob itself throws unexpectedly, catch it here.
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Unexpected error processing job ${job.id}: ${errorMessage}`,
      );
    }
  }
}
