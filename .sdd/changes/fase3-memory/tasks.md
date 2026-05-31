# Tasks: Fase 3 — Memory Layer + Language Switch

## Dependency Order
T1 (language switch) puede correr en paralelo con T2

## Tasks

### T1: Language Switch — inglés como idioma principal (AFK)
- **Files:** docs/*.md, docs/*.en.md, docs/*.es.md, CONTRIBUTING.md, README.md
- **Acceptance:** docs/nombre.md = inglés, docs/nombre.es.md = español, README.md = inglés, cross-references actualizados
- **Estimated size:** medium

### T2: Memory Layer — Store + Writer + Reader + Planner Injection (AFK)
- **Files:** src/memory/, src/planner/ (update), src/orchestrator/ (update)
- **Acceptance:** MemoryService CRUD, Writer se ejecuta al completar Goal, Reader busca por keywords/tags, Planner inyecta contexto
- **Estimated size:** large

### T3: Tests (AFK)
- **Files:** tests/unit/memory/*.spec.ts
- **Acceptance:** Tests para memory store, writer, reader, planner injection
- **Dependencies:** T2
- **Estimated size:** medium
