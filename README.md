# cortex-dev

> AI collaboration governance layer — session coherence + comprehension depth for AI-assisted development

---

## The Problem

Any software project worked on with AI coding assistance across multiple sessions has two compounding failure modes:

**Failure mode A — The AI loses the plot.**
Every new session starts blind. Architecture erodes. Reasoning evaporates. No single session is wrong — the problem is cumulative incoherence across sessions.

**Failure mode B — The AI doesn't understand what it says it understands.**
AI coding assistants are equally confident whether they deeply understand your codebase or have seen a module once. There is no signal telling you where to trust AI suggestions and where to review carefully.

Cortex solves both — as one closed-loop system.

---

## Quickstart

```bash
npm install -g cortex-dev
cortex init              # bootstrap .genome/ + .cortex/ in any project
```

Fill in the five `.genome/` files (15–20 minutes for an existing project). From that point, every AI session on this project loads context in seconds regardless of project age.

---

## How It Works

Cortex combines two layers:

### Layer 1 — Genome (session coherence)

Five markdown files in `.genome/` that every AI coding assistant reads via `AGENTS.md`:

| File | Role | Mutation rate |
|---|---|---|
| `00_GENOTYPE.md` | Project invariants — architecture, hard lines, schema commitments | Very low (architect sign-off) |
| `10_PHENOTYPE.md` | Current sprint focus, acceptance criteria, open questions | High (every session) |
| `20_EPIGENOME.md` | Append-only decision log — what was decided and why | Append-only |
| `30_SELECTION.md` | Architect's decision heuristics + Cortex autonomy policy | Low (architect sign-off) |
| `40_SHADOW.md` | Rejected paths — what was tried and ruled out | Append-only |

Solves: **amnesia** (tiered cold-start), **drift** (reflexivity firewall), **lost reasoning** (append-only epigenome).

### Layer 2 — GroundLine (comprehension depth)

Tracks concept applications across AI-assisted diffs. Measures context-distance of correct reproductions to build a comprehension map:

```
grounding(concept) += context_distance × correctness × criticality_weight
```

- `context_distance` — JSD between structural fingerprints of application sites (high = genuinely new context)
- `correctness` — tests pass, static analysis clean, human review approved
- `criticality_weight` — derived from whether concept appears in GENOTYPE (critical), SELECTION (elevated), or neither

Solves: **confident-but-wrong AI changes**, **no data-driven autonomy policy**.

### The Five Integration Points

These are mechanical connections, not thematic overlaps:

1. **GENOTYPE → concept criticality weights** — GENOTYPE invariants block on low confidence; neutral concepts only flag
2. **SHADOW → forbidden zone detection** — rejected paths become active PR gates, not passive records
3. **PHENOTYPE → measurement scoping** — comprehension monitoring follows the active sprint focus
4. **GroundLine events → EPIGENOME auto-entries** — comprehension history sits alongside decision history
5. **SELECTION → autonomous action policy** — architect's judgment file governs what the AI merges autonomously

---

## CLI

```bash
cortex init                    # bootstrap .genome/ + .cortex/ + update AGENTS.md
cortex hook install            # install pre-commit guard

cortex status                  # phenotype focus + comprehension map (unified view)
cortex status --risk           # only low-confidence + shadow-flagged items

cortex log                     # epigenome (decisions + GroundLine auto-entries)
cortex shadow                  # rejected paths + active forbidden zone alerts
cortex map                     # full comprehension map weighted by GENOTYPE criticality
cortex map --critical          # GENOTYPE-class concepts only
cortex concept <path>          # grounding history + epigenome entries for one concept
cortex since 30d               # comprehension map changes in last 30 days

cortex check --pr <number>     # CI gate: genome violations + confidence + shadow violations
```

---

## PR Gate

```yaml
# .github/workflows/cortex.yml
- name: Cortex check
  run: cortex check --pr ${{ github.event.pull_request.number }}
```

Example output:
```
🔴 Cortex [SHADOW VIOLATION]: auth/oauth-pkce.ts
   Matches Shadow S03. Architect override required.

⚠️  Cortex [LOW CONFIDENCE]: billing/proration.ts — 0.19 (GENOTYPE concept)
   Human review required before merge.

✅ Cortex [OK]: auth/session.ts — 0.87 (12 applications, 5 distinct contexts)
   Auto-merge eligible per SELECTION policy.
```

---

## IDE Extension (VS Code / Cursor)

Status bar: `[Auth refactor] Comprehension: 3 critical concepts LOW`

Sidebar: open questions, low-confidence GENOTYPE concepts, unratified hypotheses, active shadow violations.

Gutter: green (high), yellow (medium), red (low), orange (shadow forbidden zone).

---

## What You Get

| Problem | Cortex's fix |
|---|---|
| Re-briefing each new AI session | Tier 1 cold-start in seconds |
| Architectural drift | Reflexivity firewall on GENOTYPE + SELECTION |
| Lost reasoning | Append-only epigenome |
| Rediscovered rejected paths | Shadow forbidden zones — active PR gates |
| AI confident on code it doesn't understand | Comprehension map from evidence, not self-report |
| No data-driven AI autonomy policy | SELECTION-derived merge policy |

---

## Comparison

| Approach | Amnesia | Drift | Lost reasoning | Comprehension gaps | Autonomy policy |
|---|---|---|---|---|---|
| Raw `AGENTS.md` | partial | ✗ | ✗ | ✗ | ✗ |
| Genome alone | ✓ | ✓ | ✓ | ✗ | ✗ |
| GroundLine alone | ✗ | ✗ | ✗ | partial | partial |
| **Cortex** | **✓** | **✓** | **✓** | **✓** | **✓** |

---

## Derived from Prism

Cortex implements the Genome Protocol and GroundLine comprehension tracking developed for the Prism children's learning companion. Both patterns are domain-general and extracted here for standalone use.

*Capps Consulting Company LLC · extends the AGENTS.md open standard (Linux Foundation)*
