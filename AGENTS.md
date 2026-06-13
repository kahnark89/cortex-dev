# AGENTS.md — cortex-dev

## What this repo is
A Node.js CLI tool that bootstraps and maintains Cortex — the unified AI collaboration governance layer combining the Genome Protocol (session coherence) with GroundLine (comprehension depth tracking).

## Repo structure
- `bin/cortex.js` — the entire CLI, single file, sectioned: [io] [policy] [groundline math] [shadow] [commands] [dispatch]. Make targeted edits inside the relevant section; do not split into modules without architect sign-off (single-file is a deliberate token-cost choice for AI editing).
- `templates/.genome/` — the five Genome template files copied by `cortex init`
- `templates/AGENTS.md` — the AGENTS.md template injected into user projects
- `src/__tests__/cortex.test.js` — end-to-end tests; each test runs the CLI in a throwaway git repo

## Core invariants (do not change without architect sign-off)
1. **`templates/.genome/00_GENOTYPE.md` and `templates/.genome/30_SELECTION.md` define the protected files.** The guard is a **commit-msg** hook (never pre-commit: pre-commit fires before the message exists, so the tag could never be honored and a stale COMMIT_EDITMSG would silently unlock protected files). It blocks staged modifications to these files unless the live commit message carries a GENOTYPE-CHANGE tag.
2. **The epigenome is append-only.** The CLI must never modify or delete existing entries — only append new ones.
3. **The shadow file defines forbidden zones.** Any concept matching a SHADOW entry must be flagged as a violation, not a low-confidence warning.
4. **Policy is parsed live from the ```cortex-policy``` block(s) in `SELECTION.md`** — later blocks override earlier ones per key. There is no compiled policy file; never introduce one that can drift from SELECTION.
5. **GroundLine evidence (`.cortex/confidence.json`) is CLI-owned.** Sessions write it only via `cortex record`, never by hand.

## Development conventions
- Plain CommonJS JavaScript, zero runtime dependencies, no build step
- Template files are plain markdown — keep them readable by humans and AI clients alike
- Tests: `npm test` (node --test). Every command must keep an end-to-end test that exercises it through a real git repo.

## The five genome files (reference)
| File | Role | Mutation |
|---|---|---|
| `00_GENOTYPE.md` | Invariants | Architect sign-off |
| `10_PHENOTYPE.md` | Current state | Any session |
| `20_EPIGENOME.md` | Decision log | Append-only |
| `30_SELECTION.md` | Decision rules | Architect sign-off |
| `40_SHADOW.md` | Rejected paths | Append-only |
