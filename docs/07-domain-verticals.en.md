# CaS — Domain Verticals

**CLI as a Service Reference Architecture**

- **License:** MIT
- **Repository:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Last updated:** 2026-05-31

---

## Concept

A **vertical** in CaS is a specialization of the system for a specific business domain. It is not a separate product or a fork — it is a **packaged configuration** that includes:

1. **Business task vocabulary** — A mini-DSL that allows users in that domain to express Goals in their own language
2. **Task-to-tool mapping** — How high-level tasks translate into sequences of atomic tools from the registry
3. **Domain KPIs** — Success metrics that go beyond "job succeeded" (e.g., "report generated in < 30s", "deploy with 0 downtime")
4. **Specific policies** — OPA rules adapted to the risks and requirements of the domain
5. **Documented examples** — Canonical Goals that users can copy and adapt

### Vertical Structure

Each vertical lives in a directory structure within the CaS configuration repository:

```
verticals/
├── devops/
│   ├── vertical.yaml          # Vertical metadata
│   ├── vocabulary.yaml        # Business tasks → tools
│   ├── kpis.yaml              # KPI definitions
│   ├── policies/
│   │   ├── deploy.rego        # Deploy policies
│   │   └── access.rego        # Access policies
│   └── examples/
│       ├── deploy-service.md
│       └── migrate-database.md
├── marketing/
│   └── ...
└── finance/
    └── ...
```

### vertical.yaml File

```yaml
name: devops
display_name: DevOps
description: Infrastructure operations, deploy, and CI/CD
version: 1.0.0
author: sre-team@company.com

defaults:
  autonomy_mode: semi-autonomous
  runner: shell-runner
  environment: staging

requirements:
  - tool: run_shell (>= 1.0.0)
  - tool: kubectl_apply (>= 2.0.0)
  - tool: terraform_plan (>= 1.5.0)
  - tool: terraform_apply (>= 1.5.0)
  - tool: helm_deploy (>= 2.0.0)
  - tool: db_migrate (>= 3.0.0)
  - tool: docker_build (>= 1.0.0)
  - tool: api_call (>= 1.0.0)

policies:
  - deploy.rego
  - access.rego

kpis:
  - deployment_frequency
  - mttr
  - rollback_success_rate
```

---

## How to Create a Vertical

Creating a new vertical follows a 5-step process:

### Step 1: Define the Vocabulary

Identify the **business tasks** that users in that domain want to express in natural language. Each task is documented with:

- **Name**: Verb + object (e.g., "generate weekly report", "migrate database")
- **Description**: What the task does in business language
- **Goal examples**: Phrases a user would write
- **Domain parameters**: Domain-specific variables (e.g., "max budget" for marketing)

```yaml
# vocabulary.yaml (Finance example)
tasks:
  - name: generate_financial_report
    description: Generates a financial report with revenue, expense, and projections data
    examples:
      - "Generate the May financial report"
      - "Prepare the Q2 report for the management team"
      - "Run the monthly close and generate associated reports"
    parameters:
      - name: period
        type: string
        description: Report period (e.g., "may-2026", "Q2-2026")
        required: true
      - name: report_type
        type: string
        enum: [full, executive, detailed]
        default: full
  
  - name: reconcile_accounts
    description: Recognizes and reconciles accounting entries between systems
    examples:
      - "Reconcile April accounts between SAP and QuickBooks"
      - "Run the monthly revenue reconciliation"
    parameters:
      - name: month
        type: string
        required: true
      - name: sources
        type: string[]
        default: [sap, quickbooks]
```

### Step 2: Map Tasks to Tools

Each business task translates to a **sequence of tools** from the Tools Registry. The mapping can be:

- **1:1** — One task = one tool (simple, direct)
- **1:N** — One task = multiple tools in sequence (composite)
- **M:N** — One task can be solved with different tool combinations (flexible)

