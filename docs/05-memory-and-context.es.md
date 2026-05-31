# CaS — Memoria y Contexto Persistente

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## Visión General

CaS incorpora un sistema de **memoria persistente** que permite a los agentes aprender de experiencias pasadas y aplicar ese conocimiento en Goals futuros. Sin memoria, cada Goal empezaría desde cero — el agente no sabría qué decisiones se tomaron, qué convenciones sigue el equipo, ni dónde quedaron los artefactos de trabajos anteriores.

La memoria en CaS está inspirada en tres fuentes principales:

1. **Claude Memory (MEMORY.md + detail files)**: Sistema de archivos indexado donde el agente escribe y lee contexto persistente. CaS escala este concepto a entornos multi-usuario y multi-proyecto.
2. **Long-running agents (arxiv 2309.06551)**: Trabajo académico sobre agentes que mantienen estado y memoria a través de sesiones extendidas. CaS implementa memoria transaccional con resúmenes periódicos.
3. **RAG patterns**: Retrieval-Augmented Generation para inyectar contexto relevante en los prompts del Planner sin exceder ventanas de contexto.

### Principios de Diseño

1. **Memoria escrita automáticamente**: Al completar un Goal, el Orchestrator genera y persiste MemoryItems sin intervención manual.
2. **Memoria leída contextualmente**: Al planificar un Goal, el Planner recupera automáticamente los MemoryItems más relevantes.
3. **Búsqueda semántica**: La recuperación usa embeddings + vector store (pgvector) para encontrar items relevantes aunque no compartan palabras clave exactas.
4. **Dos niveles**: Org Store (memoria organizacional) y Project Store (memoria por proyecto). La primera es visible para toda la organización, la segunda está scoped al proyecto.

```
┌─────────────────────────────────────────────────────────────┐
│               SISTEMA DE MEMORIA CaS                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Escritura                           │   │
│  │                                                      │   │
│  │  Goal COMPLETED ──▶ LLM resume ──▶ MemoryItem        │   │
│  │  (Orchestrator)      (qué, por qué,                  │   │
│  │                       dónde, tags)                   │   │
│  │                                        │              │   │
│  │                    ┌────────────────────┼──────┐      │   │
│  │                    ▼                    ▼      │      │   │
│  │              Org Store             Project      │      │   │
│  │              (cross-proyecto)      Store        │      │   │
│  │              + embedding           + embedding  │      │   │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Lectura                             │   │
│  │                                                      │   │
│  │  Nuevo Goal ──▶ Planner ──▶ Query semántica          │   │
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
│  │              Consolidación Periódica                  │   │
│  │                                                      │   │
│  │  Cada N Goals ──▶ Consolidation Job ──▶ Resumen      │   │
│  │  (configurable)      (LLM)             de alto nivel │   │
│  │                                         + CHANGELOG  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Org Store

El **Org Store** almacena memoria organizacional: información que es relevante para toda la organización independientemente del proyecto.

### Estructura de Tabla

```sql
CREATE TABLE org_memory_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    domain      TEXT NOT NULL,          -- devops, finance, marketing, general
    summary     TEXT NOT NULL,          -- Resumen de < 200 caracteres
    content     TEXT,                   -- Detalle completo (opcional)
    tags        TEXT[] DEFAULT '{}',     -- Array de tags
    source      TEXT NOT NULL CHECK (source IN ('goal', 'plan', 'job', 'manual')),
    metadata    JSONB DEFAULT '{}',      -- Metadatos extensibles
    embedding   VECTOR(1536),            -- Embedding para búsqueda semántica
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    
    -- Índices
    PRIMARY KEY (id)
);

-- Índices para búsqueda
CREATE INDEX idx_org_memory_org_id ON org_memory_items(org_id);
CREATE INDEX idx_org_memory_domain ON org_memory_items(domain);
CREATE INDEX idx_org_memory_tags ON org_memory_items USING GIN(tags);
CREATE INDEX idx_org_memory_created_at ON org_memory_items(created_at DESC);
CREATE INDEX idx_org_memory_embedding ON org_memory_items USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### Campos Detallados

| Campo | Descripción | Ejemplo |
|---|---|---|
| `org_id` | Organización propietaria | `org_abc123` |
| `domain` | Dominio de negocio | `devops` |
| `summary` | Resumen del item | "Migración de staging a prod completada sin downtime usando blue-green" |
| `content` | Contenido detallado (markdown) | "Se usó blue-green deployment con 5 min de cooldown entre switches..." |
| `tags` | Tags para filtrado | `["database", "migration", "blue-green", "postgresql"]` |
| `source` | Origen del item | `goal` (generado automáticamente al completar un Goal) |
| `metadata` | Metadatos extensibles | `{"goalId": "goal_abc123", "duration": 45000, "tools": ["run_shell", "db_migrate"]}` |
| `embedding` | Vector de embeddings (1536d) | `[0.012, -0.034, ..., 0.098]` |
| `created_at` | Timestamp de creación | `2026-05-31T14:30:00Z` |

