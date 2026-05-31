# CaS — Security and Compliance

**CLI as a Service Reference Architecture**

- **License:** MIT
- **Repository:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Last updated:** 2026-05-31

---

## Security Principles

CaS is built on four fundamental security principles that guide every architectural decision:

### 1. Least Privilege

Each component of the system receives **only the permissions necessary** to fulfill its function and nothing more.

- **Runners**: Each job receives scoped credentials with a TTL equal to the job duration. Upon completion, credentials are automatically revoked.
- **Plans**: Each plan step can only access the tools and resources it needs. A SQL query step cannot execute deploys.
- **Users**: Each user has roles that limit which domains, tools, and environments they can operate.

### 2. Defense in Depth

There is no single point of security failure. Multiple layers must be breached for an attack to succeed:

```
Layer 1: Authentication (OIDC/JWT) ─── Who you are
Layer 2: Authorization (Policy Engine) ─── What you can do
Layer 3: Sandboxing (Containers) ─── Where you do it
Layer 4: Network Isolation ─── What you connect to
Layer 5: Credential Scoping ─── With what credentials
Layer 6: Audit Trail ─── What was recorded
Layer 7: Data Governance ─── What data you see
```

### 3. Separation of Concerns

The most important principle of the CaS architecture:

- **Control Plane** never executes code. It only orchestrates, plans, and evaluates policies.
- **Execution Plane** never decides policies. It only executes what it receives and reports results.
- **Memory Layer** never exposes data without authorization. It only responds to authenticated queries.
- **Interface Layer** never contains business logic. It only presents and collects.

This means that even if a runner is compromised, the attacker cannot modify policies, access other projects' memory, or execute unauthorized operations.

### 4. Auditability

Every action in the system is logged with full context:

- What was executed (tool + parameters)
- Who requested it (userId + role)
- Who approved it (if applicable)
- What the policy engine decided
- When it occurred (timestamp)
- What result it had (success/failure/error)

The audit trail is **immutable, append-only, and signed with a hash chain**.

---

## Autonomy Modes

CaS offers three autonomy modes to balance productivity vs. control. The mode is defined per Goal (not globally) and can be restricted by organizational policies.

### Mode Comparison

| Aspect | Consultive | Semi-autonomous | Autonomous |
|---|---|---|---|
| **Approval required** | Each non-read step | High-risk steps | Only outside sandbox |
| **Speed** | Slow | Medium | Fast |
| **Control** | Maximum | Balanced | Minimum |
| **Use case** | Production, finance | Daily DevOps | CI/CD, sandbox |
| **Risk** | Low | Medium | High |
| **Human supervision** | Constant | Selective | Minimal |

### Consultive

The most restrictive mode. Designed for environments with strict regulatory compliance (finance, healthcare, government).

```
Flow:
1. User creates Goal → Orchestrator plans
2. Each plan step is evaluated by Policy Engine
3. If the step is not read-only → REQUIRE_APPROVAL
4. Orchestrator pauses the plan
5. User receives notification: "Step 2/5 requires approval"
6. User (or designated approver) reviews: tool, parameters, environment
7. Approves or denies
8. If approved → step executed → loop to step 2 for next step
9. If denied → Goal FAILED

Example:
Goal: "Execute migration script on staging"
  step 1: run_shell("pg_dump staging") → read-only → auto ALLOW
  step 2: db_migrate(up, staging) → write → REQUIRE_APPROVAL
  → User reviews and approves
  step 3: run_shell("verify data") → read-only → auto ALLOW
  step 4: notify("migration completed") → write → REQUIRE_APPROVAL
  → User reviews and approves
```

### Semi-autonomous

The default mode. Balances productivity with control through risk classification.

