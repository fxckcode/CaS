# CaS — Memory and Persistent Context

**CLI as a Service Reference Architecture**

- **License:** MIT
- **Repository:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Last updated:** 2026-05-31

---

## Overview

CaS incorporates a **persistent memory system** that allows agents to learn from past experiences and apply that knowledge in future Goals. Without memory, each Goal would start from scratch — the agent would not know what decisions were made, what conventions the team follows, or where artifacts from previous work are located.

Memory in CaS is inspired by three main sources:

1. **Claude Memory (MEMORY.md + detail files)**: Indexed file system where the agent writes and reads persistent context. CaS scales this concept to multi-user and multi-project environments.
2. **Long-running agents (arxiv 2309.06551)**: Academic work on agents that maintain state and memory across extended sessions. CaS implements transactional memory with periodic summaries.
3. **RAG patterns**: Retrieval-Augmented Generation to inject relevant context into Planner prompts without exceeding context windows.

### Design Principles

1. **Memory written automatically**: When a Goal completes, the Orchestrator generates and persists MemoryItems without manual intervention.
2. **Memory read contextually**: When planning a Goal, the Planner automatically retrieves the most relevant MemoryItems.
3. **Semantic search**: Retrieval uses embeddings + vector store (pgvector) to find relevant items even if they do not share exact keywords.
4. **Two levels**: Org Store (organizational memory) and Project Store (project-specific memory). The former is visible to the entire organization, the latter is scoped to the project.

```
┌─────────────────────────────────────────────────────────────┐
│                    CaS MEMORY SYSTEM                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Writing                            │   │
│  │                                                      │   │
│  │  Goal COMPLETED ──▶ LLM summarizes ──▶ MemoryItem    │   │
│  │  (Orchestrator)      (what, why,                    │   │
│  │                       where, tags)                   │   │
│  │                                        │              │   │
│  │                    ┌────────────────────┼──────┐      │   │
│  │                    ▼                    ▼      │      │   │
│  │              Org Store             Project      │      │   │
│  │              (cross-project)       Store        │      │   │
│  │              + embedding           + embedding  │      │   │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Reading                             │   │
│  │                                                      │   │
│  │  New Goal ──▶ Planner ──▶ Semantic query             │   │
│  │                     │              │                 │   │
│  │                     │    ┌─────────▼────────┐        │   │
│  │                     │    │ pgvector search   │        │   │
│  │                     │    │ top-5 items       │        │   │
│  │                     │    │ (org + project)   │        │   │
│  │                     │    └─────────┬────────┘        │   │
│  │                     │              │                 │   │
│  │                     │    ┌─────────▼────────┐        │   │
│  │                     │    │ Inject in system  │        │   │
│  │                     └───▶│ prompt as context │        │   │
│  │                          └──────────────────┘        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Periodic Consolidation                   │   │
│  │                                                      │   │
│  │  Every N Goals ──▶ Consolidation Job ──▶ Summary     │   │
│  │  (configurable)      (LLM)             of high level │   │
│  │                                         + CHANGELOG  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Org Store

The **Org Store** stores organizational memory: information that is relevant to the entire organization regardless of project.

### Table Structure

```sql
CREATE TABLE org_memory_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    domain      TEXT NOT NULL,          -- devops, finance, marketing, general
    summary     TEXT NOT NULL,          -- Summary < 200 characters
    content     TEXT,                   -- Full detail (optional)
    tags        TEXT[] DEFAULT '{}',     -- Array of tags
    source      TEXT NOT NULL CHECK (source IN ('goal', 'plan', 'job', 'manual')),
    metadata    JSONB DEFAULT '{}',      -- Extensible metadata
    embedding   VECTOR(1536),            -- Embedding for semantic search
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes
    PRIMARY KEY (id)
);

-- Search indexes
CREATE INDEX idx_org_memory_org_id ON org_memory_items(org_id);
CREATE INDEX idx_org_memory_domain ON org_memory_items(domain);
CREATE INDEX idx_org_memory_tags ON org_memory_items USING GIN(tags);
CREATE INDEX idx_org_memory_created_at ON org_memory_items(created_at DESC);
CREATE INDEX idx_org_memory_embedding ON org_memory_items USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### Detailed Fields

