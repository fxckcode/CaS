# CaS — Verticales de Dominio

**CLI as a Service Reference Architecture**

- **Licencia:** MIT
- **Repositorio:** [github.com/fxckcode/CaS](https://github.com/fxckcode/CaS)
- **Última actualización:** 2026-05-31

---

## Concepto

Una **vertical** en CaS es una especialización del sistema para un dominio de negocio específico. No es un producto separado ni un fork — es una **configuración empaquetada** que incluye:

1. **Vocabulario de tareas de negocio** — Un mini-DSL que permite a los usuarios de ese dominio expresar Goals en su propio lenguaje
2. **Mapeo de tareas a tools** — Cómo las tareas de alto nivel se traducen a secuencias de tools atómicas del registry
3. **KPIs de dominio** — Métricas de éxito que van más allá de "job succeeded" (ej: "reporte generado en < 30s", "deploy con 0 downtime")
4. **Policies específicas** — Reglas OPA adaptadas a los riesgos y requisitos del dominio
5. **Ejemplos documentados** — Goals canónicos que los usuarios pueden copiar y adaptar

### Estructura de una Vertical

Cada vertical vive en una estructura de directorios dentro del repositorio de configuración de CaS:

```
verticals/
├── devops/
│   ├── vertical.yaml          # Metadatos de la vertical
│   ├── vocabulary.yaml        # Tareas de negocio → tools
│   ├── kpis.yaml              # Definiciones de KPIs
│   ├── policies/
│   │   ├── deploy.rego        # Políticas de deploy
│   │   └── access.rego        # Políticas de acceso
│   └── examples/
│       ├── deploy-service.md
│       └── migrate-database.md
├── marketing/
│   └── ...
└── finance/
    └── ...
```

### Archivo vertical.yaml

```yaml
name: devops
display_name: DevOps
description: Operaciones de infraestructura, deploy y CI/CD
version: 1.0.0
author: sre-team@empresa.com

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

## Cómo Crear una Vertical

Crear una vertical nueva sigue un proceso de 5 pasos:

### Paso 1: Definir el Vocabulario

Identificar las **tareas de negocio** que los usuarios de ese dominio quieren expresar en lenguaje natural. Cada tarea se documenta con:

- **Nombre**: Verbo + objeto (e.g., "generar reporte semanal", "migrar base de datos")
- **Descripción**: Qué hace la tarea en lenguaje de negocio
- **Ejemplos de Goals**: Frases que un usuario escribiría
- **Parámetros de dominio**: Variables específicas del dominio (e.g., "presupuesto máximo" para marketing)

```yaml
# vocabulary.yaml (ejemplo para Finance)
tasks:
  - name: generar_reporte_financiero
    description: Genera un reporte financiero con datos de ingresos, gastos y proyecciones
    examples:
      - "Genera el reporte financiero del mes de mayo"
      - "Prepara el reporte de Q2 para el equipo directivo"
      - "Ejecuta el cierre mensual y genera los reportes asociados"
    parameters:
      - name: periodo
        type: string
        description: Período del reporte (ej: "mayo-2026", "Q2-2026")
        required: true
      - name: tipo_reporte
        type: string
        enum: [completo, ejecutivo, detallado]
        default: completo
  
  - name: reconciliar_cuentas
    description: Reconoce y concilia movimientos contables entre sistemas
    examples:
      - "Reconcilia las cuentas de abril entre SAP y QuickBooks"
      - "Ejecuta la reconciliación mensual de ingresos"
    parameters:
      - name: mes
        type: string
        required: true
      - name: fuentes
        type: string[]
        default: [sap, quickbooks]
```

### Paso 2: Mapear Tareas a Tools

Cada tarea de negocio se traduce a una **secuencia de tools** del Tools Registry. El mapeo puede ser:

- **1:1** — Una tarea = una tool (simple, directo)
- **1:N** — Una tarea = varias tools en secuencia (compuesto)
- **M:N** — Una tarea puede resolverse con diferentes combinaciones de tools (flexible)

```yaml
# vocabulary.yaml (continuación)
mappings:
  - task: generar_reporte_financiero
    strategies:
      # Estrategia principal: vía SQL + Python + render
      - priority: 1
        steps:
          - tool: run_sql_query
            parameters:
              query: "SELECT * FROM revenue WHERE month = '{periodo}'"
              database: reporting
          - tool: run_python
            parameters:
              script: "generar_graficos.py --periodo {periodo}"
          - tool: render_report
            parameters:
              template: "financial_report"
              format: pdf
              output: "/output/reporte-{periodo}.pdf"
          - tool: send_email
            parameters:
              to: "finance-team@empresa.com"
              subject: "Reporte financiero {periodo}"
              attachment: "/output/reporte-{periodo}.pdf"
      
      # Estrategia alternativa: usar API de BI tool existente
      - priority: 2
        steps:
          - tool: api_call
            parameters:
              url: "https://bi.internal.empresa.com/api/reports"
              method: POST
              body: |
                {
                  "template": "monthly_financial",
                  "period": "{periodo}",
                  "format": "pdf"
                }
```

### Paso 3: Definir KPIs de Dominio

Los KPIs de dominio reemplazan las métricas genéricas de "job succeeded" con métricas significativas para el negocio:

```yaml
# kpis.yaml (Finance)
kpis:
  - name: report_accuracy
    description: Precisión de los datos del reporte vs. fuente de verdad
    measurement: compare_rows(reporte.generated, fuente_verdad)
    target: "> 99.9%"
    alert: "< 99.5%"
  
  - name: report_generation_time
    description: Tiempo desde que se solicita el reporte hasta que se entrega
    measurement: goal.completed_at - goal.created_at
    target: "< 30s"
    alert: "> 60s"
  
  - name: reconciliation_time
    description: Tiempo para reconciliar un mes de datos
    measurement: promedio de duración de goals de reconciliación
    target: "< 5 min"
    alert: "> 15 min"
  
  - name: forecast_error_rate
    description: Diferencia entre pronóstico y datos reales
    measurement: MAPE(forecast, actual)
    target: "< 5%"
    alert: "> 10%"
```

### Paso 4: Configurar Policies Específicas del Dominio

```rego
# policies/finance/operations.rego
package cas.domains.finance

import future.keywords.if

# Analysts solo pueden leer datos agregados
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
    input.tool.name != "run_sql_query"  # No SQL directo para analysts
}