```
Flow:
1. User creates Goal → Orchestrator plans
2. Each step is evaluated with risk rules:
   - risk=low (read, dev) → auto ALLOW
   - risk=medium (write in dev, read in prod) → auto ALLOW
   - risk=high (write in prod, deploy, delete) → REQUIRE_APPROVAL
3. Low/medium risk steps execute immediately
4. High risk steps pause the plan and notify
5. User approves in batch or step by step
6. Execution continues

Example:
Goal: "Deploy version 2.5 to staging and then to production"
  step 1: build_image(version 2.5) → risk=medium (staging) → ALLOW
  step 2: helm_deploy(staging, version 2.5) → risk=medium → ALLOW
  step 3: run_tests(staging) → risk=low → ALLOW
  step 4: helm_deploy(prod, version 2.5) → risk=high (write in prod) → REQUIRE_APPROVAL
  → User notified: "Approve deploy to production?"
  → User approves
  step 5: smoke_tests(prod) → risk=low → ALLOW
```

### Autonomous

Frictionless mode. Designed for isolated environments (CI/CD, dev sandbox, internal tools).

```
Flow:
1. User creates Goal → Orchestrator plans
2. Policy Engine evaluates steps:
   - Operation within tool sandbox → ALLOW
   - Operation requiring access outside sandbox → evaluate normally
3. Everything executes automatically
4. Only steps escaping the sandbox may require approval

Example:
Goal: "Run unit tests and generate coverage report" (sandbox)
  → All steps are ALLOW → complete automatic execution

Goal: "Modify production config from CI/CD" (sandbox + prod)
  → step 1: shell("run tests") → sandbox → ALLOW
  → step 2: kubectl_apply(prod, config.yaml) → outside sandbox → evaluate policy
```

---

## Policy Engine (OPA/Rego)

The Policy Engine uses **OPA (Open Policy Agent)** with the **Rego** language to define and evaluate security policies.

### Policy Structure

Policies are organized into packages by domain and type:

```
policies/
├── cas/
│   ├── policies.rego          # Global rules
│   ├── roles/
│   │   ├── admin.rego
│   │   ├── dev.rego
│   │   └── analyst.rego
│   ├── domains/
│   │   ├── devops.rego
│   │   ├── finance.rego
│   │   └── marketing.rego
│   ├── environments/
│   │   ├── dev.rego
│   │   ├── staging.rego
│   │   └── prod.rego
│   └── exceptions/
│       └── emergency.rego     # Break-glass policies
└── data/
    └── tools_by_domain.json   # Tools catalog by domain
```

### Global Rules (cas/policies.rego)

```rego
package cas.policies

import future.keywords.if
import future.keywords.in

# Deny by default
default allow := false
default require_approval := false
default deny := false

# ==========================================
# Explicit Denial Rules
# ==========================================

# Tool not available for the domain
deny if {
    not data.tools_by_domain[input.domain][input.tool.name]
}

# Banned or suspended user
deny if {
    data.suspended_users[input.user]
}

# Restricted hours for write operations in prod
deny if {
    input.environment == "prod"
    input.tool.type == "write"
    not is_within_business_hours()
    not data.emergency_approved[input.user]
}

# ==========================================
# Helper Functions
# ==========================================

is_within_business_hours() {
    # 9 AM - 6 PM UTC, Monday-Friday
    hour := time.now_ns() / 3600000000000 % 24
    hour >= 9
    hour < 18
    day := time.now_ns() / 86400000000000 % 7
    day >= 1   # Monday
    day <= 5   # Friday
}
```

### Role-based Rules (cas/roles/admin.rego)

```rego
package cas.roles.admin

import future.keywords.if

# Admin can do everything in dev and staging
allow if {
    input.role == "admin"
    input.environment in ["dev", "staging"]
}

# Admin needs approval for write in prod
require_approval if {
    input.role == "admin"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}
```

### Domain-based Rules (cas/domains/finance.rego)

