# CaS — Logical Architecture

**CLI as a Service Reference Architecture**

- **License:** MIT
- **Repository:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Last updated:** 2026-05-31

---

## Overview of the 4 Planes

The CaS architecture is organized into four planes with strictly separated responsibilities. The guiding principle is: **each plane does one thing and does it well**. The Control Plane never executes code, the Execution Plane never decides policies, the Memory Layer never exposes data without authorization, and the Interface Layer never contains business logic.

```
                  ┌──────────────────────────────────────────┐
                  │           INTERFACE LAYER               │
                  │  (User interaction channels)            │
                  └──────────────────┬───────────────────────┘
                                     │ HTTP/WS
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │           CONTROL PLANE                  │
                  │  (Orchestration, planning, policies)     │
                  └──────────────────┬───────────────────────┘
                                     │ Message Queue
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │          EXECUTION PLANE                 │
                  │  (Isolated job execution)                │
                  └──────────────────┬───────────────────────┘
                                     │ Results → Memory
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │           MEMORY LAYER                   │
                  │  (Persistence, semantic search)          │
                  └──────────────────────────────────────────┘
```

Data flows are **vertical**: requests enter through the Interface Layer, are processed in the Control Plane, executed in the Execution Plane, and results are persisted in the Memory Layer. The response travels back to the user through the same path.

---

## Interface Layer

### Components

| Component | Communication | Protocol | Use Case |
|---|---|---|---|
| **CLI TUI** | WebSocket full-duplex | JSON-RPC over WS | Engineers working in terminal |
| **Web UI** | HTTP + SSE | REST + Server-Sent Events | Non-technical stakeholders |
| **Slack Adapter** | HTTP | Slack Events API + Block Kit | Teams operating from Slack |
| **Teams Adapter** | HTTP | Microsoft Bot Framework | Microsoft 365 teams |
| **WhatsApp Adapter** | HTTP | WhatsApp Business API | Mobile operations |
| **Desktop App** | Unix Domain Socket | JSON-RPC + HMAC auth | High-security local sessions |

### API Gateway

The API Gateway is the **single entry point** to CaS. Its responsibilities:

- **Routing**: Directs REST requests to the Orchestrator and WebSocket connections to the session manager.
- **Authentication**: Validates JWT tokens signed by a corporate IdP (Keycloak, Okta, Azure AD). Supports OIDC with authorization code + PKCE flow for web, client credentials for CLIs.
- **Rate Limiting**: Configurable limits per user, per role, and per endpoint. Example: `10 goals/min` per user, `100 goals/min` per organization.
- **Input Validation**: Schema validation with JSON Schema or Zod. Parameter sanitization before passing to the Orchestrator.
- **WebSocket Manager**: Long-lived connections with heartbeat every 30s, automatic reconnection with exponential backoff (1s, 2s, 4s, max 30s), session resumption via persistent session ID.

### API Gateway Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/goals` | Create a new Goal |
| `GET` | `/goals/:id` | Get Goal status |
| `GET` | `/goals` | List Goals (filters: status, user, date) |
| `POST` | `/goals/:id/cancel` | Cancel a running Goal |
| `POST` | `/goals/:id/approve` | Approve a step that requires approval |
| `POST` | `/goals/:id/deny` | Deny a step that requires approval |
| `GET` | `/tools` | List available tools |
| `GET` | `/tools/:name` | Get tool descriptor |
| `GET` | `/health` | System health check |
| `WS` | `/ws` | WebSocket for progress streaming |

---

## Control Plane