# Analysts pueden usar reportes predefinidos
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.name == "render_report"
}

# Contadores pueden hacer consultas SQL detalladas
allow if {
    input.role == "accountant"
    input.domain == "finance"
    input.tool.type in ["read", "execute"]
}

# Cualquier escritura en finance requiere aprobación + justificación
require_approval if {
    input.domain == "finance"
    input.tool.type in ["write", "execute"]
}

# Exportación de datos financieros solo a destinos aprobados
deny if {
    input.domain == "finance"
    input.tool.name == "send_email"
    not data.finance_approved_destinations[input.parameters.to]
}

# Data de producción finance no puede salir del país
deny if {
    input.domain == "finance"
    input.environment == "prod"
    input.tool.name == "run_sql_query"
    contains(input.parameters.query, "SELECT")
    data.finance_pii_tables[input.parameters.table]
}
```

### Paso 5: Documentar Ejemplos

Cada vertical incluye Goals de ejemplo que los usuarios pueden copiar directamente:

```markdown
# Ejemplo: Deploy a producción con blue-green

## Goal
```
Deploy versión 2.5 del servicio de pagos a producción usando el
patrón blue-green. Verificar health checks antes de cortar tráfico.
```

## Comportamiento esperado
1. Build de la imagen Docker con tag v2.5
2. Deploy a entorno green en Kubernetes
3. Health check en el green (timeout: 60s)
4. Si health check pasa → cortar tráfico a green
5. Si health check falla → rollback automático a blue
6. Notificar al equipo en Slack

## Políticas aplicables
- Deploy a prod requiere aprobación (modo semi-autónomo)
- Rollback es automático (no requiere aprobación)
- Health check obligatorio antes de corte de tráfico

## Tiempo estimado: 3-5 minutos
```

---

## Vertical: DevOps

La vertical de DevOps es la más común y la que viene pre-configurada en CaS. Cubre operaciones de infraestructura, deploy, CI/CD y administración de sistemas.

### Vocabulario

| Tarea de Negocio | Descripción | Tools |
|---|---|---|
| `deploy_service` | Desplegar una nueva versión de un servicio | `docker_build`, `helm_deploy`, `kubectl_apply`, `smoke_test` |
| `rollback_deploy` | Revertir un deploy a una versión anterior | `helm_rollback`, `kubectl_rollout_undo` |
| `migrate_database` | Ejecutar migraciones de base de datos | `db_migrate`, `run_shell` (backup), `verify_data` |
| `scale_service` | Escalar horizontalmente un servicio | `kubectl_scale` |
| `audit_logs` | Revisar logs de un servicio en un período | `run_shell` (grep, journalctl), `aggregate_logs` |
| `backup` | Ejecutar backup de base de datos o volumen | `run_shell` (pg_dump, tar), `upload_to_s3` |
| `provision_infra` | Provisionar infraestructura con Terraform | `terraform_plan`, `terraform_apply` |
| `restart_service` | Reiniciar un servicio | `kubectl_rollout_restart`, `systemctl_restart` |

### KPIs

| KPI | Descripción | Target | Alerta |
|---|---|---|---|
| `deployment_frequency` | Frecuencia de deploys a producción por semana | > 10/semana | < 3/semana |
| `deployment_success_rate` | % de deploys exitosos sin rollback | > 99% | < 95% |
| `mttr` | Mean Time To Recover (minutos) | < 30 min | > 120 min |
| `rollback_success_rate` | % de rollbacks que restauran el servicio | > 99% | < 90% |
| `pipeline_duration` | Duración media del pipeline CI/CD | < 10 min | > 30 min |

### Policies

```rego
package cas.domains.devops