| Field | Description | Example |
|---|---|---|
| `org_id` | Owning organization | `org_abc123` |
| `domain` | Business domain | `devops` |
| `summary` | Item summary | "Migration from staging to prod completed with zero downtime using blue-green" |
| `content` | Detailed content (markdown) | "Blue-green deployment was used with 5 min cooldown between switches..." |
| `tags` | Filtering tags | `["database", "migration", "blue-green", "postgresql"]` |
| `source` | Item origin | `goal` (auto-generated when a Goal completes) |
| `metadata` | Extensible metadata | `{"goalId": "goal_abc123", "duration": 45000, "tools": ["run_shell", "db_migrate"]}` |
| `embedding` | Embeddings vector (1536d) | `[0.012, -0.034, ..., 0.098]` |
| `created_at` | Creation timestamp | `2026-05-31T14:30:00Z` |

---

## Project Store

The **Project Store** stores project-specific memory: architectural decisions, team conventions, generated artifacts, and resource links.

### Table Structure

```sql
CREATE TYPE memory_item_type AS ENUM ('decision', 'convention', 'artifact');

CREATE TABLE project_memory_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    project_id  UUID NOT NULL,
    summary     TEXT NOT NULL,
    type        memory_item_type NOT NULL,
    link        TEXT,                   -- URL to repo, pipeline, dashboard
    content     TEXT,                   -- Full detail in markdown
    tags        TEXT[] DEFAULT '{}',
    embedding   VECTOR(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_project_memory_project ON project_memory_items(org_id, project_id);
CREATE INDEX idx_project_memory_type ON project_memory_items(type);
CREATE INDEX idx_project_memory_tags ON project_memory_items USING GIN(tags);
CREATE INDEX idx_project_memory_embedding ON project_memory_items USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### MemoryItem Types in Project Store

| Type | Description | Example |
|---|---|---|
| **decision** | Documented architectural or technical decision | "We decided to use PostgreSQL instead of MongoDB because the team already has SQL experience" |
| **convention** | Naming, process, or style convention | "All DB migrations must include a rollback script" |
| **artifact** | Generated artifact (report, dashboard, pipeline) | "Monthly revenue report: /reports/revenue-2026-05.pdf" |

### Content Examples

**Decision:**
```markdown
## Decision: Use Blue-Green for critical deploys

**Context:** The production deploy of the payments module requires zero-downtime.

**Chosen option:** Blue-green deployment with 5 minutes cooldown.

**Rationale:**
- The SRE team already has experience with the pattern
- Allows instant rollback (just switch traffic to green)
- Cooldown allows detecting issues before cutting traffic

**Alternatives considered:**
- Rolling update: risk of inconsistent state during transition
- Canary: too complex for the current team

**Tags:** `deployment`, `blue-green`, `zero-downtime`, `payments`
```

**Convention:**
```markdown
## Convention: Branch naming

For all infrastructure repositories use:

- `feature/CAS-{number}-{description}` — New features
- `fix/CAS-{number}-{description}` — Bug fixes
- `chore/CAS-{number}-{description}` — Maintenance

Example: `feature/CAS-142-migration-script`

**Tags:** `git`, `branching`, `naming-convention`
```

**Artifact:**
```markdown
## Financial Report — May 2026

Generated by Goal `goal_abc123` on 2026-05-31.

**Files:**
- PDF Report: `/artifacts/goal_abc123/report-may-2026.pdf`
- CSV Data: `/artifacts/goal_abc123/data-may-2026.csv`
- Dashboard: https://grafana.internal/d/revenue-may-2026

**Key metrics:**
- Total revenue: $2,450,000
- Growth vs previous month: +12.3%
- Operating expense: $1,200,000

**Tags:** `finance`, `report`, `monthly`, `revenue`
```

---

## Semantic Search

CaS uses **embeddings + pgvector** to retrieve relevant MemoryItems in the context of a new Goal.

### Search Pipeline

```
New Goal: "Generate the Q2 financial report for the management team"

1. Generate Goal embedding
   ─ Use OpenAI text-embedding-3-small or local via Ollama (nomic-embed-text)
   ─ Output: 1536-dimensional vector

2. Semantic search in Org Store
   ─ SELECT * FROM org_memory_items
     WHERE org_id = :orgId
     ORDER BY embedding <=> :goalEmbedding
     LIMIT 3

3. Semantic search in Project Store
   ─ SELECT * FROM project_memory_items
     WHERE org_id = :orgId AND project_id = :projectId
     ORDER BY embedding <=> :goalEmbedding
     LIMIT 3

