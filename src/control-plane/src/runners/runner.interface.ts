import { Job } from '../shared/types';

export interface JobResult {
  jobId: string;
  success: boolean;
  output: string;
  error?: string;
  startedAt: Date;
  completedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface IRunner {
  readonly type: string;
  canHandle(job: Job): boolean;
  execute(job: Job): Promise<JobResult>;
}
