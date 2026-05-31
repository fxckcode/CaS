import { Test, TestingModule } from '@nestjs/testing';
import { DataRunnerService } from '../../src/runners/data-runner.service';
import { Job } from '../../src/shared/types';

describe('DataRunnerService', () => {
  let service: DataRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataRunnerService],
    }).compile();

    service = module.get<DataRunnerService>(DataRunnerService);
  });

  describe('canHandle', () => {
    it('returns true for data runnerType', () => {
      const job = new Job(
        'dr-1', 'plan-1', 'step-1', 'tool-1', {},
        'data',
      );

      expect(service.canHandle(job)).toBe(true);
    });

    it('returns false for other types', () => {
      const shellJob = new Job(
        'dr-2a', 'plan-1', 'step-1', 'tool-1', {},
        'shell',
      );
      const cicdJob = new Job(
        'dr-2b', 'plan-1', 'step-1', 'tool-1', {},
        'cicd',
      );

      expect(service.canHandle(shellJob)).toBe(false);
      expect(service.canHandle(cicdJob)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute python script', async () => {
      const job = new Job(
        'dr-3', 'plan-1', 'step-1', 'tool-1',
        { script: 'print("hello from python")', language: 'python' },
        'data',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello from python');
    });

    it('should execute sql query via sqlite3', async () => {
      const job = new Job(
        'dr-4', 'plan-1', 'step-1', 'tool-1',
        { query: "SELECT 'hello sqlite';" },
        'data',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello sqlite');
    });

    it('should return error when neither script nor query provided', async () => {
      const job = new Job(
        'dr-5', 'plan-1', 'step-1', 'tool-1',
        {},
        'data',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires "script" or "query"');
    });

    it('should handle script execution errors', async () => {
      const job = new Job(
        'dr-6', 'plan-1', 'step-1', 'tool-1',
        { script: 'print(1/0)', language: 'python' },
        'data',
      );

      const result = await service.execute(job);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
