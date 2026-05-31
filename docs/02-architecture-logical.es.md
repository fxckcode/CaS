# CaS — Arquitectura Lógica

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## Vista General de los 4 Planos

La arquitectura CaS se organiza en cuatro planos con responsabilidades estrictamente separadas. El principio rector es: **cada plano hace una cosa y la hace bien**. El Control Plane nunca ejecuta código, el Execution Plane nunca decide políticas, la Memory Layer nunca expone datos sin autorización, y la Interface Layer nunca contiene lógica de negocio.

```
                  ┌──────────────────────────────────────────┐
                  │           INTERFACE LAYER               │
                  │  (Canales de interacción con usuarios)  │
                  └──────────────────┬───────────────────────┘
                                     │ HTTP/WS
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │           CONTROL PLANE                  │
                  │  (Orquestación, planificación, políticas)│
                  └──────────────────┬───────────────────────┘
                                     │ Message Queue
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │          EXECUTION PLANE                 │
                  │  (Ejecución aislada de jobs)             │
                  └──────────────────┬───────────────────────┘
                                     │ Resultados → Memory
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │           MEMORY LAYER                   │
                  │  (Persistencia, búsqueda semántica)      │
                  └──────────────────────────────────────────┘
```

Los flujos de datos son **verticales**: las solicitudes entran por Interface Layer, se procesan en Control Plane, se ejecutan en Execution Plane, y los resultados se persisten en Memory Layer. La respuesta viaja de vuelta al usuario por el mismo camino.

---

## Interface Layer

### Componentes

| Componente | Comunicación | Protocolo | Caso de Uso |
|---|---|---|---|
| **CLI TUI** | WebSocket full-duplex | JSON-RPC sobre WS | Ingenieros que trabajan en terminal |
| **Web UI** | HTTP + SSE | REST + Server-Sent Events | Stakeholders no técnicos |
| **Slack Adapter** | HTTP | Slack Events API + Block Kit | Equipos que operan desde Slack |
| **Teams Adapter** | HTTP | Microsoft Bot Framework | Equipos Microsoft 365 |
| **WhatsApp Adapter** | HTTP | WhatsApp Business API | Operaciones móviles |
| **Desktop App** | Unix Domain Socket | JSON-RPC + HMAC auth | Sesiones locales de alta seguridad |

### API Gateway

El API Gateway es el **punto único de entrada** a CaS. Sus responsabilidades:

- **Enrutamiento**: Dirige requests REST al Orchestrator y conexiones WebSocket al manager de sesiones.
- **Autenticación**: Valida tokens JWT firmados por un IdP corporativo (Keycloak, Okta, Azure AD). Soporta OIDC con flujo authorization code + PKCE para web, client credentials para CLIs.
- **Rate Limiting**: Límites configurables por usuario, por rol y por endpoint. Ejemplo: `10 goals/min` por usuario, `100 goals/min` por organización.
- **Validación de entrada**: Schema validation con JSON Schema o Zod. Sanitización de parámetros antes de pasar al Orchestrator.
- **WebSocket Manager**: Conexiones long-lived con heartbeat cada 30s, reconexión automática con backoff exponencial (1s, 2s, 4s, max 30s), reanudación de sesión mediante session ID persistente.

### Endpoints del API Gateway

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/goals` | Crear un nuevo Goal |
| `GET` | `/goals/:id` | Obtener estado de un Goal |
| `GET` | `/goals` | Listar Goals (filtros: estado, usuario, fecha) |
| `POST` | `/goals/:id/cancel` | Cancelar un Goal en ejecución |
| `POST` | `/goals/:id/approve` | Aprobar un paso que requiere aprobación |
| `POST` | `/goals/:id/deny` | Denegar un paso que requiere aprobación |
| `GET` | `/tools` | Listar tools disponibles |
| `GET` | `/tools/:name` | Obtener descriptor de una tool |
| `GET` | `/health` | Health check del sistema |
| `WS` | `/ws` | WebSocket para streaming de progreso |

---

## Control Plane

### Componentes y sus Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Orchestrator                       │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │  │
│  │  │Goal Manager │  │Plan      │  │Job Publisher   │  │  │
│  │  │(state       │  │Executor  │  │(envía jobs a   │  │  │
│  │  │ machine)    │  │(DAG walk)│  │ message queue) │  │  │
│  │  └─────────────┘  └──────────┘  └────────────────┘  │  │
│  └────────────────────────┬─────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────┼─────────────────────────────┐  │
│  │  Planner              │                              │  │
│  │  ┌────────────────┐   │  ┌──────────────────────┐   │  │
│  │  │Prompt Builder  │   │  │LLM Provider Layer    │   │  │
│  │  │(contexto +     │   │  │(OpenAI / Anthropic /  │   │  │
│  │  │ memoria +      │   │  │ Ollama)              │   │  │
│  │  │ tools catalog) │   │  └──────────────────────┘   │  │
│  │  └────────────────┘   │  ┌──────────────────────┐   │  │
│  │  ┌────────────────┐   │  │Output Parser         │   │  │
│  │  │Plan Cache      │   │  │(JSON structured →    │   │  │
│  │  │(similitud de   │   │  │ DAG de steps)        │   │  │
│  │  │ prompts)       │   │  └──────────────────────┘   │  │
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
│  │  │API REST      │  │Schema        │                │  │
│  │  │(GET /tools)  │  │Validator     │                │  │
│  │  └──────────────┘  └──────────────┘                │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Orchestrator

El Orchestrator es el núcleo del Control Plane. Gestiona el **ciclo de vida completo de cada Goal** como una máquina de estados:

```
          ┌──────────┐
          │ PENDING  │
          └────┬─────┘
               │ Planner genera plan
               ▼
          ┌──────────┐
          │PLANNING  │
          └────┬─────┘
               │ Policy evalúa cada step
               ▼
          ┌──────────┐
          │APPROVED  │◄────── Aprobación humana (si REQUIRE_APPROVAL)
          └────┬─────┘
               │ Orchestrator publica jobs
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

