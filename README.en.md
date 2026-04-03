# CaS — CLI as a Service Reference Architecture

[🇪🇸 Español](./README.md) | [🇬🇧 English](./README.en.md)

> **Executable reference architecture** for a corporate autonomous agent system with policy control, isolated execution, and persistent memory.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Vision

This repository documents a **reference architecture** for building a corporate **CLI as a Service**: a system where users express high-level goals and the system orchestrates real tools on corporate infrastructure.

**From chatbots that respond to agents that act**: inspired by [Codex CLI](https://developers.openai.com/codex/cli/) and modern development agents, CaS allows agents to read, edit, and execute local code with different levels of autonomy, while maintaining security, audit, and enterprise policy control.

---

## Project Status

**Reference architecture — NOT production ready.**

This project is currently an architectural specification and design guide. Implementation code is on the roadmap.

---

## Architecture Components

The architecture is not just a "proof of concept," but an **executable reference architecture** for a corporate CLI as a Service:

### Control Plane
Agent orchestrator, planner, policy engine, tools registry.

### Execution Plane
Isolated runners (containers/jobs) with network profiles and minimal credentials.

### Memory Layer
Project/organization state and decision traces (CHANGELOG/Org Memory, inspired by [long‑running agents](https://arxiv.org/pdf/2309.06551.pdf) and [Claude Memory](https://skywork.ai/blog/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution/)).

### Interface Layer
HTTP/WebSocket chat + Slack/Teams/WhatsApp adapters (initial mocks included).

The design of this layer is grounded in a comparative analysis of modern AI agent CLIs (Claude Code, Opencode, Codex CLI, OpenClaw). See [`docs/research-cli-architecture.md`](./docs/research-cli-architecture.md) for the full study.

---

## Repository Structure

```text
cas-reference-arch/
  README.md

  docs/
    01-overview.md
    02-architecture-logical.md
    03-control-plane.md
    04-execution-plane.md
    05-memory-and-context.md
    06-security-and-compliance.md
    07-domain-verticals.md

  adr/
    ADR-001-choose-cas-architecture.md
    ADR-002-security-model.md

  diagrams/
    logical-architecture.mmd
    sequence-goal-to-execution.mmd

  src/
    control-plane/
      api-gateway/
      orchestrator/
      planner/
      policy-engine/
      tools-registry/
    execution-plane/
      runners/
        shell-runner/
        cicd-runner/
        data-runner/
    memory/
      org-store/
      project-store/

  infra/
    terraform/
    k8s/

  examples/
    devops-migration/
    marketing-campaign/
    finance-reporting/
```

---

## High-Level Architecture

The technical README serves as an architecture paper + quick start guide:

### 1. Context and Vision

- **From "chatbots that respond" to "agents that act"**: References to [Codex CLI](https://developers.openai.com/codex/quickstart/) and development agents with read/edit/execute capabilities for local code with different levels of autonomy.
- **Corporate CLI as a Service**: Users express goals, the system orchestrates real tools on corporate infrastructure.

### 2. Logical Diagram

Mermaid diagram (`diagrams/logical-architecture.mmd`) with:
- Interfaces (chat/API gateway)
- Orchestrator + planner + policy engine + tools registry
- Execution plane (runners)
- Memory stores

### 3. Example Use Cases

- **"Migrate this monolith to microservices"**
- **"Launch this marketing campaign"**
- **"Automate this financial report"**

Each tied to a workflow in `examples/`.

### 4. Security Model (Core Feature)

- **Autonomy modes** inspired by [Codex CLI features](https://developers.openai.com/codex/cli/features/) (consultative, semi‑autonomous, full‑auto with sandbox/approval)
- Runner isolation, network profiles, secrets vault, and declarative policy engine

### 5. Project Status

- **Reference architecture, not production ready**
- Feature roadmap: new runners, verticals, UI, etc.

---

## Control Plane Design

**Suggested stack**: TypeScript + NestJS or Go for control plane, Python/Go for runners.

### Key Components

#### `api-gateway/`
HTTP/WS service that receives:
- `/goals` (POST): `{ goal: string, projectId, channelMetadata }`
- `/events` from runners (webhooks or queue)
- Authentication (OIDC / JWT from corporate IdP)

#### `orchestrator/`
Service that:
- Creates `Goal` entity and calls `planner`
- Maintains a `Plan` (task DAG)
- Publishes jobs to a queue (`jobs` topic) for runners

#### `planner/`
Service that encapsulates LLM calls:
- **Prompt**: organization context + project memory + tools catalog
- **Normalized output**: JSON with steps, dependencies, and mapping to tools

#### `policy-engine/`
Wrapper over OPA or other policy engine:
- **Input**: user, role, domain, tool, environment, declared risk
- **Output**: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`

#### `tools-registry/`
Service that reads YAML/JSON descriptors (`tool.yaml`) and exposes:
- `GET /tools?domain=devops`
- `GET /tools/{id}/{version}`
- Applies security and versioning validations

---

## Execution Plane and Runners

`src/execution-plane/runners/` contains reference implementations:

### `shell-runner/`
- Consumes jobs from the queue
- Resolves the corresponding `tool.yaml`
- Launches an ephemeral container with:
  - Image defined in the tool
  - `entrypoint` command with placeholders filled
- Sends logs/status back to the orchestrator

### `cicd-runner/`
- Sends jobs to an existing pipeline (GitHub Actions, GitLab, Jenkins)
- CaS acts as a **high-level frontend** for existing pipelines

### `data-runner/`
- Environment with data libraries (pandas, SQLAlchemy, etc.) to execute ETL/reporting jobs

**Isolation best practices**: ephemeral runners, network profiles, CPU/memory/time limits, and scoped credentials.

---

## Persistent Memory and Context

In `src/memory/`, a design is proposed inspired by [long‑running agents](https://arxiv.org/pdf/2309.06551.pdf) harnesses and Claude Memory-type systems: local/project memory with summaries and metadata.

### `org-store/`
Table/collection `OrgMemoryItem`:
- `orgId`, `domain`, `summary`, `tags`, `createdAt`, `source` (goal/plan/job)

### `project-store/`
Table/collection `ProjectMemoryItem`:
- `projectId`, `summary`, `type` (decision, convention, artifact), `link` (to repo, pipeline, dashboard)

### Patterns to Implement

- **At the end of a large Goal**, the orchestrator writes a `MemoryItem` with:
  - What was done
  - Why a decision was made
  - Where artifacts were left

- **When starting a new Goal**, the planner retrieves `k` relevant items via filters and/or semantic search and injects them into the prompt

This connects with the concept of `CHANGELOG.md`/lab-notes for long‑running projects.

---

## Plugin Model and Verticalization

In `docs/07-domain-verticals.md` and `examples/`, a vertical CaS is shown:

- Define a mini‑DSL of business tasks (e.g., logistics, finance)
- Map business tasks to technical tool sequences
- Measure success in domain KPIs (not just "job succeeded")

### Example: `examples/finance-reporting/`

Task descriptor: `GenerateWeeklySalesReport`

**Tools**:
- `run_sql_query`
- `render_report`
- `send_email_report`

Entity vocabulary: `Goal`, `Plan`, `Tool`, `Job`, `MemoryItem`.

---

## Interface Layer Design

> Grounded in a comparative analysis of modern AI agent CLIs. See [`docs/research-cli-architecture.md`](./docs/research-cli-architecture.md) for the full study of Claude Code, Opencode, Codex CLI, and OpenClaw.

### Two identified architectural patterns

#### Pattern A: Single-Process Renderer
*Claude Code (TypeScript/Bun + React/Ink), Codex CLI (Node.js + React/Ink)*

```
┌─────────────────────────┐
│  Single process         │
│  ├── Agent Logic        │
│  └── UI Renderer (Ink)  │
└─────────────────────────┘
```

**Pros:** Simple, no IPC latency, easy to debug.
**Cons:** No session persistence; new frontend = re-implement renderer.

#### Pattern B: Daemon/Gateway + Thin Clients
*Opencode (Go + HTTP/SSE), OpenClaw (Node.js + WebSocket)*

```
┌──────────────────────┐
│  Daemon/Gateway      │  ← State, sessions, agent, tools
│  (persistent process) │
└──────────┬───────────┘
           │ standard protocol
    ┌──────┼──────┐
    ▼      ▼      ▼
  TUI    Web   Desktop  ← Rendering and UX only
```

**Pros:** Persistent sessions, native multi-client, extensible. New channel = implement adapter.
**Cons:** Operational complexity (daemon lifecycle, ports, auth).

**CaS adopts Pattern B**, aligned with its requirements for multiple entry points (terminal, Slack, Teams, WhatsApp, web).

### Interface Layer Architecture

```
┌─────────────────────────────────────────────┐
│          CaS Control Plane                  │
│  (Orchestrator + Planner + Policy Engine)   │
└─────────────────┬───────────────────────────┘
                  │ WebSocket / HTTP+SSE
        ┌─────────┴──────────┐
        ▼                    ▼
┌──────────────┐    ┌──────────────────────────┐
│  API Gateway │    │   Interface Adapters      │
│  HTTP/WS     │    │   ├── CLI Adapter (WS)   │
│  :8080       │    │   ├── Slack Adapter       │
└──────────────┘    │   ├── Teams Adapter       │
                    │   ├── WhatsApp Adapter     │
                    │   └── Desktop App (UDS)   │
                    └──────────────────────────┘
```

### Protocol decisions per client

| Client | Protocol | Reference |
|--------|----------|-----------|
| CLI (TUI) | WebSocket | OpenClaw |
| Web UI | HTTP + SSE | Opencode |
| Desktop App | Unix Domain Socket + token auth | OpenClaw macOS |
| Slack / Teams / WhatsApp | HTTP Adapters | OpenClaw channels |

The **bidirectional and long-lived** nature of AI agent flows makes WebSocket the natural match for the CLI: the backend needs to stream progress in real time and the client needs to send interruptions or new instructions at any moment.

### Minimal viable protocol for the CaS CLI

```
CLI (TUI) ──WS──► API Gateway ──internal──► Orchestrator
                      │
                      ├── /goals    POST   { goal, projectId }
                      ├── /events   SSE    streaming progress
                      └── /sessions GET    active session state
```

### Recommended TUI stack

- **TypeScript**: React + [Ink](https://github.com/vadimdemedes/ink) — same approach as Claude Code and Codex CLI
- **Go**: Bubble Tea — same approach as Opencode

---

## Security and Compliance

In `docs/06-security-and-compliance.md`, it details:

- Clear separation of planes (control vs. execution)
- Declarative policies by domain/role/tool
- Autonomy modes (consultative, semi‑autonomous, autonomous)
- Exhaustive audit: what was executed, with what parameters, under what context and policy decision

It also connects with **data governance** topics in regulated organizations: sensitivity catalogs, segmented access, etc.

---

## Roadmap

- [ ] Implement base control plane (TypeScript/NestJS or Go)
- [ ] Implement basic shell-runner
- [ ] Add policy engine with OPA
- [ ] Create vertical examples (DevOps, Marketing, Finance)
- [ ] Complete documentation in `docs/`
- [ ] Mermaid architecture diagrams
- [ ] CI/CD and release automation

---

## References

**CaS Architecture**
- [Codex CLI](https://developers.openai.com/codex/cli/)
- [Codex Quickstart](https://developers.openai.com/codex/quickstart/)
- [Long-running agents paper](https://arxiv.org/pdf/2309.06551.pdf)
- [Claude Memory deep dive](https://skywork.ai/blog/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution/)
- [Governance in regulated orgs](https://arxiv.org/pdf/2204.08941.pdf)
- [Integrate Codex CLI into workflows](https://blog.openreplay.com/integrate-openais-codex-cli-tool-development-workflow/)

**Interface Layer Research** — full study at [`docs/research-cli-architecture.md`](./docs/research-cli-architecture.md)
- [Claude Code Architecture Leak — WaveSpeedAI](https://wavespeed.ai/blog/posts/claude-code-architecture-leaked-source-deep-dive/)
- [AI Coding Agent Architecture Analysis — Haseeb Qureshi](https://gist.github.com/Haseeb-Qureshi/2213cc0487ea71d62572a645d7582518)
- [Opencode Docs — Server](https://opencode.ai/docs/server/)
- [Opencode Docs — TUI](https://opencode.ai/docs/tui/)
- [Codex CLI Features — OpenAI Developers](https://developers.openai.com/codex/cli/features)
- [OpenClaw Gateway Architecture](https://openclaws.io/docs/concepts/architecture/)
- [The Gateway — OpenClaw Docs](https://clawdocs.org/architecture/gateway/)

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Contact and Contributions

This is a reference architecture project. Contributions are welcome via issues and pull requests.