---

## Project Store

El **Project Store** almacena memoria específica de un proyecto: decisiones arquitectónicas, convenciones de equipo, artefactos generados y enlaces a recursos.

### Estructura de Tabla

```sql
CREATE TYPE memory_item_type AS ENUM ('decision', 'convention', 'artifact');

CREATE TABLE project_memory_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL,
    project_id  UUID NOT NULL,
    summary     TEXT NOT NULL,
    type        memory_item_type NOT NULL,
    link        TEXT,                   -- URL a repo, pipeline, dashboard
    content     TEXT,                   -- Detalle completo en markdown
    tags        TEXT[] DEFAULT '{}',
    embedding   VECTOR(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_project_memory_project ON project_memory_items(org_id, project_id);
CREATE INDEX idx_project_memory_type ON project_memory_items(type);
CREATE INDEX idx_project_memory_tags ON project_memory_items USING GIN(tags);
CREATE INDEX idx_project_memory_embedding ON project_memory_items USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### Tipos de MemoryItem en Project Store

| Tipo | Descripción | Ejemplo |
|---|---|---|
| **decision** | Decisión arquitectónica o técnica documentada | "Decidimos usar PostgreSQL en lugar de MongoDB porque el equipo ya tiene experiencia con SQL" |
| **convention** | Convención de nomenclatura, proceso o estilo | "Todas las migraciones DB deben incluir rollback script" |
| **artifact** | Artefacto generado (reporte, dashboard, pipeline) | "Reporte mensual de ingresos: /reports/revenue-2026-05.pdf" |

### Ejemplos de Contenido

**Decision:**
```markdown
## Decisión: Usar Blue-Green para deploys críticos

**Contexto:** El deploy a producción del módulo de pagos requiere zero-downtime.

**Opción elegida:** Blue-green deployment con 5 minutos de cooldown.

**Razonamiento:**
- El equipo de SRE ya tiene experiencia con el patrón
- Permite rollback instantáneo (solo cambiar el tráfico al green)
- El cooldown permite detectar problemas antes de cortar tráfico

**Alternativas consideradas:**
- Rolling update: riesgo de estado inconsistente durante la transición
- Canary: demasiado complejo para el equipo actual

**Tags:** `deployment`, `blue-green`, `zero-downtime`, `payments`
```

**Convention:**
```markdown
## Convención: Nomenclatura de branches

Para todos los repositorios de infraestructura usar:

- `feature/CAS-{numero}-{descripcion}` — Nuevas funcionalidades
- `fix/CAS-{numero}-{descripcion}` — Bug fixes
- `chore/CAS-{numero}-{descripcion}` — Mantenimiento

Ejemplo: `feature/CAS-142-migration-script`

**Tags:** `git`, `branching`, `naming-convention`
```

**Artifact:**
```markdown
## Reporte Financiero — Mayo 2026

Generado por Goal `goal_abc123` el 2026-05-31.

**Archivos:**
- Reporte PDF: `/artifacts/goal_abc123/reporte-mayo-2026.pdf`
- Datos CSV: `/artifacts/goal_abc123/datos-mayo-2026.csv`
- Dashboard: https://grafana.internal/d/revenue-may-2026

**Métricas clave:**
- Ingresos totales: $2,450,000
- Crecimiento vs mes anterior: +12.3%
- Gasto operativo: $1,200,000

**Tags:** `finance`, `report`, `monthly`, `revenue`
```

---

## Búsqueda Semántica

CaS usa **embeddings + pgvector** para recuperar MemoryItems relevantes al contexto de un nuevo Goal.

### Pipeline de Búsqueda

```
Nuevo Goal: "Genera el reporte financiero de Q2 para el equipo directivo"

1. Generar embedding del Goal
   ─ Usar OpenAI text-embedding-3-small o local via Ollama (nomic-embed-text)
   ─ Output: vector de 1536 dimensiones

2. Búsqueda semántica en Org Store
   ─ SELECT * FROM org_memory_items
     WHERE org_id = :orgId
     ORDER BY embedding <=> :goalEmbedding
     LIMIT 3

3. Búsqueda semántica en Project Store
   ─ SELECT * FROM project_memory_items
     WHERE org_id = :orgId AND project_id = :projectId
     ORDER BY embedding <=> :goalEmbedding
     LIMIT 3

