# Proposal: Fase 5 — Dashboard Web

## Intent
Crear un dashboard web para CaS que permita monitorear goals, planes, herramientas y memoria en tiempo real.

## Scope
### In
- [x] Nuevos endpoints REST: `GET /goals`, `GET /memory`, `GET /goals/:id/plan`
- [x] PlanStore para persistir planes en memoria (acoplado al Orchestrator)
- [x] Dashboard SPA: HTML + CSS + JS vanilla (sin build step)
- [x] Static file serving desde NestJS
- [x] Socket.io para actualizaciones en tiempo real (goal status changes)
- [x] Dark theme profesional

### Out
- Autenticación / autorización
- Bundling / minificación
- Framework JS (React, Vue, etc.)
- Tests E2E del dashboard (solo unit tests backend)

## Approach
- **Backend**: Nuevos endpoints en ApiGatewayController, PlanStore injectable, static serving con `@nestjs/serve-static`
- **Frontend**: Single HTML file con CSS moderno (grid, custom properties, dark theme) + JS vanilla + Socket.IO CDN
- **WebSocket**: ApiGatewayGateway reenvía eventos `goal.created`, `goal.planned`, `goal.completed`, `goal.failed` a clientes

## Modules Affected
- `src/api-gateway/` — nuevos endpoints + WS forwarding
- `src/orchestrator/` — nuevo PlanStore
- `dashboard/index.html` — nuevo (frontend SPA)
- `package.json` — nueva dependencia `@nestjs/serve-static`

## Risks
- Socket.io version mismatch con CDN → usar misma versión que NestJS (socket.io v4)
- Static serving path incorrecto → verificar `__dirname` relativo
