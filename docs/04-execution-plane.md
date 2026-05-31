# CaS — Execution Plane

**CLI as a Service Reference Architecture**

- **License:** MIT
- **Repository:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Last updated:** 2026-05-31

---

## General Architecture

The Execution Plane is the layer responsible for **executing code in an isolated, secure, and observable manner**. It is composed of workers that consume jobs from a message queue, execute them in containerized environments, and report results back to the Orchestrator.

**Design principles:**

1. **Stateless**: Runners do not maintain state between jobs. All state lives in the Control Plane and the Memory Layer.
2. **Total isolation**: Each job executes in an ephemeral Docker container with bounded resources, network, and credentials.
3. **Auto-scaling**: Runners scale according to message queue depth.
4. **Auto-cleanup**: Containers are destroyed immediately after execution (success, failure, or timeout).

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                          │
│                        Orchestrator                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Message Queue  │
                    │  (BullMQ /      │
                    │   RabbitMQ)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
        │  Shell    │ │  CI/CD    │ │  Data     │
        │  Runner   │ │  Runner   │ │  Runner   │
        │ (Docker)  │ │ (Actions) │ │ (pandas)  │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              │              │              │
              └──────┬───────┴───────┬──────┘
                     │               │
              ┌──────▼───────┐ ┌─────▼──────┐
              │    Vault     │ │ Container  │
              │    Agent     │ │ Registry   │
              └──────────────┘ └────────────┘
```

---

## Shell Runner

The Shell Runner is the most versatile runner. It executes **arbitrary commands inside ephemeral Docker containers**. It is the corporate equivalent of running a script in a terminal, but with sandboxing, auditing, and policies.

### Job Lifecycle in Shell Runner

```
1. VERIFY          2. CREATE             3. CONFIGURE
   ┌─────────┐         ┌─────────┐          ┌─────────┐
   │ Pull    │         │ Create  │          │ Set     │
   │ image   │         │ contain-│          │ network │
   │ from    │         │ er from │          │ profile │
   │ registry│         │ image   │          │ + inject│
   └─────────┘         └─────────┘          │ creds   │
                                            └────┬────┘
                                                 │
                    ┌────────────────────────────┘
                    ▼
   ┌─────────┐     ┌─────────┐     ┌─────────┐
   │ Run     │────▶│ Stream  │────▶│ Collect │
   │ contain-│     │ logs to │     │ results │
   │ er      │     │ WS      │     │ + exit  │
   │ entry-  │     │ (stdout │     │ code    │
   │ point   │     │ /stderr)│     │         │
   └─────────┘     └─────────┘     └────┬────┘
                                        │
                    ┌───────────────────┘
                    ▼
   ┌─────────┐     ┌─────────┐
   │ Destroy │     │ Report  │
   │ contain-│────▶│ result  │
   │ er +    │     │ to MQ   │
   │ cleanup │     │ (event) │
   └─────────┘     └─────────┘
```

### Phase Details

**1. Pull Image**
- Check if the image is already in local cache (corporate registry mirror)
- Pull with digest (not tag) for immutability
- Timeout: 120s for initial pulls, 30s for cached

**2. Create Container**
```bash
docker create \
  --name cas-job-{jobId} \
  --network {networkProfile} \
  --cpus {cpuLimit} \
  --memory {memoryLimit} \
  --read-only \
  --security-opt seccomp={profilePath} \
  --security-opt apparmor={profilePath} \
  --stop-timeout 30 \
  {image} {entrypoint} {params...}