4. Búsqueda por tags (si el Goal especifica dominio)
   ─ SELECT * FROM org_memory_items
     WHERE org_id = :orgId AND domain = :domain
     ORDER BY created_at DESC
     LIMIT 2

5. Fusionar resultados (máximo 5 items)
   ─ Deduplicar por contenido similar (cosine > 0.95)
   ─ Ordenar por relevancia (score de cosine similarity)
   ─ Limitar a top-5

6. Inyectar en system prompt del Planner
```

### Query SQL con pgvector

```sql
-- Búsqueda semántica combinada (Org + Project)
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
    WHERE relevance > 0.70  -- Umbral de relevancia mínimo
)
SELECT * FROM deduped
ORDER BY relevance DESC
LIMIT 5;
```

### Generación de Embeddings

CaS soporta dos backends de embeddings:

| Backend | Modelo | Dimensiones | Latencia | Costo |
|---|---|---|---|---|
| **OpenAI** | `text-embedding-3-small` | 1536 | ~200ms | Bajo ($0.02/1M tokens) |
| **OpenAI** | `text-embedding-3-large` | 3072 | ~300ms | Medio |
| **Ollama** | `nomic-embed-text` | 768 | ~100ms | Gratis (local) |
| **Ollama** | `mxbai-embed-large` | 1024 | ~150ms | Gratis (local) |

Default: `text-embedding-3-small` (mejor balance costo/calidad). El backend es configurable por organización.

### Filtros de Búsqueda

La búsqueda semántica se puede acotar con filtros adicionales:

```sql
-- Ejemplo: buscar solo en dominio finance, con tags específicos
SELECT * FROM org_memory_items
WHERE org_id = :orgId
    AND domain = 'finance'
    AND tags && ARRAY['report', 'monthly']  -- overlap de tags
    AND created_at > NOW() - INTERVAL '90 days'
ORDER BY embedding <=> :goalEmbedding
LIMIT 5;
```

---

## Patrones de Uso

### Escritura: Al Finalizar un Goal

Cuando un Goal alcanza el estado `COMPLETED`, el Orchestrator ejecuta el siguiente proceso:

```
1. Orchestrator detecta Goal COMPLETED
   ├── Recopila: logs completos, resultados de steps, artefactos
   └── Envía a Consolidation Service

2. Consolidation Service (LLM)
   ├── Lee: goal original, plan ejecutado, resultados, logs de alto nivel
   ├── Genera resumen estructurado:
   │   ├── Qué se hizo (summary)
   │   ├── Por qué (contexto)
   │   ├── Dónde quedaron los artefactos (links)
   │   └── Tags relevantes
   └── Retorna MemoryItem

3. Orchestrator persiste
   ├── OrgMemoryItem (si es relevante cross-proyecto)
   │   ├── domain = goal.domain
   │   ├── summary = LLM summary
   │   └── embedding = generate_embedding(summary)
   │
   ├── ProjectMemoryItem (si el Goal tiene projectId)
   │   ├── type = 'artifact' (o 'decision' si aplica)
   │   ├── summary = LLM summary
   │   └── embedding = generate_embedding(summary)
   │
   └── Si type == 'decision' → actualizar CHANGELOG.md
```

### Lectura: Al Iniciar un Nuevo Goal

Cuando el usuario crea un nuevo Goal, el Planner ejecuta:

```
1. Planner recibe nuevo Goal
   ├── Extrae dominio y palabras clave
   └── Calcula embedding del Goal

2. Búsqueda semántica
   ├── Org Store: top-3 items relevantes
   ├── Project Store: top-3 items relevantes
   └── Filtro por dominio si aplica

3. Inyección en prompt
   ├── System prompt incluye:
   │
   │   "Contexto de memoria organizacional relevante para este Goal:"
   │   "1. [summary del item 1] (relevancia: 0.92, dominio: finance)"
   │   "2. [summary del item 2] (relevancia: 0.87, dominio: finance)"
   │   "   Detalle: [content truncado a 500 chars]"
   │   "3. [summary del item 3] (relevancia: 0.81, dominio: general)"
   │
   └── Esto permite al LLM planificar considerando experiencias pasadas

4. Si hay decisiones del proyecto aplicables
   ├── "Convenciones activas de este proyecto:"
   ├── "- [convention summary]"
   └── El planner puede adaptar el plan para cumplir las convenciones
```

### Changelog Automático

Cada `MemoryItem` de tipo `decision` en el Project Store alimenta automáticamente un archivo `CHANGELOG.md` en el repositorio del proyecto:

```markdown
# Changelog del Proyecto

Generado automáticamente por CaS Memory System

