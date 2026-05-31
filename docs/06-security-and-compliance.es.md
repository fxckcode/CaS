# CaS — Seguridad y Compliance

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## Principios de Seguridad

CaS se construye sobre cuatro principios fundamentales de seguridad que guían cada decisión arquitectónica:

### 1. Least Privilege (Mínimo Privilegio)

Cada componente del sistema recibe **únicamente los permisos necesarios** para cumplir su función y nada más.

- **Runners**: Cada job recibe credenciales scoped con TTL igual a la duración del job. Al terminar, las credenciales se revocan automáticamente.
- **Planes**: Cada step del plan solo puede acceder a las tools y recursos que necesita. Un step de consulta SQL no puede ejecutar deploys.
- **Usuarios**: Cada usuario tiene roles que limitan qué domains, tools y entornos puede operar.

### 2. Defense in Depth (Defensa en Profundidad)

No existe un único punto de fallo de seguridad. Múltiples capas deben ser violadas para que un ataque tenga éxito:

```
Capa 1: Autenticación (OIDC/JWT) ─── Quién eres
Capa 2: Autorización (Policy Engine) ─── Qué puedes hacer
Capa 3: Sandboxing (Contenedores) ─── Dónde lo haces
Capa 4: Network Isolation ─── Con qué te conectas
Capa 5: Credential Scoping ─── Con qué credenciales
Capa 6: Audit Trail ─── Qué quedó registrado
Capa 7: Data Governance ─── Qué datos ves
```

### 3. Separation of Concerns (Separación de Responsabilidades)

El principio más importante de la arquitectura CaS:

- **Control Plane** nunca ejecuta código. Solo orquesta, planifica y evalúa políticas.
- **Execution Plane** nunca decide políticas. Solo ejecuta lo que recibe y reporta resultados.
- **Memory Layer** nunca expone datos sin autorización. Solo responde consultas autenticadas.
- **Interface Layer** nunca contiene lógica de negocio. Solo presenta y recolecta.

Esto significa que incluso si un runner es comprometido, el atacante no puede modificar políticas, acceder a memoria de otros proyectos, ni ejecutar operaciones no autorizadas.

### 4. Auditability (Auditabilidad)

Toda acción en el sistema es registrada con contexto completo:

- Qué se ejecutó (tool + parámetros)
- Quién lo solicitó (userId + rol)
- Quién lo aprobó (si aplica)
- Qué decidió el policy engine
- Cuándo ocurrió (timestamp)
- Qué resultado tuvo (éxito/fallo/error)

El audit trail es **inmutable, append-only y firmado con hash chain**.

---

## Modos de Autonomía

CaS ofrece tres modos de autonomía para balancear productividad vs. control. El modo se define por Goal (no global) y puede ser restringido por políticas organizacionales.

### Comparación de Modos

| Aspecto | Consultivo | Semi-autónomo | Autónomo |
|---|---|---|---|
| **Aprobación requerida** | Cada step no-lectura | Steps de alto riesgo | Solo fuera del sandbox |
| **Velocidad** | Lenta | Media | Rápida |
| **Control** | Máximo | Balanceado | Mínimo |
| **Caso de uso** | Producción, finance | DevOps diario | CI/CD, sandbox |
| **Riesgo** | Bajo | Medio | Alto |
| **Supervisión humana** | Constante | Selectiva | Mínima |

### Consultivo

El modo más restrictivo. Diseñado para entornos con cumplimiento normativo estricto (finance, healthcare, government).

