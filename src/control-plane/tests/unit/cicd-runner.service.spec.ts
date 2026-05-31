import { Test, TestingModule } from '@nestjs/testing';
import { CICDRunnerService } from '../../src/runners/cicd-runner.service';
import { Job } from '../../src/shared/types';

describe('CICDRunnerService', () => {
  let service: CICDRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CICDRunnerService],
    }).compile();

    service = module.get<CICDRunnerService>(CICDRunnerService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('canHandle', () => {
    it('returns true for cicd runnerType', () => {
      const job = new Job(
        'ch-1', 'plan-1', 'step-1', 'tool-1', {},
        'cicd',
      );

      expect(service.canHandle(job)).toBe(true);
    });

    it('returns false for other types', () => {
      const shellJob = new Job(
        'ch-2a', 'plan-1', 'step-1', 'tool-1', {},
        'shell',
      );
      const dataJob = new Job(
        'ch-2b', 'plan-1', 'step-1', 'tool-1', {},
        'data',
      );

      expect(service.canHandle(shellJob)).toBe(false);
      expect(service.canHandle(dataJob)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should return validation error when owner/repo/workflow missing', async () => {
      const job = new Job(
        'ch-3', 'plan-1', 'step-1', 'tool-1',
        { platform: 'github' },
        'cicd',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires: owner, repo, workflow');
    });

    it('should return error when GITHUB_TOKEN not set and all params provided', async () => {
      // Ensure no GITHUB_TOKEN is set
      const origToken = process.env.GITHUB_TOKEN;
      const origGhToken = process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      const job = new Job(
        'ch-4', 'plan-1', 'step-1', 'tool-1',
        { owner: 'test-org', repo: 'test-repo', workflow: 'ci.yml', ref: 'main' },
        'cicd',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GITHUB_TOKEN not set');

      // Restore env
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      if (origGhToken) process.env.GH_TOKEN = origGhToken;
    });

    it('should report success when all params provided', async () => {
      // Mock the private dispatchGitHubWorkflow to simulate successful dispatch
      const dispatchSpy = jest
        .spyOn(CICDRunnerService.prototype as any, 'dispatchGitHubWorkflow')
        .mockResolvedValue({
          jobId: 'ch-5',
          success: true,
          output: "Workflow 'deploy.yml' dispatched to my-org/my-repo@main",
          startedAt: new Date(),
          completedAt: new Date(),
          metadata: {
            platform: 'github',
            owner: 'my-org',
            repo: 'my-repo',
            workflow: 'deploy.yml',
            ref: 'main',
          },
        });

      const job = new Job(
        'ch-5', 'plan-1', 'step-1', 'tool-1',
        { owner: 'my-org', repo: 'my-repo', workflow: 'deploy.yml', ref: 'main' },
        'cicd',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Workflow 'deploy.yml' dispatched");

      dispatchSpy.mockRestore();
    });

    it('should include metadata in success result', async () => {
      const dispatchSpy = jest
        .spyOn(CICDRunnerService.prototype as any, 'dispatchGitHubWorkflow')
        .mockResolvedValue({
          jobId: 'ch-6',
          success: true,
          output: "Workflow 'ci.yml' dispatched to test-org/test-repo@main",
          startedAt: new Date(),
          completedAt: new Date(),
          metadata: {
            platform: 'github',
            owner: 'test-org',
            repo: 'test-repo',
            workflow: 'ci.yml',
            ref: 'main',
          },
        });

      const job = new Job(
        'ch-6', 'plan-1', 'step-1', 'tool-1',
        { owner: 'test-org', repo: 'test-repo', workflow: 'ci.yml' },
        'cicd',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!['platform']).toBe('github');
      expect(result.metadata!['owner']).toBe('test-org');
      expect(result.metadata!['repo']).toBe('test-repo');
      expect(result.metadata!['workflow']).toBe('ci.yml');
      expect(result.metadata!['ref']).toBe('main');

      dispatchSpy.mockRestore();
    });
  });
});