```rego
package cas.domains.finance

import future.keywords.if
import future.keywords.in

# Analysts read-only in finance
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
}

# Any write in finance requires approval
require_approval if {
    input.domain == "finance"
    input.tool.type in ["write", "execute"]
}

# Prohibit data export from finance to non-approved destinations
deny if {
    input.domain == "finance"
    input.tool.name == "send_email"
    not data.approved_export_destinations[input.parameters.to]
}
```

### Break-Glass (Emergency Override)

For emergency situations (security incident, production outage), CaS supports a **break-glass** mechanism that allows temporary policy bypass:

```rego
package cas.exceptions.emergency

import future.keywords.if

# Users with emergency_responder role can operate outside policy
allow if {
    data.emergency_active == true
    input.user in data.emergency_responders
    input.user in data.current_incident_team
}

# Break-glass requires justification + double post-hoc approval
audit.emergency_override if {
    data.emergency_active == true
    input.user in data.emergency_responders
}
```

**Break-glass activation:**

1. User with `emergency_responder` role activates the mode
2. It is registered in the audit trail with reason and timestamp
3. Restrictions are relaxed for a maximum of 60 minutes
4. Post-incident, formal justification and security review are required

---

## Auditing

The audit system records **every action** executed in CaS in an immutable manner.

### AuditEvent Table

```sql
CREATE TABLE audit_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Who
    user_id         TEXT NOT NULL,
    user_role       TEXT,
    session_id      TEXT,
    
    -- What
    goal_id         TEXT,
    plan_id         TEXT,
    job_id          TEXT,
    action          TEXT NOT NULL,      -- "run_sql_query", "kubectl_apply", etc.
    parameters      JSONB,              -- Parameters used for execution
    
    -- Policy
    policy_decision TEXT NOT NULL CHECK (
        policy_decision IN ('ALLOW', 'DENY', 'REQUIRE_APPROVAL')
    ),
    policy_reason   TEXT,
    policy_rules    TEXT[],             -- Rego rules that applied
    
    -- Approval
    approver        TEXT,               -- Who approved (NULL if auto)
    approval_note   TEXT,
    
    -- Result
    result          TEXT NOT NULL CHECK (
        result IN ('SUCCESS', 'FAILURE', 'TIMEOUT', 'CANCELLED', 'DENIED')
    ),
    error_message   TEXT,
    duration_ms     INTEGER,
    
    -- Hash chain
    previous_hash   TEXT NOT NULL,
    current_hash    TEXT NOT NULL,
    
    -- Metadata
    environment     TEXT,
    domain          TEXT,
    metadata        JSONB DEFAULT '{}'
);

-- Audit query indexes
CREATE INDEX idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX idx_audit_user ON audit_events(user_id);
CREATE INDEX idx_audit_goal ON audit_events(goal_id);
CREATE INDEX idx_audit_action ON audit_events(action);
CREATE INDEX idx_audit_policy ON audit_events(policy_decision);
```

### Hash Chain

Each audit event is cryptographically linked to the previous one, making retroactive modification impossible:

```
event_1: previous_hash = "0000..." (genesis)
         current_hash = SHA256(event_1_data + previous_hash)

event_2: previous_hash = current_hash(event_1)
         current_hash = SHA256(event_2_data + previous_hash)

event_3: previous_hash = current_hash(event_2)
         current_hash = SHA256(event_3_data + previous_hash)
```

**Integrity verification:**

```sql
-- Query to verify the chain has not been altered
SELECT
    e1.event_id,
    e1.current_hash = sha256(
        e1.event_id || e1.timestamp || e1.user_id || e1.action || 
        e1.policy_decision || e1.result || e1.previous_hash
    ) AS hash_valid,
    e1.previous_hash = e2.current_hash AS chain_valid
FROM audit_events e1
JOIN audit_events e2 ON e1.event_id > e2.event_id
ORDER BY e1.timestamp
LIMIT 1;
```

### Audit Queries