```
Flujo:
1. Usuario crea Goal → Orchestrator planifica
2. Cada step del plan es evaluado por Policy Engine
3. Si el step no es de solo lectura → REQUIRE_APPROVAL
4. Orchestrator pausa el plan
5. Usuario recibe notificación: "Step 2/5 requiere aprobación"
6. Usuario (o approver designado) revisa: tool, parámetros, entorno
7. Aprueba o deniega
8. Si aprueba → step ejecutado → loop al paso 2 para el siguiente step
9. Si deniega → Goal FAILED

Ejemplo:
Goal: "Ejecutar script de migración en staging"
  step 1: run_shell("pg_dump staging") → solo lectura → ALLOW automático
  step 2: db_migrate(up, staging) → escritura → REQUIRE_APPROVAL
  → Usuario revisa y aprueba
  step 3: run_shell("verify data") → solo lectura → ALLOW automático
  step 4: notify("migración completada") → escritura → REQUIRE_APPROVAL
  → Usuario revisa y aprueba
```

### Semi-autónomo

El modo por defecto. Balancea productividad con control mediante clasificación de riesgo.

```
Flujo:
1. Usuario crea Goal → Orchestrator planifica
2. Cada step es evaluado con reglas de riesgo:
   - risk=low (lectura, dev) → ALLOW automático
   - risk=medium (escritura en dev, lectura en prod) → ALLOW automático
   - risk=high (escritura en prod, deploy, delete) → REQUIRE_APPROVAL
3. Steps de bajo/medio riesgo se ejecutan inmediatamente
4. Steps de alto riesgo pausan el plan y notifican
5. Usuario aprueba en lote o step por step
6. Continúa ejecución

Ejemplo:
Goal: "Deploy versión 2.5 a staging y luego a producción"
  step 1: build_image(version 2.5) → risk=medium (staging) → ALLOW
  step 2: helm_deploy(staging, version 2.5) → risk=medium → ALLOW
  step 3: run_tests(staging) → risk=low → ALLOW
  step 4: helm_deploy(prod, version 2.5) → risk=high (escritura en prod) → REQUIRE_APPROVAL
  → Usuario notificado: "¿Aprobar deploy a producción?"
  → Usuario aprueba
  step 5: smoke_tests(prod) → risk=low → ALLOW
```

### Autónomo

Modo sin fricción. Diseñado para entornos aislados (CI/CD, dev sandbox, herramientas internas).

```
Flujo:
1. Usuario crea Goal → Orchestrator planifica
2. Policy Engine evalúa pasos:
   - Operación dentro del sandbox de la tool → ALLOW
   - Operación que requiere acceso fuera del sandbox → evalúa normalmente
3. Todo se ejecuta automáticamente
4. Únicamente pasos que escapan el sandbox pueden requerir aprobación

Ejemplo:
Goal: "Ejecutar tests unitarios y generar reporte de cobertura" (sandbox)
  → Todos los steps son ALLOW → ejecución automática completa

Goal: "Modificar config de producción desde CI/CD" (sandbox + prod)
  → step 1: shell("run tests") → sandbox → ALLOW
  → step 2: kubectl_apply(prod, config.yaml) → fuera del sandbox → evalúa política
```

---

## Policy Engine (OPA/Rego)

El Policy Engine usa **OPA (Open Policy Agent)** con el lenguaje **Rego** para definir y evaluar políticas de seguridad.

### Estructura de Políticas

Las políticas se organizan en paquetes por dominio y tipo:

```
policies/
├── cas/
│   ├── policies.rego          # Reglas globales
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
    └── tools_by_domain.json   # Catálogo de tools por dominio
```

### Reglas Globales (cas/policies.rego)

```rego
package cas.policies

import future.keywords.if
import future.keywords.in

# Denegar por defecto
default allow := false
default require_approval := false
default deny := false

# ==========================================
# Reglas de Denegación Explícita
# ==========================================

# Tool no disponible para el dominio
deny if {
    not data.tools_by_domain[input.domain][input.tool.name]
}

# Usuario baneado o suspendido
deny if {
    data.suspended_users[input.user]
}

# Horario restringido para operaciones de escritura en prod
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

### Reglas por Rol (cas/roles/admin.rego)

```rego
package cas.roles.admin

import future.keywords.if

# Admin puede todo en dev y staging
allow if {
    input.role == "admin"
    input.environment in ["dev", "staging"]
}

