# Archive: Fase 6 — CLI Tooling

## Summary
- **Proposal:** `.sdd/changes/fase6-cli/proposal.md`
- **Verification:** PASS ✅ (7 comandos probados contra server real)
- **Tasks:** 2 tasks, all AFK

## Files Changed

| Archivo | Cambio |
|---------|--------|
| `packages/cas-cli/` | 🆕 Paquete CLI completo (8 archivos) |
| `pnpm-lock.yaml` | 🔄 Nuevas dependencias (commander, chalk) |

## What Was Learned
- Commander.js v13 + Chalk v5 requieren ESM (`"type": "module"`)
- Node 22 fetch nativo funciona sin `node-fetch`
- CLI con `bin` entry se linkea con `pnpm link --global`
- Resolver IDs parciales mejora UX significativamente
- `tsc` con `module: NodeNext` + `moduleResolution: NodeNext` para ESM

## Usage
```bash
# Desde el repo (alias agregado)
cas health
cas goals list
cas goals create "Deploy API v3"
cas goals plan <id>
cas tools
cas memory <query>

# O vía node directo
node packages/cas-cli/dist/index.js health

# O configurar CAS_API_URL para server remoto
CAS_API_URL=http://servidor:3000 cas health
```
