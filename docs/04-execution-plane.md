# CaS — Execution Plane

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## Arquitectura General

El Execution Plane es la capa responsable de **ejecutar código de manera aislada, segura y observable**. Está compuesto por workers que consumen jobs desde una cola de mensajes, los ejecutan en entornos contenedorizados y reportan resultados de vuelta al Orchestrator.

**Principios de diseño:**

1. **Stateless**: Los runners no mantienen estado entre jobs. Todo el estado vive en el Control Plane y la Memory Layer.
2. **Aislamiento total**: Cada job se ejecuta en un contenedor Docker efímero con recursos, red y credenciales acotados.
3. **Auto-escalado**: Los runners escalan según la profundidad de la cola de mensajes.
4. **Auto-limpieza**: Los contenedores se destruyen inmediatamente después de la ejecución (éxito, fallo o timeout).

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

El Shell Runner es el runner más versátil. Ejecuta **comandos arbitrarios dentro de contenedores Docker efímeros**. Es el equivalente corporativo de ejecutar un script en terminal, pero con sandboxing, auditoría y políticas.

### Ciclo de Vida de un Job en Shell Runner

```
1. VERIFICAR         2. CREAR             3. CONFIGURAR
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

### Detalle de Cada Fase

**1. Pull Image**
- Verificar si la imagen ya está en caché local (registry mirror corporativo)
- Pull con digest (no tag) para inmutabilidad
- Timeout: 120s para pulls iniciales, 30s para cached

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
- Network profile determina conectividad (ver sección Aislamiento de Red)
- Credenciales inyectadas via vault agent sidecar o archivo temporal en `/vault/secrets/`
- Variables de entorno `CAS_*` para contexto (goalId, jobId, stepId)

**4. Run Container**
```bash
docker start -a cas-job-{jobId}
```
- `-a` attach mode para capturar stdout/stderr en tiempo real
- Timeout monitoreado por el runner. Si el contenedor excede el timeout configurado, se ejecuta `docker kill` + `docker rm -f`
- Logs se parsean línea por línea y se envían como eventos `job.log` al Orchestrator vía la cola de mensajes

**5. Collect Results**
- Exit code 0 → éxito
- Exit code != 0 → fallo
- Archivos de salida (si existen) se copian del contenedor al volumen compartido antes de destruir:
  ```bash
  docker cp cas-job-{jobId}:/output /var/cas/results/{jobId}/
  ```

**6. Destroy + Cleanup**
```bash
docker rm -f cas-job-{jobId}
docker volume rm cas-vol-{jobId}  # si aplica
```
Garantizado incluso si el proceso runner se interrumpe (mediante defer/cleanup handlers).

**7. Report Result**
Se publica un evento en la cola de mensajes (topic: `events`):

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

| Capa de Seguridad | Mecanismo | Descripción |
|---|---|---|
| **Filesystem** | `--read-only` + tmpfs para `/tmp` | El contenedor no puede modificar su propio sistema de archivos |
| **System calls** | Seccomp profile | Lista blanca de syscalls permitidas. Deniega mount, kernel modules, ptrace, etc. |
| **Mandatory Access Control** | AppArmor profile | Restringe capacidades incluso si sebypasan seccomp |
| **Linux capabilities** | `--cap-drop ALL` | Elimina todas las capabilities, luego añade solo las necesarias (e.g., `NET_BIND_SERVICE` para network outbound) |
| **User namespace** | `--userns-remap` | El proceso corre como usuario no-root dentro del contenedor |
| **Resource limits** | cgroups v2 | CPU, memoria, disco, PID máximo |
| **Network** | Perfiles: none, outbound-only, full | Control granular de conectividad |

### Resource Limits

Configuración por tool en `tool.yaml`:

```yaml
security:
  resources:
    cpu: "1"         # 1 vCPU máximo
    memory: "512Mi"   # 512 MB RAM máximo
    disk: "1Gi"       # 1 GB disco temporal
    pids: 100         # Máximo de procesos
