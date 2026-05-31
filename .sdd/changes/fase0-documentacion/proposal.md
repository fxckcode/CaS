# Proposal: Fase 0 — Fundación Documental

## Intent
Crear toda la documentación arquitectónica y diagramas que el README ya promete pero no existen: docs/ (7 documentos), adr/ (2 ADRs), y diagrams/ (2 diagramas Mermaid).

## Scope

### In
- [x] `docs/01-overview.md` + `docs/01-overview.en.md` — Visión general, terminología, actores
- [x] `docs/02-architecture-logical.md` + `docs/02-architecture-logical.en.md` — Arquitectura lógica detallada
- [x] `docs/03-control-plane.md` + `docs/03-control-plane.en.md` — Especificación del control plane
- [x] `docs/04-execution-plane.md` + `docs/04-execution-plane.en.md` — Especificación del execution plane
- [x] `docs/05-memory-and-context.md` + `docs/05-memory-and-context.en.md` — Diseño de memoria persistente
- [x] `docs/06-security-and-compliance.md` + `docs/06-security-and-compliance.en.md` — Modelo de seguridad y compliance
- [x] `docs/07-domain-verticals.md` + `docs/07-domain-verticals.en.md` — Verticales de dominio y DSLs
- [x] `adr/ADR-001-choose-cas-architecture.md` — Decisión arquitectónica (Patrón B)
- [x] `adr/ADR-002-security-model.md` — Modelo de seguridad (OPA + autonomía)
- [x] `diagrams/logical-architecture.mmd` — Diagrama de arquitectura lógica
- [x] `diagrams/sequence-goal-to-execution.mmd` — Diagrama de secuencia Goal→Execution

### Out
- [ ] Código fuente (src/) — es Fase 1
- [ ] Infraestructura (infra/) — es Fase 5
- [ ] Ejemplos (examples/) — es Fase 5
- [ ] CI/CD — es Fase 5
- [ ] Modificaciones al README existente
- [ ] Modificaciones al research doc existente

## Approach
1. Escribir cada doc en español (fuente primaria, según CONTRIBUTING.md)
2. Traducir cada doc al inglés (filename.en.md)
3. Mantener consistencia de términos técnicos en inglés (orchestrator, planner, runner, policy engine, etc.)
4. Los docs deben ser auto-contenidos pero referenciarse entre sí
5. Cada doc expande la sección correspondiente del README con profundidad arquitectónica

## Modules Affected
- `docs/` — 7 nuevos documentos bilingües
- `adr/` — 2 nuevos ADRs
- `diagrams/` — 2 nuevos diagramas Mermaid

## Risks
- Contenido inconsistente entre docs → mitigación: template común y revisión cruzada
- Términos traducidos incorrectamente → mitigación: seguir glossary de CONTRIBUTING.md
- Docs demasiado extensos sin valor añadido → mitigación: cada doc debe ser focused, no repetir el README
