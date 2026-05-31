# CaS — CLI as a Service

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Tests](https://img.shields.io/badge/tests-136%20passing-brightgreen)

> **Executable reference architecture** for a corporate autonomous agent system with policy control, isolated execution, and persistent memory.

---

## Project Status

**Fully implemented reference architecture — 7 phases completed.** 136 tests, 0 failures.

This is an **executable reference architecture**: every component is implemented in TypeScript/NestJS, fully tested, and runnable. Use it as a foundation, template, or inspiration for your own autonomous agent platform.

---

## What's Inside

### Control Plane (NestJS monorepo)

| Component | Description |
|-----------|-------------|
| **API Gateway** | REST + WebSocket server on `:3000`. Routes: `/goals`, `/goals/:id/plan`, `/memory`, `/tools`, `/health`. SSE streaming, CORS enabled. |
| **Orchestrator** | State machine managing Goal lifecycle: `created → planned → running → completed/failed`. Emits WebSocket events (`goal.created`, `goal.planned`, `goal.completed`, `goal.failed`). Persistent PlanStore. |
| **Planner** | Template-based planner. Creates execution plans with steps and tool mappings. Stores plans via PlanStore. |
| **Policy Engine** | 3-mode authorization: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`. Mode selection via `POLICY_MODE` env var. |
| **Tools Registry** | 8 seed tools: `shell`, `read_file`, `write_file`, `search_files`, `plan`, `review`, `delegate_task`, `memory`. Each with schema, versioning, and capabilities. |

### Execution Plane

| Runner | Description |
|--------|-------------|
| **Shell Runner** | Executes shell commands. Handles stdout/stderr, timeouts, status reporting back to orchestrator. |
| **CI/CD Runner** | Dispatches GitHub Actions workflows. Supports event types, refs, and input parameters. |
| **Data Runner** | Runs Python data processing scripts. Handles stdout capture, error propagation, result return. |

### Memory Layer

Dual implementation via DI token `MEMORY_STORE`:

| Driver | Description |
|--------|-------------|
| **In-Memory** (default) | `InMemoryStore` — `Map`-backed, ephemeral. Perfect for tests and development. |
| **SQLite** | `SqliteMemoryStoreService` — `better-sqlite3`-backed, persistent. Activate with `MEMORY_DRIVER=sqlite`. |

Stores goal completion records and provides context injection for planners.

### Dashboard

Dark-themed SPA served at `http://localhost:3000/`:
- Real-time goal feed via WebSocket
- Goal creation, status tracking, plan visualization
- Memory search
- Connects to API Gateway's Socket.IO endpoint

### CLI

`cas` — a Commander.js + Chalk CLI tool with 7 commands:

```bash
cas health              # Check server status
cas goals list          # List all goals
cas goals get <id>      # Get goal by ID (partial ID resolution >3 chars)
cas goals create <desc> # Create a new goal
cas goals plan <id>     # Generate a plan for a goal
cas tools               # List available tools
cas memory <query>      # Search memory store
```

Partial ID resolution: `cas goals get abc` matches the first goal starting with `abc`.

---

## Quick Start

```bash
# Install dependencies
cd src/control-plane
pnpm install

# Build & run
pnpm build && node dist/main.js
# → Server on http://localhost:3000
# → Dashboard at http://localhost:3000/

# Persist memory (optional)
MEMORY_DRIVER=sqlite node dist/main.js

# Run tests
pnpm test
# → 136 tests, 0 failures

# CLI (from another terminal)
cas health
cas goals create "Deploy API v3"
cas goals list
cas goals plan <id>
```

---

## Repository Structure

```
.
├── README.md                   ← You are here
├── README.es.md                ← Español
├── package.json                ← Workspace root
│
├── packages/
│   └── cas-cli/                ← CLI tool (Commander.js + Chalk)
│       └── src/
│           ├── index.ts         ← Entry point
│           ├── client.ts        ← HTTP client for API Gateway
│           └── commands/        ← Command implementations
│
├── src/
│   └── control-plane/          ← NestJS monorepo
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── api-gateway/     ← Controller + Gateway (WS) + PlanStore + Dashboard SPA
│       │   ├── orchestrator/    ← OrchestratorService + GoalStore
│       │   ├── planner/         ← PlannerService (template-based)
│       │   ├── policy-engine/   ← PolicyEngineService (3 modes)
│       │   ├── tools-registry/  ← ToolRegistryService (8 seed tools)
│       │   ├── runners/         ← Shell, CI/CD, Data runners
│       │   ├── memory/          ← IMemoryStore, SQLite, InMemory, Reader/Writer
│       │   └── shared/          ← Shared types, enums, interfaces
│       ├── tests/
│       │   ├── unit/            ← 121 unit tests
│       │   └── e2e/             ← 15 e2e tests
│       └── package.json
│
├── docs/                       ← Architecture documentation
│   ├── 01-overview.md
│   ├── 02-architecture-logical.md
│   ├── 03-control-plane.md
│   ├── 04-execution-plane.md
│   ├── 05-memory-and-context.md
│   ├── 06-security-and-compliance.md
│   ├── 07-domain-verticals.md
│   └── research-cli-architecture.md
│
├── adr/                        ← Architecture Decision Records
│   ├── ADR-001-choose-cas-architecture.md
│   └── ADR-002-security-model.md
│
├── diagrams/                   ← Mermaid diagrams
│   ├── logical-architecture.mmd
│   └── sequence-goal-to-execution.mmd
│
├── examples/                   ── Domain vertical examples
├── infra/                      ← Terraform / K8s manifests (scaffolding)
└── .sdd/                       ← Spec-Driven Development records
```

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                    Control Plane                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Gateway  │  │Orchestr. │  │ Planner  │  │ Policy │  │
│  │ REST+WS  │◄─┤ State    │◄─┤ Template │  │ Engine │  │
│  │ /goals   │  │ Machine  │  │+Memory   │  │3 Modes │  │
│  │ /memory  │  │ GoalStore│  │ Context  │  │        │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └────────┘  │
│       │              │                                   │
│  ┌────▼──────────────▼────────────────────────────┐      │
│  │              Message Queue (in-process)        │      │
│  └────┬──────────────┬────────────────────────────┘      │
│       │              │                                   │
│  ┌────▼─────┐  ┌─────▼──────┐  ┌───────────┐           │
│  │  Shell   │  │  CI/CD     │  │   Data    │           │
│  │  Runner  │  │  Runner    │  │   Runner  │           │
│  └──────────┘  └────────────┘  └───────────┘           │
│              Execution Plane                             │
└─────────────────────────────────────────────────────────┘
         │                         │
    ┌────▼─────┐            ┌──────▼──────┐
    │ Dashboard│            │ CLI (cas)   │
    │ SPA      │            │ Commander   │
    │ Socket.IO│            │ + Chalk     │
    └──────────┘            └─────────────┘
```

### Key Design Decisions

- **Pattern B (Gateway + Thin Clients)**: WebSocket for real-time bidirectional communication, HTTP+SSE for streaming. Multiple frontends (CLI, Dashboard, future Slack/Teams).
- **Dynamic DI**: Memory store selected at runtime via `MEMORY_DRIVER` env var. `IMemoryStore` token abstraction makes swapping implementations trivial.
- **State Machine**: Orchestrator drives Goal lifecycle explicitly. Clear transitions and error states.
- **PlanStore**: Plans are persisted alongside Goal state, enabling resumability and audit.

---

## Test Suite

```bash
# Run all 136 tests
pnpm test
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| **Unit** | **121** | Control Plane (Gateway, Orchestrator, Planner, Policy, Tools), Execution Plane (all runners), Memory Layer (SQLite + InMemory) |
| **E2E** | **15** | HTTP endpoints, Goal lifecycle, plan generation, memory search, health check |

All tests pass. CI-ready.

---

## Configuration

| Env Var | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API Gateway listen port |
| `MEMORY_DRIVER` | — | `sqlite` for persistent storage (default: in-memory) |
| `POLICY_MODE` | `ALLOW` | `ALLOW` / `DENY` / `APPROVAL` |
| `DB_PATH` | `./data/cas.db` | SQLite database path (when `MEMORY_DRIVER=sqlite`) |

---

## Roadmap

- [x] **Fase 0** — Architectural documentation & ADRs
- [x] **Fase 1** — Control Plane MVP (Gateway, Orchestrator, Planner, Policy, Tools)
- [x] **Fase 2** — Execution Plane MVP (Shell, CI/CD, Data runners)
- [x] **Fase 3** — Memory Layer (IMemoryStore, Reader, Writer)
- [x] **Fase 4** — Persistence (SQLite with better-sqlite3)
- [x] **Fase 5** — Dashboard Web (SPA + WebSocket live updates)
- [x] **Fase 6** — CLI Tooling (Commander.js + Chalk, 7 commands)
- [ ] **Future** — Docker runner, Kubernetes runner, Hermes integration, OPA policy engine, Slack/Teams adapters

---

## References

- [Codex CLI](https://developers.openai.com/codex/cli/)
- [Long-running agents paper](https://arxiv.org/pdf/2309.06551.pdf)
- [Claude Memory](https://skywork.ai/blog/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution/)
- [Research: CLI Architecture](./docs/research-cli-architecture.md)

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Contact

Built by [fxckcode](https://github.com/fxckcode). Issues and PRs welcome.
