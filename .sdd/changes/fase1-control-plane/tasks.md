# Tasks: Fase 1 — Control Plane MVP

## Dependency Order
T1 ← T2, T3 ← T4 (T4 tests depend on modules existing)

## Tasks

### T1: Scaffold + Core Types (AFK)
- **Files:** package.json, pnpm-workspace.yaml, tsconfig, nest-cli, src/main.ts, src/app.module.ts, shared/types.ts
- **Acceptance:** pnpm install succeeds, `pnpm start:dev` boots NestJS on port 3000
- **Estimated size:** medium

### T2: API Gateway + Orchestrator (AFK, parallel with T3)
- **Files:** src/control-plane/api-gateway/, src/control-plane/orchestrator/
- **Acceptance:** POST /goals returns 201 with Goal object, WebSocket connects, state machine transitions work
- **Dependencies:** T1
- **Estimated size:** large

### T3: Planner + Policy Engine + Tools Registry (AFK, parallel with T2)
- **Files:** src/control-plane/planner/, src/control-plane/policy-engine/, src/control-plane/tools-registry/
- **Acceptance:** planner returns structured Plan, policy evaluates ALLOW/DENY/REQUIRE_APPROVAL, tools registry returns tool list
- **Dependencies:** T1
- **Estimated size:** large

### T4: Tests + Integration (AFK)
- **Files:** tests/ e2e tests, module tests
- **Acceptance:** Tests pass for all modules
- **Dependencies:** T2, T3
- **Estimated size:** medium
