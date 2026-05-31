# CaS — Control Plane

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## Vista General

El Control Plane es el **cerebro del sistema**. Contiene toda la lógica de orquestación, planificación, evaluación de políticas y registro de capacidades. Opera bajo un principio fundamental: **nunca ejecuta código directamente**. Delega toda ejecución al Execution Plane a través de una cola de mensajes asincrónica.

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

El API Gateway es la **puerta de entrada única** a CaS. Todos los clientes (CLI, web, Slack, desktop) se conectan a través de él.

### Endpoints

| Método | Ruta | Autenticación | Límite | Descripción |
|---|---|---|---|---|
| `POST` | `/goals` | Requerida | 10/min per user | Crear un nuevo Goal |
| `GET` | `/goals/:id` | Requerida | 60/min per user | Obtener estado de un Goal |
| `GET` | `/goals` | Requerida | 30/min per user | Listar Goals con filtros |
| `POST` | `/goals/:id/cancel` | Requerida | 10/min per user | Cancelar Goal |
| `POST` | `/goals/:id/approve` | Requerida + rol | 20/min per user | Aprobar step |
| `POST` | `/goals/:id/deny` | Requerida + rol | 20/min per user | Denegar step |
| `GET` | `/tools` | Requerida | 60/min per user | Listar tools |
| `GET` | `/tools/:name` | Requerida | 60/min per user | Tool descriptor |
| `GET` | `/health` | Pública | — | Health check |
| `WS` | `/ws` | Requerida (token en query) | — | Streaming |

### Autenticación

CaS delega autenticación en un **IdP corporativo** (Keycloak, Okta, Azure AD, Auth0) mediante el flujo **OIDC**:

- **Web UI**: Authorization Code Flow + PKCE. El usuario redirige al IdP, recibe un authorization code, el backend lo canjea por tokens.
- **CLI TUI / Desktop App**: Device Authorization Grant (RFC 8628). El CLI muestra un código que el usuario verifica en su navegador.
- **Slack / Teams Adapters**: Verificación de firmas HMAC del proveedor + token de servicio interno.
- **Service-to-service**: Client Credentials Grant. Los runners se autentican con client ID + client secret.

**Estructura del JWT:**

```json
{
  "sub": "user_abc123",
  "email": "jdoe@empresa.com",
  "roles": ["admin", "devops"],
  "groups": ["sre-team", "finance-approvers"],
  "iat": 1717200000,
  "exp": 1717203600,
  "iss": "https://idp.empresa.com/auth/realms/cas"
}
```

### Rate Limiting

Configuración por defecto (sobrescribible por política corporativa):

| Nivel | Goals/min | Reads/min | Auth failures/h |
|---|---|---|---|
| Free tier | 5 | 30 | 5 |
| Developer | 20 | 120 | 10 |
| Admin | 50 | 300 | 20 |
| Service account | 200 | 1000 | — |

El rate limiting se implementa con **Redis + sliding window** para precisión en entornos distribuidos.

### WebSocket Management

El Gateway mantiene conexiones WebSocket long-lived para streaming de progreso.

**Ciclo de vida:**

```
Client                     Gateway
  │                          │
  │──── WS /ws?token=... ───▶│
  │                          │──── Verifica token JWT
  │◀─── 101 Switching ──────│
  │                          │
  │──── {"subscribe":       │
  │       "goal_abc123"} ───▶│
  │                          │──── Suscribe a eventos del Goal
  │◀─── {"type":"progress", │
  │       "step":"1/4",     │
  │       "status":"running"}│
  │◀─── {"type":"log",      │
  │       "data":"Query OK"}│
  │                          │
  │──── {"type":"ping"} ────▶│  (heartbeat cada 30s)
  │◀─── {"type":"pong"} ────│
  │                          │
  │◀─── {"type":"completed",│
  │       "result":"..."}    │
```

**Reconexión**: Si el cliente se desconecta, el Gateway mantiene la suscripción activa por 5 minutos. Al reconectar con el mismo `sessionId`, el Gateway reenvía el estado actual y los eventos no entregados.