**Responsabilidades detalladas:**

1. **Goal Manager**: Estado del Goal. Persiste en Redis para tolerancia a fallos y escalado horizontal.
2. **Plan Executor**: Recorre el DAG de tareas respetando dependencias. Cuando un step se completa, evalúa si sus dependientes pueden comenzar. Usa un topological sort con ejecución paralela de tareas independientes.
3. **Job Publisher**: Para cada step del DAG, construye un mensaje de job con: `{toolName, parameters, runnerType, credentialsRef, timeout, networkProfile}`. Lo publica en la cola de mensajes correspondiente.
4. **Event Consumer**: Escucha eventos de los runners (progreso, log, error, completado). Actualiza el estado del step en el DAG. Cuando todos los steps están completos, marca el Goal como COMPLETED.

### Planner

El Planner traduce un Goal expresado en lenguaje natural a un **plan estructurado como DAG de tareas**.

**Pipeline de planificación:**

```
Goal → [Prompt Builder] → [LLM Provider] → [Output Parser] → Plan (DAG)
         ↑                                       │
         │                                       ▼
    Contexto:                              Fallback:
    - Memoria organizacional               - Plan template
    - Memoria del proyecto                 - Plan manual
    - Catálogo de tools
    - Políticas activas
```

**Prompt Builder** construye el system prompt con:
- Contexto de organización: nombre, dominio, políticas activas
- Memoria de proyecto: últimas decisiones y convenciones
- Catálogo de tools: hasta 20 tools más relevantes para el dominio del Goal
- Formato de output esperado: JSON estructurado con steps, dependencias y tool mappings

**Multi-LLM Integration**: Abstracción sobre proveedores de LLM. Cada proveedor implementa la interfaz `PlannerProvider`:

```typescript
interface PlannerProvider {
  name: string;
  plan(goal: string, context: PlannerContext): Promise<Plan>;
  model: string;
  maxTokens: number;
  temperature: number;
}
```

Proveedores soportados: OpenAI (GPT-4o), Anthropic (Claude 4 Opus), locales via Ollama (DeepSeek, Llama, Qwen).

**Caching**: Prompts similares (medidos por cosine similarity del embedding del Goal) reutilizan planes anteriores. El cache expira según configuración (default: 1 hora).

**Fallback**: Si el LLM no retorna un JSON parseable o retorna errores, el Planner cae a:
1. Plan template: buscar un plan predefinido para el tipo de Goal
2. Plan manual: retornar al usuario con un mensaje de error y permitir que defina los steps manualmente

### Policy Engine

Evaluador de políticas basado en **OPA/Rego**. Opera en modalidad sidecar (proceso separado) para aislamiento.

**Modelo de decisión:**

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

**Modos de Autonomía:**

| Modo | Comportamiento | Uso típico |
|---|---|---|
| **Consultivo** | Toda operación que no sea de solo lectura requiere aprobación humana. El Orchestrator pausa el plan y notifica al canal del usuario. | Entornos con cumplimiento estricto (finance, healthcare) |
| **Semi-autónomo** | Operaciones de bajo riesgo (lectura, ejecución en dev) son ALLOW automático. Alto riesgo requiere aprobación. La definición de riesgo está en las políticas OPA. | Entornos de producción con supervisión |
| **Autónomo** | Todas las operaciones dentro del sandbox son ALLOW. Solo para entornos aislados (sandbox, dev personal) y tools verificadas. | Desarrollo rápido, CI/CD interno |

