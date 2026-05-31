import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from '../shared/types';
import { RunnerRegistryService } from './runner-registry.service';

@Injectable()
export class RunnerOrchestratorService {
  private readonly logger = new Logger(RunnerOrchestratorService.name);
  private readonly maxRetries = 3;

  constructor(
    private registry: RunnerRegistryService,
    private eventEmitter: EventEmitter2,
  ) {}

  async executeJob(job: Job): Promise<void> {
    const runner = this.registry.getRunner(job.runnerType);

    this.logger.log(
      `Starting job ${job.id} (${job.runnerType}) for tool ${job.toolId}`,
    );

    this.eventEmitter.emit('job.started', {
      jobId: job.id,
      runnerType: job.runnerType,
      toolId: job.toolId,
    });

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await runner.execute(job);

        if (result.success) {
          this.logger.log(`Job ${job.id} completed successfully`);
          this.eventEmitter.emit('job.completed', {
            jobId: job.id,
            result: {
              output: result.output,
              metadata: result.metadata,
            },
            startedAt: result.startedAt,
            completedAt: result.completedAt,
          });
          return;
        }

        // Runner returned success=false — treat as failure
        lastError = result.error || 'Unknown error';
        this.logger.warn(
          `Job ${job.id} returned failure (attempt ${attempt}/${this.maxRetries}): ${lastError}`,
        );

        if (attempt < this.maxRetries) {
          continue; // retry
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        lastError = errorMessage;
        this.logger.warn(
          `Job ${job.id} threw exception (attempt ${attempt}/${this.maxRetries}): ${errorMessage}`,
        );

        if (attempt < this.maxRetries) {
          continue; // retry
        }
      }
    }

    // All retries exhausted
    this.logger.error(`Job ${job.id} failed after ${this.maxRetries} attempts: ${lastError}`);
    this.eventEmitter.emit('job.failed', {
      jobId: job.id,
      error: lastError,
      attempts: this.maxRetries,
    });
  }
}
