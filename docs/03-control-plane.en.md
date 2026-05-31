# CaS — Control Plane

**CLI as a Service Reference Architecture**

- **License:** MIT
- **Repository:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Last updated:** 2026-05-31

---

## Overview

The Control Plane is the **brain of the system**. It contains all orchestration logic, planning, policy evaluation, and capability registration. It operates under a fundamental principle: **it never executes code directly**. It delegates all execution to the Execution Plane through an asynchronous message queue.

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ API Gateway  │─▶│Orchestrator  │──▶│    Planner       │  │
│  │ (HTTP/WS)    │  │(state        │  │(prompt builder + │  │
│  │              │  │ machine)     │  │ LLM integration) │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘  │
│                           │                                  │
│                  ┌────────┴────────┐                        │
│                  │  Policy Engine  │                        │
│                  │  (OPA/Rego)     │                        │
│                  └────────┬────────┘                        │
│                  ┌────────┴────────┐                        │
│                  │ Tools Registry  │                        │
│                  │  (tool.yaml)    │                        │
│                  └─────────────────┘                        │
└────────────────────────────────────┬────────────────────────┘
                                     │ Message Queue
                                     ▼
                              Execution Plane
```

---

## API Gateway

The API Gateway is the **single entry door** to CaS. All clients (CLI, web, Slack, desktop) connect through it.

### Endpoints

| Method | Path | Authentication | Limit | Description |
|---|---|---|---|---|
| `POST` | `/goals` | Required | 10/min per user | Create a new Goal |
| `GET` | `/goals/:id` | Required | 60/min per user | Get Goal status |
| `GET` | `/goals` | Required | 30/min per user | List Goals with filters |
| `POST` | `/goals/:id/cancel` | Required | 10/min per user | Cancel Goal |
| `POST` | `/goals/:id/approve` | Required + role | 20/min per user | Approve step |
| `POST` | `/goals/:id/deny` | Required + role | 20/min per user | Deny step |
| `GET` | `/tools` | Required | 60/min per user | List tools |
| `GET` | `/tools/:name` | Required | 60/min per user | Tool descriptor |
| `GET` | `/health` | Public | — | Health check |
| `WS` | `/ws` | Required (token in query) | — | Streaming |

### Authentication

CaS delegates authentication to a **corporate IdP** (Keycloak, Okta, Azure AD, Auth0) using the **OIDC** flow:

- **Web UI**: Authorization Code Flow + PKCE. The user is redirected to the IdP, receives an authorization code, the backend exchanges it for tokens.
- **CLI TUI / Desktop App**: Device Authorization Grant (RFC 8628). The CLI shows a code that the user verifies in their browser.
- **Slack / Teams Adapters**: HMAC signature verification from the provider + internal service token.
- **Service-to-service**: Client Credentials Grant. Runners authenticate with client ID + client secret.

**JWT Structure:**

```json
{
  "sub": "user_abc123",
  "email": "jdoe@company.com",
  "roles": ["admin", "devops"],
  "groups": ["sre-team", "finance-approvers"],
  "iat": 1717200000,
  "exp": 1717203600,
  "iss": "https://idp.company.com/auth/realms/cas"
}
```

### Rate Limiting

Default configuration (overridable by corporate policy):

| Level | Goals/min | Reads/min | Auth failures/h |
|---|---|---|---|
| Free tier | 5 | 30 | 5 |
| Developer | 20 | 120 | 10 |
| Admin | 50 | 300 | 20 |
| Service account | 200 | 1000 | — |

Rate limiting is implemented with **Redis + sliding window** for precision in distributed environments.

### WebSocket Management

The Gateway maintains long-lived WebSocket connections for progress streaming.

**Lifecycle:**

```
Client                     Gateway
  │                          │
  │──── WS /ws?token=... ───▶│
  │                          │──── Verifies JWT token
  │◀─── 101 Switching ──────│
  │                          │
  │──── {"subscribe":       │
  │       "goal_abc123"} ───▶│
  │                          │──── Subscribes to Goal events
  │◀─── {"type":"progress", │
  │       "step":"1/4",     │
  │       "status":"running"}│
  │◀─── {"type":"log",      │
  │       "data":"Query OK"}│
  │                          │
  │──── {"type":"ping"} ────▶│  (heartbeat every 30s)
  │◀─── {"type":"pong"} ────│
  │                          │
  │◀─── {"type":"completed",│
  │       "result":"..."}    │