### Tools Registry

Catálogo central de todas las capacidades del sistema. Cada tool se describe con un archivo `tool.yaml`:

```yaml
name: run_sql_query
version: 1.0.0
description: Ejecuta una consulta SQL en una base de datos
domain: finance
runner: data-runner
image: cas/data-runner:latest
entrypoint: python /runner/run_sql.py
parameters:
  - name: query
    type: string
    description: Consulta SQL a ejecutar
    required: true
    sensitive: false
  - name: database
    type: string
    description: Nombre de la base de datos
    required: true
    enum: [staging, prod, reporting]
  - name: limit
    type: integer
    description: Límite de filas
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

**Endpoints del Registry:**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/tools` | Listar todas las tools (con filtros por dominio, runner, versión) |
| `GET` | `/tools/:name` | Obtener descriptor de una tool (última versión) |
| `GET` | `/tools/:name/:version` | Obtener versión específica |

**Versionado semántico**: `MAJOR.MINOR.PATCH`
- **Major**: Cambio rompiente en parámetros, comportamiento o seguridad
- **Minor**: Nueva funcionalidad backward-compatible
- **Patch**: Bug fixes sin cambios de interfaz

---

## Execution Plane

### Componentes

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
│  │  Tokens dinámicos por job, rotación automática     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

Para una descripción detallada de cada runner y la message queue, consultar el documento dedicado: **[Execution Plane](04-execution-plane.md)**

---

## Memory Layer

### Componentes

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
│  │  │   proyecto   │  │ · conventions│                │   │
│  │  │ · resúmenes  │  │ · artifacts  │                │   │
│  │  │   de Goals   │  │ · tags       │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │           Vector Store                       │   │   │
│  │  │  · Embeddings (1536d)                        │   │   │
│  │  │  · Cosine similarity search                  │   │   │
│  │  │  · Filtros: orgId, domain, tags              │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

Para una descripción detallada de los patrones de escritura/lectura y la búsqueda semántica, consultar: **[Memoria y Contexto](05-memory-and-context.md)**

---

## Flujo de Datos Completo

A continuación se describe el flujo completo desde que un usuario envía un Goal hasta que recibe el resultado:

### Ejemplo: "Genera el reporte financiero del mes de mayo"

```
Paso 1: Interface Layer
────────────────────────
Usuario → CLI TUI → WebSocket → API Gateway
  Payload: { type: "goal", text: "Genera el reporte financiero del mes de mayo" }

Paso 2: API Gateway
───────────────────
  ✓ Autentica el token JWT
  ✓ Valida schema del payload
  ✓ Rate limiting check
  ✓ Asigna goalId: "goal_abc123"
  → Reenvía al Orchestrator

Paso 3: Orchestrator
───────────────────
  ✓ Goal state: PENDING
  ✓ Persiste goalId en Redis
  ✓ Solicita al Planner

Paso 4: Planner
──────────────
  ✓ Consulta memoria organizacional: goals similares previos
  ✓ Consulta tools registry: tools del dominio finance
  ✓ Construye prompt con contexto
  ✓ LLM → JSON estructurado
  ✓ Output Parser → Plan (DAG):
      step 1: run_sql_query(reporte_mayo) → resultados
      step 2: run_python(generar_graficos) → gráficos
      step 3: render_report(resultados, gráficos) → PDF
      step 4: send_email(pdf, destinatarios) → completado
      Dependencias: step 1 → step 2 → step 3 → step 4
  ✓ Goal state → PLANNING

Paso 5: Policy Engine
─────────────────────
  Por cada step del plan:
  - step 1 (read, finance, dev) → ALLOW
  - step 2 (execute, finance, dev) → ALLOW
  - step 3 (execute, finance, dev) → ALLOW
  - step 4 (execute, finance, dev) → ALLOW (modo semi-autónomo)
  ✓ Goal state → APPROVED

Paso 6: Orchestrator publica jobs
─────────────────────────────────
  ✓ step 1 disponible → job_1 → Message Queue (topic: jobs)
  (steps 2, 3, 4 esperan a sus dependencias)

Paso 7: Execution Plane
───────────────────────
  ✓ Data Runner consume job_1 de la cola
  ✓ Vault agent inyecta credenciales dinámicas de DB
  ✓ Ejecuta run_sql.py con parámetros del job
  ✓ Stream de logs → Orchestrator vía WebSocket
  ✓ Resultado: archivo CSV con datos del reporte
  ✓ Job completado → evento COMPLETED → Message Queue (topic: events)

Paso 8: Orchestrator procesa evento
───────────────────────────────────
  ✓ Step 1 COMPLETED
  ✓ Step 2 disponible → job_2 → Message Queue
  (Se repite hasta que todos los steps están completos)

Paso 9: Goal COMPLETED
──────────────────────
  ✓ Orchestrator marca Goal como COMPLETED
  ✓ Escribe MemoryItem en Org Store y Project Store
  ✓ Envía resultado final al usuario vía WebSocket

Paso 10: Usuario recibe notificación
────────────────────────────────────
  CLI TUI muestra: "✅ Reporte financiero de mayo generado.
     Archivos: /reportes/mayo-2026.pdf
     Enviado a: finance@empresa.com"
```