```

**3. Set Network + Inject Credentials**
- Network profile determines connectivity (see Network Isolation section)
- Credentials injected via vault agent sidecar or temporary file at `/vault/secrets/`
- Environment variables `CAS_*` for context (goalId, jobId, stepId)

**4. Run Container**
```bash
docker start -a cas-job-{jobId}
```
- `-a` attach mode for real-time stdout/stderr capture
- Timeout monitored by the runner. If the container exceeds the configured timeout, `docker kill` + `docker rm -f` is executed
- Logs are parsed line by line and sent as `job.log` events to the Orchestrator via the message queue

**5. Collect Results**
- Exit code 0 → success
- Exit code != 0 → failure
- Output files (if any) are copied from the container to the shared volume before destroying:
  ```bash
  docker cp cas-job-{jobId}:/output /var/cas/results/{jobId}/
  ```

**6. Destroy + Cleanup**
```bash
docker rm -f cas-job-{jobId}
docker volume rm cas-vol-{jobId}  # if applicable
```
Guaranteed even if the runner process is interrupted (via defer/cleanup handlers).

**7. Report Result**
An event is published to the message queue (topic: `events`):

```json
{
  "type": "job.completed",
  "jobId": "job_456",
  "goalId": "goal_abc123",
  "result": {
    "exitCode": 0,
    "stdout": "Migration completed successfully\n",
    "stderr": "",
    "artifacts": [
      "/var/cas/results/job_456/migration_report.txt"
    ],
    "duration": 45000
  }
}
```

### Sandboxing

| Security Layer | Mechanism | Description |
|---|---|---|
| **Filesystem** | `--read-only` + tmpfs for `/tmp` | Container cannot modify its own filesystem |
| **System calls** | Seccomp profile | Whitelist of allowed syscalls. Denies mount, kernel modules, ptrace, etc. |
| **Mandatory Access Control** | AppArmor profile | Restricts capabilities even if seccomp is bypassed |
| **Linux capabilities** | `--cap-drop ALL` | Drops all capabilities, then adds only necessary ones (e.g., `NET_BIND_SERVICE` for network outbound) |
| **User namespace** | `--userns-remap` | Process runs as non-root user inside the container |
| **Resource limits** | cgroups v2 | CPU, memory, disk, max PID |
| **Network** | Profiles: none, outbound-only, full | Granular connectivity control |

### Resource Limits

Per-tool configuration in `tool.yaml`:

```yaml
security:
  resources:
    cpu: "1"         # 1 vCPU maximum
    memory: "512Mi"   # 512 MB RAM maximum
    disk: "1Gi"       # 1 GB temporary disk
    pids: 100         # Maximum processes
```

Global per-runner limits:

| Resource | Default | Maximum | Exception |
|---|---|---|---|
| CPU | 1 vCPU | 4 vCPU | Admin approval |
| RAM | 512 MB | 4 GB | Admin approval |
| Disk | 1 GB | 10 GB | Admin approval |
| Time | 300s | 3600s | Admin approval |
| Processes | 100 | 500 | Admin approval |

### Network Profiles

| Profile | Connectivity | Use Cases |
|---|---|---|
| `none` | No network access | Local data processing, calculations, report generation without external connection |
| `outbound-only` | Outbound connections allowed (TCP/UDP), no listening | DB queries, API calls, deploys to external services |
| `full` | Full bidirectional access | Interactive debugging, migrations with tunneling, access to internal services |

Default for most tools: `outbound-only`.

### Logs and Streaming

Container logs are transmitted in real-time to the Orchestrator and from there to the end client:

```
Runner                                Orchestrator                  CLI TUI
  │                                       │                          │
  │── job.log {stream:stdout, data:"...")─▶│                          │
  │                                       │── {"type":"log",          │
  │                                       │    "data":"..."} (WS) ───▶│
  │                                       │                          │
  │── job.progress {percent:50} ─────────▶│                          │
  │                                       │── {"type":"progress",    │
  │                                       │    "percent":50} (WS) ──▶│
  │                                       │                          │
  │── job.completed {result} ────────────▶│                          │
  │                                       │── {"type":"completed",   │
  │                                       │    "result":"..."} (WS)─▶│
```

Log buffering is managed with a limit of 10,000 lines per job. If exceeded, logs are truncated and the user is notified.

---

## CI/CD Runner

The CI/CD Runner acts as a **bridge between CaS and existing CI/CD systems** in the organization. Instead of replacing pipelines, CaS becomes a **high-level frontend** that orchestrates pipelines as steps of a Goal.

### Architecture

```
Goal: "Deploy version 2.5 to production"

Plan:
  step 1: terraform_plan (plan infrastructure)
  step 2: run_tests (CI/CD Runner → GitHub Actions)
  step 3: build_image (CI/CD Runner → GitLab CI)
  step 4: helm_deploy (Shell Runner → Kubernetes)
  step 5: smoke_tests (CI/CD Runner → Jenkins)
