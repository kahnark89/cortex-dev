# 10_PHENOTYPE — cortex-dev (live state)

> High-churn file. Any session updates this freely.
> **Last touched:** 2026-06-01 by claude/project-onboarding-XAXWx
> **Pending ratification:** none

---

## §1 Current focus

v0.1.0 is built and pushed to GitHub. Next step is npm publication and real-world validation.

---

## §2 Acceptance criteria

- [x] `src/confidence.ts` — `ConfidenceDB` with atomic write, score formula, criticality weights
- [x] `src/concepts.ts` — zero-dep regex extraction (headings, bold, backticks, open questions, policy, shadow entries)
- [x] `src/check.ts` — `runCheck` with SHADOW always-block, GENOTYPE threshold gate, exit code 1
- [x] `src/watcher.ts` — `GenomeWatcher` using `fs.watch()`
- [x] `src/context.ts` — `buildContext` emitting `CortexContextBundle` JSON
- [x] `src/index.ts` — re-exports all public API
- [x] 34 tests passing (`npm test`)
- [x] `npm run build` produces clean `dist/` with no `__tests__/` leak
- [x] `bin/cortex.js` — all commands wired: `init`, `hook`, `status`, `status --risk`, `map`, `watch`, `check`, `concept`, `since`, `context`, `init --with-animus`
- [x] `INTEGRATION.md` — full guide for cortex + animus combined use
- [x] GitHub Actions `release.yml` — triggers on `v*` tags
- [ ] `npm publish` — package live on npmjs.com as `cortex-dev`
- [ ] Smoke test: `npm install -g cortex-dev` in throwaway dir, `cortex init` creates `.genome/`

---

## §3 Open questions

- `cortex check --pr <number>` accepts a PR number but currently does local-only check (no GitHub API call). Decide whether v0.2 should add actual GitHub PR diff analysis.
- The `context_distance` in GroundLine upsert is currently hardcoded at `0.5` in the watcher. A future version could compute real Jensen-Shannon divergence between structural fingerprints of application sites.
- Should `cortex since <range>` also filter EPIGENOME entries (not just confidence store)?
- IDE extension (VS Code / Cursor) planned but not yet started — would consume `cortex context` JSON.
- **[GENOTYPE-CHANGE proposal]** `ConceptEntry` schema in `00_GENOTYPE.md §5` omits `file: string`, but the field is present throughout the code and is required for `cortex concept <path>` lookups and per-file display. Propose adding `file: string` after `concept: string` in the published schema. Awaiting architect sign-off.

---

## §4 Next actions

1. Add `NPM_TOKEN` secret to GitHub repo settings
2. Set `main` as default branch in GitHub repo settings
3. `git tag v0.1.0 && git push origin v0.1.0` — triggers GitHub Actions publish
4. Verify: `npm view cortex-dev` — confirms publication
5. Smoke test from fresh directory: `cortex init`, `cortex status`, `cortex map`
6. Begin real-world usage on an actual project to validate GroundLine scoring feel

---

## §5 Deliverables on hand

- `src/` — full TypeScript implementation (confidence, concepts, check, watcher, context)
- `dist/` — compiled CommonJS output
- `templates/.genome/` — all five genome template files
- `AGENTS.md` — AI session briefing
- `INTEGRATION.md` — full cortex + animus integration guide
- `.github/workflows/release.yml` — automated npm publish on tag
