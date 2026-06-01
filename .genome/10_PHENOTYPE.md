# 10_PHENOTYPE — cortex-dev (live state)

> High-churn file. Any session updates this freely.
> **Last touched:** 2026-06-01 by claude/project-onboarding-XAXWx (pivot session)
> **Pending ratification:** CortexContextBundle version bump (see §3)

---

## §1 Current focus

v0.2 pivot complete: GroundLine removed, replaced with `sync`, `audit`, `harvest`. Ready for npm publish and real-world validation.

---

## §2 Acceptance criteria

- [x] `src/audit.ts` — genome health checks (staleness, completeness, template detection)
- [x] `src/sync.ts` — generate `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md` from genome
- [x] `src/harvest.ts` — git log → EPIGENOME entries (`DECISION:`, `ADR:`, `ARCH:`, `.genome/` commits)
- [x] `src/check.ts` — governance gate (audit-backed, no GroundLine dependency)
- [x] `src/context.ts` — `CortexContextBundle` v2 (genome + audit health, no comprehension field)
- [x] `src/concepts.ts` — `extractFocus`, `extractOpenQuestions`, `extractShadowEntries`, `extractSection`
- [x] 31 tests passing (`npm test`)
- [x] `npm run build` produces clean `dist/`
- [x] `bin/cortex.js` — commands: `init`, `hook install`, `status`, `audit`, `sync`, `harvest`, `check`, `log`, `shadow`, `context`
- [x] `package.json` test script cleans `.dist-test/` before compile
- [ ] `npm publish` — package live on npmjs.com as `cortex-dev`
- [ ] Smoke test: `npm install -g cortex-dev` in throwaway dir

---

## §3 Open questions

- **[GENOTYPE-CHANGE proposal]** `CortexContextBundle` in `00_GENOTYPE.md §5` references `version: 1` and the `comprehension` field. After the v0.2 pivot, the bundle is `version: 2` with an `audit` field instead. Propose updating the schema in §5 to reflect the new shape. Awaiting architect sign-off.
- `cortex harvest` currently scans 30d by default — should this be configurable in a `cortex.config.json`?
- IDE extension (VS Code / Cursor) — would call `cortex context` and inject into AI session on workspace open.
- Should `cortex sync` also write a `GEMINI.md` / `.aider.conf.yml` for other AI tools?

---

## §4 Next actions

1. Ratify GENOTYPE-CHANGE: update `CortexContextBundle` schema in `00_GENOTYPE.md §5` to version 2
2. Add `NPM_TOKEN` secret to GitHub repo settings
3. Bump version to `0.2.0`, tag `v0.2.0`, push to trigger publish
4. Smoke test: `npm install -g cortex-dev`, `cortex init`, `cortex sync`
5. Dog-food on a real project to validate `cortex harvest` and `cortex audit` feel

---

## §5 Deliverables on hand

- `src/` — audit, sync, harvest, check (rewritten), context (v2), concepts (simplified)
- `dist/` — compiled CommonJS output
- `templates/.genome/` — all five genome template files
- `AGENTS.md` — AI session briefing
- `INTEGRATION.md` — cortex + animus integration guide
- `.github/workflows/release.yml` — automated npm publish on tag