```

**Reconnection**: If the client disconnects, the Gateway keeps the subscription active for 5 minutes. Upon reconnecting with the same `sessionId`, the Gateway resends the current state and any undelivered events.

### Input Validation

Each request is validated against a schema before reaching the Orchestrator:

```typescript
const goalSchema = {
  type: 'object',
  required: ['goal'],
  properties: {
    goal: {
      type: 'string',
      minLength: 10,
      maxLength: 2000,
      description: 'Description of the high-level objective'
    },
    autonomyMode: {
      type: 'string',
      enum: ['consultive', 'semi-autonomous', 'autonomous'],
      default: 'semi-autonomous'
    },
    domain: {
      type: 'string',
      enum: ['devops', 'finance', 'marketing', 'general'],
      default: 'general'
    }
  }
};
```

---

## Orchestrator

The Orchestrator is the **core of the Control Plane**. It manages the full lifecycle of each Goal from arrival to completion, failure, or cancellation.

### Goal Lifecycle

```
                          ┌──────────────┐
                          │   PENDING    │
                          │ Goal created, │
                          │ unprocessed   │
                          └──────┬───────┘
                                 │ Orchestrator assigns to Planner
                                 ▼
                          ┌──────────────┐
                          │  PLANNING    │
                          │ Planner      │
                          │ generating   │
                          │ DAG of tasks │
                          └──────┬───────┘
                                 │ Plan generated + Policy evaluated
                                 ▼
                    ┌─────────────────────────┐
                    │       APPROVED           │
                    │ Plan accepted,           │
                    │ ready to execute         │
                    │                          │
                    │ (If a policy             │
                    │  returned                │
                    │  REQUIRE_APPROVAL,       │
                    │  waits for human input)  │
                    └──────┬──────────────────┘
                           │ Orchestrator publishes first job
                           ▼
                    ┌─────────────────────────┐
                    │      IN_PROGRESS        │
                    │ Jobs executing,         │
                    │ DAG being traversed     │
                    │                         │
                    │ Per-step state:         │
                    │ · pending               │
                    │ · running               │
                    │ · completed             │
                    │ · failed                │
                    │ · waiting_approval      │
                    └──────┬──────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │ COMPLETED  │ │  FAILED    │ │ CANCELLED  │
     │ All steps  │ │ A step     │ │ User       │
     │ OK         │ │ failed     │ │ cancelled  │
     │            │ │ no retry   │ │            │
     └────────────┘ └────────────┘ └────────────┘
```

### State Machine (Transition Detail)

| Current State | Event | Next State | Action |
|---|---|---|---|
| PENDING | start_planning | PLANNING | Invoke Planner |
| PLANNING | plan_ready | APPROVED | Evaluate policies per step |
| PLANNING | plan_failed | FAILED | Notify planning error |
| APPROVED | all_auto | IN_PROGRESS | Publish available jobs |
| APPROVED | waiting_approval | APPROVED | Block until human approval |
| APPROVED | approved | IN_PROGRESS | Continue with approved step |
| APPROVED | denied | FAILED | Step denied → Goal failed |
| IN_PROGRESS | step_completed | IN_PROGRESS | Advance DAG, publish next job |
| IN_PROGRESS | all_completed | COMPLETED | Write memory, notify user |
| IN_PROGRESS | step_failed_no_retry | FAILED | Notify error |
| IN_PROGRESS | step_failed_retry | IN_PROGRESS | Retry with backoff |
| IN_PROGRESS | cancelled | CANCELLED | Cancel queued jobs, cleanup |
| ANY | cancel_requested | CANCELLED | Manual user cancellation |

### Plan as DAG of Tasks

The plan generated by the Planner is a **directed acyclic graph (DAG)** where:

- **Nodes (steps)**: Atomic units of work, each mapped to a tool from the registry
- **Edges**: Dependencies between steps. A step does not start until all its predecessors are complete
- **Weight**: Each step has a timeout and priority

**DAG Example:**

```
        ┌──────────┐
        │backup_db │
        └────┬─────┘
             │
        ┌────▼─────┐
        │run_migr. │
        └────┬─────┘
             │
        ┌────▼─────┐    ┌──────────┐
        │verify    │────│notify    │
        │data      │    │complete  │
        └──────────┘    └──────────┘