```yaml
# vocabulary.yaml (continuation)
mappings:
  - task: generate_financial_report
    strategies:
      # Main strategy: via SQL + Python + render
      - priority: 1
        steps:
          - tool: run_sql_query
            parameters:
              query: "SELECT * FROM revenue WHERE month = '{period}'"
              database: reporting
          - tool: run_python
            parameters:
              script: "generate_charts.py --period {period}"
          - tool: render_report
            parameters:
              template: "financial_report"
              format: pdf
              output: "/output/report-{period}.pdf"
          - tool: send_email
            parameters:
              to: "finance-team@company.com"
              subject: "Financial report {period}"
              attachment: "/output/report-{period}.pdf"
      
      # Alternative strategy: use existing BI tool API
      - priority: 2
        steps:
          - tool: api_call
            parameters:
              url: "https://bi.internal.company.com/api/reports"
              method: POST
              body: |
                {
                  "template": "monthly_financial",
                  "period": "{period}",
                  "format": "pdf"
                }
```

### Step 3: Define Domain KPIs

Domain KPIs replace generic "job succeeded" metrics with meaningful business metrics:

```yaml
# kpis.yaml (Finance)
kpis:
  - name: report_accuracy
    description: Accuracy of report data vs. source of truth
    measurement: compare_rows(report.generated, truth_source)
    target: "> 99.9%"
    alert: "< 99.5%"
  
  - name: report_generation_time
    description: Time from report request to delivery
    measurement: goal.completed_at - goal.created_at
    target: "< 30s"
    alert: "> 60s"
  
  - name: reconciliation_time
    description: Time to reconcile one month of data
    measurement: average duration of reconciliation goals
    target: "< 5 min"
    alert: "> 15 min"
  
  - name: forecast_error_rate
    description: Difference between forecast and actual data
    measurement: MAPE(forecast, actual)
    target: "< 5%"
    alert: "> 10%"
```

### Step 4: Configure Domain-Specific Policies

```rego
# policies/finance/operations.rego
package cas.domains.finance

import future.keywords.if

# Analysts can only read aggregated data
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
    input.tool.name != "run_sql_query"  # No direct SQL for analysts
}

# Analysts can use predefined reports
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.name == "render_report"
}

# Accountants can run detailed SQL queries
allow if {
    input.role == "accountant"
    input.domain == "finance"
    input.tool.type in ["read", "execute"]
}

# Any write in finance requires approval + justification
require_approval if {
    input.domain == "finance"
    input.tool.type in ["write", "execute"]
}

# Financial data export only to approved destinations
deny if {
    input.domain == "finance"
    input.tool.name == "send_email"
    not data.finance_approved_destinations[input.parameters.to]
}

# Production finance data cannot leave the country
deny if {
    input.domain == "finance"
    input.environment == "prod"
    input.tool.name == "run_sql_query"
    contains(input.parameters.query, "SELECT")
    data.finance_pii_tables[input.parameters.table]
}
```

### Step 5: Document Examples

Each vertical includes example Goals that users can copy directly:

```markdown
# Example: Blue-green production deploy

## Goal
```
Deploy version 2.5 of the payments service to production using the
blue-green pattern. Verify health checks before cutting traffic.
```

## Expected behavior
1. Build Docker image with tag v2.5
2. Deploy to green environment on Kubernetes
3. Health check on green (timeout: 60s)
4. If health check passes → cut traffic to green
5. If health check fails → automatic rollback to blue
6. Notify the team on Slack

## Applicable policies
- Deploy to prod requires approval (semi-autonomous mode)
- Rollback is automatic (no approval required)
- Health check mandatory before traffic cut

## Estimated time: 3-5 minutes
```

---

## Vertical: DevOps

The DevOps vertical is the most common and comes pre-configured in CaS. It covers infrastructure operations, deploy, CI/CD, and systems administration.

### Vocabulary

| Business Task | Description | Tools |
|---|---|---|
| `deploy_service` | Deploy a new version of a service | `docker_build`, `helm_deploy`, `kubectl_apply`, `smoke_test` |
| `rollback_deploy` | Revert a deploy to a previous version | `helm_rollback`, `kubectl_rollout_undo` |
| `migrate_database` | Execute database migrations | `db_migrate`, `run_shell` (backup), `verify_data` |
| `scale_service` | Horizontally scale a service | `kubectl_scale` |
| `audit_logs` | Review service logs for a period | `run_shell` (grep, journalctl), `aggregate_logs` |
| `backup` | Execute database or volume backup | `run_shell` (pg_dump, tar), `upload_to_s3` |
| `provision_infra` | Provision infrastructure with Terraform | `terraform_plan`, `terraform_apply` |
| `restart_service` | Restart a service | `kubectl_rollout_restart`, `systemctl_restart` |

### KPIs