**Tiempo total estimado**: ~30 segundos (2s planificación, 25s ejecución de queries, 3s renderizado y envío).

---

## Comunicaciones

### Canales de Comunicación

| Tipo | Protocolo | Uso | Dirección |
|---|---|---|---|
| **Sincrónica** | HTTP/WS | Requests de usuario, streaming de estado | Bidireccional |
| **Asincrónica** | BullMQ/RabbitMQ | Jobs entre orchestrator y runners | Unidireccional (cola) |
| **Eventos** | SSE (Server-Sent Events) | Progreso en tiempo real para Web UI | Servidor → Cliente |

### Contratos de Interfaz

Cada comunicación entre planos sigue un contrato definido:

**API Gateway → Orchestrator**: HTTP POST con payload `{goal, userId, sessionId, autonomyMode}`. Retorna `{goalId, status}`.

**Orchestrator → Planner**: Llamada interna con `{goalId, goal, context, userProfile}`. Retorna `{planId, steps: DAG}`.

**Orchestrator → Policy Engine**: Llamada interna con `{userId, role, domain, tool, environment}`. Retorna `{decision, reason}`.

**Orchestrator → Message Queue**: JSON serializado con `{jobId, goalId, stepId, tool, parameters, credentialsRef, timeout}`.

**Runner → Orchestrator (vía MQ)**: Eventos `{jobId, type: 'progress'|'log'|'error'|'completed', payload, timestamp}`.

---

## Límites de Despliegue

| Componente | Naturaleza | Escalado | Persistencia |
|---|---|---|---|
| **API Gateway** | Stateless | Horizontal (detrás de LB) | Ninguna |
| **Orchestrator** | Stateful (Redis compartido) | Horizontal con Redis cluster | Redis + PostgreSQL |
| **Planner** | Stateless | Horizontal | Cache en Redis |
| **Policy Engine** | Stateless (sidecar) | Por instancia de Orchestrator | Políticas en disco/etcd |
| **Tools Registry** | Stateless | Horizontal | PostgreSQL |
| **Shell Runner** | Stateless | Horizontal (auto-escalado) | Contenedores efímeros |
| **CI/CD Runner** | Stateless | Bajo demanda | Ninguna |
| **Data Runner** | Stateless | Horizontal (auto-escalado) | Contenedores efímeros |
| **Message Queue** | Stateful | Cluster BullMQ/RabbitMQ | Disco |
| **PostgreSQL** | Stateful | Réplicas de lectura | Disco (WAL + backups) |

### Requisitos de Infraestructura Mínimos

- **Kubernetes**:集群 Kubernetes (EKS, AKS, GKE) para orquestar contenedores de runners
- **PostgreSQL 15+** con extensión pgvector
- **Redis 7+** para estado del Orchestrator y caché del Planner
- **Cola de mensajes**: BullMQ (Redis-based) o RabbitMQ
- **Vault**: HashiCorp Vault para secrets management
- **OPA Server**: Proceso sidecar o servidor central

---

## Tolerancia a Fallos

| Escenario | Mecanismo |
|---|---|
| **Job falla** | Retry con backoff exponencial (3 intentos: 5s, 30s, 120s) |
| **Job no recuperable** | Dead Letter Queue + notificación al operador |
| **Runner se cuelga** | Timeout por tool (configurable en tool.yaml) |
| **Orchestrator cae** | Recuperación desde Redis: goals en IN_PROGRESS se re-ejecutan desde el último checkpoint |
| **Message Queue cae** | Buffer en disco del Orchestrator + cola de respaldo |
| **LLM falla** | Fallback a plan template o plan manual |
| **Red de runner** | Timeout de conexión + retry con runner alternativo |
| **Base de datos** | Réplica de lectura para queries, WAL para recuperación |

---

## Siguiente

Continúa con el **[Control Plane](03-control-plane.md)** , donde se profundiza en el API Gateway, Orchestrator, Planner, Policy Engine y Tools Registry con ejemplos concretos y consideraciones de implementación.

---

*Última actualización: 2026-05-31*
