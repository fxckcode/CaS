# Archive: Fase 1 — Control Plane MVP

## Summary
- **Spec:** [spec.md](spec.md)
- **Tasks:** T1 (scaffold), T2 (API Gateway + Orchestrator), T3 (Planner + Policy Engine + Tools Registry), T4 (Tests)
- **Verification:** PASS — 58/58 tests, 0 TS errors, API verificada

## Files Changed
- `src/control-plane/` — 28 archivos nuevos (scaffold + 5 módulos + tests)
- `.sdd/changes/fase1-control-plane/` — artefactos SDD

## ADRs Created
- Ninguno nuevo (decisiones arquitectónicas ya documentadas en ADR-001 y ADR-002)

## What Was Learned
- NestJS con pnpm funciona bien para este stack
- La comunicación entre módulos vía EventEmitter2 desacopla limpiamente
- El planner template-based permite demo funcional sin LLM real
- PolicyEngine con 3 modos de autonomía es suficiente para el MVP
- El patrón daemon+eventos permite procesamiento asíncrono de goals

## Next Steps
- **Fase 2:** Execution Plane (Shell Runner, CI/CD Runner, Data Runner + BullMQ)
- **Fase 3:** Memory Layer (Org Store + Project Store + pgvector)
- Migrar PolicyEngine de inline a OPA/Rego
- Agregar autenticación OIDC/JWT
