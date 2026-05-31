# Proposal: Fase 3 — Memory Layer + Language Switch

## Intent
Implementar la capa de memoria persistente de CaS (Org Store + Project Store + búsqueda semántica) y cambiar el idioma principal del repositorio de español a inglés.

## Scope
### In — Language Switch
- [x] Renombrar docs: `.md` → inglés (antes español), `.es.md` → español (antes .md)
- [x] Actualizar CONTRIBUTING.md: inglés como idioma primario
- [x] Actualizar README.md (inglés ahora default) y crear README.es.md
- [x] Actualizar cross-references entre docs

### In — Memory Layer
- [x] Modelo de datos: MemoryItem, OrgMemoryItem, ProjectMemoryItem
- [x] Memory Store Service (in-memory MVP, swappable a pgvector)
- [x] Memory Writer: escribe MemoryItems al completar Goals
- [x] Memory Reader: búsqueda semántica con embeddings (MVP: keyword + tag matching)
- [x] Planner context injection: recuperar memorias relevantes al planificar
- [x] Tests

### Out
- [ ] pgvector real (MVP usa in-memory + keyword matching)
- [ ] Embedding service with OpenAI/Ollama (MVP usa keyword/tag matching)
- [ ] Migration BullMQ queue persistence

## Stack
- TypeScript, NestJS
- In-memory store (MVP), interface diseñada para pgvector después
- No new external deps
