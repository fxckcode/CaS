# Tasks: Fase 5 — Dashboard Web

## Dependency Order
T1 ← T2 ← T3 (secuencial)

## Tasks

### T1: Backend — PlanStore + nuevos endpoints (AFK)
- **Files:** 
  - `src/orchestrator/plan.store.ts` 🆕
  - `src/orchestrator/orchestrator.module.ts` ✏️
  - `src/orchestrator/orchestrator.service.ts` ✏️
  - `src/api-gateway/api-gateway.controller.ts` ✏️
  - `src/api-gateway/api-gateway.service.ts` ✏️
  - `src/api-gateway/api-gateway.gateway.ts` ✏️
  - `src/api-gateway/api-gateway.dto.ts` ✏️
  - `src/api-gateway/api-gateway.module.ts` ✏️
  - `package.json` ✏️
  - `tests/unit/` — tests nuevos
- **Acceptance:** 
  - `GET /goals` retorna lista de goals
  - `GET /goals/:id/plan` retorna plan del goal
  - `GET /memory` retorna memory items (con query params)
  - PlanStore almacena planes emitidos por Orchestrator
  - WS gateway reenvía eventos goal.* a clientes
- **Dependencies:** ninguna
- **Size:** medium

### T2: Frontend — Dashboard HTML (AFK)
- **Files:** `dashboard/index.html` 🆕
- **Acceptance:** 
  - Muestra lista de goals con status y timestamps
  - Permite crear goals desde UI
  - Muestra tools disponibles
  - Muestra memory items con búsqueda
  - Conexión WebSocket en vivo
  - Dark theme profesional
  - Sin build step (vanilla HTML+CSS+JS)
- **Dependencies:** T1 (endpoints existentes)
- **Size:** medium

### T3: Static serving config + tests (AFK)
- **Files:** 
  - `src/main.ts` ✏️
  - `src/app.module.ts` ✏️
  - `tests/unit/` — tests nuevos para PlanStore y endpoints
- **Acceptance:** Dashboard servido en `/` al iniciar CaS
- **Dependencies:** T2
- **Size:** small
