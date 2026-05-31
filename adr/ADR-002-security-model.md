# ADR-002: Modelo de Seguridad — OPA + Autonomía Gradual

- **Estado:** Aceptado
- **Fecha:** 2026-05-31

## Contexto

CaS ejecuta comandos en nombre del usuario, accede a sistemas remotos (Kubernetes, bases de datos, CI/CD) y manipula archivos. Cada operación tiene un nivel de riesgo asociado. El sistema necesita un modelo de seguridad que:

- Decida qué operaciones están permitidas según el contexto (goal, herramienta, argumentos, origen del cliente)
- Soporte autonomía gradual: desde fully-manual (cada acción requiere aprobación) hasta fully-autonomous (el agente decide y ejecuta)
- Sea auditable, testeable y versionable
- Permita a organizaciones definir sus propias policies sin modificar el código de CaS

Existen tres enfoques principales para policy engines en el ecosistema:

- **OPA/Rego** (usado por Styra, Netflix, Goldman Sachs)
- **Custom Policy Engine** (desarrollado internamente)
- **AWS Cedar** (de AWS Verified Permissions)

## Opción A: OPA/Rego

### Pros
- Declarativo: las policies describen qué está permitido, no cómo evaluarlo
- Testeable: OPA tiene un framework de tests incorporado (`test_allow { ... }`)
- Adoptado en enterprise: usado por Netflix, Goldman Sachs, Chef, muchas organizations
- Policy-as-code: las policies se versionan en git, se revisan en PR, se despliegan con CI/CD
- Sidecar o embebido: OPA se puede ejecutar como sidecar (daemon separado) o embebido como biblioteca
- Ecosistema maduro: documentación extensa, herramientas de linting, VSCode extension
- Separación clara entre decisión (OPA) y enforcement (CaS)

### Contras
- Learning curve: Rego es un lenguaje diferente a todo lo que el equipo conoce
- Performance overhead: cada decisión requiere una consulta OPA (aunque con caching se mitiga)
- Complejidad de despliegue: en modo sidecar, gestionar otro proceso; en modo embebido, la librería Go no es trivial de integrar con Node.js
- Rego puede ser verboso para policies simples

## Opción B: Custom Policy Engine

### Pros
- Control total sobre la sintaxis y semántica
- Integración directa con el stack TypeScript/NestJS
- Sin dependencias externas
- Curva de aprendizaje mínima para el equipo

### Contras
- Reinventar la rueda: hay que diseñar, implementar, testear y mantener un engine de policies
- Sin ecosistema: no hay herramientas de linting, formateo, testing ni IDE support
- Difícil de auditar externamente: los evaluadores de seguridad no conocen la sintaxis custom
- Riesgo de bugs de seguridad en el engine mismo
- Las policies terminan siendo código TypeScript espagueti

## Opción C: AWS Cedar (de AWS Verified Permissions)

### Pros
- Diseñado específicamente para permisos (no para datos genéricos como OPA)
- Sintaxis más simple que Rego para casos de uso de authorization
- Usado por AWS internamente (probado en producción a escala)

### Contras
- Ecosistema significativamente menos maduro que OPA
- Sintaxis Cedar (similar a Sesame) con menos herramientas de desarrollo
- Bias hacia AWS: integraciones pensadas para AWS, no para entornos on-premise o multi-cloud
- Menos community y recursos de aprendizaje
- La especificación aún está evolucionando
- Integración con Node.js menos probada que OPA

## Decisión

**Opción A: OPA/Rego**

Se elige OPA porque es el estándar de facto para policy-as-code en la industria, tiene el ecosistema más maduro, y permite a las organizaciones definir policies complejas de forma declarativa, testeable y versionable. La inversión en aprender Rego se amortiza con la flexibilidad y seguridad que aporta.

## Consecuencias

### Positivas
- Policies versionables en git, revisables mediante PR, desplegables con CI/CD
- Tests de policies: cada policy debe tener su suite de tests en Rego
- Separación clara entre decisión (OPA evalúa) y enforcement (CaS ejecuta o bloquea)
- Las organizaciones pueden tener sus propias policies sin tocar el código de CaS
- Soporte nativo para autonomía gradual: la policy puede devolver `allow`, `deny`, o `require_approval`

### Negativas
- El equipo necesita aprender Rego: plan de formación y pair programming inicial
- Overhead en el hot path: cada decisión de policy implica una llamada OPA
- Complejidad operacional en modo sidecar (gestión de otro daemon)

### Mitigaciones
- **Caching de decisiones OPA**: cachear resultados de policy con TTL configurable para decisiones repetitivas
- **Evaluación asíncrona**: donde sea posible, evaluar policies en background y precargar decisiones
- **Modo embebido inicial**: empezar con OPA embebido para simplificar el despliegue; migrar a sidecar si el rendimiento lo requiere
- **Training budget**: asignar tiempo de aprendizaje de Rego al inicio del proyecto
- **Policy templates**: proporcionar templates de policies comunes para acelerar la adopción
