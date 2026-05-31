import { Test, TestingModule } from '@nestjs/testing';
import { RunnerRegistryService } from '../../src/runners/runner-registry.service';
import { ShellRunnerService } from '../../src/runners/shell-runner.service';
import { CICDRunnerService } from '../../src/runners/cicd-runner.service';
import { DataRunnerService } from '../../src/runners/data-runner.service';
import { RunnerType, Job } from '../../src/shared/types';

describe('RunnerRegistryService', () => {
  let service: RunnerRegistryService;
  let shellRunner: ShellRunnerService;
  let cicdRunner: CICDRunnerService;
  let dataRunner: DataRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellRunnerService,
        CICDRunnerService,
        DataRunnerService,
        RunnerRegistryService,
      ],
    }).compile();

    service = module.get<RunnerRegistryService>(RunnerRegistryService);
    shellRunner = module.get<ShellRunnerService>(ShellRunnerService);
    cicdRunner = module.get<CICDRunnerService>(CICDRunnerService);
    dataRunner = module.get<DataRunnerService>(DataRunnerService);
  });

  it('should register all three runners on construction', () => {
    const runners = service.getAvailableRunners();

    expect(runners).toHaveLength(3);
    expect(runners.map(r => r.type)).toEqual(
      expect.arrayContaining(['shell', 'cicd', 'data']),
    );
  });

  it('should return correct runner for each RunnerType via getRunner()', () => {
    const shell = service.getRunner('shell' as RunnerType);
    const cicd = service.getRunner('cicd' as RunnerType);
    const data = service.getRunner('data' as RunnerType);

    expect(shell).toBeInstanceOf(ShellRunnerService);
    expect(shell.type).toBe('shell');

    expect(cicd).toBeInstanceOf(CICDRunnerService);
    expect(cicd.type).toBe('cicd');

    expect(data).toBeInstanceOf(DataRunnerService);
    expect(data.type).toBe('data');
  });

  it('should throw error for unknown runner type', () => {
    expect(() => service.getRunner('unknown' as RunnerType)).toThrow(
      "No runner registered for type 'unknown'",
    );
  });

  it('should allow registering custom runners', () => {
    const customRunner = {
      type: 'custom',
      canHandle: jest.fn().mockReturnValue(true),
      execute: jest.fn().mockResolvedValue({}),
    };

    service.register(customRunner);

    const retrieved = service.getRunner('custom' as RunnerType);
    expect(retrieved).toBe(customRunner);
    expect(service.getAvailableRunners()).toHaveLength(4);
  });

  it('getAvailableRunners returns all registered runners', () => {
    const runners = service.getAvailableRunners();

    expect(runners).toHaveLength(3);
    expect(runners.some(r => r.type === 'shell')).toBe(true);
    expect(runners.some(r => r.type === 'cicd')).toBe(true);
    expect(runners.some(r => r.type === 'data')).toBe(true);
  });

  it('getRunner returns the same instance', () => {
    const shell1 = service.getRunner('shell' as RunnerType);
    const shell2 = service.getRunner('shell' as RunnerType);

    expect(shell1).toBe(shell2);
  });
});