```

Límites globales por runner:

| Recurso | Default | Máximo | Excepción |
|---|---|---|---|
| CPU | 1 vCPU | 4 vCPU | Aprobación de admin |
| RAM | 512 MB | 4 GB | Aprobación de admin |
| Disco | 1 GB | 10 GB | Aprobación de admin |
| Tiempo | 300s | 3600s | Aprobación de admin |
| Procesos | 100 | 500 | Aprobación de admin |

### Network Profiles

| Perfil | Conectividad | Casos de uso |
|---|---|---|
| `none` | Sin acceso a red | Procesamiento local de datos, cálculos, generación de reportes sin conexión externa |
| `outbound-only` | Conexiones salientes permitidas (TCP/UDP), sin listening | Consultas a DB, API calls, deploys a servicios externos |
| `full` | Acceso bidireccional completo | Debugging interactivo, migraciones con tunneling, acceso a servicios internos |

Default para la mayoría de tools: `outbound-only`.

### Logs y Streaming

Los logs del contenedor se transmiten en tiempo real al Orchestrator y de ahí al cliente final:

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

El buffering de logs se maneja con un límite de 10,000 líneas por job. Si se excede, se truncan y se notifica al usuario.

---

## CI/CD Runner

El CI/CD Runner actúa como **bridge entre CaS y los sistemas CI/CD existentes** en la organización. En lugar de reemplazar pipelines, CaS se convierte en un **frontend de alto nivel** que orquesta pipelines como steps de un Goal.

### Arquitectura

```
Goal: "Deploy versión 2.5 a producción"

Plan:
  step 1: terraform_plan (planear infraestructura)
  step 2: run_tests (CI/CD Runner → GitHub Actions)
  step 3: build_image (CI/CD Runner → GitLab CI)
  step 4: helm_deploy (Shell Runner → Kubernetes)
  step 5: smoke_tests (CI/CD Runner → Jenkins)
```

### Bridges Soportados

| Sistema | Mecanismo | Autenticación | Estado |
|---|---|---|---|
| **GitHub Actions** | `workflow_dispatch` API + `repository_dispatch` | Token de acceso (GH App) | Polling con check_run API |
| **GitLab CI** | Pipeline trigger API con variables | Trigger token | Polling con pipeline status API |
| **Jenkins** | Webhook + Remote Build Token | API token + HMAC | Callback vía webhook |
| **Azure DevOps** | Pipelines REST API + Run Pipeline | PAT token | Polling con Run status API |
| **ArgoCD** | Application Set API + Sync | API token SSO | Polling con Application status |

### Mapeo de Estados

| Estado del Pipeline CaS | Estado CI/CD |
|---|---|
| `pending` | — (job no publicado aún) |
| `running` | `queued`, `in_progress`, `pending` |
| `completed` | `success`, `completed` |
| `failed` | `failure`, `cancelled`, `timed_out` |
| `timeout` | `timed_out` (o timeout del job CaS) |

### Ejemplo: Bridge GitHub Actions

```typescript
// CI/CD Runner — GitHub Actions Bridge
async function executeGitHubActionJob(job: Job): Promise<JobResult> {
  // 1. Disparar workflow
  const dispatch = await github.actions.createWorkflowDispatch({
    owner: 'empresa',
    repo: 'infra-deploy',
    workflow_id: 'deploy.yaml',
    ref: 'main',
    inputs: {
      environment: job.parameters.environment,
      version: job.parameters.version,
      cas_job_id: job.jobId
    }
  });

  // 2. Esperar a que el workflow corra (polling)
  const runId = await pollForRun(job.jobId);
  
  // 3. Monitorear progreso
  while (status !== 'completed') {
    const run = await github.actions.getWorkflowRun({ runId });
    status = run.data.status;
    conclusion = run.data.conclusion;
    
    // Reenviar logs de GitHub Actions a CaS
    const logs = await github.actions.downloadWorkflowRunLogs({ runId });
    await publishEvent('job.log', { data: logs });
    
    await sleep(5000);
  }

  // 4. Retornar resultado
  return {
    exitCode: conclusion === 'success' ? 0 : 1,
    artifacts: [`https://github.com/empresa/infra-deploy/actions/runs/${runId}`]
  };
}
```

---

## Data Runner

El Data Runner está especializado para **jobs de análisis de datos, ETL y reporting**. Su imagen base incluye las herramientas más comunes del ecosistema Python de datos.

### Imagen Base

```dockerfile
FROM python:3.12-slim