### Validación de Entrada

Cada request es validado contra un schema antes de llegar al Orchestrator:

```typescript
const goalSchema = {
  type: 'object',
  required: ['goal'],
  properties: {
    goal: {
      type: 'string',
      minLength: 10,
      maxLength: 2000,
      description: 'Descripción del objetivo de alto nivel'
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

El Orchestrator es el **núcleo del Control Plane**. Gestiona el ciclo de vida completo de cada Goal desde que llega hasta que se completa, falla o se cancela.

### Ciclo de Vida de un Goal

```
                          ┌──────────────┐
                          │   PENDING    │
                          │ Goal creado,  │
                          │ sin procesar  │
                          └──────┬───────┘
                                 │ Orchestrator asigna al Planner
                                 ▼
                          ┌──────────────┐
                          │  PLANNING    │
                          │ Planner      │
                          │ generando    │
                          │ DAG de tareas│
                          └──────┬───────┘
                                 │ Plan generado + Policy evaluada
                                 ▼
                    ┌─────────────────────────┐
                    │       APPROVED           │
                    │ Plan aceptado,           │
                    │ listo para ejecutar      │
                    │                          │
                    │ (Si alguna policy         │
                    │  devolvió                 │
                    │  REQUIRE_APPROVAL,        │
                    │  espera input humano)     │
                    └──────┬──────────────────┘
                           │ Orchestrator publica primer job
                           ▼
                    ┌─────────────────────────┐
                    │      IN_PROGRESS        │
                    │ Jobs ejecutándose,      │
                    │ DAG recorriéndose       │
                    │                         │
                    │ Estado por step:        │
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
     │ Todos los  │ │ Algún step │ │ Usuario    │
     │ steps OK   │ │ falló sin  │ │ canceló    │
     │            │ │ retry      │ │            │
     └────────────┘ └────────────┘ └────────────┘
