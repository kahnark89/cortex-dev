# AGENTS.md — cortex-dev

## What this repo is
A Node.js CLI tool that bootstraps and maintains Cortex — the unified AI collaboration governance layer combining the Genome Protocol (session coherence) with GroundLine (comprehension depth tracking).

## Repo structure
- `bin/cortex.js` — CLI entry point (all cortex commands)
- `templates/.genome/` — the five Genome template files copied by `cortex init`
- `templates/AGENTS.md` — the AGENTS.md template injected into user projects

## Core invariants (do not change without architect sign-off)
1. **`templates/.genome/00_GENOTYPE.md` and `templates/.genome/30_SELECTION.md` define the protected files.** The pre-commit hook must block modifications to these files without an explicit GENOTYPE-CHANGE tag in the commit message.
2. **The epigenome is append-only.** The CLI must never modify or delete existing entries — only append new ones.
3. **The shadow file defines forbidden zones.** Any concept matching a SHADOW entry must be flagged as a violation, not a low-confidence warning.
4. **`policy.yml` in `.cortex/` is always compiled from `SELECTION.md`.** Never tell users to edit it directly.

## Development conventions
- TypeScript strict mode
- Zero runtime dependencies for the CLI skeleton
- Template files are plain markdown — keep them readable by humans and AI clients alike
- Tests live in `src/__tests__/`

## The five genome files (reference)
| File | Role | Mutation |
|---|---|---|
| `00_GENOTYPE.md` | Invariants | Architect sign-off |
| `10_PHENOTYPE.md` | Current state | Any session |
| `20_EPIGENOME.md` | Decision log | Append-only |
| `30_SELECTION.md` | Decision rules | Architect sign-off |
| `40_SHADOW.md` | Rejected paths | Append-only |
