# Investigación: Arquitectura de CLIs de Agentes IA
## Claude Code · Opencode · Codex CLI · OpenClaw

> **Propósito:** Alimentar el diseño de la **Capa de Interfaces** del proyecto CaS (CLI as a Service), identificando patrones probados para sincronizar un agente backend con múltiples frontends: terminal (TUI), app de escritorio, extensión IDE y adaptadores de mensajería.

---

## 1. Claude Code (Anthropic)

### Stack tecnológico
- **Runtime:** Bun (TypeScript — ~512K líneas, filtrado vía source maps de npm en marzo 2026)
- **TUI:** React + [Ink](https://github.com/vadimdemedes/ink) — el terminal completo es un árbol de componentes React renderizados como UI de terminal
- **Modelo de proceso:** Un único proceso por sesión, sin daemon separado

### Arquitectura interna

```
┌─────────────────────────────────────┐
│          Proceso CLI (Bun)          │
│                                     │
│  React/Ink Component Tree           │
│  ├── MessageBubble                  │
│  ├── ToolCallDisplay                │
│  ├── PermissionPrompt               │
│  └── MarkdownRenderer               │
│                                     │
│  Generator-based Query Loop (turns) │
│  ├── ThoughtBlocks                  │
│  └── ToolCalls → Permission Engine  │
│                                     │
│  Tool Inventory (~40 tools)         │
│  ├── FileRead / FileWrite / FileEdit│
│  ├── Bash, Glob, Grep               │
│  ├── WebFetch / WebSearch           │
│  ├── MCP integration                │
│  └── Sub-agent spawning             │
└─────────────────────────────────────┘
```

### Modelo de permisos (4 niveles)
```
ALLOW (automático) → CONFIRM (requiere aprobación) → DENY → SANDBOX
```
Antes de ejecutar cualquier herramienta destructiva, el permission engine evalúa contexto, herramienta y modo activo.

### Gestión de memoria y contexto
Sistema de dos capas:
- **MEMORY.md index:** Archivo siempre cargado. Entradas < 150 caracteres, actúa como puntero ("he recordado X, los detalles están en Y"). Costo mínimo de tokens.
- **Archivos de detalle:** Referenciados desde el índice, cargados on-demand según relevancia.

### Sincronización CLI ↔ Desktop App
Claude Code resuelve el problema de múltiples frontends (terminal, desktop app, extensión VS Code, web) como **variantes de un mismo proceso**, no como clientes conectados a un servidor. Cada frontend inicia su propio proceso con la misma lógica de agente.

### Patrón arquitectónico
> **Single-process, multi-renderer:** El agente y la UI viven en el mismo proceso. Para nuevos frontends se reimplementa el renderer (Ink para terminal, Electron renderer para desktop).

---

## 2. Opencode (SST)

### Stack tecnológico
- **Lenguaje:** Go
- **TUI:** Go-native (Bubble Tea framework internamente)
- **Modelo de proceso:** **Client-Server separados** — el killer feature arquitectónico

### Arquitectura interna

```
┌──────────────┐     HTTP + SSE      ┌─────────────────────────┐
│  TUI Client  │ ◄──────────────────► │   opencode serve        │
│  (Go/BubbleTea)│                   │   (background server)   │
└──────────────┘                     │                         │
                                     │  Server.App             │
┌──────────────┐     HTTP + SSE      │  └── SessionPrompt      │
│  Web UI      │ ◄──────────────────► │       └── Provider      │
└──────────────┘                     │           └── LanguageModel│
                                     │                         │
┌──────────────┐     HTTP + SSE      │  Tool Executor          │
│  Desktop App │ ◄──────────────────► │  SessionPrompt.loop()   │
└──────────────┘                     └─────────────────────────┘
```

### Protocolo de comunicación
- **Transporte:** HTTP REST + **SSE (Server-Sent Events)** para eventos en tiempo real
- **Puerto por defecto:** `4096` (configurable con `--port`)
- **API:** Expone spec OpenAPI 3.1 → usado también para generar el SDK cliente
- **Variable de entorno:** `OPENCODE_API_URL` — permite al TUI apuntar a un servidor remoto
- **Descubrimiento de red:** mDNS (cuando `hostname=0.0.0.0`) para descubrimiento en red local

### Ciclo de vida de sesiones
Las sesiones **sobreviven a desconexiones de terminal**, drops de SSH y suspensiones de máquina. El cliente TUI reconecta y retoma el estado exacto donde quedó.

### Modos de autonomía
Configurable en `opencode.json`:
```json
{
  "autoapprove": ["read", "write", "execute"]
}
```

### Multi-proveedor
Soporta 75+ proveedores de IA (OpenAI, Anthropic, Mistral, Groq, local via Ollama, etc.) sin lock-in.

### Patrón arquitectónico
> **Daemon Server + Thin Clients:** El agente es un servidor HTTP persistente. Cada tipo de cliente (TUI, web, desktop, IDE) es simplemente un cliente HTTP que consume la misma API. Añadir un nuevo frontend = implementar un cliente HTTP, no modificar el agente.

---

## 3. Codex CLI (OpenAI)

### Stack tecnológico
- **Runtime:** Node.js (TypeScript)
- **TUI:** React + Ink (mismo approach que Claude Code)
- **Modelo de proceso:** Single-process por sesión (con variante "app-server TUI")

### Arquitectura interna

```
┌─────────────────────────────────────┐
│  Multitool Dispatcher               │
│  ├── subcommand: config             │
│  ├── subcommand: login              │
│  └── (default) → Interactive TUI   │
│                                     │
│  Agent Loop (turns)                 │
│  ├── Model Inference                │
│  └── Tool Calls (iterativo)         │
│                                     │
│  Approval Policy Engine             │
│  ├── Auto                           │
│  ├── Read-only                      │
│  └── Full Access                    │
└─────────────────────────────────────┘
```

### Modos de aprobación
| Modo | Comportamiento |
|------|---------------|
| `auto` (default) | Lee + edita + ejecuta dentro del directorio de trabajo. Pide confirmación fuera del scope o para red. |
| `read-only` | Solo consulta. No escribe ni ejecuta hasta aprobar un plan. |
| `full-access` | Sin restricciones de scope ni red. Uso cauteloso. |

El comando `/permissions` dentro del TUI permite cambiar de modo en caliente durante la sesión.

### Variante "App-Server TUI"
Codex menciona un modo `app-server TUI` (separado del TUI clásico), que sugiere que también experimenta con arquitectura cliente-servidor al estilo de Opencode, aunque no es el modo principal.

### Patrón arquitectónico
> **Single-process con dispatcher:** Similar a Claude Code, pero con un dispatcher de subcomandos más explícito. El agent loop es el núcleo, el TUI es el renderer por defecto.

---

## 4. OpenClaw

### Contexto
Creado por Peter Steinberger (Austria), publicado en noviembre 2025 como "Clawdbot", renombrado a OpenClaw en enero 2026. Alcanzó **247,000+ GitHub stars en ~60 días** — el proyecto open-source de más rápido crecimiento por esa métrica. Es el referente más relevante para CaS por su arquitectura multicanal.

### Stack tecnológico
- **Runtime:** Node.js (proceso Gateway persistente)
- **Arquitectura:** Hub-and-spoke centrado en el Gateway
- **Sin microservicios**, sin arquitectura distribuida compleja
- **Plugin system** de 3 capas (introducido en v2026.3)

### Arquitectura interna

```
                    ┌──────────────────────────────────┐
WhatsApp ──────────►│                                  │
Telegram ──────────►│         Gateway :18789           │
Slack    ──────────►│      (Node.js, WebSocket)        │
Discord  ──────────►│                                  │
iMessage ──────────►│  ┌─────────────────────────┐    │
Signal   ──────────►│  │ Sessions Manager         │    │
Teams    ──────────►│  │ Channel Router           │    │
Matrix   ──────────►│  │ Tool Dispatcher          │    │
...50+ más ────────►│  │ Hook System              │    │
                    │  └─────────────────────────┘    │
CLI      ──────────►│         WS RPC                  │
Web UI   ──────────►│         WS directo              │
macOS App ─────────►│         UDS + HMAC + TTL        │
                    └──────────────────────────────────┘
```

### Protocolo de comunicación por cliente

| Cliente | Protocolo | Detalles |
|---------|-----------|----------|
| CLI (`openclaw chat`) | **WebSocket RPC** | Conecta a `ws://localhost:18789` |
| Web UI / WebChat | **WebSocket** | Conexión directa al Gateway |
| macOS Desktop App | **Unix Domain Socket (UDS)** | + autenticación HMAC + TTL enforcement |
| Channels (WhatsApp, Slack…) | **Adapters** | Cada canal tiene su adapter en el Gateway |

### Por qué WebSocket como protocolo core
> Los flujos de agentes IA son **bidireccionales y long-lived**: los Nodes necesitan recibir asignaciones en tiempo real, y el Gateway necesita recibir progreso y resultados en tiempo real. La naturaleza full-duplex de WebSocket es el match perfecto.

### Sistema de Skills
Cada skill es un directorio con un archivo `SKILL.md` que contiene metadatos e instrucciones de uso de herramientas. Se pueden empaquetar con el software, instalar globalmente o almacenar en workspace. Análogo al sistema de herramientas (Tools) en CaS.

### Configuración del agente
Cada agente se define mediante **archivos Markdown de configuración** que controlan identidad, memoria y permisos. Enfoque declarativo, sin código.

### Patrón arquitectónico
> **Gateway persistente como único control plane:** Un proceso WebSocket actúa de hub universal. Todos los clientes (CLI, GUI, mensajería) son consumidores del mismo Gateway. Añadir un nuevo canal = implementar un adapter, no modificar el núcleo.

---

## 5. Síntesis de Patrones y Aplicación a CaS

### Mapa comparativo

| Dimensión | Claude Code | Opencode | Codex CLI | OpenClaw |
|-----------|------------|----------|-----------|---------|
| **Lenguaje** | TypeScript/Bun | Go | TypeScript/Node | Node.js |
| **TUI framework** | React + Ink | Bubble Tea | React + Ink | WebUI vía WS |
| **Modelo de proceso** | Single-process | Daemon server | Single-process | Gateway persistente |
| **Protocolo IPC** | N/A (in-process) | HTTP + SSE | N/A | WebSocket + UDS |
| **Multi-cliente** | Reimplementación | HTTP clients | Parcial | Adapters nativos |
| **Sesiones persistentes** | No (por sesión) | Sí (sobreviven reconexión) | No | Sí |
| **Memoria** | MEMORY.md index | BD de sesiones | Contexto en proceso | Config Markdown |
| **Modos de autonomía** | 4-tier permission | autoapprove config | Auto/ReadOnly/Full | Permisos por Markdown |
| **Multi-proveedor** | Solo Anthropic | 75+ providers | Solo OpenAI | Configurable |

### Dos grandes patrones arquitectónicos

#### Patrón A: Single-Process Renderer
*Usado por Claude Code y Codex CLI*

```
┌─────────────────────────┐
│  Proceso único          │
│  ├── Agent Logic        │
│  └── UI Renderer (Ink)  │
└─────────────────────────┘
```

**Pros:** Simple, sin latencia IPC, fácil de debuggear.
**Contras:** Para nuevo frontend hay que reimplementar. Sin persistencia entre sesiones.

#### Patrón B: Daemon/Gateway + Thin Clients
*Usado por Opencode (HTTP+SSE) y OpenClaw (WebSocket)*

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

**Pros:** Sesiones persistentes, multi-cliente nativo, arquitectura extensible, separación clara.
**Contras:** Complejidad operacional (lifecycle del daemon, puertos, auth).

---

### Recomendaciones para la Capa de Interfaces de CaS

Dado que CaS es un **CLI as a Service corporativo** con múltiples puntos de entrada (terminal, Slack, Teams, WhatsApp, web), el **Patrón B** es el más alineado.

#### Arquitectura recomendada para la Interface Layer de CaS

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

#### Decisiones de diseño clave

| Decisión | Recomendación | Referente |
|----------|--------------|-----------|
| **Protocolo CLI ↔ Backend** | WebSocket para bidireccionalidad y streaming | OpenClaw |
| **Protocolo Web UI ↔ Backend** | HTTP + SSE para simplicidad y compatibilidad | Opencode |
| **Desktop App ↔ Backend** | Unix Domain Socket con token auth | OpenClaw (macOS) |
| **Persistencia de sesiones** | Daemon persistente con session store | Opencode |
| **Nuevo canal** | Implementar adapter, no modificar core | OpenClaw |
| **TUI del CLI** | React/Ink (TS) o Bubble Tea (Go) | Claude Code / Opencode |
| **Skills/Tools definition** | Descriptores YAML/Markdown declarativos | OpenClaw + CaS actual |

#### Protocolo mínimo viable para el CLI de CaS

```
CLI (TUI) ──WS──► API Gateway ──internal──► Orchestrator
                      │
                      ├── /goals    POST   { goal, projectId }
                      ├── /events   SSE    streaming de progreso
                      └── /sessions GET    estado de sesión activa
```

---

## Referencias

- [Claude Code Source Leak — WaveSpeedAI Blog](https://wavespeed.ai/blog/posts/claude-code-architecture-leaked-source-deep-dive/)
- [AI Coding Agent Architecture Analysis — Haseeb Qureshi (GitHub Gist)](https://gist.github.com/Haseeb-Qureshi/2213cc0487ea71d62572a645d7582518)
- [Inside the Claude Code source — GitHub Gist](https://gist.github.com/Haseeb-Qureshi/d0dc36844c19d26303ce09b42e7188c1)
- [Opencode Docs — Server](https://opencode.ai/docs/server/)
- [Opencode Docs — TUI](https://opencode.ai/docs/tui/)
- [Opencode — DeepWiki](https://deepwiki.com/sst/opencode)
- [Codex CLI Features — OpenAI Developers](https://developers.openai.com/codex/cli/features)
- [Unrolling the Codex agent loop — OpenAI](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [OpenClaw Gateway Architecture](https://openclaws.io/docs/concepts/architecture/)
- [OpenClaw Architecture, Explained — ppaolo.substack](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [The Gateway — OpenClaw Docs](https://clawdocs.org/architecture/gateway/)
- [What is OpenClaw AI in 2026 — DEV Community](https://dev.to/laracopilot/what-is-openclaw-ai-in-2026-a-practical-guide-for-developers-25hj)
- [OpenClaw Terminal Guide — Skywork](https://skywork.ai/skypage/en/openclaw-terminal-guide/2037079836549005312)
