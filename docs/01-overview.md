# CaS — Visión General

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## ¿Qué es CaS?

CaS (CLI as a Service) es una **arquitectura de referencia ejecutable** para construir sistemas corporativos donde agentes de inteligencia artificial ejecutan tareas reales sobre infraestructura organizacional. Es la evolución de los asistentes de línea de comandos locales hacia una plataforma gestionada, observable y gobernable que opera dentro de los límites de seguridad y cumplimiento normativo de una empresa.

En lugar de un chatbot que solo responde preguntas, CaS es un sistema donde los usuarios expresan **objetivos de alto nivel** —"migra la base de datos de staging a producción", "genera el reporte financiero mensual", "escala el servicio de pagos"— y la plataforma orquesta herramientas reales en infraestructura corporativa: shells en contenedores, pipelines CI/CD, consultas SQL, deploys a Kubernetes, y más.

---

## El Problema

Las organizaciones enfrentan cuatro brechas fundamentales al adoptar agentes de IA en operaciones técnicas:

### 1. Chatbots responden pero no actúan

Los asistentes conversacionales actuales (ChatGPT, Claude Web, Copilot Chat) entregan texto, código y explicaciones, pero no ejecutan nada. El usuario debe copiar, pegar y ejecutar manualmente. Esto limita drásticamente el valor real: el agente ve pero no toca.

### 2. Agentes de IA sin control corporativo

Las herramientas de agente local (Codex CLI, Claude Code) operan con permisos del usuario que las ejecuta. En una empresa, esto significa que un agente sin supervisión podría accidentalmente —o intencionalmente— eliminar recursos, exponer secretos o modificar configuraciones críticas. No existe un punto central de control, auditoría o policy enforcement.

### 3. Falta de auditoría, políticas y aislamiento

- **Auditoría:** No hay un registro inmutable de qué se ejecutó, quién lo aprobó, con qué parámetros y qué resultado tuvo.
- **Políticas:** No hay reglas de negocio que impidan ejecutar ciertas operaciones según rol, dominio o entorno.
- **Aislamiento:** Los agentes locales ejecutan en el mismo contexto de red y recursos que el usuario, sin sandboxing.
- **Memoria:** Cada sesión de agente empieza desde cero. No hay memoria organizacional que acumule decisiones, convenciones y lecciones aprendidas.

### 4. Multiplicidad de canales sin orquestación

Las empresas tienen equipos que operan desde Slack, Teams, terminal, web, y aplicaciones desktop. Sin una arquitectura unificada, cada canal desarrolla su propia solución, duplicando esfuerzos e imposibilitando una experiencia consistente.

---

## La Solución: CaS

CaS resuelve estas brechas mediante una arquitectura de **cuatro planos** que transforma "chatbots que responden" en **"agentes que actúan"** :

| Problema | Solución CaS |
|---|---|
| Chatbots no ejecutan | Execution Plane con runners aislados (shell, CI/CD, datos) |
| Sin control corporativo | Policy Engine (OPA/Rego) con 3 modos de autonomía |
| Sin auditoría | Audit trail inmutable con hash chain |
| Sin aislamiento | Contenedores efímeros con perfiles de red y recursos |
| Sin memoria | Memory Layer con búsqueda semántica (pgvector) |
| Canales fragmentados | Interface Layer unificada con API Gateway |

CaS se inspira en las mejores prácticas de sistemas existentes:

- **Claude Code** — Referente para interfaz TUI (React + Ink) y sistema de memoria persistente (MEMORY.md index + detail files)
- **Codex CLI** — Referente para modos de aprobación y sandboxing de ejecución
- **Opencode** — Referente para arquitectura daemon + thin clients con WebSocket
- **OpenClaw** — Referente para multi-canal vía gateway WebSocket
- **Semantic Kernel** — Referente para planner y tool registry con composición dinámica
- **AutoGPT / BabyAGI** — Referente para goal decomposition y DAG de planes

---

## Conceptos Clave

| Término | Definición | Ejemplo |
|---|---|---|
| **Goal** | Objetivo de alto nivel expresado por el usuario | "Migra la base de datos de staging a producción" |
| **Plan** | DAG (grafo acíclico dirigido) de tareas generado por el planner | `[backup_staging, run_migrations, verify_data, switch_dns]` |
| **Tool** | Capacidad atómica registrada en el Tools Registry | `run_sql_query`, `kubectl_apply`, `deploy_service` |
| **Job** | Instancia de una tool ejecutándose en un runner | `run_sql_query(backup_staging)` ejecutándose en el data runner |
| **Runner** | Entorno de ejecución aislado que aloja un job | Shell Runner (Docker), CI/CD Runner (GitHub Actions), Data Runner (pandas) |
| **MemoryItem** | Unidad de memoria persistente | Decisión arquitectónica, convención de equipo, artefacto generado |
| **Policy** | Regla de negocio evaluada por el Policy Engine | "Escritura en prod requiere aprobación de dos personas" |
| **Vertical** | Especialización del sistema para un dominio de negocio | DevOps, Marketing, Finance |