```

**Execution**: The Plan Executor does a topological sort of the DAG. Steps without pending dependencies execute in parallel. When a step completes, it evaluates which dependent steps can start.

### Job Publication

When a step is ready to execute, the Job Publisher builds a job message:

```json
{
  "jobId": "job_456",
  "goalId": "goal_abc123",
  "stepId": "step_2",
  "tool": "run_sql_query",
  "version": "1.0.0",
  "parameters": {
    "query": "SELECT * FROM revenue WHERE month = 'may-2026'",
    "database": "reporting"
  },
  "credentialsRef": "vault://db/reporting/readonly",
  "runnerType": "data-runner",
  "image": "cas/data-runner:latest",
  "timeout": 300,
  "networkProfile": "outbound-only",
  "environment": {
    "CAS_GOAL_ID": "goal_abc123",
    "CAS_JOB_ID": "job_456",
    "CAS_STEP_ID": "step_2"
  }
}
```

This message is published to the message queue (topic: `jobs`). The corresponding runner consumes it when available.

### Event Reception

Runners publish events on the message queue (topic: `events`). The Orchestrator consumes and processes them:

| Event | Payload | Orchestrator Action |
|---|---|---|
| `job.started` | `{jobId, startedAt}` | Update step state → running |
| `job.progress` | `{jobId, percent, message}` | Forward to client via WebSocket |
| `job.log` | `{jobId, stream: stdout/stderr, data}` | Store in buffer, forward if client connected |
| `job.completed` | `{jobId, result, artifacts, duration}` | Step completed, advance DAG |
| `job.failed` | `{jobId, error, exitCode}` | Attempt retry or mark Goal as FAILED |
| `job.timeout` | `{jobId}` | Kill + cleanup, mark as FAILED |

### Memory Writing

When a Goal completes successfully, the Orchestrator initiates a **memory consolidation** process:

1. Sends the logs, results, and artifacts of the Goal to an LLM for summarization
2. The LLM generates a structured `MemoryItem` with:
   - Summary of what was done
   - Architectural decisions made
   - Generated artifacts (paths, URLs)
   - Domain and project tags
3. The `MemoryItem` is persisted in Org Store and Project Store
4. If the Goal produced decisions, the project's `CHANGELOG.md` is updated

---

## Planner

The Planner is the component that **translates natural language into executable plans**. It is the interface between human language and the Orchestrator's state machine.

### Prompt Builder

Builds the system prompt with rich context:

```
System: You are a task planner for CaS (CLI as a Service).
Your job is to decompose a high-level Goal into a DAG of tasks.

Organization context:
- Name: CompanyTech
- Domain: devops
- Environment: staging
- Active policies: semi-autonomous mode

Available tools (top 5 of 20):
1. run_shell (v2.1.0) - Executes shell commands in container
2. kubectl_apply (v1.0.0) - Applies Kubernetes manifests
3. db_migrate (v3.2.1) - Executes database migrations
4. terraform_plan (v1.5.0) - Plans infrastructure changes
5. helm_deploy (v2.0.0) - Deploys Helm charts

Relevant project memory:
- Last DB migration: used `db_migrate` with automatic rollback
- Convention: use `terraform_plan` before any `kubectl_apply`

Output format (JSON):
{
  "steps": [
    {
      "id": "step_1",
      "tool": "tool_name",
      "parameters": { ... },
      "depends_on": [],
      "description": "What this step does"
    }
  ]
}

User's Goal: [GOAL TEXT]
```

### Multi-LLM Integration

The Planner abstracts the LLM choice through a provider interface:

```typescript
interface PlannerProvider {
  name: string;
  model: string;
  plan(
    systemPrompt: string,
    userGoal: string,
    options?: PlannerOptions
  ): Promise<PlannerResponse>;
}