```

### State Machine (Detalle de Transiciones)

| Estado Actual | Evento | Siguiente Estado | Acción |
|---|---|---|---|
| PENDING | start_planning | PLANNING | Invocar Planner |
| PLANNING | plan_ready | APPROVED | Evaluar políticas por step |
| PLANNING | plan_failed | FAILED | Notificar error de planificación |
| APPROVED | all_auto | IN_PROGRESS | Publicar jobs disponibles |
| APPROVED | waiting_approval | APPROVED | Bloquear hasta aprobación humana |
| APPROVED | approved | IN_PROGRESS | Continuar con step aprobado |
| APPROVED | denied | FAILED | Step denegado → Goal fallido |
| IN_PROGRESS | step_completed | IN_PROGRESS | Avanzar DAG, publicar siguiente job |
| IN_PROGRESS | all_completed | COMPLETED | Escribir memoria, notificar usuario |
| IN_PROGRESS | step_failed_no_retry | FAILED | Notificar error |
| IN_PROGRESS | step_failed_retry | IN_PROGRESS | Reintentar con backoff |
| IN_PROGRESS | cancelled | CANCELLED | Cancelar jobs en cola, cleanup |
| ANY | cancel_requested | CANCELLED | Cancelación manual del usuario |

### Plan como DAG de Tareas

El plan generado por el Planner es un **grafo acíclico dirigido (DAG)** donde:

- **Nodos (steps)**: Unidades atómicas de trabajo, cada una mapeada a una tool del registry
- **Aristas (edges)**: Dependencias entre steps. Un step no comienza hasta que todos sus predecesores estén completos
- **Peso**: Cada step tiene un timeout y prioridad

**Ejemplo de DAG:**

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

**Ejecución**: El Plan Executor hace un topological sort del DAG. Los steps sin dependencias pendientes se ejecutan en paralelo. Cuando un step se completa, se evalúa qué steps dependientes pueden comenzar.

### Publicación de Jobs

Cuando un step está listo para ejecutarse, el Job Publisher construye un mensaje de job:

```json
{
  "jobId": "job_456",
  "goalId": "goal_abc123",
  "stepId": "step_2",
  "tool": "run_sql_query",
  "version": "1.0.0",
  "parameters": {
    "query": "SELECT * FROM revenue WHERE month = 'mayo-2026'",
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

Este mensaje se publica en la cola de mensajes (topic: `jobs`). El runner correspondiente lo consume cuando esté disponible.

### Recepción de Eventos

Los runners publican eventos en la cola de mensajes (topic: `events`). El Orchestrator los consume y procesa:

| Evento | Payload | Acción del Orchestrator |
|---|---|---|
| `job.started` | `{jobId, startedAt}` | Actualizar step state → running |
| `job.progress` | `{jobId, percent, message}` | Reenviar al cliente vía WebSocket |
| `job.log` | `{jobId, stream: stdout/stderr, data}` | Almacenar en buffer, reenviar si hay cliente conectado |
| `job.completed` | `{jobId, result, artifacts, duration}` | Step completed, avanzar DAG |
| `job.failed` | `{jobId, error, exitCode}` | Intentar retry o marcar Goal como FAILED |
| `job.timeout` | `{jobId}` | Kill + cleanup, marcar como FAILED |

### Escritura de Memoria

Cuando un Goal se completa exitosamente, el Orchestrator inicia un proceso de **consolidación de memoria**:

1. Envía los logs, resultados y artefactos del Goal a un LLM para resumir
2. El LLM genera un `MemoryItem` estructurado con:
   - Resumen de lo que se hizo
   - Decisiones arquitectónicas tomadas
   - Artefactos generados (rutas, URLs)
   - Tags de dominio y proyecto
3. El `MemoryItem` se persiste en Org Store y Project Store
4. Si el Goal produjo decisiones, se actualiza el `CHANGELOG.md` del proyecto

---

## Planner

El Planner es el componente que **traduce lenguaje natural a planes ejecutables**. Es la interfaz entre el lenguaje humano y la máquina de estados del Orchestrator.

### Prompt Builder

Construye el prompt del sistema con contexto rico:

```
System: Eres un planificador de tareas para CaS (CLI as a Service).
Tu trabajo es descomponer un Goal de alto nivel en un DAG de tareas.

Contexto de organización:
- Nombre: EmpresaTech
- Dominio: devops
- Entorno: staging
- Políticas activas: modo semi-autónomo

Herramientas disponibles (top 5 de 20):
1. run_shell (v2.1.0) - Ejecuta comandos shell en contenedor
2. kubectl_apply (v1.0.0) - Aplica manifiestos Kubernetes
3. db_migrate (v3.2.1) - Ejecuta migraciones de base de datos
4. terraform_plan (v1.5.0) - Planifica cambios de infraestructura
5. helm_deploy (v2.0.0) - Despliega charts Helm

Memoria de proyecto relevante:
- Última migración DB: usó `db_migrate` con rollback automático
- Convención: usar `terraform_plan` antes de cualquier `kubectl_apply`

Formato de output (JSON):
{
  "steps": [
    {
      "id": "step_1",
      "tool": "tool_name",
      "parameters": { ... },
      "depends_on": [],
      "description": "Qué hace este paso"
    }
  ]
}

Goal del usuario: [GOAL TEXT]
```

### Integración Multi-LLM

El Planner abstrae la elección del LLM mediante una interfaz de proveedor:

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

// Proveedores implementados:
class OpenAIProvider implements PlannerProvider { ... }
class AnthropicProvider implements PlannerProvider { ... }
class OllamaProvider implements PlannerProvider { ... }
```

**Selección de proveedor**: Configurable por organización. Default: intentar OpenAI GPT-4o, fallback a Anthropic Claude 4 Opus, fallback a Ollama local.

**Parámetros por proveedor:**

| Provider | Modelo Default | Max Tokens | Temperatura |
|---|---|---|---|
| OpenAI | gpt-4o | 4096 | 0.2 |
| Anthropic | claude-opus-4 | 4096 | 0.3 |
| Ollama | deepseek-coder-v2 | 4096 | 0.1 |

### Output Normalizado

El LLM debe retornar un JSON con la siguiente estructura:

```json
{
  "plan_id": "plan_789",
  "goal_summary": "Migrar base de datos de staging a producción",
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
      "description": "Backup del schema de staging",
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
      "description": "Ejecutar migraciones en producción",
      "timeout_seconds": 300
    }
  ]
}
```

**Validación post-parsing:**

1. El JSON debe ser parseable (si no, reintentar con el LLM con feedback del error)
2. Todos los `tool` referenciados deben existir en el Tools Registry
3. Todos los parámetros requeridos deben estar presentes
4. Las dependencias (`depends_on`) deben formar un DAG válido (sin ciclos)
5. Cada step debe tener un `id` único dentro del plan

### Plan Cache

Para evitar llamadas LLM innecesarias, el Planner mantiene un cache de planes:

```typescript
interface CacheEntry {
  goalEmbedding: number[];   // embedding(1536) del Goal original
  plan: Plan;
  createdAt: Date;
  ttl: number;               // segundos
  hitCount: number;
}