# Admin necesita aprobación para escritura en prod
require_approval if {
    input.role == "admin"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}
```

### Reglas por Dominio (cas/domains/finance.rego)

```rego
package cas.domains.finance

import future.keywords.if
import future.keywords.in

# Analysts solo lectura en finance
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
}

# Cualquier escritura en finance requiere aprobación
require_approval if {
    input.domain == "finance"
    input.tool.type in ["write", "execute"]
}

# Prohibir exportación de datos de finance a destinos no aprobados
deny if {
    input.domain == "finance"
    input.tool.name == "send_email"
    not data.approved_export_destinations[input.parameters.to]
}
```

### Break-Glass (Emergency Override)

Para situaciones de emergencia (incidente de seguridad, caída de producción), CaS soporta un mecanismo **break-glass** que permite bypass temporal de políticas:

```rego
package cas.exceptions.emergency

import future.keywords.if

# Usuarios con rol emergency_responder pueden operar fuera de política
allow if {
    data.emergency_active == true
    input.user in data.emergency_responders
    input.user in data.current_incident_team
}

# Break-glass requiere justificación + doble aprobación post-hoc
audit.emergency_override if {
    data.emergency_active == true
    input.user in data.emergency_responders
}
```

**Activación de break-glass:**

1. Usuario con rol `emergency_responder` activa el modo
2. Se registra en el audit trail con razón y timestamp
3. Las restricciones se relajan por máximo 60 minutos
4. Post-incidente, se requiere justificación formal y revisión de seguridad

---

## Auditoría

El sistema de auditoría registra **toda acción** ejecutada en CaS de forma inmutable.

### Tabla AuditEvent

```sql
CREATE TABLE audit_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Quién
    user_id         TEXT NOT NULL,
    user_role       TEXT,
    session_id      TEXT,
    
    -- Qué
    goal_id         TEXT,
    plan_id         TEXT,
    job_id          TEXT,
    action          TEXT NOT NULL,      -- "run_sql_query", "kubectl_apply", etc.
    parameters      JSONB,              -- Parámetros con los que se ejecutó
    
    -- Política
    policy_decision TEXT NOT NULL CHECK (
        policy_decision IN ('ALLOW', 'DENY', 'REQUIRE_APPROVAL')
    ),
    policy_reason   TEXT,
    policy_rules    TEXT[],             -- Reglas Rego que aplicaron
    
    -- Aprobación
    approver        TEXT,               -- Quién aprobó (NULL si auto)
    approval_note   TEXT,
    
    -- Resultado
    result          TEXT NOT NULL CHECK (
        result IN ('SUCCESS', 'FAILURE', 'TIMEOUT', 'CANCELLED', 'DENIED')
    ),
    error_message   TEXT,
    duration_ms     INTEGER,
    
    -- Hash chain
    previous_hash   TEXT NOT NULL,
    current_hash    TEXT NOT NULL,
    
    -- Metadatos
    environment     TEXT,
    domain          TEXT,
    metadata        JSONB DEFAULT '{}'
);

-- Índices para consultas de auditoría
CREATE INDEX idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX idx_audit_user ON audit_events(user_id);
CREATE INDEX idx_audit_goal ON audit_events(goal_id);
CREATE INDEX idx_audit_action ON audit_events(action);
CREATE INDEX idx_audit_policy ON audit_events(policy_decision);
```

### Hash Chain

Cada evento de auditoría está enlazado criptográficamente al anterior, haciendo imposible la modificación retroactiva:

```
event_1: previous_hash = "0000..." (genesis)
         current_hash = SHA256(event_1_data + previous_hash)

event_2: previous_hash = current_hash(event_1)
         current_hash = SHA256(event_2_data + previous_hash)

event_3: previous_hash = current_hash(event_2)
         current_hash = SHA256(event_3_data + previous_hash)
```

**Verificación de integridad:**

```sql
-- Consulta para verificar que la cadena no ha sido alterada
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

