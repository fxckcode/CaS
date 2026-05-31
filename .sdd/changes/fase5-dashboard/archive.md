# Archive: Fase 5 — Dashboard Web

## Summary
- **Proposal:** `.sdd/changes/fase5-dashboard/proposal.md`
- **Verification:** PASS ✅ (121 tests + smoke test real)
- **Tasks:** 3 tasks, all AFK

## Files Changed
| Archivo | Cambio |
|---------|--------|
| `dashboard/index.html` | 🆕 SPA dashboard oscuro, responsive, con WebSocket en vivo |
| `src/orchestrator/plan.store.ts` | 🆕 PlanStore para consultar planes via API |
| `src/orchestrator/orchestrator.service.ts` | ✏️ Persiste plan al planificar |
| `src/orchestrator/orchestrator.module.ts` | ✏️ +PlanStore |
| `src/api-gateway/api-gateway.service.ts` | ✏️ 3 nuevos métodos de consulta |
| `src/api-gateway/api-gateway.controller.ts` | ✏️ 3 nuevos endpoints REST |
| `src/api-gateway/api-gateway.gateway.ts` | ✏️ Forward de eventos goal.* |
| `src/api-gateway/api-gateway.module.ts` | ✏️ +MemoryModule |
| `src/main.ts` | ✏️ Static file serving |
| `tsconfig.json` | ✏️ rootDir fix |

## What Was Learned
- NestJS `NestExpressApplication` permite `useStaticAssets()` sin dependencias extra
- Socket.io server events se pueden forwardear desde EventEmitter2
- El tsconfig con `rootDir: "src"` es clave para que `dist/main.js` quede en raíz
- Vanilla HTML+CSS+JS es suficiente para un dashboard de referencia — sin build step
- `useExisting` en DI de NestJS permite compartir instancia entre token y clase

## Usage
```bash
cd src/control-plane
npx nest build     # compila
node dist/main.js  # inicia en http://localhost:3000
# Abrir http://localhost:3000 en el navegador
```