# Herramientas de datos
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

### Tipos de Jobs Soportados

| Tipo | Descripción | Output Típico |
|---|---|---|
| `sql_query` | Ejecutar consulta SQL y devolver resultados | CSV, Parquet |
| `etl` | Extraer, transformar y cargar datos | Tabla actualizada en DB |
| `report` | Generar reporte con gráficos y tablas | PDF, Excel, HTML |
| `analysis` | Análisis exploratorio de datos | Notebook (Jupyter .ipynb) |
| `ml_inference` | Ejecutar inferencia con modelo pre-entrenado | JSON con predicciones |

### Conexiones a Bases de Datos

Las credenciales de bases de datos se gestionan exclusivamente a través de **Vault**:

```python
# runner.py — conexión automática vía Vault Agent
import os
import json
import pandas as pd
from sqlalchemy import create_engine

def get_db_connection(database_name):
    """Obtiene conexión a DB usando credenciales de Vault Agent."""
    vault_path = f"/vault/secrets/{database_name}"
    
    with open(f"{vault_path}/host") as f:
        host = f.read().strip()
    with open(f"{vault_path}/port") as f:
        port = f.read().strip() 
    with open(f"{vault_path}/username") as f:
        username = f.read().strip()
    with open(f"{vault_path}/password") as f:
        password = f.read().strip()
    
    conn_str = f"postgresql://{username}:{password}@{host}:{port}/{database_name}"
    return create_engine(conn_str)

# Uso en el job
engine = get_db_connection("reporting")
df = pd.read_sql("SELECT * FROM revenue WHERE month = 'mayo-2026'", engine)
df.to_csv("/output/reporte_mayo.csv", index=False)
```

### Output del Data Runner

El Data Runner puede producir múltiples formatos de output:

| Formato | Content-Type | Uso |
|---|---|---|
| CSV | `text/csv` | Datos tabulares para procesamiento posterior |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Reportes para stakeholders |
| PDF | `application/pdf` | Reportes formateados |
| HTML | `text/html` | Dashboards embebidos |
| Parquet | `application/parquet` | Datos columnar para big data |
| JSON | `application/json` | APIs y consumo programático |

---

## Message Queue (BullMQ / RabbitMQ)

La cola de mensajes es el **sistema circulatorio** que conecta el Control Plane con el Execution Plane. Desacopla la publicación de jobs de su ejecución, permitiendo que cada lado escale independientemente.

### Topología

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
│  │  Jobs que excedieron retry count o timeout máximo   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Configuración (BullMQ con Redis)

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';

// Cola de jobs
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
      age: 3600 * 24,  // 24 horas
      count: 1000
    },
    removeOnFail: {
      age: 3600 * 24 * 7  // 7 días
    }
  }
});

