import { Test, TestingModule } from '@nestjs/testing';
import { ShellRunnerService } from '../../src/runners/shell-runner.service';
import { Job } from '../../src/shared/types';

describe('ShellRunnerService', () => {
  let service: ShellRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShellRunnerService],
    }).compile();

    service = module.get<ShellRunnerService>(ShellRunnerService);
  });

  describe('execute', () => {
    it('should execute a shell command and return success', async () => {
      const job = new Job(
        'test-1', 'plan-1', 'step-1', 'tool-1',
        { command: 'echo "hello"' },
        'shell',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('test-1');
    });

    it('should capture stdout as output', async () => {
      const job = new Job(
        'test-2', 'plan-1', 'step-1', 'tool-1',
        { command: 'echo "hello world"' },
        'shell',
      );

      const result = await service.execute(job);

      expect(result.output).toContain('hello world');
    });

    it('should capture stderr on failure', async () => {
      const job = new Job(
        'test-3', 'plan-1', 'step-1', 'tool-1',
        { command: 'ls /nonexistent_dir_cas_test_xyz' },
        'shell',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use provided cwd parameter', async () => {
      const job = new Job(
        'test-4', 'plan-1', 'step-1', 'tool-1',
        { command: 'pwd', cwd: '/tmp' },
        'shell',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(true);
      expect(result.output).toBe('/tmp');
    });

    it('should use provided timeout parameter and abort long commands', async () => {
      const job = new Job(
        'test-5', 'plan-1', 'step-1', 'tool-1',
        { command: 'sleep 5 && echo done', timeout: 200 },
        'shell',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-existent command gracefully', async () => {
      const job = new Job(
        'test-6', 'plan-1', 'step-1', 'tool-1',
        { command: 'nonexistent_command_cas_test_xyz' },
        'shell',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
    });
  });

  describe('canHandle', () => {
    it('returns true for shell runnerType', () => {
      const job = new Job(
        'test-7', 'plan-1', 'step-1', 'tool-1', {},
        'shell',
      );

      expect(service.canHandle(job)).toBe(true);
    });

    it('returns false for other runnerTypes', () => {
      const cicdJob = new Job(
        'test-8a', 'plan-1', 'step-1', 'tool-1', {},
        'cicd',
      );
      const dataJob = new Job(
        'test-8b', 'plan-1', 'step-1', 'tool-1', {},
        'data',
      );

      expect(service.canHandle(cicdJob)).toBe(false);
      expect(service.canHandle(dataJob)).toBe(false);
    });
  });
});
