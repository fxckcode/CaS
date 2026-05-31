# Proposal: Fase 6 — CLI Tooling

## Intent
Crear un CLI (`cas`) para interactuar con CaS desde terminal — crear goals, ver planes, listar tools y buscar memoria.

## Scope
### In
- [x] Comando `cas goals list` — lista todos los goals con status
- [x] Comando `cas goals create <desc>` — crea un goal
- [x] Comando `cas goals get <id>` — detalle de un goal
- [x] Comando `cas goals plan <id>` — muestra el plan de un goal
- [x] Comando `cas tools` — lista herramientas registradas
- [x] Comando `cas memory <query>` — busca en la memoria
- [x] Comando `cas health` — health check del server
- [x] Salida colorida y formateada (tablas, status badges)
- [x] Config de server URL via env `CAS_API_URL` o flag `--url`

### Out
- Autocompletado de shell
- Modo interactivo (REPL)
- Watch mode
- Tests del CLI (el CLI llama a la API ya testeada)

## Approach
- Nuevo workspace `packages/cas-cli` en el monorepo
- Commander.js para parsing de comandos
- Chalk para output colorido
- Fetch nativo (Node 22) para HTTP
- Binario `cas` linkeable via `pnpm link`

## Modules Affected
- `packages/cas-cli/` — nuevo package (8 archivos fuente)
- `pnpm-workspace.yaml` — agregar nuevo workspace
- `packages/cas-cli/package.json` — bin alias

## Risks
- Node 22 fetch nativo funciona sin dependencias extra
- Commander.js y Chalk son ligeros
