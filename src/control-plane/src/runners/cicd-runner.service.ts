import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { Job } from '../shared/types';
import { IRunner, JobResult } from './runner.interface';

@Injectable()
export class CICDRunnerService implements IRunner {
  readonly type = 'cicd';
  private readonly logger = new Logger(CICDRunnerService.name);

  canHandle(job: Job): boolean {
    return job.runnerType === 'cicd';
  }

  async execute(job: Job): Promise<JobResult> {
    const start = new Date();

    try {
      const platform = (job.parameters['platform'] as string) || 'github';
      const owner = job.parameters['owner'] as string;
      const repo = job.parameters['repo'] as string;
      const workflow = job.parameters['workflow'] as string;
      const ref = (job.parameters['ref'] as string) || 'main';
      const inputs = (job.parameters['inputs'] as Record<string, string>) || {};

      if (platform === 'github' && owner && repo && workflow) {
        return await this.dispatchGitHubWorkflow(job.id, start, owner, repo, workflow, ref, inputs);
      }

      return {
        jobId: job.id,
        success: false,
        output: '',
        error:
          'CI/CD runner requires: owner, repo, workflow params for GitHub. Or set platform to a supported CI provider.',
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

  private dispatchGitHubWorkflow(
    jobId: string,
    startedAt: Date,
    owner: string,
    repo: string,
    workflow: string,
    ref: string,
    inputs: Record<string, string>,
  ): Promise<JobResult> {
    return new Promise((resolve) => {
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

      if (!token) {
        resolve({
          jobId,
          success: false,
          output: '',
          error:
            'GITHUB_TOKEN not set — set GITHUB_TOKEN env var to dispatch workflows',
          startedAt,
          completedAt: new Date(),
        });
        return;
      }

      const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
      const data = JSON.stringify({ ref, inputs });

      const req = https.request(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'Content-Length': data.length,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: string) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode === 204 || res.statusCode === 201) {
              this.logger.log(`Workflow '${workflow}' dispatched to ${owner}/${repo}@${ref}`);
              resolve({
                jobId,
                success: true,
                output: `Workflow '${workflow}' dispatched to ${owner}/${repo}@${ref}`,
                startedAt,
                completedAt: new Date(),
                metadata: { platform: 'github', owner, repo, workflow, ref },
              });
            } else {
              resolve({
                jobId,
                success: false,
                output: '',
                error: `GitHub API returned ${res.statusCode}: ${body}`,
                startedAt,
                completedAt: new Date(),
              });
            }
          });
        },
      );

      req.on('error', (err) => {
        resolve({
          jobId,
          success: false,
          output: '',
          error: err.message,
          startedAt,
          completedAt: new Date(),
        });
      });

      req.write(data);
      req.end();
    });
  }
}