```

### Supported Bridges

| System | Mechanism | Authentication | Status |
|---|---|---|---|
| **GitHub Actions** | `workflow_dispatch` API + `repository_dispatch` | Access token (GH App) | Polling with check_run API |
| **GitLab CI** | Pipeline trigger API with variables | Trigger token | Polling with pipeline status API |
| **Jenkins** | Webhook + Remote Build Token | API token + HMAC | Callback via webhook |
| **Azure DevOps** | Pipelines REST API + Run Pipeline | PAT token | Polling with Run status API |
| **ArgoCD** | Application Set API + Sync | API token SSO | Polling with Application status |

### State Mapping

| CaS Pipeline State | CI/CD State |
|---|---|
| `pending` | — (job not published yet) |
| `running` | `queued`, `in_progress`, `pending` |
| `completed` | `success`, `completed` |
| `failed` | `failure`, `cancelled`, `timed_out` |
| `timeout` | `timed_out` (or CaS job timeout) |

### Example: GitHub Actions Bridge

```typescript
// CI/CD Runner — GitHub Actions Bridge
async function executeGitHubActionJob(job: Job): Promise<JobResult> {
  // 1. Trigger workflow
  const dispatch = await github.actions.createWorkflowDispatch({
    owner: 'company',
    repo: 'infra-deploy',
    workflow_id: 'deploy.yaml',
    ref: 'main',
    inputs: {
      environment: job.parameters.environment,
      version: job.parameters.version,
      cas_job_id: job.jobId
    }
  });

  // 2. Wait for workflow to run (polling)
  const runId = await pollForRun(job.jobId);
  
  // 3. Monitor progress
  while (status !== 'completed') {
    const run = await github.actions.getWorkflowRun({ runId });
    status = run.data.status;
    conclusion = run.data.conclusion;
    
    // Forward GitHub Actions logs to CaS
    const logs = await github.actions.downloadWorkflowRunLogs({ runId });
    await publishEvent('job.log', { data: logs });
    
    await sleep(5000);
  }

  // 4. Return result
  return {
    exitCode: conclusion === 'success' ? 0 : 1,
    artifacts: [`https://github.com/company/infra-deploy/actions/runs/${runId}`]
  };
}
```

---

## Data Runner

The Data Runner is specialized for **data analysis, ETL, and reporting jobs**. Its base image includes the most common tools from the Python data ecosystem.

### Base Image

```dockerfile
FROM python:3.12-slim

# Data tools
RUN pip install --no-cache-dir \
    pandas==2.2.* \
    sqlalchemy==2.0.* \
    numpy==1.26.* \
    matplotlib==3.8.* \
    seaborn==0.13.* \
    openpyxl==3.1.* \
    jupyter==1.0.* \
    psycopg2-binary==2.9.* \
    pyarrow==15.* \
    fastparquet==2024.*

# Runner entrypoint
COPY runner.py /runner/
WORKDIR /runner
ENTRYPOINT ["python", "/runner/runner.py"]
```

### Supported Job Types

| Type | Description | Typical Output |
|---|---|---|
| `sql_query` | Execute SQL query and return results | CSV, Parquet |
| `etl` | Extract, transform, and load data | Updated DB table |
| `report` | Generate report with charts and tables | PDF, Excel, HTML |
| `analysis` | Exploratory data analysis | Notebook (Jupyter .ipynb) |
| `ml_inference` | Run inference with pre-trained model | JSON with predictions |

### Database Connections

Database credentials are managed exclusively through **Vault**:

```python
# runner.py — automatic connection via Vault Agent
import os
import json
import pandas as pd
from sqlalchemy import create_engine

def get_db_connection(database_name):
    """Gets DB connection using Vault Agent credentials."""
    vault_path = f"/vault/secrets/{database_name}"
    
    with open(f"{vault_path}/host") as f:
        host = f.read().strip()
    with open(f"{vault_path}/port") as f:
        port = f.read().strip() 
    with open(f"{vault_path}/username") as f:
        username = f.read().strip()
    with open(f"{vault_path}/password") as f:
        password = f.read().strip()
    
    conn_str = f"postgresql://{username}:***@{host}:{port}/{database_name}"
    return create_engine(conn_str)