# Escritura en producción requiere aprobación
require_approval if {
    input.domain == "devops"
    input.environment == "prod"
    input.tool.type in ["write", "execute"]
}

# Rollbacks son automáticos (no requieren aprobación)
allow if {
    input.domain == "devops"
    input.tool.name == "helm_rollback"
}

# Terraform plan es solo lectura (siempre permitido)
allow if {
    input.domain == "devops"
    input.tool.name == "terraform_plan"
}
```

### Goals de Ejemplo

```markdown
# Escalar servicio de pagos

Goal: "Escalar el servicio de pagos a 5 réplicas en producción"

Plan generado:
1. kubectl_scale(deployment: "payments", replicas: 5, env: "prod")
   → REQUIRE_APPROVAL (escritura en prod)
2. smoke_test(url: "https://payments.internal/health")
   → ALLOW (solo lectura)

Si se aprueba el paso 1 → ejecución automática del paso 2
```

---

## Vertical: Marketing

La vertical de Marketing permite a los equipos de marketing ejecutar campañas, segmentar audiencias y generar reportes sin necesidad de herramientas técnicas.

### Vocabulario

| Tarea de Negocio | Descripción | Tools |
|---|---|---|
| `launch_campaign` | Lanzar una campaña en múltiples canales | `api_call` (CRM), `send_email`, `api_call` (ads) |
| `segment_audience` | Segmentar audiencia basada en criterios | `run_sql_query`, `run_python` (clustering) |
| `ab_test` | Configurar y monitorear un A/B test | `api_call` (experimentation), `render_report` |
| `analytics_report` | Generar reporte de métricas de campaña | `run_sql_query`, `render_report`, `send_email` |
| `import_leads` | Importar leads desde CSV a CRM | `run_python`, `api_call` (CRM batch) |
| `social_media_post` | Programar publicación en redes sociales | `api_call` (social media API) |

### KPIs

| KPI | Descripción | Target | Alerta |
|---|---|---|---|
| `campaign_roi` | Retorno de inversión de campañas | > 3x | < 1.5x |
| `conversion_rate` | Tasa de conversión de campañas | > 5% | < 2% |
| `audience_reach` | Número de personas alcanzadas por campaña | > 100K | < 50K |
| `campaign_launch_time` | Tiempo desde idea hasta campaña activa | < 2h | > 8h |
| `lead_quality_score` | Calidad promedio de leads generados | > 80% | < 60% |

### Policies

```rego
package cas.domains.marketing

# Límites de presupuesto por campaña
deny if {
    input.domain == "marketing"
    input.tool.name == "api_call"
    input.parameters.api == "ads"
    input.parameters.budget > data.department_budget_remaining
}

# No PII en campañas sin aprobación de compliance
require_approval if {
    input.domain == "marketing"
    input.tool.name == "run_sql_query"
    contains(input.parameters.query, "email") or
    contains(input.parameters.query, "phone")
}

# Límite de velocidad de envío de emails
deny if {
    input.domain == "marketing"
    input.tool.name == "send_email"
    input.parameters.recipients_count > 10000
}
```

### Goals de Ejemplo

```markdown
# Campaña de email segmentada

Goal: "Crear una campaña de email para clientes que no han comprado en 90 días,
con un presupuesto máximo de $5000, y generar reporte de resultados"

