# cortex-dev

> The pre-merge trust layer for AI-written code. Know which AI changes to merge and which to actually read.

---

## The problem nobody's gate catches

Your AI agents now write most of the diff. Your AI code reviewer reviews the diff. Both are missing the same thing: **the project's accumulated judgment.**

A per-PR reviewer sees a clean diff that passes tests and approves it — without knowing that this exact approach was tried and rejected in March, that it quietly violates an architectural invariant decided in week two, or that the agent proposing it has never successfully touched this subsystem before. Tests pass. Lint is clean. The PR is still wrong, and nothing in your pipeline can know that, because the knowledge lives in the architect's head and in chat transcripts nobody re-reads.

Two compounding failure modes:

**A — The AI loses the plot.** Every new session starts blind. Architecture erodes. Rejected paths get re-proposed. No single session is wrong; the damage is cumulative incoherence.

**B — The AI doesn't know what it doesn't understand.** Coding agents are equally confident on a module they've mastered and a module they've seen once. Nothing tells you where to trust and where to read carefully.

Cortex closes both — as one closed-loop system that turns project memory into enforced merge policy.

---

## Quickstart

```bash
npm install -g cortex-dev
cortex init              # bootstrap .genome/ + .cortex/ in any project
```

Fill in the five `.genome/` files (15–20 minutes for an existing project). From that point, every AI session loads full project judgment in seconds, and every PR is checked against it.

---

## How It Works

### Layer 1 — Genome (the project's judgment, in files)

Five markdown files in `.genome/` that every coding agent reads via `AGENTS.md` — but unlike a flat AGENTS.md, with **enforced mutation rules**:

| File | Role | Mutation rate |
|---|---|---|
| `00_GENOTYPE.md` | Project invariants — architecture, hard lines, schema commitments | Very low (architect sign-off) |
| `10_PHENOTYPE.md` | Current sprint focus, acceptance criteria, open questions | High (every session) |
| `20_EPIGENOME.md` | Append-only decision log — what was decided and why | Append-only |
| `30_SELECTION.md` | Architect's decision heuristics + AI autonomy policy | Low (architect sign-off) |
| `40_SHADOW.md` | Rejected paths — what was tried and ruled out | Append-only |

A flat AGENTS.md is advice. The genome is governed state: invariants the agent cannot edit (reflexivity firewall), decisions it cannot erase (append-only), and dead ends it cannot resurrect (shadow file). Solves amnesia, drift, and lost reasoning.

### Layer 2 — GroundLine (evidence-based trust)

Tracks concept applications across AI-assisted diffs and builds a comprehension map from **evidence, not self-report**:

```
grounding(concept) += context_distance × correctness × criticality_weight
```

- `context_distance` — JSD between structural fingerprints of application sites (high = genuinely new context, not pattern-matching the last diff)
- `correctness` — tests pass, static analysis clean, human review approved
- `criticality_weight` — derived from whether the concept appears in GENOTYPE (critical), SELECTION (elevated), or neither

An agent that has correctly applied a concept twelve times across five distinct contexts has *earned* autonomy on it. An agent at 0.19 on a GENOTYPE-class concept gets a human, every time. That's a merge policy derived from data — not vibes, not a blanket "review everything" rule that nobody follows at AI-generated volume.

### The Five Integration Points

These are mechanical connections, not thematic overlaps:

1. **GENOTYPE → criticality weights** — invariant concepts block on low confidence; neutral concepts only flag
2. **SHADOW → forbidden zones** — rejected paths become active PR gates, not passive records
3. **PHENOTYPE → measurement scoping** — comprehension tracking follows the live sprint focus
4. **GroundLine → EPIGENOME auto-entries** — comprehension history sits alongside decision history
5. **SELECTION → autonomy policy** — the architect's judgment file governs what merges without a human

---

## The PR Gate

```yaml
# .github/workflows/cortex.yml
- name: Cortex check
  run: cortex check --pr ${{ github.event.pull_request.number }}
```

```
🔴 Cortex [SHADOW VIOLATION]: auth/oauth-pkce.ts
   Matches Shadow S03 (rejected 2026-03-14: PKCE-only flow breaks the
   embedded-webview clients). Architect override required.

⚠️  Cortex [LOW CONFIDENCE]: billing/proration.ts — 0.19 (GENOTYPE concept)
   Human review required before merge.

✅ Cortex [OK]: auth/session.ts — 0.87 (12 applications, 5 distinct contexts)
   Auto-merge eligible per SELECTION policy.
```

