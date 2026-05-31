# Proposal: Fase 4 — Memoria Persistente con SQLite

## Intent
Reemplazar MemoryStore in-memory (Map<string, MemoryItem>) con SQLite para que los datos persistan entre reinicios del servicio.

## Scope
### In
- [x] Instalar `better-sqlite3` + types
- [x] Crear `SqliteMemoryStoreService` implementando `IMemoryStore`
- [x] Schema SQL con tabla `memories` + índice FTS para keywords
- [x] Config via env vars: `MEMORY_DRIVER` (memory|sqlite) y `MEMORY_DB_PATH`
- [x] Factory/provider dinámico en `MemoryModule`
- [x] Tests unitarios para SqliteMemoryStoreService
- [x] Actualizar imports y exports de MemoryModule

### Out
- PostgreSQL u otros drivers (fase futura)
- Migración de datos in-memory → SQLite al switchear
- Backup/restore automático
- Clustering / memoria distribuida
- Pool de conexiones (better-sqlite3 no necesita)

## Approach
- **better-sqlite3** — nativo, síncrono, rápido. Ideal para carga single-process.
- **Custom provider pattern** en NestJS: `IMemoryStore` bindea a `MemoryStoreService` (in-memory, default) o `SqliteMemoryStoreService` según `MEMORY_DRIVER`.
- **Schema**: `id TEXT PK, org_id TEXT, project_id TEXT, summary TEXT, type TEXT, source TEXT, content TEXT, tags TEXT(JSON), link TEXT, created_at TEXT(ISO)`. Índice FTS.
- **Wrapper async**: better-sqlite3 es síncrono, los métodos de IMemoryStore devuelven Promise — wrapper trivial.

## Modules Affected
- `src/memory/` — nuevo `sqlite-memory-store.service.ts`, modificación `memory.module.ts`
- `src/memory/memory.types.ts` — posible extensión de interfaces para config
- `package.json` — nueva dependencia `better-sqlite3`
- `tests/unit/` — nuevo test para SqliteMemoryStore

## Risks
- `better-sqlite3` compilación nativa ⚠️ → prebuilts disponibles para linux-x64, si falla usar `sql.js` (pure JS)
- Tests existentes de MemoryStoreService no deben romperse (in-memory sigue siendo default)