## 2026-05-31

### Decisiones

- **CAS-142: Migración blue-green para payments**
  Se adoptó blue-green deployment para el módulo de pagos.
  Tags: `deployment`, `blue-green`, `zero-downtime`

### Artefactos

- **Reporte financiero Q2 2026**
  PDF generado con datos de ingresos, gastos y proyecciones.
  Archivo: `/artifacts/goal_abc123/reporte-q2-2026.pdf`

---

## 2026-05-29

### Decisiones

- **CAS-138: PostgreSQL como DB principal**
  Se decidió usar PostgreSQL para todos los nuevos servicios.
  Tags: `database`, `postgresql`, `architecture`
```

El changelog es visible tanto para humanos (en el repo) como para agentes (en el Project Store).

---

## Resúmenes Automáticos con LLM

Cuando un proyecto acumula múltiples MemoryItems, un **job de consolidación** periódico genera resúmenes de alto nivel.

### Configuración

```yaml
# consolidation-job.yaml
consolidation:
  schedule: "0 2 * * 1"         # Cada lunes a las 2 AM
  trigger_after_n_items: 10     # O cada 10 items nuevos
  llm_provider: openai
  model: gpt-4o-mini
  max_items_per_run: 50
  
  output:
    - executive_summary.md      # Resumen ejecutivo para stakeholders
    - technical_summary.md      # Resumen técnico para el equipo
    - trends.md                 # Tendencias detectadas
```

### Tipos de Resúmenes

| Tipo | Audiencia | Contenido | Longitud |
|---|---|---|---|
| **Executive Summary** | Stakeholders no técnicos | Logros del período, KPIs, impacto de negocio | 1-2 párrafos |
| **Technical Summary** | Equipo de desarrollo | Decisiones técnicas, cambios de infraestructura, deuda técnica | 3-5 párrafos |
| **Trends** | Arquitectos | Patrones recurrentes, oportunidades de mejora, riesgos | Lista de tendencias |

### Ejemplo de Executive Summary

```markdown
## Resumen Ejecutivo — Mayo 2026

### Logros
- **Migración de base de datos** completada sin downtime. El nuevo cluster PostgreSQL
  maneja 2x el throughput del anterior.
- **Reporte financiero mensual** ahora se genera automáticamente cada 1ro de mes,
  ahorrando ~4 horas de trabajo manual del equipo de finanzas.
- **Pipeline de deploy** reducido de 15min a 4min gracias a la optimización de
  imágenes Docker.

### KPIs del Período
- Goals completados: 47
- Tasa de éxito: 91.5%
- Tiempo promedio por Goal: 3.2 min
- Tools utilizadas: 12 distintas

### Próximos Pasos
- Evaluar migración de Jenkins a GitHub Actions (3 decisiones recientes apuntan
  a esta dirección)
- Revisar políticas de aprobación para deploy en prod (2 goals fallaron por
  timeout de aprobación)
```

---

## Consideraciones de Implementación

### Estrategia de Embeddings

1. **Generación async**: Los embeddings se generan de forma asíncrona después de escribir el MemoryItem. El write es inmediato; el embedding llega segundos después.
2. **Batch processing**: Si hay múltiples items para embedder, se procesan en batch para eficiencia.
3. **Re-embedding**: Cuando se actualiza un modelo de embeddings, los items existentes se re-embeddean con un job de mantenimiento.

### Tamaño y Retención

| Store | Tamaño estimado por item | Retención default | Política de archivo |
|---|---|---|---|
| Org Store | ~2 KB + embedding (6 KB) | 1 año | Archive a cold storage (S3) |
| Project Store | ~5 KB + embedding (6 KB) | Indefinido | Export a JSON al archivar proyecto |
| Embeddings | 6 KB por vector (1536 floats) | Misma que el item | Se eliminan con el item |

### Performance de Búsqueda

| Cardinalidad | Tiempo de búsqueda (ivfflat, lists=100) | Precisión |
|---|---|---|
| 1,000 items | < 5ms | ~0.98 |
| 10,000 items | ~15ms | ~0.95 |
| 100,000 items | ~80ms | ~0.90 |
| 1,000,000 items | ~400ms | ~0.85 |

Para organizaciones con >100K items, se recomienda usar **pgvector con HNSW index** (mayor precisión, mayor consumo de memoria):

```sql
CREATE INDEX idx_memory_hnsw ON org_memory_items 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 200);
```

---

## Siguiente

Continúa con **[Seguridad y Compliance](06-security-and-compliance.md)** , donde se detallan los modos de autonomía, las políticas OPA, el sistema de auditoría y el aislamiento de red.

---

*Última actualización: 2026-05-31*