### Components and their Responsibilities

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Orchestrator                       │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │  │
│  │  │Goal Manager │  │Plan      │  │Job Publisher   │  │  │
│  │  │(state       │  │Executor  │  │(sends jobs to  │  │  │
│  │  │ machine)    │  │(DAG walk)│  │ message queue) │  │  │
│  │  └─────────────┘  └──────────┘  └────────────────┘  │  │
│  └────────────────────────┬─────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────┼─────────────────────────────┐  │
│  │  Planner              │                              │  │
│  │  ┌────────────────┐   │  ┌──────────────────────┐   │  │
│  │  │Prompt Builder  │   │  │LLM Provider Layer    │   │  │
│  │  │(context +      │   │  │(OpenAI / Anthropic /  │   │  │
│  │  │ memory +       │   │  │ Ollama)              │   │  │
│  │  │ tools catalog) │   │  └──────────────────────┘   │  │
│  │  └────────────────┘   │  ┌──────────────────────┐   │  │
│  │  ┌────────────────┐   │  │Output Parser         │   │  │
│  │  │Plan Cache      │   │  │(JSON structured →    │   │  │
│  │  │(prompt         │   │  │ DAG of steps)        │   │  │
│  │  │ similarity)    │   │  └──────────────────────┘   │  │
│  │  └────────────────┘   │                              │  │
│  └────────────────────────┼─────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────┼─────────────────────────────┐  │
│  │              Policy Engine                           │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │  OPA/Rego Evaluator                           │  │  │
│  │  │  Input: {user, role, domain, tool,            │  │  │
│  │  │          environment, risk_level,             │  │  │
│  │  │          autonomy_mode}                       │  │  │
│  │  │  Output: ALLOW | DENY | REQUIRE_APPROVAL      │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                Tools Registry                       │  │
│  │  ┌──────────────┐  ┌──────────────┐                │  │
│  │  │REST API      │  │Schema        │                │  │
│  │  │(GET /tools)  │  │Validator     │                │  │
│  │  └──────────────┘  └──────────────┘                │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Orchestrator

The Orchestrator is the core of the Control Plane. It manages the **full lifecycle of each Goal** as a state machine:

```
          ┌──────────┐
          │ PENDING  │
          └────┬─────┘
               │ Planner generates plan
               ▼
          ┌──────────┐
          │PLANNING  │
          └────┬─────┘
               │ Policy evaluates each step
               ▼
          ┌──────────┐
          │APPROVED  │◄────── Human approval (if REQUIRE_APPROVAL)
          └────┬─────┘
               │ Orchestrator publishes jobs
               ▼
          ┌─────────────┐
          │IN_PROGRESS  │
          └────┬────────┘
               │
     ┌─────────┼────────────┐
     ▼         ▼            ▼
┌─────────┐┌─────────┐┌─────────┐
│COMPLETED││ FAILED  ││CANCELLED│
└─────────┘└─────────┘└─────────┘
```

**Detailed responsibilities:**

1. **Goal Manager**: Goal state. Persists in Redis for fault tolerance and horizontal scaling.
2. **Plan Executor**: Traverses the DAG of tasks respecting dependencies. When a step completes, evaluates if its dependents can start. Uses topological sort with parallel execution of independent tasks.
3. **Job Publisher**: For each DAG step, builds a job message with: `{toolName, parameters, runnerType, credentialsRef, timeout, networkProfile}`. Publishes it to the corresponding message queue.
4. **Event Consumer**: Listens to events from runners (progress, log, error, completed). Updates step state in the DAG. When all steps are complete, marks the Goal as COMPLETED.

### Planner

The Planner translates a Goal expressed in natural language into a **structured plan as a DAG of tasks**.

**Planning pipeline:**

```
Goal → [Prompt Builder] → [LLM Provider] → [Output Parser] → Plan (DAG)
         ↑                                       │
         │                                       ▼
    Context:                              Fallback:
    - Organizational memory               - Plan template
    - Project memory                      - Manual plan
    - Tools catalog
    - Active policies
```

**Prompt Builder** constructs the system prompt with:
- Organization context: name, domain, active policies
- Project memory: recent decisions and conventions
- Tools catalog: up to 20 most relevant tools for the Goal's domain
- Expected output format: structured JSON with steps, dependencies, and tool mappings