### Consultas de Auditoría

```sql
-- ¿Qué hizo el usuario jdoe en las últimas 24 horas?
SELECT timestamp, action, parameters, policy_decision, result
FROM audit_events
WHERE user_id = 'jdoe'
    AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- ¿Cuántas operaciones fueron denegadas por política?
SELECT policy_reason, COUNT(*) as count
FROM audit_events
WHERE policy_decision = 'DENY'
    AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY policy_reason
ORDER BY count DESC;

-- ¿Quién aprobó operaciones en producción la última semana?
SELECT approver, COUNT(*) as approvals
FROM audit_events
WHERE environment = 'prod'
    AND policy_decision = 'REQUIRE_APPROVAL'
    AND result = 'SUCCESS'
    AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY approver;
```

---

## Aislamiento de Red

El Execution Plane implementa aislamiento de red mediante tres perfiles configurables por tool.

### Perfiles de Red

| Perfil | Descripción | Inbound | Outbound | Ejemplos de tool |
|---|---|---|---|---|
| `none` | Sin red | Bloqueado | Bloqueado | `run_python` (cálculo local), `render_report` |
| `outbound-only` | Solo salida | Bloqueado | Permitido | `run_sql_query`, `kubectl_apply`, `api_call` |
| `full` | Bidireccional | Permitido | Permitido | `debug_session`, `db_tunnel`, `migration` |

### Implementación en Docker

```bash
# none — sin red
docker run --network none ...

# outbound-only — solo conexiones salientes
docker run --network bridge --publish-all=false ...

# full — acceso completo
docker run --network host ...
# O con bridge + puertos específicos mapeados
docker run --network bridge -p 8080:8080 ...
```

### Default: outbound-only

El 90% de las tools usan `outbound-only`. Esto permite:
- Consultar bases de datos
- Hacer API calls a servicios internos
- Ejecutar deploys a Kubernetes

Pero impide:
- Recibir conexiones entrantes (no hay servidores listening en el runner)
- Escanear la red interna
- Actuar como punto de pivot para ataques

### Proxy de Salida

Todo el tráfico outbound pasa por un **proxy forward** (Squid, mitmproxy) que:

1. **Whitelist de destinos**: Solo dominios/IPs autorizados
2. **Inspección TLS**: Tráfico HTTPS descifrado y re-inspeccionado
3. **Rate limiting**: Límite de requests por job
4. **Logging**: Todas las conexiones registradas en audit trail
5. **Filtrado de contenido**: Bloqueo de descargas de ejecutables, payloads sospechosos

```yaml
# proxy-policies.yaml
proxy:
  whitelist:
    - "*.internal.empresa.com"         # Servicios internos
    - "api.github.com"                 # GitHub API
    - "registry-1.docker.io"           # Docker Hub (pulls)
    - "*.googleapis.com"               # GCP APIs
    - "database.empresa.com:5432"      # PostgreSQL corporativo
  
  blacklist:
    - "*.pastebin.com"
    - "*.file.io"
    - "192.168.0.0/16"                # Red interna no autorizada
    - "10.0.0.0/8"
  
  rate_limit:
    max_requests: 1000
    window_seconds: 60
  
  tls_inspection: true                   # MITM para tráfico HTTPS
```

---

## Secrets Management

CaS integra **HashiCorp Vault** como backend central de secrets. Las credenciales nunca se almacenan en código, variables de entorno, logs ni archivos de configuración.

### Jerarquía de Secretos en Vault

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

### Políticas de Vault

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