// Implemented providers:
class OpenAIProvider implements PlannerProvider { ... }
class AnthropicProvider implements PlannerProvider { ... }
class OllamaProvider implements PlannerProvider { ... }
```

**Provider selection**: Configurable per organization. Default: try OpenAI GPT-4o, fallback to Anthropic Claude 4 Opus, fallback to local Ollama.

**Per-provider parameters:**

| Provider | Default Model | Max Tokens | Temperature |
|---|---|---|---|
| OpenAI | gpt-4o | 4096 | 0.2 |
| Anthropic | claude-opus-4 | 4096 | 0.3 |
| Ollama | deepseek-coder-v2 | 4096 | 0.1 |

### Normalized Output

The LLM must return JSON with the following structure:

```json
{
  "plan_id": "plan_789",
  "goal_summary": "Migrate database from staging to production",
  "domain": "devops",
  "risk_level": "high",
  "steps": [
    {
      "id": "step_1",
      "tool": "run_shell",
      "version": "2.1.0",
      "parameters": {
        "command": "pg_dump -h staging-db -U admin --schema-only > /tmp/schema.sql"
      },
      "depends_on": [],
      "description": "Backup staging schema",
      "timeout_seconds": 120
    },
    {
      "id": "step_2",
      "tool": "db_migrate",
      "version": "3.2.1",
      "parameters": {
        "direction": "up",
        "target": "production",
        "source_file": "/tmp/schema.sql"
      },
      "depends_on": ["step_1"],
      "description": "Run migrations in production",
      "timeout_seconds": 300
    }
  ]
}
```

**Post-parsing validation:**

1. The JSON must be parseable (if not, retry with the LLM with error feedback)
2. All referenced `tool` values must exist in the Tools Registry
3. All required parameters must be present
4. Dependencies (`depends_on`) must form a valid DAG (no cycles)
5. Each step must have a unique `id` within the plan

### Plan Cache

To avoid unnecessary LLM calls, the Planner maintains a plan cache:

```typescript
interface CacheEntry {
  goalEmbedding: number[];   // embedding(1536) of the original Goal
  plan: Plan;
  createdAt: Date;
  ttl: number;               // seconds
  hitCount: number;
}

// Cache strategy:
// 1. Calculate embedding of the new Goal
// 2. Search cache by cosine similarity > 0.92
// 3. If match, reuse plan (validating tools are still available)
// 4. If no match, call the LLM
```

### Fallback

If the LLM does not produce a valid plan after 3 attempts:

1. **Plan template**: Search a template database by domain and Goal type
   ```yaml
   templates:
     - domain: devops
       type: database_migration
       steps:
         - tool: run_shell, command: pg_dump...
         - tool: db_migrate...
   ```
2. **Manual plan**: Return to the user with an explanatory message and allow them to define steps manually through the CLI

---

## Policy Engine

The Policy Engine is the **guardian of the system**. Every proposed operation is evaluated against rules defined in **OPA/Rego** before being executed.

### OPA/Rego Integration

CaS supports two integration modes:

| Mode | Description | Advantage |
|---|---|---|
| **Sidecar** | OPA process per Orchestrator instance | Isolation, low latency |
| **Central Server** | Shared OPA server for the entire cluster | Unified policies, easy updates |

Default: Sidecar for low latency (< 2ms per evaluation).

**Evaluation API:**

```
POST /v1/data/cas/policies/allow
Body: {
  "input": {
    "user": "jdoe",
    "role": "dev",
    "domain": "devops",
    "environment": "prod",
    "tool": {
      "name": "kubectl_apply",
      "type": "write",
      "risk": "high"
    },
    "autonomy_mode": "semi-autonomous",
    "goal_risk_level": "high"
  }
}
Response: {
  "result": {
    "allow": false,
    "require_approval": true,
    "reason": "Write to production requires approval"
  }
}
```

### Rego Rules Structure

```rego
package cas.policies

import future.keywords.if
import future.keywords.in

default allow := false
default require_approval := false

# ==========================================
# Role-based Rules
# ==========================================

