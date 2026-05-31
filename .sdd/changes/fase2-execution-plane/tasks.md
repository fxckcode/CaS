# Tasks: Fase 2 — Execution Plane MVP

## Dependency Order
T1 ← T2 ← T3

## Tasks

### T1: Scaffold + Runner Interface + Runner Registry + Runner Orchestrator (AFK)
- **Files:** src/runners/ (runner.interface.ts, runner-registry.service.ts, runner-orchestrator.service.ts, runners.module.ts)
- **Acceptance:** Interface definida, registry resuelve runner por tipo, orchestrator conecta con processor existente
- **Estimated size:** medium

### T2: Shell Runner + CI/CD Runner + Data Runner (AFK, parallel with T1)
- **Files:** src/runners/shell-runner.service.ts, cicd-runner.service.ts, data-runner.service.ts
- **Acceptance:** Shell runner ejecuta comandos reales, CI/CD dispatches a GHA, data runner ejecuta scripts
- **Estimated size:** large

### T3: Tests + Wire into orchestrator (AFK)
- **Files:** tests/unit/runners/*.spec.ts, orchestrator.processor.ts (update)
- **Acceptance:** Tests pasan, orchestrator usa runners reales en vez de simulación
- **Estimated size:** medium