// Estrategia de cache:
// 1. Calcular embedding del nuevo Goal
// 2. Buscar en cache por cosine similarity > 0.92
// 3. Si hay match, reusar plan (validando que tools sigan disponibles)
// 4. Si no hay match, llamar al LLM
```

### Fallback

Si el LLM no produce un plan válido después de 3 intentos:

1. **Plan template**: Buscar en una base de templates por dominio y tipo de Goal
   ```yaml
   templates:
     - domain: devops
       type: database_migration
       steps:
         - tool: run_shell, command: pg_dump...
         - tool: db_migrate...
   ```
2. **Plan manual**: Retornar al usuario con un mensaje explicativo y permitir que defina los steps manualmente a través de la CLI

---

## Policy Engine

El Policy Engine es el **guardián del sistema**. Cada operación propuesta es evaluada contra reglas definidas en **OPA/Rego** antes de ser ejecutada.

### Integración OPA/Rego

CaS soporta dos modos de integración:

| Modo | Descripción | Ventaja |
|---|---|---|
| **Sidecar** | Proceso OPA por instancia del Orchestrator | Aislamiento, baja latencia |
| **Servidor Central** | Servidor OPA compartido para todo el cluster | Políticas unificadas, fácil actualización |

Default: Sidecar para baja latencia (< 2ms por evaluación).

**API de evaluación:**

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
    "reason": "Escritura en producción requiere aprobación"
  }
}
```

### Estructura de Reglas Regio

```rego
package cas.policies

import future.keywords.if
import future.keywords.in

default allow := false
default require_approval := false

# ==========================================
# Reglas por Rol
# ==========================================

# Admin puede todo en dev y staging
allow if {
    input.role == "admin"
    input.environment in ["dev", "staging"]
}

# Developer solo lectura en prod
allow if {
    input.role == "dev"
    input.environment == "prod"
    input.tool.type == "read"
}

# Developer necesita aprobación para escribir en prod
require_approval if {
    input.role == "dev"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}

# Analyst solo lectura en finance
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
}

# ==========================================
# Reglas por Entorno
# ==========================================

# En producción, escritura siempre requiere aprobación
require_approval if {
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
    input.autonomy_mode != "autonomous"
}

# ==========================================
# Reglas por Nivel de Riesgo
# ==========================================

# Riesgo alto siempre requiere aprobación en modo semi-autónomo
require_approval if {
    input.tool.risk == "high"
    input.autonomy_mode == "semi-autonomous"
}

# Riesgo bajo siempre permitido en modo semi-autónomo
allow if {
    input.tool.risk == "low"
    input.autonomy_mode == "semi-autonomous"
}

# ==========================================
# Reglas de Denegación Explícita
# ==========================================

# Denegar si la tool no está aprobada para el dominio
deny if {
    not data.tools_by_domain[input.domain][input.tool.name]
}

# Denegar ejecución en prod en horario no laboral sin aprobación especial
deny if {
    input.environment == "prod"
    input.tool.type == "execute"
    time.now_ns() % 86400000000000 < time.clock(9, 0, 0)
    not data.approved_outside_hours[input.user]
}
```