# Policy: job-execution (scoped por TTL)
path "secret/data/cas/org_*/db/*" {
  capabilities = ["read"]
}
# TTL máximo: 300 segundos (duración máxima de job)
```

### Rotación Automática

Para bases de datos PostgreSQL, CaS usa **Vault Dynamic Secrets**:

```hcl
# Configuración de rotación de DB
path "database/creds/cas-reporting-role" {
  capabilities = ["read"]
  # TTL: 5 minutos (duración típica de job)
  # Max TTL: 30 minutos
}
```

Cuando el runner solicita credenciales, Vault:
1. Crea un usuario temporal en PostgreSQL
2. Concede solo los permisos necesarios (READ en tablas específicas)
3. Asigna TTL de 5 minutos
4. Revoca automáticamente al expirar el TTL

---

## Data Governance

### Clasificación de Datos

CaS soporta un sistema de **catálogos de sensibilidad** que determinan qué datos puede ver cada rol:

| Nivel de Sensibilidad | Descripción | Roles con Acceso | Ejemplo |
|---|---|---|---|
| **Público** | Datos no sensibles | Todos | Documentación, métricas de uptime |
| **Interno** | Datos internos de la empresa | Todos los empleados | Reportes de equipo, dashboards internos |
| **Confidencial** | Datos sensibles de negocio | Equipo autorizado | Datos financieros, estrategia de producto |
| **Restringido** | Datos altamente sensibles | Roles específicos + justificación | PII de clientes, secretos comerciales |
| **Crítico** | Datos con implicaciones legales | Aprobación explícita + audit trail completo | Datos bancarios, historial médico |

### PII Detection

Los logs y outputs de los runners pasan por un **filtro de PII** (Personally Identifiable Information) que:

1. Detecta patrones de PII: emails, teléfonos, direcciones, SSN, números de tarjeta
2. Redacta automáticamente: reemplaza con `[REDACTED]`
3. Registra la redacción en audit trail: cuántas instancias, qué tipo

```python
# PII Redaction Filter (implementado en el runner agent)
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

### Compliance por Marco Regulatorio

| Marco | Requisito | Implementación en CaS |
|---|---|---|
| **SOC2** | Audit trail completo | Hash chain inmutable de eventos |
| **SOC2** | Access controls | Policy Engine + OIDC + roles |
| **GDPR** | Right to deletion | Delete cascade en MemoryItems + Audit trail anonymization |
| **GDPR** | Data portability | Export de MemoryItems en JSON |
| **SOX** | Approval workflows | Modo consultivo + REQUIRE_APPROVAL |
| **SOX** | Segregación de duties | Separation of concerns entre planos |
| **PCI DSS** | Cardholder data protection | PII detection + redaction automática |
| **PCI DSS** | Access control | Network isolation + credential scoping |

---

## Monitoreo de Seguridad

### Alertas Automáticas

| Evento | Severidad | Acción | Canal |
|---|---|---|---|
| 5+ DENY consecutivos del mismo usuario | Media | Notificar al equipo de seguridad | Slack + Email |
| Break-glass activado | Alta | Notificar inmediatamente | PagerDuty + Slack |
| Job con patrones de ataque (SQL injection, RCE) | Crítica | Bloquear tool, notificar SOC | PagerDuty |
| Token Vault no renovado | Alta | Deshabilitar runner | Slack |
| Hash chain inválida | Crítica | Congelar sistema, notificar SOC | PagerDuty |

### Métricas de Seguridad (Prometheus)

| Métrica | Descripción |
|---|---|
| `cas.security.denies_total` | Total de operaciones denegadas |
| `cas.security.approvals_required` | Operaciones que requirieron aprobación |
| `cas.security.approval_time_seconds` | Tiempo hasta aprobación/denegación |
| `cas.security.break_glass_active` | 1 si break-glass está activo |
| `cas.security.pii_redactions_total` | Instancias de PII redactadas |
| `cas.security.chain_integrity` | 1 si hash chain es válida |

---

## Siguiente

Continúa con las **[Verticales de Dominio](07-domain-verticals.md)** , donde se describe cómo especializar CaS para dominios de negocio específicos (DevOps, Marketing, Finance) con vocabulario propio, mapeo de tareas a tools y políticas específicas.

---

*Última actualización: 2026-05-31*
