# Proposal: Fase 2 — Execution Plane MVP

## Intent
Implementar el Execution Plane de CaS: runners que ejecutan jobs reales (shell local, GitHub Actions, data processing), con interfaz común y bridge desde el Control Plane.

## Scope
### In
- [x] `src/execution-plane/` scaffold (package.json, tsconfig, shared interfaces)
- [x] **Runner interface**: IRunner con método `execute(job: Job): Promise<JobResult>`
- [x] **Shell Runner**: ejecuta comandos en shell local con timeout, env vars, working directory
- [x] **CI/CD Runner**: dispatches a GitHub Actions via API, track workflow run status
- [x] **Data Runner**: ejecuta scripts Python/SQL en subproceso
- [x] **Runner Registry**: factory que resuelve qué runner usar según `runnerType`
- [x] **Bridge desde Orchestrator**: RunnerOrchestratorService que consume jobs y los envía al runner correspondiente
- [x] **Tests** para cada runner

### Out
- [ ] Docker sandboxing (contendrá a Fase 5)
- [ ] BullMQ/Redis queue persistente (MVP usa cola in-memory del orchestrator existente)
- [ ] OPA/Rego (Fase 5)
- [ ] WebSocket bridge para logs streaming real-time (se puede agregar después)

## Stack
- TypeScript, pnpm workspace
- child_process (spawn) para shell runner
- @actions/github o REST API para CI/CD runner
- child_process.spawn para data runner
