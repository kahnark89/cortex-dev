# AGENTS.md — cortex-dev

## What this repo is
A Node.js CLI tool that installs Cortex genome governance into any project. Uses the same five-file genome protocol on itself as a live dog-food example.

## Session start — load in order

**Always load:**
1. This file (AGENTS.md)
2. `.genome/00_GENOTYPE.md` — architecture invariants, hard lines (protected — do not modify)
3. `.genome/10_PHENOTYPE.md` — current focus, acceptance criteria, open questions (update freely)

**Load when the task touches *why* something is designed as it is:**
4. `.genome/20_EPIGENOME.md` — append-only decision log
5. `.genome/40_SHADOW.md` — rejected paths and forbidden zones

**Load when making a judgment call without explicit direction:**
6. `.genome/30_SELECTION.md` — architect's decision heuristics

After reading, state the current focus from PHENOTYPE §1 back to the architect before starting work.

## Repo structure
- `bin/cortex.js` — CLI entry point (all cortex commands, CommonJS, zero deps)
- `src/` — TypeScript source: `audit`, `check`, `concepts`, `context`, `harvest`, `index`, `session`, `sync`, `verify`
- `src/__tests__/` — test suite (67 tests)
- `dist/` — compiled CommonJS output (`npm run build`)
- `templates/.genome/` — five genome template files copied by `cortex init`
- `templates/AGENTS.md` — AGENTS.md template injected into user projects by `cortex init`

## Build and test
```bash
npm run build   # tsc → dist/
npm test        # rm -rf .dist-test && tsc -p tsconfig.test.json && node --test
```

## Session rules
- **Never modify** `.genome/00_GENOTYPE.md` or `.genome/30_SELECTION.md` without explicit architect sign-off. Propose changes in PHENOTYPE §3 instead.
- **Append only** to `.genome/20_EPIGENOME.md` and `.genome/40_SHADOW.md`. Never edit existing entries.
- **Mark inferred reasoning** as `(hypothesis — UNCONFIRMED)` in epigenome entries.
- **Update PHENOTYPE** §1 to reflect the session's outcome before closing.

## Session close (mandatory)
```
node bin/cortex.js close
```

> Note: use `node bin/cortex.js` not `npx cortex-dev` — this repo runs the local dev version, not the published package.

This enforces four gates automatically:
1. **PHENOTYPE freshness** — §1 must reflect the session's outcome
2. **Code → genome drift** — if code changed, EPIGENOME must have new entries
3. **Genome → code drift** — if EPIGENOME grew, code must have also changed (prevents false claims)
4. **Chain integrity** — EPIGENOME hash chain intact; no protected files changed outside cortex

**If any gate fails, fix what it describes and re-run.** Do not end the session until it exits 0. On pass, it seals the genome and writes `.cortex/badge.json`.

## The five genome files (reference)
| File | Role | Mutation |
|---|---|---|
| `00_GENOTYPE.md` | Invariants | Architect sign-off |
| `10_PHENOTYPE.md` | Current state | Any session |
| `20_EPIGENOME.md` | Decision log | Append-only |
| `30_SELECTION.md` | Decision rules | Architect sign-off |
| `40_SHADOW.md` | Rejected paths | Append-only |