---

## Arquitectura en 4 Planos

CaS organiza sus componentes en cuatro planos con responsabilidades claramente separadas:

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERFACE LAYER                              │
│  ┌────────┐  ┌────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │CLI TUI │  │Web UI  │  │Slack/Teams/  │  │Desktop App    │  │
│  │(React/ │  │(HTTP + │  │WhatsApp      │  │(Unix Socket + │  │
│  │ Ink)   │  │ SSE)   │  │Adapters      │  │ HMAC)         │  │
│  └────┬───┘  └────┬───┘  └──────┬───────┘  └───────┬───────┘  │
│       └──────────┐└─────────────┼──────────────────┘          │
│                  ▼              ▼                              │
│            ┌─────────────────────────┐                        │
│            │     API Gateway         │                        │
│            │  HTTP/WS, OIDC/JWT,     │                        │
│            │  Rate Limiting          │                        │
│            └────────────┬────────────┘                        │
└─────────────────────────┼─────────────────────────────────────┘
                          │
┌─────────────────────────┼─────────────────────────────────────┐
│                   CONTROL PLANE                               │
│            ┌────────────┴────────────┐                        │
│            │    Orchestrator         │                        │
│            │  - Goal state machine   │                        │
│            │  - Plan DAG execution   │◄────┐                  │
│            │  - Job publication      │     │                  │
│            └────────────┬────────────┘     │                  │
│            ┌────────────┴────────────┐     │                  │
│            │       Planner           │     │                  │
│            │  - Prompt builder       │     │                  │
│            │  - Multi-LLM integration│     │                  │
│            │  - Structured output    │     │                  │
│            └────────────┬────────────┘     │                  │
│            ┌────────────┴────────────┐     │                  │
│            │    Policy Engine        │     │                  │
│            │  - OPA/Rego evaluation  │     │                  │
│            │  - Autonomy modes       │─────┘                  │
│            └────────────┬────────────┘                        │
│            ┌────────────┴────────────┐                        │
│            │    Tools Registry       │                        │
│            │  - tool.yaml descriptors│                        │
│            │  - Versionado semántico │                        │
│            └─────────────────────────┘                        │
└────────────────────────────────────┬──────────────────────────┘
                                     │