# Admin can do everything in dev and staging
allow if {
    input.role == "admin"
    input.environment in ["dev", "staging"]
}

# Developer read-only in prod
allow if {
    input.role == "dev"
    input.environment == "prod"
    input.tool.type == "read"
}

# Developer needs approval to write in prod
require_approval if {
    input.role == "dev"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}

# Analyst read-only in finance
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
}

# ==========================================
# Environment-based Rules
# ==========================================

# In production, writing always requires approval
require_approval if {
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
    input.autonomy_mode != "autonomous"
}

# ==========================================
# Risk-level Rules
# ==========================================

# High risk always requires approval in semi-autonomous mode
require_approval if {
    input.tool.risk == "high"
    input.autonomy_mode == "semi-autonomous"
}

# Low risk always allowed in semi-autonomous mode
allow if {
    input.tool.risk == "low"
    input.autonomy_mode == "semi-autonomous"
}

# ==========================================
# Explicit Denial Rules
# ==========================================

# Deny if the tool is not approved for the domain
deny if {
    not data.tools_by_domain[input.domain][input.tool.name]
}

# Deny execution in prod outside business hours without special approval
deny if {
    input.environment == "prod"
    input.tool.type == "execute"
    time.now_ns() % 86400000000000 < time.clock(9, 0, 0)
    not data.approved_outside_hours[input.user]
}
```

### Policy Engine Input

| Field | Type | Description | Example |
|---|---|---|---|
| `user` | string | User ID | `jdoe` |
| `role` | string | User role | `dev`, `admin`, `analyst` |
| `domain` | string | Business domain | `devops`, `finance`, `marketing` |
| `environment` | string | Target environment | `dev`, `staging`, `prod` |
| `tool.name` | string | Tool name | `kubectl_apply` |
| `tool.type` | string | Operation type | `read`, `write`, `execute` |
| `tool.risk` | string | Risk level | `low`, `medium`, `high` |
| `autonomy_mode` | string | Goal's autonomy mode | `consultive`, `semi-autonomous`, `autonomous` |
| `goal_risk_level` | string | Calculated risk of the entire Goal | `low`, `medium`, `high` |

### Policy Engine Output

| Decision | Meaning | Orchestrator Action |
|---|---|---|
| `ALLOW` | Operation permitted | Publish job to queue |
| `DENY` | Operation denied | Mark step as FAILED with reason |
| `REQUIRE_APPROVAL` | Requires human approval | Pause plan, notify user and approvers |

### Autonomy Modes in Detail

**Consultive:**

```
For EACH step in the plan:
  if tool.type == "read" → ALLOW
  else → REQUIRE_APPROVAL

The Orchestrator:
  1. Pauses the plan after planning
  2. Shows each step to the user with its parameters
  3. Waits for explicit approval to continue
  4. If a step is denied → Goal FAILED
  5. If approved → step executes, then pauses at the next one
```

**Semi-autonomous (default):**

```
For EACH step in the plan:
  if tool.risk == "low" → ALLOW
  if tool.risk == "medium" AND environment != "prod" → ALLOW
  if tool.risk == "high" OR environment == "prod" → REQUIRE_APPROVAL

The Orchestrator:
  1. Automatically executes low-risk steps
  2. When it encounters a REQUIRE_APPROVAL, pauses and notifies
  3. The user can approve in batch or step by step
  4. Continues automatically after approval
```

**Autonomous:**

```
For EACH step in the plan:
  if operation is inside the sandbox → ALLOW
  if operation is outside the sandbox → evaluate normal policy

The Orchestrator:
  1. Executes everything automatically
  2. Only asks for approval if the step requires access outside the sandbox
  3. Useful for CI/CD and isolated environments
```

---

## Tools Registry

The Tools Registry is the **capability catalog** of the system. Each tool is an atomic function that can execute on a specific runner.

### tool.yaml Descriptor

Each tool is defined with a YAML file:

```yaml
name: run_sql_query
version: 1.0.0
description: Executes a SQL query on a corporate database
domain: finance
author: admin@sre-team

# Runner that will execute this tool
runner:
  type: data-runner
  image: cas/data-runner:1.2.0
  entrypoint: python /runner/run_sql.py