// Worker de shell runner
const shellWorker = new Worker('jobs', async (job) => {
  const { tool, parameters, credentialsRef, timeout } = job.data;
  
  // Solo procesar jobs para shell-runner
  if (job.data.runnerType !== 'shell-runner') {
    return; // Otro worker lo procesará
  }
  
  return await executeShellJob(job.data);
}, {
  connection: { /* ... */ },
  concurrency: 10,        // 10 jobs simultáneos por worker
  maxStalledCount: 3,     // Permite 3 stalls antes de DLQ
  stalledInterval: 30000, // Check de stall cada 30s
  lockDuration: 60000     // Lock de 60s por job
});
```

### Prioridades

Algunos jobs pueden tener prioridad sobre otros:

| Prioridad | Rango | Ejemplos |
|---|---|---|
| **Crítica** | 1 | Rollbacks, hotfixes, security patches |
| **Alta** | 2 | Deploys aprobados, migraciones urgentes |
| **Normal** | 3 | Goals de usuario regular (default) |
| **Baja** | 4 | Reportes nocturnos, tareas batch |

```typescript
await jobsQueue.add('job', jobData, {
  priority: 1  // Crítica
});
```

### Dead Letter Queue

Jobs que entran en DLQ:

1. Excedieron `attempts` (3 intentos por defecto)
2. Timeout excedido sin respuesta
3. Worker stall detectado 3 veces
4. Error no recuperable (imagen no encontrada, credenciales inválidas)

Los jobs en DLQ se almacenan con metadata de diagnóstico:

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

### Observabilidad de la Cola

| Métrica | Descripción | Exportación |
|---|---|---|
| `mq.queue_depth` | Jobs esperando ser procesados | Prometheus |
| `mq.active_jobs` | Jobs en ejecución | Prometheus |
| `mq.wait_time_ms` | Tiempo que un job espera en cola | Prometheus (histogram) |
| `mq.job_duration_ms` | Duración de ejecución de jobs | Prometheus (histogram) |
| `mq.dlq_count` | Jobs en Dead Letter Queue | Prometheus |
| `mq.retry_rate` | Proporción de jobs que requieren retry | Prometheus |

---

## Gestión de Credenciales

CaS integra **HashiCorp Vault** como backend central de secrets management. Las credenciales nunca se almacenan en código, variables de entorno del runner, ni logs.

### Arquitectura Vault

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

### Flujo de Credenciales

```
1. Orchestrator prepara job
   ─ Crea policy scoped: path "db/reporting/readonly" + TTL = job_timeout
   ─ Crea token con esa policy
   ─ Almacena referencia: credentialsRef = "vault://db/reporting/readonly?token=..."

2. Runner recibe job
   ─ Vault Agent (sidecar) autentica con su propio token
   ─ Solicita credenciales a Vault usando el credentialsRef
   ─ Vault valida el token scoped + policy
   ─ Vault retorna credenciales dinámicas (username, password, host, port)
   ─ Vault Agent escribe en /vault/secrets/{db_name}/ (archivos)

3. Runner ejecuta job
   ─ El entrypoint lee los archivos en /vault/secrets/
   ─ Establece conexión con las credenciales
   ─ Ejecuta la operación

4. Post-ejecución
   ─ Vault revoca automáticamente el token scoped (TTL expirado)
   ─ Runner limpia /vault/secrets/
   ─ No quedan credenciales en el sistema
```

### Principios de Secrets Management

1. **Nunca en variables de entorno**: Las variables de entorno pueden leakearse en logs, dumps de proceso, etc.
2. **Tokens dinámicos**: Cada job recibe un token único con TTL = duración del job + 30s de margen.
3. **Scoped policies**: El token solo puede acceder a las rutas estrictamente necesarias para el job.
4. **Rotación automática**: Las credenciales de bases de datos se rotan post-ejecución.
5. **No secrets en logs**: El runner filtra cualquier línea de log que coincida con patrones de secretos (contraseñas, tokens, claves).

---

## Consideraciones Operativas

### Auto-escalado de Runners

Los runners se despliegan como Deployments en Kubernetes con auto-escalado basado en:

| Métrica | Threshold | Acción |
|---|---|---|
| Profundidad de cola | > 10 jobs por worker | +1 worker |
| Latencia de job | > 80% del timeout | +1 worker |
| CPU del worker | > 70% por 5 min | +1 worker |
| Cola vacía por 5 min | — | Scale down gradual |

### Health Checks

Cada runner expone endpoints de health check:

| Endpoint | Descripción |
|---|---|
| `GET /health` | Estado general del runner |
| `GET /health/queue` | Conexión a la cola de mensajes |
| `GET /health/docker` | Docker daemon disponible |
| `GET /health/vault` | Conexión a Vault |
| `GET /metrics` | Métricas Prometheus |

### Networking

- Los runners se ejecutan en una **subred aislada** dentro del cluster Kubernetes
- Solo el API Gateway y la Message Queue son accesibles desde fuera de la subred
- El tráfico de salida pasa por un **proxy de salida** (e.g., Squid) que aplica whitelist de dominios
- El tráfico a bases de datos internas usa **Vault + certificados TLS mutuos**

---

## Siguiente

Continúa con **[Memoria y Contexto](05-memory-and-context.md)** , donde se detalla el sistema de persistencia, búsqueda semántica y los patrones de escritura/lectura de memoria organizacional y de proyecto.

---

*Última actualización: 2026-05-31*
