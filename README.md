# CaS — CLI as a Service Reference Architecture

[🇪🇸 Español](./README.md) | [🇬🇧 English](./README.en.md)

> **Arquitectura de referencia ejecutable** para un sistema corporativo de agentes autónomos con control de políticas, aislamiento de ejecución y memoria persistente.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Visión

Este repositorio documenta una **arquitectura de referencia** para construir un **CLI as a Service** corporativo: un sistema donde usuarios expresan objetivos de alto nivel y el sistema orquesta herramientas reales en infraestructura corporativa.

**De chatbots que responden a agentes que actúan**: inspirado en [Codex CLI](https://developers.openai.com/codex/cli/) y agentes de desarrollo modernos, CaS permite a los agentes leer, editar y ejecutar código local con distintos niveles de autonomía, mientras mantiene seguridad, auditoría y control de políticas empresariales.

---

## Estado del Proyecto

**Reference architecture — NOT production ready.**

Este proyecto actualmente es una especificación arquitectónica y guía de diseño. El código de implementación está en roadmap.

---

## Componentes de la Arquitectura

La arquitectura no es solo "ensayo", sino una **arquitectura de referencia ejecutable** de un CLI as a Service corporativo:

### Control Plane
Orquestador de agentes, planner, policy engine, registry de tools.

### Execution Plane
Runners aislados (containers/jobs) con perfiles de red y credenciales mínimas.

### Capa de Memoria
Estado de proyectos/organización y trazas de decisiones (CHANGELOG/Org Memory, inspirado en [long‑running agents](https://arxiv.org/pdf/2309.06551.pdf) y [Claude Memory](https://skywork.ai/blog/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution/)).

### Capa de Interfaces
Chat HTTP/WebSocket + adaptadores Slack/Teams/WhatsApp (mocks iniciales incluidos).

El diseño de esta capa está fundamentado en el análisis comparativo de CLIs de agentes IA modernos (Claude Code, Opencode, Codex CLI, OpenClaw). Ver [`docs/research-cli-architecture.md`](./docs/research-cli-architecture.md) para el estudio completo.

---

## Estructura del Repositorio

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

## Arquitectura de Alto Nivel

El README técnico funciona como paper de arquitectura + guía de uso rápido:

### 1. Contexto y Visión

- **De "chatbots que responden" a "agentes que actúan"**: Referencias a [Codex CLI](https://developers.openai.com/codex/quickstart/) y agentes de desarrollo con capacidades de lectura/edición/ejecución de código local con distintos niveles de autonomía.
- **CLI as a Service corporativo**: El usuario expresa objetivos, el sistema orquesta herramientas reales en infra corporativa.

### 2. Diagrama Lógico

Diagrama Mermaid (`diagrams/logical-architecture.mmd`) con:
- Interfaces (chat/API gateway)
- Orchestrator + planner + policy engine + tools registry
- Execution plane (runners)
- Memory stores

### 3. Casos de Uso Ejemplares

- **"Migra este monolito a microservicios"**
- **"Lanza esta campaña de marketing"**
- **"Automatiza este reporte financiero"**

Cada uno atado a un flujo en `examples/`.

### 4. Modelo de Seguridad (Feature Central)

- **Modos de autonomía** inspirados en [Codex CLI features](https://developers.openai.com/codex/cli/features/) (consultivo, semi‑autónomo, full‑auto con sandbox/approval)
- Aislamiento de runners, perfiles de red, vault de secretos y policy engine declarativo

### 5. Estado del Proyecto

- **Reference architecture, not production ready**
- Roadmap de features: nuevos runners, verticales, UI, etc.

---

## Diseño del Control Plane

**Stack sugerido**: TypeScript + NestJS o Go para control plane, Python/Go para runners.

### Componentes Clave

#### `api-gateway/`
Servicio HTTP/WS que recibe:
- `/goals` (POST): `{ goal: string, projectId, channelMetadata }`
- `/events` de runners (webhooks o cola)
- Autenticación (OIDC / JWT de IdP corporativo)

#### `orchestrator/`
Servicio que:
- Crea entidad `Goal` y llama a `planner`
- Mantiene un `Plan` (DAG de tareas)
- Publica jobs a una cola (`jobs` topic) para los runners

#### `planner/`
Servicio que encapsula llamadas a LLM:
- **Prompt**: contexto de organización + memoria de proyecto + catálogo de tools
- **Output normalizado**: JSON con steps, dependencia y mapping a tools

#### `policy-engine/`
Wrapper sobre OPA u otro motor de políticas:
- **Input**: usuario, rol, dominio, tool, entorno, riesgo declarado
- **Output**: `ALLOW`, `DENY`, `REQUIRE_APPROVAL`

#### `tools-registry/`
Servicio que lee descriptors YAML/JSON (`tool.yaml`) y expone:
- `GET /tools?domain=devops`
- `GET /tools/{id}/{version}`
- Aplica validaciones de seguridad y versionado

---

## Execution Plane y Runners

`src/execution-plane/runners/` contiene implementaciones de referencia:

### `shell-runner/`
- Consume jobs desde la cola
- Resuelve el `tool.yaml` correspondiente
- Lanza un contenedor efímero con:
  - Imagen definida en la tool
  - Comando `entrypoint` con los placeholders rellenados
- Envía logs/estado de vuelta al orchestrator

### `cicd-runner/`
- Envía jobs a un pipeline ya existente (GitHub Actions, GitLab, Jenkins)
- El CaS actúa como **frontend de alto nivel** para pipelines existentes

### `data-runner/`
- Entorno con librerías de datos (pandas, SQLAlchemy, etc.) para ejecutar jobs de ETL/reporting

**Buenas prácticas de aislamiento**: runners efímeros, network profiles, limits de CPU/memoria/tiempo y credenciales scoped.

---

## Memoria y Contexto Persistente

En `src/memory/` se propone un diseño inspirado en harnesses de [long‑running agents](https://arxiv.org/pdf/2309.06551.pdf) y sistemas tipo Claude Memory: memoria local/proyecto con resúmenes y metadatos.

### `org-store/`
Tabla/colección `OrgMemoryItem`:
- `orgId`, `domain`, `summary`, `tags`, `createdAt`, `source` (goal/plan/job)

### `project-store/`
Tabla/colección `ProjectMemoryItem`:
- `projectId`, `summary`, `type` (decision, convention, artifact), `link` (a repo, pipeline, dashboard)

### Patrones a Implementar

- **Al final de un Goal grande**, el orchestrator escribe un `MemoryItem` con:
  - Qué se hizo
  - Por qué se tomó una decisión
  - Dónde quedaron los artefactos

- **Al iniciar un nuevo Goal**, el planner recupera `k` items relevantes vía filtros y/o búsqueda semántica y los inyecta al prompt

Esto conecta con el concepto de `CHANGELOG.md`/lab-notes de proyectos long‑running.

---

## Modelo de Plugins y Verticalización

En `docs/07-domain-verticals.md` y `examples/` se muestra cómo se ve un CaS vertical:

- Definir un mini‑DSL de tareas de negocio (ej. logística, finanzas)
- Mapear tareas de negocio a secuencias de tools técnicas
- Medir el éxito en KPIs del dominio (no solo "job succeeded")

### Ejemplo: `examples/finance-reporting/`

Descriptor de tarea: `GenerateWeeklySalesReport`

**Tools**:
- `run_sql_query`
- `render_report`
- `send_email_report`

Vocabulario de entidades: `Goal`, `Plan`, `Tool`, `Job`, `MemoryItem`.

---

## Diseño de la Capa de Interfaces

> Fundamentado en el análisis comparativo de CLIs de agentes IA modernos. Ver [`docs/research-cli-architecture.md`](./docs/research-cli-architecture.md) para el estudio completo de Claude Code, Opencode, Codex CLI y OpenClaw.

### Dos patrones arquitectónicos identificados

#### Patrón A: Single-Process Renderer
*Claude Code (TypeScript/Bun + React/Ink), Codex CLI (Node.js + React/Ink)*

```
┌─────────────────────────┐
│  Proceso único          │
│  ├── Agent Logic        │
│  └── UI Renderer (Ink)  │
└─────────────────────────┘
```

**Pros:** Simple, sin latencia IPC, fácil de debuggear.
**Contras:** Sin persistencia de sesión; nuevo frontend = reimplementar renderer.

#### Patrón B: Daemon/Gateway + Thin Clients
*Opencode (Go + HTTP/SSE), OpenClaw (Node.js + WebSocket)*

```
┌──────────────────────┐
│  Daemon/Gateway      │  ← Estado, sesiones, agente, tools
│  (proceso persistente)│
└──────────┬───────────┘
           │ protocolo estándar
    ┌──────┼──────┐
    ▼      ▼      ▼
  TUI    Web   Desktop  ← Solo rendering y UX
```

**Pros:** Sesiones persistentes, multi-cliente nativo, extensible. Añadir canal = implementar adapter.
**Contras:** Complejidad operacional (lifecycle del daemon, puertos, auth).

**CaS adopta el Patrón B**, alineado con sus requerimientos de múltiples puntos de entrada (terminal, Slack, Teams, WhatsApp, web).

### Arquitectura de la Capa de Interfaces

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

### Decisiones de protocolo por cliente

| Cliente | Protocolo | Referente |
|---------|-----------|-----------|
| CLI (TUI) | WebSocket | OpenClaw |
| Web UI | HTTP + SSE | Opencode |
| Desktop App | Unix Domain Socket + token auth | OpenClaw macOS |
| Slack / Teams / WhatsApp | Adapters HTTP | OpenClaw channels |

La naturaleza **full-duplex y long-lived** de los flujos de agentes IA hace que WebSocket sea el match natural para el CLI: el backend necesita enviar progreso en tiempo real y el cliente necesita enviar interrupciones o nuevas instrucciones en cualquier momento.

### Protocolo mínimo viable para el CLI de CaS

```
CLI (TUI) ──WS──► API Gateway ──internal──► Orchestrator
                      │
                      ├── /goals    POST   { goal, projectId }
                      ├── /events   SSE    streaming de progreso
                      └── /sessions GET    estado de sesión activa
```

### Stack TUI recomendado

- **TypeScript**: React + [Ink](https://github.com/vadimdemedes/ink) — mismo approach que Claude Code y Codex CLI
- **Go**: Bubble Tea — mismo approach que Opencode

---

## Seguridad y Compliance

En `docs/06-security-and-compliance.md` se detalla:

- Separación clara de planos (control vs. ejecución)
- Policies declarativas por dominio/rol/tool
- Modos de autonomía (consultivo, semi‑autónomo, autónomo)
- Auditoría exhaustiva: qué se ejecutó, con qué parámetros, bajo qué contexto y decisión de política

También conecta con temas de **gobierno de datos** en organizaciones reguladas: catálogos de sensibilidad, acceso segmentado, etc.

---

## Roadmap

- [ ] Implementar control plane base (TypeScript/NestJS o Go)
- [ ] Implementar shell-runner básico
- [ ] Agregar policy engine con OPA
- [ ] Crear ejemplos de verticales (DevOps, Marketing, Finance)
- [ ] Documentación completa en `docs/`
- [ ] Diagramas Mermaid de arquitectura
- [ ] CI/CD y release automation

---

## Referencias

**Arquitectura de CaS**
- [Codex CLI](https://developers.openai.com/codex/cli/)
- [Codex Quickstart](https://developers.openai.com/codex/quickstart/)
- [Long-running agents paper](https://arxiv.org/pdf/2309.06551.pdf)
- [Claude Memory deep dive](https://skywork.ai/blog/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution/)
- [Governance in regulated orgs](https://arxiv.org/pdf/2204.08941.pdf)
- [Integrate Codex CLI into workflows](https://blog.openreplay.com/integrate-openais-codex-cli-tool-development-workflow/)

**Investigación de la Capa de Interfaces** — ver estudio completo en [`docs/research-cli-architecture.md`](./docs/research-cli-architecture.md)
- [Claude Code Architecture Leak — WaveSpeedAI](https://wavespeed.ai/blog/posts/claude-code-architecture-leaked-source-deep-dive/)
- [AI Coding Agent Architecture Analysis — Haseeb Qureshi](https://gist.github.com/Haseeb-Qureshi/2213cc0487ea71d62572a645d7582518)
- [Opencode Docs — Server](https://opencode.ai/docs/server/)
- [Opencode Docs — TUI](https://opencode.ai/docs/tui/)
- [Codex CLI Features — OpenAI Developers](https://developers.openai.com/codex/cli/features)
- [OpenClaw Gateway Architecture](https://openclaws.io/docs/concepts/architecture/)
- [The Gateway — OpenClaw Docs](https://clawdocs.org/architecture/gateway/)

---

## Licencia

MIT License - ver [LICENSE](./LICENSE) para más detalles.

---

## Contacto y Contribuciones

Este es un proyecto de referencia arquitectónica. Las contribuciones son bienvenidas vía issues y pull requests.
