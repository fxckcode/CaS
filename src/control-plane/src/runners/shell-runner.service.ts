import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { Job } from '../shared/types';
import { IRunner, JobResult } from './runner.interface';

@Injectable()
export class ShellRunnerService implements IRunner {
  readonly type = 'shell';
  private readonly logger = new Logger(ShellRunnerService.name);

  canHandle(job: Job): boolean {
    return job.runnerType === 'shell';
  }

  async execute(job: Job): Promise<JobResult> {
    const start = new Date();
    const command =
      (job.parameters['command'] as string) ||
      (job.parameters['entrypoint'] as string) ||
      'echo "no command"';
    const timeout = (job.parameters['timeout'] as number) || 30000;

    this.logger.log(`Executing shell command for job ${job.id}: ${command.substring(0, 120)}`);

    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        cwd: (job.parameters['cwd'] as string) || process.cwd(),
        env: {
          ...process.env,
          ...((job.parameters['env'] as Record<string, string>) || {}),
        },
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });

      return {
        jobId: job.id,
        success: true,
        output: output.trim(),
        startedAt: start,
        completedAt: new Date(),
      };
    } catch (err: any) {
      return {
        jobId: job.id,
        success: false,
        output: err.stdout?.trim() || '',
        error: err.stderr?.trim() || err.message,
        startedAt: start,
        completedAt: new Date(),
      };
    }
  }
}