| KPI | Description | Target | Alert |
|---|---|---|---|
| `deployment_frequency` | Production deploy frequency per week | > 10/week | < 3/week |
| `deployment_success_rate` | % of successful deploys without rollback | > 99% | < 95% |
| `mttr` | Mean Time To Recover (minutes) | < 30 min | > 120 min |
| `rollback_success_rate` | % of rollbacks that restore service | > 99% | < 90% |
| `pipeline_duration` | Average CI/CD pipeline duration | < 10 min | > 30 min |

### Policies

```rego
package cas.domains.devops

# Write in production requires approval
require_approval if {
    input.domain == "devops"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}

# Rollbacks are automatic (no approval required)
allow if {
    input.domain == "devops"
    input.tool.name == "helm_rollback"
}

# Terraform plan is read-only (always allowed)
allow if {
    input.domain == "devops"
    input.tool.name == "terraform_plan"
}
```

### Example Goals

```markdown
# Scale payments service

Goal: "Scale the payments service to 5 replicas in production"

Generated plan:
1. kubectl_scale(deployment: "payments", replicas: 5, env: "prod")
   → REQUIRE_APPROVAL (write in prod)
2. smoke_test(url: "https://payments.internal/health")
   → ALLOW (read-only)

If step 1 is approved → automatic execution of step 2
```

---

## Vertical: Marketing

The Marketing vertical allows marketing teams to execute campaigns, segment audiences, and generate reports without needing technical tools.

### Vocabulary

| Business Task | Description | Tools |
|---|---|---|
| `launch_campaign` | Launch a campaign on multiple channels | `api_call` (CRM), `send_email`, `api_call` (ads) |
| `segment_audience` | Segment audience based on criteria | `run_sql_query`, `run_python` (clustering) |
| `ab_test` | Set up and monitor an A/B test | `api_call` (experimentation), `render_report` |
| `analytics_report` | Generate campaign metrics report | `run_sql_query`, `render_report`, `send_email` |
| `import_leads` | Import leads from CSV to CRM | `run_python`, `api_call` (CRM batch) |
| `social_media_post` | Schedule social media post | `api_call` (social media API) |

### KPIs

| KPI | Description | Target | Alert |
|---|---|---|---|
| `campaign_roi` | Campaign return on investment | > 3x | < 1.5x |
| `conversion_rate` | Campaign conversion rate | > 5% | < 2% |
| `audience_reach` | Number of people reached by campaign | > 100K | < 50K |
| `campaign_launch_time` | Time from idea to active campaign | < 2h | > 8h |
| `lead_quality_score` | Average quality of generated leads | > 80% | < 60% |

### Policies

```rego
package cas.domains.marketing

# Budget limits per campaign
deny if {
    input.domain == "marketing"
    input.tool.name == "api_call"
    input.parameters.api == "ads"
    input.parameters.budget > data.department_budget_remaining
}

# No PII in campaigns without compliance approval
require_approval if {
    input.domain == "marketing"
    input.tool.name == "run_sql_query"
    contains(input.parameters.query, "email") or
    contains(input.parameters.query, "phone")
}

# Email sending speed limit
deny if {
    input.domain == "marketing"
    input.tool.name == "send_email"
    input.parameters.recipients_count > 10000
}
```

### Example Goals

```markdown
# Segmented email campaign

Goal: "Create an email campaign for customers who haven't purchased in 90 days,
with a maximum budget of $5000, and generate a results report"

Generated plan:
1. run_sql_query("SELECT email, name, last_purchase FROM customers 
                  WHERE last_purchase < NOW() - INTERVAL '90 days'")
   → REQUIRE_APPROVAL (PII in query)
2. run_python("segment_audience.py --input /tmp/leads.csv --segments 3")
   → ALLOW (low risk)
3. api_call(api: "email_marketing", action: "create_campaign", budget: 5000)
   → ALLOW (budget within limit)
4. send_email(template: "reengagement", segments: [...], recipients: 8500)
   → REQUIRE_APPROVAL (> 10000 recipients requires approval)
```

---

## Vertical: Finance

The Finance vertical is the most sensitive and has the highest number of controls. Designed for finance, accounting, and audit teams.

### Vocabulary

