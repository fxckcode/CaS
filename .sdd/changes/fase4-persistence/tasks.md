# Tasks: Fase 4 — Memoria Persistente con SQLite

## Dependency Order
T1 ← T2 ← T3 (secuencial)

## Tasks

### T1: Instalar dependencias y preparar schema (AFK)
- **Files:** `package.json`, `pnpm-lock.yaml`
- **Acceptance:** `better-sqlite3` instalado, sql schema diseñado
- **Dependencies:** ninguna
- **Size:** small

### T2: Implementar SqliteMemoryStoreService (AFK)
- **Files:** 
  - `src/memory/sqlite-memory-store.service.ts` (nuevo)
  - `src/memory/memory.types.ts` (posible extensión)
  - `src/memory/memory.module.ts` (factory provider)
- **Acceptance:** 
  - Implementa todas las operaciones de `IMemoryStore` con SQLite
  - Soporta FTS search por keywords
  - Tags almacenados como JSON array
  - Factory en MemoryModule switchea según `MEMORY_DRIVER`
- **Dependencies:** T1
- **Size:** medium

### T3: Tests + verify (AFK)
- **Files:** `tests/unit/sqlite-memory-store.service.spec.ts` (nuevo)
- **Acceptance:** 
  - Mismos tests que MemoryStoreService + específicos de SQLite (FTS, tags JSON)
  - Todos los tests existentes siguen pasando
  - 104+ tests en total
- **Dependencies:** T2
- **Size:** small
