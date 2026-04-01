# Contributing to CaS

Welcome! This reference architecture project welcomes contributions via issues and pull requests.

## How to Contribute

### Reporting Issues
- Use GitHub Issues to report bugs or suggest features
- Provide clear descriptions and context
- Include relevant details about your environment if applicable

### Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes following the guidelines below
4. Commit with conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
5. Push to your fork and submit a pull request

## Documentation Sync

This project maintains bilingual documentation (Spanish primary, English secondary).

### Updating Documentation

When modifying documentation files, follow this workflow:

1. **Always update Spanish first** — `README.md` and `*.md` files are the source of truth
2. **Use LLM for English draft**:
   - Recommended prompt: "Translate this to English (US). Preserve technical terms: orchestrator, planner, runner, policy engine, control plane, execution plane, memory stores, tools registry. Maintain exact markdown structure."
   - Review the output for accuracy
3. **Review technical terms** — ensure consistency with the list below
4. **Validate structure** — sections must match exactly between language versions
5. **Commit both files together** — do not commit only one language version

### File Naming Convention

- **Spanish (primary)**: `filename.md`
- **English (secondary)**: `filename.en.md`

Examples:
- `README.md` (Spanish) + `README.en.md` (English)
- `docs/01-overview.md` (Spanish) + `docs/01-overview.en.md` (English)

### Technical Terms (Preserve in English)

The following technical terms should **not** be translated and must remain in English in both language versions:

- orchestrator
- planner
- runner
- policy engine
- control plane
- execution plane
- memory stores
- tools registry
- goal
- plan
- tool
- job

### Validation Checklist

Before committing bilingual changes, verify:

- [ ] Badge navigation works (🇪🇸 → Spanish, 🇬🇧 → English)
- [ ] Structure identical (same section order and heading levels)
- [ ] Technical terms consistent (see list above)
- [ ] Internal links updated (e.g., `./LICENSE` works in both versions)
- [ ] Length similar (±20% acceptable, >50% difference indicates missing content)

### Future: Automated Drift Detection

When the project scales, we may add:
- GitHub Action to detect `*.md` changes without corresponding `*.en.md` updates
- Documentation framework (VitePress/Docusaurus) with native i18n support

**Trigger for migration**: 5+ international contributors or production-ready status

## Code of Conduct

Be respectful, constructive, and collaborative. This is a technical reference project — focus on architecture quality and clarity.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
