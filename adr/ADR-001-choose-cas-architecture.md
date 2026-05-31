# ADR-001: Elección de Arquitectura — Daemon/Gateway + Thin Clients

- **Estado:** Aceptado
- **Fecha:** 2026-05-31

## Contexto

CaS (CLI as a Service) necesita una arquitectura que permita a los usuarios interactuar con un agente de IA desde múltiples canales (terminal CLI, web UI, Slack, Teams, etc.) manteniendo sesiones persistentes, estado compartido y una experiencia coherente. El agente debe poder ejecutar tareas complejas (planificación, ejecución de comandos, integración con CI/CD, consultas a memoria) de forma segura y extensible.

Existen tres patrones arquitectónicos principales en el ecosistema de CLI agents:

- **Single-Process Renderer** (usado por Claude Code, Codex CLI)
- **Daemon/Gateway + Thin Clients** (usado por Opencode, OpenClaw)
- **Híbrido** (servidor para canales externos + proceso local para CLI)

## Opción A: Single-Process Renderer (como Claude Code, Codex CLI)

### Pros
- Simplicidad: un solo proceso, sin IPC, sin gestión de puertos
- Sin latencia de red entre componentes
- Fácil debug y desarrollo local
- Menor superficie de ataque (no hay socket expuesto)

### Contras
- Sin persistencia de sesión entre invocaciones
- Nuevo frontend = reimplementar el renderer completo
- Imposibilidad de servir a múltiples clientes simultáneamente
- El estado vive solo en la memoria del proceso
- Difícil integrar canales externos (Slack, Teams, web)

## Opción B: Daemon/Gateway + Thin Clients (como Opencode, OpenClaw)

### Pros
- Sesiones persistentes: el daemon mantiene el estado entre conexiones
- Multi-cliente nativo: un solo agente sirve a CLI, web, Slack, Teams
- Extensible: añadir un canal = implementar un adapter
- El gateway maneja autenticación, rate limiting, routing
- Desacopla frontend (thin client) de backend (agente pesado)

### Contras
- Complejidad operacional: gestión de lifecycle del daemon (systemd/launchd)
- Puertos y networking: necesidad de asignar y proteger puertos
- Autenticación entre procesos: tokens, mTLS, o IPC sockets
- Latencia de red local vs IPC directo
- Single point of failure: si el daemon cae, todos los clientes pierden conexión

## Opción C: Híbrido (servidor para canales externos + proceso local para CLI)

### Pros
- Lo mejor de ambos mundos en teoría: CLI rápido sin daemon, canales externos con servidor
- El usuario local no depende de un daemon para uso básico

### Contras
- Dos codebases de agente o lógica duplicada
- Inconsistencia de estado entre el agente local y el servidor
- Mayor esfuerzo de mantenimiento
- Complejidad de sincronización de memoria y sesiones
- Confusión en el modelo mental del usuario

## Decisión

**Opción B: Daemon/Gateway + Thin Clients**

Se elige esta opción porque el caso de uso principal de CaS es la persistencia de sesión y el multi-cliente. Un arquitecto que usa CaS desde la terminal por la mañana debe poder retomar la misma sesión desde Slack por la tarde. Solo una arquitectura con daemon persistente y thin clients lo permite de forma limpia.

## Consecuencias

### Positivas
- Un solo agente sirve a todos los clientes (CLI, web, Slack, Teams)
- Sesiones persistentes: el daemon mantiene el árbol de decisión y la memoria
- Añadir un nuevo canal = implementar un adapter que hable HTTP/WS con el gateway
- El thin client puede ser mínimo (TUI, web, o incluso curl)
- El gateway centraliza autenticación, logging y rate limiting
- Separación clara de responsabilidades: el daemon es el cerebro, los clients son la piel

### Negativas
- Necesidad de gestionar lifecycle del daemon: systemd (Linux), launchd (macOS), o contenedor Docker
- Puertos: definir y documentar el puerto por defecto (8080) y mecanismo de discoverabilidad
- Autenticación entre procesos: socket UNIX para localhost, tokens JWT para remoto
- Dependencia de un proceso en background para funcionar

### Riesgos y Mitigaciones
- **Latencia de red local vs IPC**: mitigar usando conexiones persistentes (WebSocket) y keepalive HTTP/2
- **Single point of failure del gateway**: implementar health checks, auto-reinicio del daemon, y modo degraded donde el thin client pueda cachear el último estado conocido
- **Seguridad de puerto local**: el daemon solo debe escuchar en localhost por defecto; exponer a red solo con configuración explícita y TLS