**Multi-LLM Integration**: Abstraction over LLM providers. Each provider implements the `PlannerProvider` interface:

```typescript
interface PlannerProvider {
  name: string;
  plan(goal: string, context: PlannerContext): Promise<Plan>;
  model: string;
  maxTokens: number;
  temperature: number;
}
```

Supported providers: OpenAI (GPT-4o), Anthropic (Claude 4 Opus), local via Ollama (DeepSeek, Llama, Qwen).

**Caching**: Similar prompts (measured by cosine similarity of the Goal embedding) reuse previous plans. Cache expires according to configuration (default: 1 hour).

**Fallback**: If the LLM doesn't return a parseable JSON or returns errors, the Planner falls back to:
1. Plan template: look up a predefined plan for the Goal type
2. Manual plan: return to the user with an error message and allow them to define steps manually

### Policy Engine

Policy evaluator based on **OPA/Rego**. Operates in sidecar mode (separate process) for isolation.

**Decision model:**

```
Input ─────────────────────────────────────────┐
  user: "jdoe"                                 │
  role: "dev"                                  │
  domain: "devops"                             │
  tool: {name: "kubectl_apply", type: "write"} │
  environment: "prod"                          │
  risk_level: "high"                           │
  autonomy_mode: "semi-autonomous"             │
                                                ▼
                                    ┌──────────────────┐
                                    │  OPA Rego Engine │
                                    └────────┬─────────┘
                                             ▼
                              Output: REQUIRE_APPROVAL
```

**Autonomy Modes:**

| Mode | Behavior | Typical Use |
|---|---|---|
| **Consultive** | Every operation that is not read-only requires human approval. The Orchestrator pauses the plan and notifies the user's channel. | Strict compliance environments (finance, healthcare) |
| **Semi-autonomous** | Low-risk operations (read, dev execution) are auto ALLOW. High risk requires approval. Risk definition is in OPA policies. | Production environments with supervision |
| **Autonomous** | All operations within the sandbox are ALLOW. Only for isolated environments (sandbox, personal dev) and verified tools. | Rapid development, internal CI/CD |

### Tools Registry

Central catalog of all system capabilities. Each tool is described with a `tool.yaml` file:

```yaml
name: run_sql_query
version: 1.0.0
description: Executes a SQL query on a database
domain: finance
runner: data-runner
image: cas/data-runner:latest
entrypoint: python /runner/run_sql.py
parameters:
  - name: query
    type: string
    description: SQL query to execute
    required: true
    sensitive: false
  - name: database
    type: string
    description: Database name
    required: true
    enum: [staging, prod, reporting]
  - name: limit
    type: integer
    description: Row limit
    required: false
    default: 100
security:
  network: outbound-only
  resources:
    cpu: "1"
    memory: "512Mi"
  timeout: 300
  risk: read
```