# Parameters it accepts
parameters:
  - name: query
    type: string
    description: SQL query to execute. Only SELECT allowed.
    required: true
    sensitive: false
    validation:
      pattern: "^SELECT.*"
      message: "Only SELECT queries are allowed"
  - name: database
    type: string
    description: Target database
    required: true
    enum:
      - staging-finance
      - prod-finance
      - reporting
  - name: limit
    type: integer
    description: Maximum number of rows
    required: false
    default: 100
    validation:
      min: 1
      max: 10000

# Security profile
security:
  network: outbound-only
  resources:
    cpu: "1"
    memory: "512Mi"
  timeout: 300
  risk: read
  sandbox: true

# Contract metadata
contract:
  output:
    type: file
    format: csv
    max_size_mb: 50
  error_codes:
    - code: ERR_QUERY_TIMEOUT
      description: Query exceeded maximum time
    - code: ERR_INVALID_QUERY
      description: Query has syntax errors
    - code: ERR_DB_CONNECTION
      description: Could not connect to the database
```

### Registry API

| Method | Path | Description | Query Params |
|---|---|---|---|
| `GET` | `/tools` | List all tools | `domain`, `runner`, `risk`, `query` (text search) |
| `GET` | `/tools/:name` | Latest version of a tool | — |
| `GET` | `/tools/:name/:version` | Specific version | — |
| `POST` | `/tools` | Register new tool (admin) | — |
| `PUT` | `/tools/:name/:version` | Update tool (admin) | — |
| `DELETE` | `/tools/:name/:version` | Deprecate tool (admin) | — |

### Semantic Versioning

| Change | Example | Version |
|---|---|---|
| Bug fix with no interface changes | Timeout fix | `1.0.0` → `1.0.1` |
| New backward-compatible functionality | New optional parameter | `1.0.0` → `1.1.0` |
| Breaking change | Required parameter removed | `1.0.0` → `2.0.0` |
| Security change | More restrictive network profile | `1.0.0` → `2.0.0` |

Versioned tools coexist in the registry. Existing plans referencing `tool@1.0.0` continue working even if `tool@2.0.0` exists.

### Registration Validation

When registering or updating a tool, the Registry validates:

1. **Parameter schema**: Correct types, default values, valid enums
2. **Security**: Valid network profile, resources within limits, reasonable timeout
3. **Runner**: The runner type exists and the image is available
4. **Integrity signature**: The registration must be signed with a deploy key
5. **No duplicates**: No two tools with the same `name@version`

---

## Performance Considerations

### Latency Targets

| Operation | Target Latency | P99 Maximum |
|---|---|---|
| Policy evaluation (OPA) | < 2ms | < 10ms |
| LLM planning | < 5s | < 15s |
| Schema validation | < 1ms | < 5ms |
| Job queue publication | < 5ms | < 20ms |
| Runner event processing | < 10ms | < 50ms |
| Health check | < 50ms | < 200ms |

### Throughput

The Control Plane is designed to handle **tens of concurrent Goals** per instance:

| Component | Estimated Throughput | Bottleneck |
|---|---|---|
| API Gateway | 1000 req/s | Rate limiting + Redis |
| Orchestrator | 50 goals/s | Redis state updates |
| Planner | 10 plans/s | LLM API latency |
| Policy Engine | 10000 eval/s | OPA sidecar |
| Tools Registry | 500 queries/s | PostgreSQL reads |

### Scaling Strategy

- **API Gateway**: Pure horizontal behind load balancer. Stateless.
- **Orchestrator**: Horizontal with shared Redis for state. Each instance handles a subset of Goals (sharding by goalId hash).
- **Planner**: Horizontal, stateless. Distributed cache in Redis.
- **Policy Engine**: Sidecar per Orchestrator instance. Policies loaded from OPA bundle.
- **Tools Registry**: Horizontal, stateless. Cache in Redis with event-driven invalidation.

---

## Next

Continue with the **[Execution Plane](04-execution-plane.md)** , which details the runners, message queue, credential management, and execution sandboxing.

---

*Last updated: 2026-05-31*