### Input del Policy Engine

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| `user` | string | ID del usuario | `jdoe` |
| `role` | string | Rol del usuario | `dev`, `admin`, `analyst` |
| `domain` | string | Dominio de negocio | `devops`, `finance`, `marketing` |
| `environment` | string | Entorno objetivo | `dev`, `staging`, `prod` |
| `tool.name` | string | Nombre de la tool | `kubectl_apply` |
| `tool.type` | string | Tipo de operación | `read`, `write`, `execute` |
| `tool.risk` | string | Nivel de riesgo | `low`, `medium`, `high` |
| `autonomy_mode` | string | Modo de autonomía del Goal | `consultive`, `semi-autonomous`, `autonomous` |
| `goal_risk_level` | string | Riesgo calculado del Goal completo | `low`, `medium`, `high` |

### Output del Policy Engine

| Decisión | Significado | Acción del Orchestrator |
|---|---|---|
| `ALLOW` | Operación permitida | Publicar job en la cola |
| `DENY` | Operación denegada | Marcas step como FAILED con razón |
| `REQUIRE_APPROVAL` | Requiere aprobación humana | Pausar el plan, notificar al usuario y a los aprobadores |

### Modos de Autonomía en Detalle

**Consultivo:**

```
Para CADA step del plan:
  if tool.type == "read" → ALLOW
  else → REQUIRE_APPROVAL

El Orchestrator:
  1. Pausa el plan después de planificar
  2. Muestra cada step al usuario con sus parámetros
  3. Espera aprobación explícita para continuar
  4. Si se deniega un step → Goal FAILED
  5. Si se aprueba → step ejecutado, luego pausa en el siguiente
```

**Semi-autónomo (default):**

```
Para CADA step del plan:
  if tool.risk == "low" → ALLOW
  if tool.risk == "medium" AND environment != "prod" → ALLOW
  if tool.risk == "high" OR environment == "prod" → REQUIRE_APPROVAL

El Orchestrator:
  1. Ejecuta automáticamente steps de bajo riesgo
  2. Cuando encuentra un REQUIRE_APPROVAL, pausa y notifica
  3. El usuario puede aprobar en lote o step por step
  4. Continúa automáticamente después de aprobación
```

**Autónomo:**

```
Para CADA step del plan:
  if operación dentro del sandbox → ALLOW
  if operación fuera del sandbox → evalúa política normal

El Orchestrator:
  1. Ejecuta todo automáticamente
  2. Solo pide aprobación si el step requiere acceso fuera del sandbox
  3. Útil para CI/CD y entornos aislados
```

---

## Tools Registry

El Tools Registry es el **catálogo de capacidades** del sistema. Cada tool es una función atómica que puede ejecutarse en un runner específico.

### Descriptor tool.yaml

Cada tool se define con un archivo YAML:

```yaml
name: run_sql_query
version: 1.0.0
description: Ejecuta una consulta SQL en una base de datos corporativa
domain: finance
author: admin@sre-team

# Runner que ejecutará esta tool
runner:
  type: data-runner
  image: cas/data-runner:1.2.0
  entrypoint: python /runner/run_sql.py

# Parámetros que acepta
parameters:
  - name: query
    type: string
    description: Consulta SQL a ejecutar. Solo SELECT permitido.
    required: true
    sensitive: false
    validation:
      pattern: "^SELECT.*"
      message: "Solo consultas SELECT están permitidas"
  - name: database
    type: string
    description: Base de datos destino
    required: true
    enum:
      - staging-finance
      - prod-finance
      - reporting
  - name: limit
    type: integer
    description: Número máximo de filas
    required: false
    default: 100
    validation:
      min: 1
      max: 10000

# Perfil de seguridad
security:
  network: outbound-only
  resources:
    cpu: "1"
    memory: "512Mi"
  timeout: 300
  risk: read
  sandbox: true

# Metadatos del contrato
contract:
  output:
    type: file
    format: csv
    max_size_mb: 50
  error_codes:
    - code: ERR_QUERY_TIMEOUT
      description: La consulta excedió el tiempo máximo
    - code: ERR_INVALID_QUERY
      description: La consulta tiene errores de sintaxis
    - code: ERR_DB_CONNECTION
      description: No se pudo conectar a la base de datos
```

