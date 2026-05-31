# Tasks: Fase 0 — Fundación Documental

## Dependency Order
T1 ← T2 ← T3 (translation depends on Spanish source)

## Tasks

### T1: Docs principales español (AFK)
- **Files:** 7 archivos: docs/01-overview.md a docs/07-domain-verticals.md
- **Acceptance:** Cada doc cubre su tema en profundidad, es auto-contenido, referencia a otros docs
- **Dependencies:** ninguna
- **Estimated size:** large

### T2: ADRs + Diagramas (AFK, paralelo con T1)
- **Files:** adr/ADR-001.md, adr/ADR-002.md, diagrams/logical-architecture.mmd, diagrams/sequence-goal-to-execution.mmd
- **Acceptance:** ADRs formato YADR, diagramas Mermaid sin errores de sintaxis
- **Dependencies:** ninguna
- **Estimated size:** medium

### T3: Traducción al inglés (AFK)
- **Files:** 7 archivos: docs/01-overview.en.md a docs/07-domain-verticals.en.md
- **Acceptance:** Terminología técnica preservada en inglés, estructura de markdown idéntica
- **Dependencies:** T1
- **Estimated size:** medium