**Registry Endpoints:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/tools` | List all tools (with filters by domain, runner, version) |
| `GET` | `/tools/:name` | Get tool descriptor (latest version) |
| `GET` | `/tools/:name/:version` | Get specific version |

**Semantic versioning**: `MAJOR.MINOR.PATCH`
- **Major**: Breaking change in parameters, behavior, or security
- **Minor**: New backward-compatible functionality
- **Patch**: Bug fixes with no interface changes

---

## Execution Plane

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    EXECUTION PLANE                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Message Queue                          │   │
│  │  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Topic: jobs  │  │Topic: events │               │   │
│  │  │ (orchestrator│  │(runners →    │               │   │
│  │  │  → runners)  │  │ orchestrator)│               │   │
│  │  └──────────────┘  └──────────────┘               │   │
│  │  ┌────────────────────────────────────────────┐   │   │
│  │  │ Dead Letter Queue (DLQ)                    │   │   │
│  │  └────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Shell    │  │ CI/CD    │  │ Data     │                 │
│  │ Runner   │  │ Runner   │  │ Runner   │                 │
│  │ (Docker) │  │(GitHub   │  │(pandas,  │                 │
│  │          │  │ Actions) │  │SQLAlch.) │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Vault Agent (HashiCorp Vault)             │   │
│  │  Dynamic tokens per job, automatic rotation         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

For a detailed description of each runner and the message queue, refer to the dedicated document: **[Execution Plane](04-execution-plane.md)**

---

## Memory Layer

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                      MEMORY LAYER                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           PostgreSQL + pgvector                     │   │
│  │                                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │  Org Store   │  │Project Store │                │   │
│  │  │ · cross-     │  │ · decisions  │                │   │
│  │  │   project    │  │ · conventions│                │   │
│  │  │ · Goal       │  │ · artifacts  │                │   │
│  │  │   summaries  │  │ · tags       │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │           Vector Store                       │   │   │
│  │  │  · Embeddings (1536d)                        │   │   │
│  │  │  · Cosine similarity search                  │   │   │
│  │  │  · Filters: orgId, domain, tags              │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

For a detailed description of read/write patterns and semantic search, refer to: **[Memory and Context](05-memory-and-context.md)**

---

## Complete Data Flow

Below is the complete flow from when a user submits a Goal until they receive the result:

### Example: "Generate the May financial report"

```
Step 1: Interface Layer
────────────────────────
User → CLI TUI → WebSocket → API Gateway
  Payload: { type: "goal", text: "Generate the May financial report" }

Step 2: API Gateway
───────────────────
  ✓ Authenticates JWT token
  ✓ Validates payload schema
  ✓ Rate limiting check
  ✓ Assigns goalId: "goal_abc123"
  → Forwards to Orchestrator

Step 3: Orchestrator
───────────────────
  ✓ Goal state: PENDING
  ✓ Persists goalId in Redis
  ✓ Requests Planner

Step 4: Planner
──────────────
  ✓ Queries organizational memory: similar previous goals
  ✓ Queries tools registry: finance domain tools
  ✓ Builds prompt with context
  ✓ LLM → structured JSON
  ✓ Output Parser → Plan (DAG):
      step 1: run_sql_query(may_report) → results
      step 2: run_python(generate_charts) → charts
      step 3: render_report(results, charts) → PDF
      step 4: send_email(pdf, recipients) → completed
      Dependencies: step 1 → step 2 → step 3 → step 4
  ✓ Goal state → PLANNING

Step 5: Policy Engine
─────────────────────
  For each plan step:
  - step 1 (read, finance, dev) → ALLOW
  - step 2 (execute, finance, dev) → ALLOW
  - step 3 (execute, finance, dev) → ALLOW
  - step 4 (execute, finance, dev) → ALLOW (semi-autonomous mode)
  ✓ Goal state → APPROVED

Step 6: Orchestrator publishes jobs
─────────────────────────────────
  ✓ step 1 available → job_1 → Message Queue (topic: jobs)
  (steps 2, 3, 4 wait for their dependencies)

Step 7: Execution Plane
───────────────────────
  ✓ Data Runner consumes job_1 from the queue
  ✓ Vault agent injects dynamic DB credentials
  ✓ Executes run_sql.py with job parameters
  ✓ Log stream → Orchestrator via WebSocket
  ✓ Result: CSV file with report data
  ✓ Job completed → COMPLETED event → Message Queue (topic: events)

Step 8: Orchestrator processes event
───────────────────────────────────
  ✓ Step 1 COMPLETED
  ✓ Step 2 available → job_2 → Message Queue
  (Repeats until all steps are complete)

Step 9: Goal COMPLETED
──────────────────────
  ✓ Orchestrator marks Goal as COMPLETED
  ✓ Writes MemoryItem to Org Store and Project Store
  ✓ Sends final result to user via WebSocket