Plan generado:
1. run_sql_query("SELECT email, name, last_purchase FROM customers 
                  WHERE last_purchase < NOW() - INTERVAL '90 days'")
   → REQUIRE_APPROVAL (PII en query)
2. run_python("segmentar_audiencia.py --input /tmp/leads.csv --segments 3")
   → ALLOW (bajo riesgo)
3. api_call(api: "email_marketing", action: "create_campaign", budget: 5000)
   → ALLOW (presupuesto dentro del límite)
4. send_email(template: "reengagement", segments: [...], recipients: 8500)
   → REQUIRE_APPROVAL (> 10000 recipients requiere aprobación)
```

---

## Vertical: Finance

La vertical de Finance es la más sensible y con mayor cantidad de controles. Diseñada para equipos de finanzas, contabilidad y auditoría.

### Vocabulario

| Tarea de Negocio | Descripción | Tools |
|---|---|---|
| `generate_report` | Generar reporte financiero (ingresos, gastos, P&L) | `run_sql_query`, `run_python`, `render_report` |
| `reconcile_accounts` | Reconciliar cuentas entre sistemas | `run_sql_query` (dual), `run_python` (matching) |
| `forecast_revenue` | Generar pronóstico de ingresos | `run_python` (time series), `ml_inference` |
| `audit_trail` | Extraer trail de auditoría para un período | `run_sql_query`, `export_to_excel` |
| `close_period` | Ejecutar cierre contable mensual/trimestral | `run_sql_query`, `run_python`, `send_email` (aprobación) |
| `compliance_check` | Ejecutar checks de cumplimiento normativo | `run_python` (rules engine), `render_report` |
| `budget_vs_actual` | Comparar presupuesto vs. gasto real | `run_sql_query`, `render_report` |

### KPIs

| KPI | Descripción | Target | Alerta |
|---|---|---|---|
| `report_accuracy` | Precisión de datos vs. fuente de verdad | > 99.9% | < 99.5% |
| `reconciliation_time` | Tiempo para reconciliar un período | < 5 min | > 15 min |
| `forecast_error_rate` | MAPE de pronóstico vs. real | < 5% | > 10% |
| `close_time` | Tiempo para cerrar un período contable | < 3 días | > 7 días |
| `audit_completeness` | % de transacciones con trail completo | 100% | < 100% |

### Policies

```rego
package cas.domains.finance

import future.keywords.if

# ==========================================
# Reglas por Rol
# ==========================================

# Analysts solo lectura, sin SQL directo
allow if {
    input.role == "analyst"
    input.domain == "finance"
    input.tool.type == "read"
    input.tool.name != "run_sql_query"
}

# Accountants pueden SQL + escritura en dev/staging
allow if {
    input.role == "accountant"
    input.domain == "finance"
    input.environment in ["dev", "staging"]
    input.tool.type in ["read", "write"]
}

# Controllers pueden todo en finance (con aprobación para escritura en prod)
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
# Reglas por Tipo de Operación
# ==========================================

# Toda operación de escritura requiere aprobación + justificación
require_approval if {
    input.domain == "finance"
    input.tool.type == "write"
}

# Exportación de datos solo a destinatarios aprobados
deny if {
    input.domain == "finance"
    input.tool.name == "send_email"
    not data.finance_email_whitelist[input.parameters.to]
}

# ==========================================
# Reglas de Auditoría
# ==========================================

# Toda operación en finance debe tener audit trail completo
audit.mandatory_fields if {
    input.domain == "finance"
}
```

### Goals de Ejemplo

```markdown
# Cierre Mensual

Goal: "Ejecutar el cierre contable de mayo 2026: reconciliar cuentas,
generar reporte P&L, y enviar aprobación al controller"

Plan generado:
1. run_sql_query("SELECT * FROM ledger WHERE month = '2026-05'")
   → ALLOW (accountant, lectura)
2. run_python("reconcile.py --month 2026-05 --sources sap,quickbooks")
   → ALLOW (accountant, ejecución en dev)
3. run_sql_query("INSERT INTO closed_periods VALUES ('2026-05')")
   → REQUIRE_APPROVAL (escritura en finance)
4. render_report(template: "pnl_monthly", period: "2026-05")
   → ALLOW (accountant, solo lectura de template)
5. send_email(to: "controller@empresa.com", 
              subject: "Aprobación cierre mayo 2026",
              attachment: "/output/pnl-2026-05.pdf")
   → ALLOW (controller está en whitelist de finance)
```

---

## Extensibilidad

### Cómo Contribuir una Nueva Vertical

1. **Fork** el repositorio de configuración de CaS
2. **Crear directorio** en `verticals/{nombre}/` con la estructura descrita
3. **Definir vocabulary.yaml** con tareas de negocio y mapeo a tools
4. **Definir kpis.yaml** con métricas de dominio
5. **Escribir policies.rego** con reglas específicas del dominio
6. **Documentar ejemplos** en `examples/`
7. **Enviar PR** para revisión por el equipo de arquitectura

### Buenas Prácticas para Verticales

| Principio | Descripción |
|---|---|
| **Vocabulario de negocio, no técnico** | "reconciliar cuentas", no "ejecutar SQL JOIN entre tablas" |
| **KPIs orientados a resultados** | "reporte generado en < 30s", no "job duration < 30s" |
| **Policies por defecto restrictivas** | Empezar restrictivo, relajar según necesidad |
| **Ejemplos canónicos** | 3-5 Goals de ejemplo que cubran los casos de uso principales |
| **Tools existentes primero** | Reusar tools del registry antes de crear nuevas |
| **Versionado semántico** | La vertical tiene su propio versionado independiente |

---

## Siguiente

Este documento concluye el recorrido por la arquitectura CaS. Para volver al inicio y tener una visión global del sistema, consulta la **[Visión General](01-overview.md)** .

---

*Última actualización: 2026-05-31*
