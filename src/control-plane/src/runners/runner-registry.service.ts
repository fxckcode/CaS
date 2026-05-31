import { Injectable, Logger } from '@nestjs/common';
import { RunnerType } from '../shared/types';
import { IRunner } from './runner.interface';
import { ShellRunnerService } from './shell-runner.service';
import { CICDRunnerService } from './cicd-runner.service';
import { DataRunnerService } from './data-runner.service';

@Injectable()
export class RunnerRegistryService {
  private readonly logger = new Logger(RunnerRegistryService.name);
  private runners = new Map<RunnerType, IRunner>();

  constructor(
    private shellRunner: ShellRunnerService,
    private cicdRunner: CICDRunnerService,
    private dataRunner: DataRunnerService,
  ) {
    this.register(shellRunner);
    this.register(cicdRunner);
    this.register(dataRunner);
    this.logger.log('Runners registered: shell, cicd, data');
  }

  register(runner: IRunner): void {
    this.runners.set(runner.type as RunnerType, runner);
    this.logger.log(`Runner '${runner.type}' registered`);
  }

  getRunner(type: RunnerType): IRunner {
    const runner = this.runners.get(type);
    if (!runner) {
      throw new Error(`No runner registered for type '${type}'`);
    }
    return runner;
  }

  getAvailableRunners(): IRunner[] {
    return Array.from(this.runners.values());
  }
}
