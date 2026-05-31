import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { Job } from '../shared/types';
import { IRunner, JobResult } from './runner.interface';

@Injectable()
export class DataRunnerService implements IRunner {
  readonly type = 'data';
  private readonly logger = new Logger(DataRunnerService.name);

  canHandle(job: Job): boolean {
    return job.runnerType === 'data';
  }

  async execute(job: Job): Promise<JobResult> {
    const start = new Date();

    try {
      const script = job.parameters['script'] as string;
      const query = job.parameters['query'] as string;
      const language = (job.parameters['language'] as string) || 'python';

      if (script) {
        return this.executeScript(job.id, start, script, language);
      }

      if (query) {
        return this.executeQuery(job.id, start, query);
      }

      return {
        jobId: job.id,
        success: false,
        output: '',
        error: 'Data runner requires "script" or "query" parameter',
        startedAt: start,
        completedAt: new Date(),
      };
    } catch (err: any) {
      return {
        jobId: job.id,
        success: false,
        output: '',
        error: err.message,
        startedAt: start,
        completedAt: new Date(),
      };
    }
  }

  private executeScript(jobId: string, startedAt: Date, script: string, language: string): JobResult {
    const ext = language === 'python' ? 'py' : 'sql';
    const tmpFile = `/tmp/cas-job-${jobId}.${ext}`;

    writeFileSync(tmpFile, script);

    try {
      const interpreter = language === 'python' ? 'python3' : 'sqlite3';
      this.logger.log(`Executing ${language} script for job ${jobId}`);

      const output = execSync(`${interpreter} ${tmpFile}`, {
        timeout: 60000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        jobId,
        success: true,
        output: output.trim(),
        startedAt,
        completedAt: new Date(),
      };
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private executeQuery(jobId: string, startedAt: Date, query: string): JobResult {
    this.logger.log(`Executing SQL query for job ${jobId}`);

    try {
      const output = execSync(`echo "${query}" | sqlite3 :memory:`, {
        timeout: 30000,
        encoding: 'utf-8',
      });

      return {
        jobId,
        success: true,
        output: output.trim(),
        startedAt,
        completedAt: new Date(),
      };
    } catch (err: any) {
      return {
        jobId,
        success: false,
        output: err.stdout?.trim() || '',
        error: err.stderr?.trim() || err.message,
        startedAt,
        completedAt: new Date(),
      };
    }
  }
}