# Usage in the job
engine = get_db_connection("reporting")
df = pd.read_sql("SELECT * FROM revenue WHERE month = 'may-2026'", engine)
df.to_csv("/output/may_report.csv", index=False)
```

### Data Runner Output

The Data Runner can produce multiple output formats:

| Format | Content-Type | Usage |
|---|---|---|
| CSV | `text/csv` | Tabular data for downstream processing |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Reports for stakeholders |
| PDF | `application/pdf` | Formatted reports |
| HTML | `text/html` | Embedded dashboards |
| Parquet | `application/parquet` | Columnar data for big data |
| JSON | `application/json` | APIs and programmatic consumption |

---

## Message Queue (BullMQ / RabbitMQ)

The message queue is the **circulatory system** that connects the Control Plane with the Execution Plane. It decouples job publication from job execution, allowing each side to scale independently.

### Topology

```
┌─────────────────────────────────────────────────────────────┐
│                      MESSAGE QUEUE                          │
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │   Topic: jobs    │         │  Topic: events   │         │
│  │                  │         │                  │         │
│  │ Orchestrator →  │         │  Runners →       │         │
│  │ Runners          │         │  Orchestrator    │         │
│  │                  │         │                  │         │
│  │ · shell-jobs     │         │ · job.started    │         │
│  │ · cicd-jobs      │         │ · job.progress   │         │
│  │ · data-jobs      │         │ · job.log        │         │
│  └──────────────────┘         │ · job.completed  │         │
│                               │ · job.failed     │         │
│                               └──────────────────┘         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Dead Letter Queue (DLQ)                   │   │
│  │  Jobs that exceeded retry count or max timeout       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Configuration (BullMQ with Redis)

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';

// Job queue
const jobsQueue = new Queue('jobs', {
  connection: {
    host: 'redis-cas.internal',
    port: 6379,
    password: process.env.REDIS_PASSWORD
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: {
      age: 3600 * 24,  // 24 hours
      count: 1000
    },
    removeOnFail: {
      age: 3600 * 24 * 7  // 7 days
    }
  }
});

// Shell runner worker
const shellWorker = new Worker('jobs', async (job) => {
  const { tool, parameters, credentialsRef, timeout } = job.data;
  
  // Only process jobs for shell-runner
  if (job.data.runnerType !== 'shell-runner') {
    return; // Another worker will process it
  }
  
  return await executeShellJob(job.data);
}, {
  connection: { /* ... */ },
  concurrency: 10,        // 10 simultaneous jobs per worker
  maxStalledCount: 3,     // Allows 3 stalls before DLQ
  stalledInterval: 30000, // Stall check every 30s
  lockDuration: 60000     // 60s lock per job
});
```

### Priorities

Some jobs can have priority over others:

| Priority | Range | Examples |
|---|---|---|
| **Critical** | 1 | Rollbacks, hotfixes, security patches |
| **High** | 2 | Approved deploys, urgent migrations |
| **Normal** | 3 | Regular user Goals (default) |
| **Low** | 4 | Nightly reports, batch tasks |

```typescript
await jobsQueue.add('job', jobData, {
  priority: 1  // Critical
});
```

### Dead Letter Queue

Jobs that enter the DLQ:

1. Exceeded `attempts` (3 attempts by default)
2. Timeout exceeded without response
3. Worker stall detected 3 times
4. Unrecoverable error (image not found, invalid credentials)

DLQ jobs are stored with diagnostic metadata:

```json
{
  "jobId": "job_999",
  "originalData": { ... },
  "failures": [
    {
      "attempt": 1,
      "timestamp": "2026-05-31T10:00:00Z",
      "error": "Connection timeout to database staging-finance",
      "stack": "..."
    },
    {
      "attempt": 2,
      "timestamp": "2026-05-31T10:05:00Z",
      "error": "Connection timeout to database staging-finance",
      "stack": "..."
    },
    {
      "attempt": 3,
      "timestamp": "2026-05-31T10:10:00Z",
      "error": "Connection timeout to database staging-finance",
      "stack": "..."
    }
  ],
  "dlqReason": "Max attempts reached",
  "dlqTimestamp": "2026-05-31T10:10:01Z"
}
```

### Queue Observability

| Metric | Description | Export |
|---|---|---|
| `mq.queue_depth` | Jobs waiting to be processed | Prometheus |
| `mq.active_jobs` | Jobs in execution | Prometheus |
| `mq.wait_time_ms` | Time a job waits in queue | Prometheus (histogram) |
| `mq.job_duration_ms` | Job execution duration | Prometheus (histogram) |
| `mq.dlq_count` | Jobs in Dead Letter Queue | Prometheus |
| `mq.retry_rate` | Proportion of jobs requiring retry | Prometheus |

---

## Credential Management

CaS integrates **HashiCorp Vault** as the central secrets management backend. Credentials are never stored in code, runner environment variables, or logs.

### Vault Architecture

```
                    ┌─────────────┐
                    │   Vault     │
                    │   Cluster   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐
        │ Orchestr. │ │ Shell  │ │  Data    │
        │ Vault     │ │ Runner │ │  Runner  │
        │ Token     │ │ Vault  │ │  Vault   │
        │ (long-    │ │ Agent  │ │  Agent   │
        │  lived)   │ │(sidecar│ │ (sidecar │
        └───────────┘ │ or     │ │  or      │
                      │ init   │ │  init    │
                      │ cont.) │ │  cont.)  │
                      └────────┘ └──────────┘
