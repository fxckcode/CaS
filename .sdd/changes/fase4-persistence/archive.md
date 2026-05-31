# Archive: Fase 4 — Memoria Persistente con SQLite

## Summary
- **Proposal:** `.sdd/changes/fase4-persistence/proposal.md`
- **Verification:** PASS ✅ (121 tests, 0 failed)
- **Tasks:** 3 tasks, all AFK

## Files Changed
| Archivo | Cambio |
|---------|--------|
| `src/control-plane/src/memory/sqlite-memory-store.service.ts` | 🆕 Nuevo — SQLite implementation of IMemoryStore |
| `src/control-plane/src/memory/memory.types.ts` | ✏️ +MEMORY_STORE injection token |
| `src/control-plane/src/memory/memory.module.ts` | ✏️ Factory provider: memory vs sqlite |
| `src/control-plane/src/memory/memory-reader.service.ts` | ✏️ Inyecta via token en vez de clase |
| `src/control-plane/src/memory/memory-writer.service.ts` | ✏️ Inyecta via token en vez de clase |
| `src/control-plane/src/memory/index.ts` | ✏️ Exporta nuevo servicio + token |
| `src/control-plane/package.json` | ✏️ +better-sqlite3 |
| `src/control-plane/pnpm-workspace.yaml` | ✏️ allowBuilds |
| `tests/unit/sqlite-memory-store.service.spec.ts` | 🆕 17 tests de persistencia |
| `tests/unit/memory-reader.service.spec.ts` | ✏️ +MEMORY_STORE provider |
| `tests/unit/memory-writer.service.spec.ts` | ✏️ +MEMORY_STORE provider |
| `tests/unit/planner.service.spec.ts` | ✏️ +MEMORY_STORE provider |

## What Was Learned
- `better-sqlite3` se instala sin problemas en CachyOS con prebuild
- NestJS custom providers con `useFactory` permiten switchear implementation sin cambiar consumidores
- `useExisting` en tests permite compartir instancia entre token y clase original
- Tags como JSON array en SQLite funciona bien con `LIKE %"tag"%` para búsqueda exacta
- SQLite WAL mode es óptimo para single-process读写

## Next Steps
- PostgreSQL u otros drivers como Fase 5 opcional
- CLI tooling para CaS
- Integración Hermes → CaS como backend de ejecución