```sql
-- What did user jdoe do in the last 24 hours?
SELECT timestamp, action, parameters, policy_decision, result
FROM audit_events
WHERE user_id = 'jdoe'
    AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- How many operations were denied by policy?
SELECT policy_reason, COUNT(*) as count
FROM audit_events
WHERE policy_decision = 'DENY'
    AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY policy_reason
ORDER BY count DESC;

-- Who approved production operations in the last week?
SELECT approver, COUNT(*) as approvals
FROM audit_events
WHERE environment = 'prod'
    AND policy_decision = 'REQUIRE_APPROVAL'
    AND result = 'SUCCESS'
    AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY approver;
```

---

## Network Isolation

The Execution Plane implements network isolation through three profiles configurable per tool.

### Network Profiles

| Profile | Description | Inbound | Outbound | Tool examples |
|---|---|---|---|---|
| `none` | No network | Blocked | Blocked | `run_python` (local computation), `render_report` |
| `outbound-only` | Outbound only | Blocked | Allowed | `run_sql_query`, `kubectl_apply`, `api_call` |
| `full` | Bidirectional | Allowed | Allowed | `debug_session`, `db_tunnel`, `migration` |

### Docker Implementation

```bash
# none — no network
docker run --network none ...

# outbound-only — only outbound connections
docker run --network bridge --publish-all=false ...

# full — full access
docker run --network host ...
# Or with bridge + specific ports mapped
docker run --network bridge -p 8080:8080 ...
```

### Default: outbound-only

90% of tools use `outbound-only`. This allows:
- Querying databases
- Making API calls to internal services
- Executing deploys to Kubernetes

But prevents:
- Receiving incoming connections (no listening servers in the runner)
- Scanning the internal network
- Acting as a pivot point for attacks

### Outbound Proxy

All outbound traffic goes through a **forward proxy** (Squid, mitmproxy) that:

1. **Destination whitelist**: Only authorized domains/IPs
2. **TLS inspection**: Decrypted and re-inspected HTTPS traffic
3. **Rate limiting**: Request limit per job
4. **Logging**: All connections recorded in audit trail
5. **Content filtering**: Blocking executable downloads, suspicious payloads

```yaml
# proxy-policies.yaml
proxy:
  whitelist:
    - "*.internal.company.com"         # Internal services
    - "api.github.com"                 # GitHub API
    - "registry-1.docker.io"           # Docker Hub (pulls)
    - "*.googleapis.com"               # GCP APIs
    - "database.company.com:5432"      # Corporate PostgreSQL
  
  blacklist:
    - "*.pastebin.com"
    - "*.file.io"
    - "192.168.0.0/16"                # Unauthorized internal network
```

---

## Secrets Management

CaS integrates **HashiCorp Vault** as the central secrets backend. Credentials are never stored in code, environment variables, logs, or configuration files.

### Secrets Hierarchy in Vault

```
secret/
└── cas/
    ├── org_{orgId}/
    │   ├── db/
    │   │   ├── reporting/readonly
    │   │   │   ├── host
    │   │   │   ├── port
    │   │   │   ├── username
    │   │   │   └── password
    │   │   ├── prod-finance/admin
    │   │   │   └── ...
    │   ├── api/
    │   │   ├── github/token
    │   │   └── slack/webhook
    │   └── cloud/
    │       ├── aws/credentials
    │       └── gcp/service-account
    └── tools/
        └── {tool_name}/
            └── {version}/
                └── config
```

### Vault Policies

```hcl
# Policy: db-reporting-readonly
path "secret/data/cas/org_*/db/reporting/readonly" {
  capabilities = ["read"]
  allowed_parameters = {
    "host" = []
    "port" = []
    "username" = []
    "password" = []
  }
}

# Policy: job-execution (scoped by TTL)
path "secret/data/cas/org_*/db/*" {
  capabilities = ["read"]
}
# Max TTL: 300 seconds (maximum job duration)
```

### Automatic Rotation

For PostgreSQL databases, CaS uses **Vault Dynamic Secrets**:

```hcl
# DB rotation configuration
path "database/creds/cas-reporting-role" {
  capabilities = ["read"]
  # TTL: 5 minutes (typical job duration)
  # Max TTL: 30 minutes
}
```

When the runner requests credentials, Vault:
1. Creates a temporary user in PostgreSQL
2. Grants only the necessary permissions (READ on specific tables)
3. Assigns a TTL of 5 minutes
4. Automatically revokes upon TTL expiration

---

## Data Governance

### Data Classification

CaS supports a **sensitivity catalog** system that determines what data each role can see:

| Sensitivity Level | Description | Roles with Access | Example |
|---|---|---|---|
| **Public** | Non-sensitive data | Everyone | Documentation, uptime metrics |
| **Internal** | Internal company data | All employees | Team reports, internal dashboards |
| **Confidential** | Sensitive business data | Authorized team | Financial data, product strategy |
| **Restricted** | Highly sensitive data | Specific roles + justification | Customer PII, trade secrets |
| **Critical** | Data with legal implications | Explicit approval + full audit trail | Banking data, medical history |

### PII Detection

Runner logs and outputs go through a **PII (Personally Identifiable Information) filter** that:

1. Detects PII patterns: emails, phones, addresses, SSN, credit card numbers
2. Automatically redacts: replaces with `[REDACTED]`
3. Records the redaction in audit trail: how many instances, what type

```python
# PII Redaction Filter (implemented in the runner agent)
import re

PII_PATTERNS = {
    'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
    'phone': r'\+?1?\d{9,15}',
    'ssn': r'\d{3}-\d{2}-\d{4}',
    'credit_card': r'\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}',
    'ip_address': r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b',
}

def redact_pii(text: str) -> tuple[str, list]:
    redacted = text
    findings = []
    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, redacted)
        if matches:
            findings.append({'type': pii_type, 'count': len(matches)})
            redacted = re.sub(pattern, '[REDACTED]', redacted)
    return redacted, findings
```

### Compliance by Regulatory Framework

| Framework | Requirement | Implementation in CaS |
|---|---|---|
| **SOC2** | Full audit trail | Immutable hash chain of events |
| **SOC2** | Access controls | Policy Engine + OIDC + roles |
| **GDPR** | Right to deletion | Delete cascade on MemoryItems + Audit trail anonymization |
| **GDPR** | Data portability | Export MemoryItems in JSON |
| **SOX** | Approval workflows | Consultive mode + REQUIRE_APPROVAL |
| **SOX** | Segregation of duties | Separation of concerns between planes |
| **PCI DSS** | Cardholder data protection | PII detection + automatic redaction |
| **PCI DSS** | Access control | Network isolation + credential scoping |

---

## Security Monitoring

### Automatic Alerts

| Event | Severity | Action | Channel |
|---|---|---|---|
| 5+ consecutive DENY from same user | Medium | Notify security team | Slack + Email |
| Break-glass activated | High | Notify immediately | PagerDuty + Slack |
| Job with attack patterns (SQL injection, RCE) | Critical | Block tool, notify SOC | PagerDuty |
| Vault token not renewed | High | Disable runner | Slack |
| Invalid hash chain | Critical | Freeze system, notify SOC | PagerDuty |

### Security Metrics (Prometheus)

| Metric | Description |
|---|---|
| `cas.security.denies_total` | Total denied operations |
| `cas.security.approvals_required` | Operations that required approval |
| `cas.security.approval_time_seconds` | Time until approval/denial |
| `cas.security.break_glass_active` | 1 if break-glass is active |
| `cas.security.pii_redactions_total` | Instances of redacted PII |
| `cas.security.chain_integrity` | 1 if hash chain is valid |

---

## Next

Continue with the **[Domain Verticals](07-domain-verticals.md)** , which describes how to specialize CaS for specific business domains (DevOps, Marketing, Finance) with custom vocabulary, task-to-tool mapping, and specific policies.

---

*Last updated: 2026-05-31*