Your AI reviewer answers *"is this diff well-written?"* Cortex answers the question that actually gates a merge: *"does this diff contradict anything this project has already learned, and has this agent earned the right to ship it unreviewed?"* Run both — they're different layers.

---

## CLI

```bash
cortex init                    # bootstrap .genome/ + .cortex/ + update AGENTS.md
cortex hook install            # install commit-msg guard for protected genome files

cortex status                  # phenotype focus + risk summary
cortex status --risk           # only low-confidence + shadow-flagged items

cortex log                     # epigenome (decisions + GroundLine auto-entries)
cortex shadow                  # rejected paths + active forbidden zone alerts
cortex map                     # full comprehension map weighted by GENOTYPE criticality
cortex map --critical          # GENOTYPE-class concepts only
cortex concept <name>          # grounding history + epigenome mentions for one concept
cortex since 30d               # comprehension activity in the last 30 days

cortex record <concept> <file> # record a concept application  [--fail] [--note "..."]
cortex check [--pr <number>]   # gate: exit 2 = shadow violation, 1 = critical low confidence, 0 = clean
```

### How evidence gets in

`cortex record` is the GroundLine data entry point — an AI session (per its AGENTS.md instructions) or your CI calls it after a concept is applied:

```bash
cortex record session-auth auth/refresh.js                 # tests passed → grounding grows
cortex record session-auth auth/session.js --fail          # broke in review → score decays
```

Each record computes the structural fingerprint of the application site, measures JSD context-distance against everything seen before (repeating a known context earns ~0), scales by genome criticality (GENOTYPE-class concepts need **twice** the evidence), and auto-appends a `[GroundLine]` line to the epigenome — comprehension history living beside decision history.

### Shadow forbidden zones

Add a `**Forbidden:**` line to any shadow entry and it becomes machine-enforced:

```markdown
### Shadow S03 — PKCE-only OAuth flow
**Why rejected:** breaks the embedded-webview clients
**Forbidden:** auth/oauth-pkce
```

### Policy

Thresholds live in a ` ```cortex-policy ` JSON block inside `30_SELECTION.md` (the architect's judgment file governs the machine gate — integration point 5):

```json
{ "auto_merge": 0.70, "review": 0.40, "critical_block": 0.60, "gain": 0.25, "fail_decay": 0.6 }
```

---

## Roadmap

- IDE extension (VS Code / Cursor): status-bar comprehension summary, gutter confidence colors, shadow-zone highlights
- `cortex record --auto`: derive concept applications straight from the staged diff
- GitHub Action wrapper publishing check results as PR review comments

---

## What You Get

| Problem | Cortex's fix |
|---|---|
| Re-briefing each new AI session | Tier 1 cold-start in seconds |
| Architectural drift | Reflexivity firewall on GENOTYPE + SELECTION |
| Lost reasoning | Append-only epigenome |
| Rejected paths re-proposed | Shadow forbidden zones — active PR gates |
| AI confident on code it doesn't understand | Comprehension map from evidence, not self-report |
| "Review everything" collapsing under AI volume | Data-driven merge policy from SELECTION |

---

## Comparison

| Approach | Sees the diff | Sees project history | Knows rejected paths | Knows what the AI has mastered | Gates the merge |
|---|---|---|---|---|---|
| Raw `AGENTS.md` / CLAUDE.md | ✗ | partial | ✗ | ✗ | ✗ |
| Per-PR AI reviewer (CodeRabbit, PR-Agent, etc.) | ✓ | ✗ | ✗ | ✗ | partial |
| Genome alone | ✗ | ✓ | ✓ | ✗ | ✗ |
| **Cortex** | **✓** | **✓** | **✓** | **✓** | **✓** |

Cortex extends the AGENTS.md open standard — it doesn't replace your existing setup, it makes it enforceable.

---

## Provenance

Cortex implements the Genome Protocol and GroundLine comprehension tracking developed across long-running multi-agent projects (the Prism learning companion among them), where dozens of cold-start AI sessions over months made cumulative incoherence the dominant failure mode. Both patterns are domain-general and extracted here for standalone use.

*Capps Consulting Company LLC · extends the AGENTS.md open standard (Linux Foundation)*