| Business Task | Description | Tools |
|---|---|---|
| `generate_report` | Generate financial report (revenue, expenses, P&L) | `run_sql_query`, `run_python`, `render_report` |
| `reconcile_accounts` | Reconcile accounts between systems | `run_sql_query` (dual), `run_python` (matching) |
| `forecast_revenue` | Generate revenue forecast | `run_python` (time series), `ml_inference` |
| `audit_trail` | Extract audit trail for a period | `run_sql_query`, `export_to_excel` |
| `close_period` | Execute monthly/quarterly accounting close | `run_sql_query`, `run_python`, `send_email` (approval) |
| `compliance_check` | Execute compliance checks | `run_python` (rules engine), `render_report` |
| `budget_vs_actual` | Compare budget vs. actual spend | `run_sql_query`, `render_report` |

### KPIs

| KPI | Description | Target | Alert |
|---|---|---|---|
| `report_accuracy` | Data accuracy vs. source of truth | > 99.9% | < 99.5% |
| `reconciliation_time` | Time to reconcile a period | < 5 min | > 15 min |
| `forecast_error_rate` | MAPE of forecast vs. actual | < 5% | > 10% |
| `close_time` | Time to close an accounting period | < 3 days | > 7 days |
| `audit_completeness` | % of transactions with full trail | 100% | < 100% |

### Policies

```rego
package cas.domains.finance

import future.keywords.if

# ==========================================
# Role-based Rules
# ==========================================

# Analysts read-only, no direct SQL
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
    input.tool.name != "run_sql_query"
}

# Accountants can SQL + write in dev/staging
allow if {
    input.role == "accountant"
    input.domain == "finance"
    input.environment in ["dev", "staging"]
    input.tool.type in ["read", "write"]
}

# Controllers can do everything in finance (with approval for write in prod)
allow if {
    input.role == "controller"
    input.domain == "finance"
}

require_approval if {
    input.role == "controller"
    input.domain == "finance"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}

# ==========================================
# Operation Type Rules
# ==========================================

# Every write operation requires approval + justification
require_approval if {
    input.domain == "finance"
    input.tool.type == "write"
}

# Data export only to approved recipients
deny if {
    input.domain == "finance"
    input.tool.name == "send_email"
    not data.finance_email_whitelist[input.parameters.to]
}

# ==========================================
# Audit Rules
# ==========================================

# Every finance operation must have full audit trail
audit.mandatory_fields if {
    input.domain == "finance"
}
```

### Example Goals

```markdown
# Monthly Close

Goal: "Execute the May 2026 accounting close: reconcile accounts,
generate P&L report, and send approval to the controller"

Generated plan:
1. run_sql_query("SELECT * FROM ledger WHERE month = '2026-05'")
   → ALLOW (accountant, read)
2. run_python("reconcile.py --month 2026-05 --sources sap,quickbooks")
   → ALLOW (accountant, execute in dev)
3. run_sql_query("INSERT INTO closed_periods VALUES ('2026-05')")
   → REQUIRE_APPROVAL (write in finance)
4. render_report(template: "pnl_monthly", period: "2026-05")
   → ALLOW (accountant, template read-only)
5. send_email(to: "controller@company.com", 
              subject: "May 2026 close approval",
              attachment: "/output/pnl-2026-05.pdf")
   → ALLOW (controller is in finance whitelist)
```

---

## Extensibility

### How to Contribute a New Vertical

1. **Fork** the CaS configuration repository
2. **Create directory** in `verticals/{name}/` with the described structure
3. **Define vocabulary.yaml** with business tasks and tool mappings
4. **Define kpis.yaml** with domain metrics
5. **Write policies.rego** with domain-specific rules
6. **Document examples** in `examples/`
7. **Submit PR** for review by the architecture team

### Best Practices for Verticals

| Principle | Description |
|---|---|
| **Business vocabulary, not technical** | "reconcile accounts", not "execute SQL JOIN between tables" |
| **Result-oriented KPIs** | "report generated in < 30s", not "job duration < 30s" |
| **Default restrictive policies** | Start restrictive, relax as needed |
| **Canonical examples** | 3-5 example Goals covering main use cases |
| **Existing tools first** | Reuse registry tools before creating new ones |
| **Semantic versioning** | The vertical has its own independent versioning |

---

## Next

This document concludes the walkthrough of the CaS architecture. To return to the beginning and get a global view of the system, refer to the **[Overview](01-overview.md)** .

---

*Last updated: 2026-05-31*