Step 10: User receives notification
────────────────────────────────────
  CLI TUI shows: "✅ May financial report generated.
     Files: /reports/may-2026.pdf
     Sent to: finance@company.com"
```

**Estimated total time**: ~30 seconds (2s planning, 25s query execution, 3s rendering and sending).

---

## Communications

### Communication Channels

| Type | Protocol | Usage | Direction |
|---|---|---|---|
| **Synchronous** | HTTP/WS | User requests, state streaming | Bidirectional |
| **Asynchronous** | BullMQ/RabbitMQ | Jobs between orchestrator and runners | Unidirectional (queue) |
| **Events** | SSE (Server-Sent Events) | Real-time progress for Web UI | Server → Client |

### Interface Contracts

Each communication between planes follows a defined contract:

**API Gateway → Orchestrator**: HTTP POST with payload `{goal, userId, sessionId, autonomyMode}`. Returns `{goalId, status}`.

**Orchestrator → Planner**: Internal call with `{goalId, goal, context, userProfile}`. Returns `{planId, steps: DAG}`.

**Orchestrator → Policy Engine**: Internal call with `{userId, role, domain, tool, environment}`. Returns `{decision, reason}`.

**Orchestrator → Message Queue**: Serialized JSON with `{jobId, goalId, stepId, tool, parameters, credentialsRef, timeout}`.

**Runner → Orchestrator (via MQ)**: Events `{jobId, type: 'progress'|'log'|'error'|'completed', payload, timestamp}`.

---

## Deployment Boundaries

| Component | Nature | Scaling | Persistence |
|---|---|---|---|
| **API Gateway** | Stateless | Horizontal (behind LB) | None |
| **Orchestrator** | Stateful (shared Redis) | Horizontal with Redis cluster | Redis + PostgreSQL |
| **Planner** | Stateless | Horizontal | Cache in Redis |
| **Policy Engine** | Stateless (sidecar) | Per Orchestrator instance | Policies on disk/etcd |
| **Tools Registry** | Stateless | Horizontal | PostgreSQL |
| **Shell Runner** | Stateless | Horizontal (auto-scaling) | Ephemeral containers |
| **CI/CD Runner** | Stateless | On demand | None |
| **Data Runner** | Stateless | Horizontal (auto-scaling) | Ephemeral containers |
| **Message Queue** | Stateful | BullMQ/RabbitMQ cluster | Disk |
| **PostgreSQL** | Stateful | Read replicas | Disk (WAL + backups) |

### Minimum Infrastructure Requirements

- **Kubernetes**: Kubernetes cluster (EKS, AKS, GKE) for orchestrating runner containers
- **PostgreSQL 15+** with pgvector extension
- **Redis 7+** for Orchestrator state and Planner cache
- **Message Queue**: BullMQ (Redis-based) or RabbitMQ
- **Vault**: HashiCorp Vault for secrets management
- **OPA Server**: Sidecar process or central server

---

## Fault Tolerance

| Scenario | Mechanism |
|---|---|
| **Job fails** | Retry with exponential backoff (3 attempts: 5s, 30s, 120s) |
| **Unrecoverable job** | Dead Letter Queue + operator notification |
| **Runner hangs** | Per-tool timeout (configurable in tool.yaml) |
| **Orchestrator goes down** | Recovery from Redis: goals in IN_PROGRESS re-execute from last checkpoint |
| **Message Queue goes down** | On-disk buffer on Orchestrator + backup queue |
| **LLM fails** | Fallback to plan template or manual plan |
| **Runner network** | Connection timeout + retry with alternative runner |
| **Database** | Read replica for queries, WAL for recovery |

---

## Next

Continue with the **[Control Plane](03-control-plane.md)** , which dives deep into the API Gateway, Orchestrator, Planner, Policy Engine, and Tools Registry with concrete examples and implementation considerations.

---

*Last updated: 2026-05-31*
