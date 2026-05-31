import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

interface JobEvent {
  goalId: string;
  job: {
    id: string;
    planId: string;
    stepId: string;
    toolId: string;
    parameters: Record<string, unknown>;
    runnerType: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

@Injectable()
export class OrchestratorProcessor {
  private readonly logger = new Logger(OrchestratorProcessor.name);
  private readonly retryCounts = new Map<string, number>();
  private readonly maxRetries = 3;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @OnEvent('job.published')
  async handleJobPublished(payload: JobEvent): Promise<void> {
    const { job } = payload;
    this.logger.log(`Processing job ${job.id} for tool ${job.toolId}`);

    // Simulate execution with a short timeout
    try {
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          // Simulate 90% success rate
          if (Math.random() < 0.9) {
            resolve();
          } else {
            reject(new Error(`Simulated execution failure for job ${job.id}`));
          }
        }, 50);
      });

      this.logger.log(`Job ${job.id} completed successfully`);
      this.eventEmitter.emit('job.completed', {
        jobId: job.id,
        result: { output: `Job ${job.id} executed successfully` },
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const retries = this.retryCounts.get(job.id) ?? 0;

      if (retries < this.maxRetries) {
        this.retryCounts.set(job.id, retries + 1);
        this.logger.warn(
          `Job ${job.id} failed (attempt ${retries + 1}/${this.maxRetries}), retrying...`,
        );
        // Re-publish with slight delay
        setTimeout(() => {
          this.eventEmitter.emit('job.published', payload);
        }, 100);
      } else {
        this.logger.error(
          `Job ${job.id} failed after ${this.maxRetries} retries: ${errorMessage}`,
        );
        this.eventEmitter.emit('job.failed', {
          jobId: job.id,
          error: errorMessage,
        });
        this.retryCounts.delete(job.id);
      }
    }
  }
}