```

### Credential Flow

```
1. Orchestrator prepares job
   ─ Creates scoped policy: path "db/reporting/readonly" + TTL = job_timeout
   ─ Creates token with that policy
   ─ Stores reference: credentialsRef = "vault://db/reporting/readonly?token=..."

2. Runner receives job
   ─ Vault Agent (sidecar) authenticates with its own token
   ─ Requests credentials from Vault using the credentialsRef
   ─ Vault validates the scoped token + policy
   ─ Vault returns dynamic credentials (username, password, host, port)
   ─ Vault Agent writes to /vault/secrets/{db_name}/ (files)

3. Runner executes job
   ─ The entrypoint reads files in /vault/secrets/
   ─ Establishes connection with the credentials
   ─ Executes the operation

4. Post-execution
   ─ Vault automatically revokes the scoped token (TTL expired)
   ─ Runner cleans /vault/secrets/
   ─ No credentials remain in the system
```

### Secrets Management Principles

1. **Never in environment variables**: Environment variables can leak in logs, process dumps, etc.
2. **Dynamic tokens**: Each job receives a unique token with TTL = job duration + 30s margin.
3. **Scoped policies**: The token can only access the strictly necessary paths for the job.
4. **Automatic rotation**: Database credentials are rotated post-execution.
5. **No secrets in logs**: The runner filters any log line matching secret patterns (passwords, tokens, keys).

---

## Operational Considerations

### Runner Auto-scaling

Runners are deployed as Kubernetes Deployments with auto-scaling based on:

| Metric | Threshold | Action |
|---|---|---|
| Queue depth | > 10 jobs per worker | +1 worker |
| Job latency | > 80% of timeout | +1 worker |
| Worker CPU | > 70% for 5 min | +1 worker |
| Empty queue for 5 min | — | Gradual scale down |

### Health Checks

Each runner exposes health check endpoints:

| Endpoint | Description |
|---|---|
| `GET /health` | General runner status |
| `GET /health/queue` | Message queue connection |
| `GET /health/docker` | Docker daemon available |
| `GET /health/vault` | Vault connection |
| `GET /metrics` | Prometheus metrics |

### Networking

- Runners run on an **isolated subnet** within the Kubernetes cluster
- Only the API Gateway and the Message Queue are accessible from outside the subnet
- Outbound traffic passes through an **outbound proxy** (e.g., Squid) that applies domain whitelisting
- Traffic to internal databases uses **Vault + mutual TLS certificates**

---

## Next

Continue with **[Memory and Context](05-memory-and-context.md)** , which details the persistence system, semantic search, and organizational and project memory read/write patterns.

---

*Last updated: 2026-05-31*