### API del Registry

| Método | Ruta | Descripción | Query Params |
|---|---|---|---|
| `GET` | `/tools` | Listar todas las tools | `domain`, `runner`, `risk`, `query` (búsqueda textual) |
| `GET` | `/tools/:name` | Última versión de una tool | — |
| `GET` | `/tools/:name/:version` | Versión específica | — |
| `POST` | `/tools` | Registrar nueva tool (admin) | — |
| `PUT` | `/tools/:name/:version` | Actualizar tool (admin) | — |
| `DELETE` | `/tools/:name/:version` | Deprecar tool (admin) | — |

### Versionado Semántico

| Cambio | Ejemplo | Versión |
|---|---|---|
| Bug fix sin cambios de interfaz | Corrección de timeout | `1.0.0` → `1.0.1` |
| Nueva funcionalidad backward-compatible | Nuevo parámetro opcional | `1.0.0` → `1.1.0` |
| Cambio rompiente | Parámetro requerido eliminado | `1.0.0` → `2.0.0` |
| Cambio de seguridad | Perfil de red más restrictivo | `1.0.0` → `2.0.0` |

Las tools versionadas conviven en el registry. Los planes existentes que referencian `tool@1.0.0` siguen funcionando aunque exista `tool@2.0.0`.

### Validación al Registrar

Al registrar o actualizar una tool, el Registry valida:

1. **Schema de parámetros**: Tipos correctos, valores por defecto, enumeraciones válidas
2. **Seguridad**: Perfil de red válido, recursos dentro de límites, timeout razonable
3. **Runner**: El runner type existe y la imagen está disponible
4. **Firma de integridad**: El registro debe estar firmado con una clave de deploy
5. **No duplicados**: No puede haber dos tools con el mismo `name@version`

---

## Consideraciones de Rendimiento

### Objetivos de Latencia

| Operación | Latencia Objetivo | P99 Máximo |
|---|---|---|
| Evaluación de política (OPA) | < 2ms | < 10ms |
| Planificación con LLM | < 5s | < 15s |
| Validación de schema | < 1ms | < 5ms |
| Publicación de job en cola | < 5ms | < 20ms |
| Procesamiento de evento de runner | < 10ms | < 50ms |
| Health check | < 50ms | < 200ms |

### Throughput

El Control Plane está diseñado para manejar **decenas de Goals concurrentes** por instancia:

| Componente | Throughput Estimado | Cuello de Botella |
|---|---|---|
| API Gateway | 1000 req/s | Rate limiting + Redis |
| Orchestrator | 50 goals/s | Redis state updates |
| Planner | 10 plans/s | LLM API latency |
| Policy Engine | 10000 eval/s | OPA sidecar |
| Tools Registry | 500 queries/s | PostgreSQL reads |

### Estrategia de Escalado

- **API Gateway**: Horizontal puro detrás de load balancer. Stateless.
- **Orchestrator**: Horizontal con Redis compartido para state. Cada instancia maneja un subconjunto de Goals (sharding por goalId hash).
- **Planner**: Horizontal, stateless. Cache distribuido en Redis.
- **Policy Engine**: Sidecar por instancia de Orchestrator. Políticas cargadas desde bundle OPA.
- **Tools Registry**: Horizontal, stateless. Cache en Redis con invalidación por evento.

---

## Siguiente

Continúa con el **[Execution Plane](04-execution-plane.md)** , donde se detallan los runners, la message queue, la gestión de credenciales y el sandboxing de ejecución.

---

*Última actualización: 2026-05-31*
