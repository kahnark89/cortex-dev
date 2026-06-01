## Cortex

This project uses [cortex-dev](https://github.com/kahnark89/cortex-dev) for AI collaboration governance.

### Loading instructions (every session)

**Tier 1 — always load:**
1. This file (AGENTS.md)
2. `.genome/00_GENOTYPE.md` — project invariants, hard lines, architecture constraints
3. `.genome/10_PHENOTYPE.md` — current sprint focus and open questions

**Tier 2 — load when the task touches *why* something is designed as it is:**
4. `.genome/20_EPIGENOME.md` — decision history (append-only log)
5. `.genome/40_SHADOW.md` — rejected paths and forbidden zones

**Tier 3 — load when making a judgment call without explicit direction:**
6. `.genome/30_SELECTION.md` — architect's decision heuristics

**Tier 4 — load specific artifacts in play:**
7. `src/`, `docs/`, or other paths relevant to the current task

### Session rules

- **Never modify** `.genome/00_GENOTYPE.md` or `.genome/30_SELECTION.md` without explicit architect sign-off. Propose changes in PHENOTYPE §3 instead.
- **Append only** to `.genome/20_EPIGENOME.md` and `.genome/40_SHADOW.md`. Never edit existing entries.
- **Mark inferred reasoning** as `(hypothesis — UNCONFIRMED)` in epigenome entries. Do not assert inferred reasoning as stated fact.
- **Update PHENOTYPE** at the end of each session to reflect the new current state.

### Coherence check

At the start of each session, state the current focus from PHENOTYPE §1 back to the architect. If you cannot state it correctly, the genome needs tightening — the failure is in the genome, not in you.