4. Tag-based search (if Goal specifies domain)
   ─ SELECT * FROM org_memory_items
     WHERE org_id = :orgId AND domain = :domain
     ORDER BY created_at DESC
     LIMIT 2

5. Merge results (max 5 items)
   ─ Deduplicate by similar content (cosine > 0.95)
   ─ Sort by relevance (cosine similarity score)
   ─ Limit to top-5

6. Inject into Planner system prompt
```

### SQL Query with pgvector

```sql
-- Combined semantic search (Org + Project)
WITH org_results AS (
    SELECT 
        id,
        summary,
        'org' as store,
        1 - (embedding <=> :goalEmbedding) as relevance,
        domain,
        tags
    FROM org_memory_items
    WHERE org_id = :orgId
        AND embedding IS NOT NULL
    ORDER BY embedding <=> :goalEmbedding
    LIMIT 3
),
project_results AS (
    SELECT 
        id,
        summary,
        'project' as store,
        1 - (embedding <=> :goalEmbedding) as relevance,
        domain,
        tags
    FROM project_memory_items
    WHERE org_id = :orgId
        AND project_id = :projectId
        AND embedding IS NOT NULL
    ORDER BY embedding <=> :goalEmbedding
    LIMIT 3
),
deduped AS (
    SELECT DISTINCT ON (summary) *
    FROM (
        SELECT * FROM org_results
        UNION ALL
        SELECT * FROM project_results
    ) combined
    WHERE relevance > 0.70  -- Minimum relevance threshold
)
SELECT * FROM deduped
ORDER BY relevance DESC
LIMIT 5;
```

### Embedding Generation

CaS supports two embedding backends:

| Backend | Model | Dimensions | Latency | Cost |
|---|---|---|---|---|
| **OpenAI** | `text-embedding-3-small` | 1536 | ~200ms | Low ($0.02/1M tokens) |
| **OpenAI** | `text-embedding-3-large` | 3072 | ~300ms | Medium |
| **Ollama** | `nomic-embed-text` | 768 | ~100ms | Free (local) |
| **Ollama** | `mxbai-embed-large` | 1024 | ~150ms | Free (local) |

Default: `text-embedding-3-small` (best cost/quality balance). The backend is configurable per organization.

### Search Filters

Semantic search can be narrowed down with additional filters:

```sql
-- Example: search only in finance domain, with specific tags
SELECT * FROM org_memory_items
WHERE org_id = :orgId
    AND domain = 'finance'
    AND tags && ARRAY['report', 'monthly']  -- tag overlap
    AND created_at > NOW() - INTERVAL '90 days'
ORDER BY embedding <=> :goalEmbedding
LIMIT 5;
```

---

## Usage Patterns

### Writing: When a Goal Completes

When a Goal reaches the `COMPLETED` state, the Orchestrator executes the following process:

```
1. Orchestrator detects Goal COMPLETED
   ├── Collects: full logs, step results, artifacts
   └── Sends to Consolidation Service

2. Consolidation Service (LLM)
   ├── Reads: original goal, executed plan, results, high-level logs
   ├── Generates structured summary:
   │   ├── What was done (summary)
   │   ├── Why (context)
   │   ├── Where artifacts are located (links)
   │   └── Relevant tags
   └── Returns MemoryItem

3. Orchestrator persists
   ├── OrgMemoryItem (if cross-project relevant)
   │   ├── domain = goal.domain
   │   ├── summary = LLM summary
   │   └── embedding = generate_embedding(summary)
   │
   ├── ProjectMemoryItem (if Goal has projectId)
   │   ├── type = 'artifact' (or 'decision' if applicable)
   │   ├── summary = LLM summary
   │   └── embedding = generate_embedding(summary)
   │
   └── If type == 'decision' → update CHANGELOG.md
```

### Reading: When Starting a New Goal

When the user creates a new Goal, the Planner executes:

```
1. Planner receives new Goal
   ├── Extracts domain and keywords
   └── Calculates Goal embedding

2. Semantic search
   ├── Org Store: top-3 relevant items
   ├── Project Store: top-3 relevant items
   └── Domain filter if applicable

3. Injection into prompt
   ├── System prompt includes:
   │
   │   "Organizational memory context relevant to this Goal:"
   │   "1. [item 1 summary] (relevance: 0.92, domain: finance)"
   │   "2. [item 2 summary] (relevance: 0.87, domain: finance)"
   │   "   Detail: [content truncated to 500 chars]"
   │   "3. [item 3 summary] (relevance: 0.81, domain: general)"
   │
   └── This allows the LLM to plan considering past experiences

