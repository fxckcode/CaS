# Proposal: Fase 1 — Control Plane MVP

## Intent
Implementar el Control Plane base de CaS: API Gateway HTTP/WS, Orchestrator con state machine, Planner con integración LLM, Policy Engine con modos de autonomía, y Tools Registry con tool descriptors.

## Scope
### In
- [x] Scaffold monorepo (pnpm workspaces, NestJS, TypeScript)
- [x] `src/control-plane/api-gateway/` — NestJS module, endpoints /goals, /health, WebSocket
- [x] `src/control-plane/orchestrator/` — Goal lifecycle state machine, Plan DAG
- [x] `src/control-plane/planner/` — Prompt builder, LLM provider abstraction
- [x] `src/control-plane/policy-engine/` — Autonomy modes (MVP inline), policy evaluation
- [x] `src/control-plane/tools-registry/` — Tool YAML descriptors, GET /tools
- [x] Tests para cada módulo

### Out
- [ ] Execution Plane (runners) — Fase 2
- [ ] Memory Layer — Fase 3
- [ ] OPA/Rego integration — Fase 5 (MVP inline first)
- [ ] TUI/Web UI — Fase 4
- [ ] BullMQ/Redis — Fase 2 (MVP usa cola en memoria)

## Stack
- TypeScript + NestJS + pnpm workspaces
- Jest + Supertest para tests
- In-memory queue (MVP), BullMQ después
