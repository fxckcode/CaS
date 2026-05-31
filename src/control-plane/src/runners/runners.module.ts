import { Module } from '@nestjs/common';
import { RunnerRegistryService } from './runner-registry.service';
import { RunnerOrchestratorService } from './runner-orchestrator.service';
import { ShellRunnerService } from './shell-runner.service';
import { CICDRunnerService } from './cicd-runner.service';
import { DataRunnerService } from './data-runner.service';

@Module({
  providers: [
    ShellRunnerService,
    CICDRunnerService,
    DataRunnerService,
    RunnerRegistryService,
    RunnerOrchestratorService,
  ],
  exports: [
    RunnerRegistryService,
    RunnerOrchestratorService,
    ShellRunnerService,
    CICDRunnerService,
    DataRunnerService,
  ],
})
export class RunnersModule {}