4. If applicable project decisions exist
   ├── "Active conventions for this project:"
   ├── "- [convention summary]"
   └── The planner can adapt the plan to comply with conventions
```

### Automatic Changelog

Each `MemoryItem` of type `decision` in the Project Store automatically feeds a `CHANGELOG.md` file in the project repository:

```markdown
# Project Changelog

Automatically generated by CaS Memory System

## 2026-05-31

### Decisions

- **CAS-142: Blue-green migration for payments**
  Blue-green deployment was adopted for the payments module.
  Tags: `deployment`, `blue-green`, `zero-downtime`

### Artifacts

- **Q2 2026 Financial Report**
  PDF generated with revenue, expense, and projections data.
  File: `/artifacts/goal_abc123/report-q2-2026.pdf`

---

## 2026-05-29

### Decisions

- **CAS-138: PostgreSQL as primary DB**
  PostgreSQL was chosen for all new services.
  Tags: `database`, `postgresql`, `architecture`
```

The changelog is visible both to humans (in the repo) and to agents (in the Project Store).

---

## Automatic Summaries with LLM

When a project accumulates multiple MemoryItems, a periodic **consolidation job** generates high-level summaries.

### Configuration

```yaml
# consolidation-job.yaml
consolidation:
  schedule: "0 2 * * 1"         # Every Monday at 2 AM
  trigger_after_n_items: 10     # Or every 10 new items
  llm_provider: openai
  model: gpt-4o-mini
  max_items_per_run: 50
  
  output:
    - executive_summary.md      # Executive summary for stakeholders
    - technical_summary.md      # Technical summary for the team
    - trends.md                 # Detected trends
```

### Summary Types

| Type | Audience | Content | Length |
|---|---|---|---|
| **Executive Summary** | Non-technical stakeholders | Period achievements, KPIs, business impact | 1-2 paragraphs |
| **Technical Summary** | Development team | Technical decisions, infrastructure changes, technical debt | 3-5 paragraphs |
| **Trends** | Architects | Recurring patterns, improvement opportunities, risks | List of trends |

### Executive Summary Example

```markdown
## Executive Summary — May 2026

### Achievements
- **Database migration** completed with zero downtime. The new PostgreSQL cluster
  handles 2x the throughput of the previous one.
- **Monthly financial report** is now automatically generated on the 1st of each month,
  saving ~4 hours of manual work for the finance team.
- **Deploy pipeline** reduced from 15min to 4min thanks to Docker image optimization.

### Period KPIs
- Goals completed: 47
- Success rate: 91.5%
- Average time per Goal: 3.2 min
- Tools used: 12 different

### Next Steps
- Evaluate migration from Jenkins to GitHub Actions (3 recent decisions point
  in this direction)
- Review approval policies for prod deploys (2 goals failed due to
  approval timeout)
```

---

## Implementation Considerations

### Embedding Strategy

1. **Async generation**: Embeddings are generated asynchronously after writing the MemoryItem. The write is immediate; the embedding arrives seconds later.
2. **Batch processing**: If there are multiple items to embed, they are processed in batch for efficiency.
3. **Re-embedding**: When an embedding model is updated, existing items are re-embedded with a maintenance job.

### Size and Retention

| Store | Estimated size per item | Default retention | Archive policy |
|---|---|---|---|
| Org Store | ~2 KB + embedding (6 KB) | 1 year | Archive to cold storage (S3) |
| Project Store | ~5 KB + embedding (6 KB) | Indefinite | Export to JSON when archiving project |
| Embeddings | 6 KB per vector (1536 floats) | Same as item | Deleted with the item |

### Search Performance

| Cardinality | Search time (ivfflat, lists=100) | Precision |
|---|---|---|
| 1,000 items | < 5ms | ~0.98 |
| 10,000 items | ~15ms | ~0.95 |
| 100,000 items | ~80ms | ~0.90 |
| 1,000,000 items | ~400ms | ~0.85 |

For organizations with >100K items, using **pgvector with HNSW index** (higher precision, higher memory usage) is recommended:

```sql
CREATE INDEX idx_memory_hnsw ON org_memory_items 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 200);
```

---

## Next

Continue with **[Security and Compliance](06-security-and-compliance.md)** , which details the autonomy modes, OPA policies, audit system, and network isolation.

---

*Last updated: 2026-05-31*
