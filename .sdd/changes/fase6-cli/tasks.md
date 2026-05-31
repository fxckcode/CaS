# Tasks: Fase 6 — CLI Tooling

## Dependency Order
T1 ← T2 (secuencial)

## Tasks

### T1: Scaffold CLI project + HTTP client (AFK)
- **Files:** `packages/cas-cli/package.json`, `packages/cas-cli/tsconfig.json`, `packages/cas-cli/src/client.ts`
- **Acceptance:** Package structure, HTTP client con fetch nativo, bin alias
- **Dependencies:** ninguna
- **Size:** small

### T2: Implement all commands (AFK)
- **Files:**
  - `packages/cas-cli/src/index.ts` — entry point con Commander
  - `packages/cas-cli/src/commands/goals.ts` — list, create, get, plan
  - `packages/cas-cli/src/commands/tools.ts` — tools list
  - `packages/cas-cli/src/commands/memory.ts` — memory search
  - `packages/cas-cli/src/commands/health.ts` — health check
  - `pnpm-workspace.yaml` — agregar workspace
- **Acceptance:** Todos los comandos funcionan contra el server real
- **Dependencies:** T1
- **Size:** medium
