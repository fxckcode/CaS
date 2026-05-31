import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RunnerOrchestratorService } from '../../src/runners/runner-orchestrator.service';
import { RunnerRegistryService } from '../../src/runners/runner-registry.service';
import { JobResult } from '../../src/runners/runner.interface';
import { Job } from '../../src/shared/types';

describe('RunnerOrchestratorService', () => {
  let service: RunnerOrchestratorService;
  let mockRegistry: jest.Mocked<RunnerRegistryService>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockRunner: { type: string; canHandle: jest.Mock; execute: jest.Mock };

  function makeResult(overrides: Partial<JobResult> = {}): JobResult {
    return {
      jobId: overrides.jobId || 'test-job',
      success: overrides.success ?? true,
      output: overrides.output || '',
      error: overrides.error,
      startedAt: overrides.startedAt || new Date(),
      completedAt: overrides.completedAt || new Date(),
      metadata: overrides.metadata,
    };
  }

  beforeEach(async () => {
    mockRunner = {
      type: 'shell',
      canHandle: jest.fn().mockReturnValue(true),
      execute: jest.fn(),
    };

    mockRegistry = {
      getRunner: jest.fn().mockReturnValue(mockRunner),
      register: jest.fn(),
      getAvailableRunners: jest.fn().mockReturnValue([mockRunner]),
    } as any;

    mockEventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunnerOrchestratorService,
        { provide: RunnerRegistryService, useValue: mockRegistry },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<RunnerOrchestratorService>(RunnerOrchestratorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should execute a job via the correct runner', async () => {
    mockRunner.execute.mockResolvedValue(makeResult({ jobId: 'exec-1', success: true }));

    const job = new Job(
      'exec-1', 'plan-1', 'step-1', 'tool-1',
      { command: 'echo hi' },
      'shell',
    );

    await service.executeJob(job);

    expect(mockRegistry.getRunner).toHaveBeenCalledWith('shell');
    expect(mockRunner.execute).toHaveBeenCalledWith(job);
  });

  it('should emit job.started event', async () => {
    mockRunner.execute.mockResolvedValue(makeResult({ jobId: 'evt-1', success: true }));

    const job = new Job(
      'evt-1', 'plan-1', 'step-1', 'tool-1', {},
      'shell',
    );

    await service.executeJob(job);

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'job.started',
      expect.objectContaining({ jobId: 'evt-1', runnerType: 'shell', toolId: 'tool-1' }),
    );
  });

  it('should emit job.completed event on success', async () => {
    mockRunner.execute.mockResolvedValue(
      makeResult({
        jobId: 'evt-2',
        success: true,
        output: 'done',
        metadata: { key: 'val' },
      }),
    );

    const job = new Job(
      'evt-2', 'plan-1', 'step-1', 'tool-1', {},
      'shell',
    );

    await service.executeJob(job);

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'job.completed',
      expect.objectContaining({
        jobId: 'evt-2',
        result: expect.objectContaining({
          output: 'done',
          metadata: { key: 'val' },
        }),
      }),
    );
  });

  it('should emit job.failed event on error', async () => {
    mockRunner.execute.mockResolvedValue(
      makeResult({ jobId: 'evt-3', success: false, error: 'command failed' }),
    );

    const job = new Job(
      'evt-3', 'plan-1', 'step-1', 'tool-1', {},
      'shell',
    );

    await service.executeJob(job);

    // job.failed should be emitted after all retries exhausted
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'job.failed',
      expect.objectContaining({
        jobId: 'evt-3',
        error: 'command failed',
        attempts: 3,
      }),
    );
  });

  it('should retry on failure up to 3 times', async () => {
    mockRunner.execute.mockResolvedValue(
      makeResult({ jobId: 'retry-1', success: false, error: 'transient error' }),
    );

    const job = new Job(
      'retry-1', 'plan-1', 'step-1', 'tool-1', {},
      'shell',
    );

    await service.executeJob(job);

    expect(mockRunner.execute).toHaveBeenCalledTimes(3);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'job.failed',
      expect.objectContaining({ jobId: 'retry-1', attempts: 3 }),
    );
  });

  it('should succeed on retry if runner eventually succeeds', async () => {
    mockRunner.execute
      .mockResolvedValueOnce(makeResult({ jobId: 'retry-2', success: false, error: 'fail1' }))
      .mockResolvedValueOnce(makeResult({ jobId: 'retry-2', success: false, error: 'fail2' }))
      .mockResolvedValueOnce(makeResult({ jobId: 'retry-2', success: true, output: 'finally passed' }));

    const job = new Job(
      'retry-2', 'plan-1', 'step-1', 'tool-1', {},
      'shell',
    );

    await service.executeJob(job);

    expect(mockRunner.execute).toHaveBeenCalledTimes(3);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'job.completed',
      expect.objectContaining({
        jobId: 'retry-2',
        result: expect.objectContaining({ output: 'finally passed' }),
      }),
    );
    expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
      'job.failed',
      expect.anything(),
    );
  });

  it('should handle runner not found error', async () => {
    mockRegistry.getRunner.mockImplementation(() => {
      throw new Error("No runner registered for type 'unknown'");
    });

    const job = new Job(
      'err-1', 'plan-1', 'step-1', 'tool-1', {},
      'unknown' as any,
    );

    // getRunner throws before the event emit / try block, so the promise rejects
    await expect(service.executeJob(job)).rejects.toThrow(
      "No runner registered for type 'unknown'",
    );

    // job.started should NOT be emitted because getRunner throws first
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should pass job parameters to the runner', async () => {
    mockRunner.execute.mockImplementation(async (j: Job) =>
      makeResult({ jobId: j.id, success: true, output: String(j.parameters['command']) }),
    );

    const job = new Job(
      'param-1', 'plan-1', 'step-1', 'tool-1',
      { command: 'deploy --env prod', timeout: 60000 },
      'shell',
    );

    await service.executeJob(job);

    expect(mockRunner.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          command: 'deploy --env prod',
          timeout: 60000,
        }),
      }),
    );
  });
});