┌────────────────────────────────────┼──────────────────────────┐
│                           EXECUTION PLANE                     │
│            ┌────────────────────────┴───────────┐             │
│            │      Message Queue                 │             │
│            │   (BullMQ / RabbitMQ)              │             │
│            └──────┬──────────┬──────────┬───────┘             │
│            ┌──────┴─────┐ ┌──┴──────┐ ┌─┴────────┐           │
│            │Shell Runner│ │CI/CD    │ │Data      │           │
│            │(Docker)    │ │Runner   │ │Runner    │           │
│            │            │ │(GitHub  │ │(pandas,  │           │
│            │            │ │ Actions)│ │SQLAlchemy│           │
│            └────────────┘ └─────────┘ └──────────┘           │
└────────────────────────────────┬──────────────────────────────┘
                                 │
┌────────────────────────────────┼──────────────────────────────┐
│                        MEMORY LAYER                           │
│            ┌───────────────────┴──────────────┐               │
│            │        PostgreSQL + pgvector      │               │
│            ┌──────────────┐  ┌──────────────┐  │               │
│            │  Org Store   │  │Project Store  │  │               │
│            │  (memoria    │  │(decisiones,   │  │               │
│            │   cross-     │  │ convenciones, │  │               │
│            │   proyecto)  │  │ artefactos)   │  │               │
│            └──────────────┘  └──────────────┘  │               │
│            ┌──────────────────────────────┐    │               │
│            │  Vector Store (embeddings)   │    │               │
│            │  Búsqueda semántica (cosine) │    │               │
│            └──────────────────────────────┘    │               │
└────────────────────────────────────────────────────────────────┘
```

### Interface Layer

Capa de presentación que adapta CaS a múltiples canales de interacción. Incluye:

- **CLI TUI** — Terminal interactiva construida con React/Ink, comunicación bidireccional vía WebSocket. Experiencia similar a Claude Code pero con conexión remota al daemon.
- **Web UI** — Interfaz web con HTTP + Server-Sent Events para progreso en tiempo real.
- **Slack/Teams/WhatsApp Adapters** — Bots que traducen mensajes de chat a Goals de CaS.
- **Desktop App** — Aplicación nativa que se conecta vía Unix Domain Socket con autenticación HMAC.
- **API Gateway** — Punto único de entrada con autenticación OIDC/JWT y rate limiting.

### Control Plane

El cerebro del sistema. Orquesta toda la lógica de negocio sin ejecutar código directamente:

- **Orchestrator** — Gestiona el ciclo de vida completo de un Goal: recibe la solicitud, coordina la planificación, publica jobs en la cola, recolecta resultados y persiste memoria.
- **Planner** — Construye prompts contextualizados (con memoria organizacional + catálogo de tools), consulta uno o más LLMs y parsea la respuesta estructurada como un DAG de tareas.
- **Policy Engine** — Evalúa cada operación contra reglas OPA/Rego usando inputs de usuario, rol, dominio, tool y entorno. Decide si la operación es permitida, denegada o requiere aprobación humana.
- **Tools Registry** — Catálogo central de todas las capacidades del sistema. Cada tool tiene un descriptor `tool.yaml` con parámetros, runner destino, recursos, y perfil de seguridad.

### Execution Plane

Capa de ejecución aislada. Workers que consumen jobs de la cola de mensajes:

- **Shell Runner** — Contenedores Docker efímeros con sandboxing (seccomp, AppArmor), perfiles de red (none, outbound-only, full) y límites de recursos. Ideal para scripts, deploys y operaciones ad-hoc.
- **CI/CD Runner** — Bridge a pipelines existentes (GitHub Actions, GitLab CI, Jenkins). CaS actúa como frontend de alto nivel para la infraestructura CI/CD ya existente.
- **Data Runner** — Imagen especializada con Python, pandas, SQLAlchemy, Jupyter. Para jobs ETL, reporting y análisis de datos.

### Memory Layer

Capa de memoria persistente con búsqueda semántica:

- **Org Store** — Memoria organizacional cross-proyecto. Almacena resúmenes de Goals completados con embeddings para recuperación semántica.
- **Project Store** — Decisiones arquitectónicas, convenciones de equipo y artefactos por proyecto. Alimenta un CHANGELOG.md automático.
- **Vector Store** — Extension pgvector sobre PostgreSQL. Embeddings generados via OpenAI o Ollama.

---

## Usuarios Target

| Perfil | Rol en CaS | ¿Qué busca? |
|---|---|---|
| Arquitecto de Software | Diseña verticales y políticas | Un framework extensible para orquestar agentes corporativos |
| Desarrollador Backend | Registra tools y construye runners | Una API clara para exponer capacidades existentes como tools |
| DevOps / SRE | Opera el Execution Plane | Aislamiento, límites de recursos, integración con CI/CD existente |
| Equipo de Seguridad | Define políticas OPA y auditoría | Control granular, audit trail inmutable, cumplimiento normativo |
| Business Stakeholder | Define Goals y consume reportes | Resultados tangibles sin involucrarse en la ejecución técnica |

---

## Cómo Leer Esta Documentación

Esta especificación arquitectónica está organizada como una narrativa progresiva. Se recomienda el siguiente orden de lectura:

1. **Visión General** (este documento) — Contexto, conceptos y vista de pájaro de la arquitectura
2. **[Arquitectura Lógica](02-architecture-logical.md)** — Desglose detallado de cada plano, sus componentes y flujos de datos
3. **[Control Plane](03-control-plane.md)** — Profundidad en el cerebro del sistema: API Gateway, Orchestrator, Planner, Policy Engine, Tools Registry
4. **[Execution Plane](04-execution-plane.md)** — Runners, contenedores, message queue, gestión de credenciales
5. **[Memoria y Contexto](05-memory-and-context.md)** — Persistencia, búsqueda semántica, patrones de escritura/lectura
6. **[Seguridad y Compliance](06-security-and-compliance.md)** — Modos de autonomía, políticas OPA, auditoría, aislamiento
7. **[Verticales de Dominio](07-domain-verticals.md)** — Especialización para DevOps, Marketing, Finance

Cada documento es auto-contenido pero referencia a los demás con enlaces relativos. Los lectores pueden profundizar según su interés.

---

## Relación con el Ecosistema

CaS no pretende reemplazar herramientas existentes sino **orquestarlas bajo una arquitectura corporativa unificada**:

| Herramienta | Relación con CaS |
|---|---|
| **Claude Code** | Inspiración para la TUI (React+Ink) y el sistema de memoria (MEMORY.md detail files). CaS extiende el concepto a multi-usuario y multi-proyecto. |
| **Codex CLI** | Inspiración para los modos de aprobación y el sandboxing de ejecución. CaS añade un policy engine centralizado con OPA. |
| **Opencode** | Inspiración para la arquitectura daemon + thin clients con comunicación WebSocket. |
| **OpenClaw** | Inspiración para el gateway WebSocket multi-canal. |
| **Semantic Kernel** | Inspiración para el planner, el tool registry y la composición dinámica de capacidades. |
| **AutoGPT / BabyAGI** | Inspiración para la descomposición de goals en DAGs de tareas. |
| **HashiCorp Vault** | Backend de secrets management con tokens dinámicos y rotación automática. |
| **OPA (Open Policy Agent)** | Motor de políticas del Policy Engine. |

---

## Siguiente

Continúa con la **[Arquitectura Lógica](02-architecture-logical.md)** , donde se desglosa cada plano en detalle con sus componentes, interfaces y flujos de datos completos.

---

*Última actualización: 2026-05-31*
