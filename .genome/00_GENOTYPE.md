# 00_GENOTYPE — cortex-dev

> **Protected file.** Do not modify without architect sign-off.
> Any commit modifying this file must include `GENOTYPE-CHANGE: <reason>` in the commit message.
> Log the authorization in `20_EPIGENOME.md` after making the change.

---

## §1 Project Thesis

cortex-dev is an AI collaboration governance layer that solves two compounding failure modes in AI-assisted development: session amnesia (every new session starts blind, architecture erodes) and comprehension gaps (AI is equally confident whether it deeply understands code or has seen it once). Cortex solves both as one closed-loop system: five structured genome files provide session coherence, and the GroundLine engine tracks concept applications across diffs to build an evidence-based comprehension map. The two layers are mechanically integrated — genome criticality weights feed directly into GroundLine thresholds.

---

## §2 Architecture Invariants

1. **Five-file genome protocol is the schema.** `00_GENOTYPE`, `10_PHENOTYPE`, `20_EPIGENOME`, `30_SELECTION`, `40_SHADOW` — the names, numbering, and roles of these files are a published interface read by AI coding assistants via `AGENTS.md`.
2. **GroundLine confidence store is `confidence.json`.** Plain JSON. Atomic writes (`.tmp` then `fs.renameSync`). Score formula: `new = clamp01(old + SCORE_STEP × context_distance × correctness × criticality_weight)`.
3. **Zero runtime dependencies.** Published package uses only Node.js built-ins. No third-party imports in `src/` or `bin/`.
4. **CommonJS output only.** `"module": "CommonJS"` in tsconfig, no `"type": "module"` in package.json.
5. **SHADOW concepts score 0 always.** Shadow entries are forbidden zones. They are never "learned" — score stays 0 regardless of applications. This is a hard constraint, not a policy.
6. **Integration with animus-sdk is optional and graceful.** `require('animus-sdk')` is always wrapped in try/catch. cortex-dev never hard-requires animus-sdk.

---

## §3 Design Principles

1. **Evidence over self-report.** Comprehension scores come from diff applications across distinct contexts, not from the AI asserting what it knows.
2. **Genome files are the cold-start.** A new AI session on any project with cortex-dev reads the genome in under 30 seconds and has full architectural context. This is the primary value proposition.
3. **Mechanical integration, not thematic overlap.** The five integration points between genome and GroundLine (GENOTYPE→weights, SHADOW→gates, PHENOTYPE→scope, events→EPIGENOME, SELECTION→policy) are specific code connections, not vague alignment.
4. **EPIGENOME is append-only.** Decisions are logged forward, never rewritten. This is a protocol invariant, not a preference.

---

## §4 Hard Lines (Non-Negotiables)

1. **SHADOW entries always block.** A SHADOW concept in the confidence store produces an error in `cortex check`, regardless of score or any other condition.
2. **GENOTYPE and SELECTION files require architect sign-off to modify.** Any commit touching these files must include `GENOTYPE-CHANGE:` or `SELECTION-CHANGE:` in the message.
3. **EPIGENOME is append-only.** Never edit or delete existing entries. Only append.
4. **Concept extraction is zero-dep regex, not AST.** Using an AST parser would require language-specific deps and break the zero-dependency constraint. Regex on markdown (headings, bold, backticks) is the defined extraction method.
5. **`cortex context` output is stdout JSON only.** No interactive prompts, no side effects. The command is designed to be piped.

---

## §5 Schema Commitments

**Genome file roles and mutation rates:**
| File | Mutation rate |
|---|---|
| `00_GENOTYPE.md` | Very low — architect sign-off required |
| `10_PHENOTYPE.md` | High — any session updates freely |
| `20_EPIGENOME.md` | Append-only — never edit existing entries |
| `30_SELECTION.md` | Low — architect sign-off required |
| `40_SHADOW.md` | Append-only — never edit existing entries |

**`CortexContextBundle` shape (published stdout interface):**
```typescript
{
  version: 2;
  generatedAt: number;       // epoch ms
  genome: { focus, openQuestions, hasGenotype, hasEpigenome, hasShadow, hasSelection };
  audit: { health: 'green' | 'yellow' | 'red', items: AuditItem[] };
  animus: { present, moodLine?, schemaName? };
}
```

**`ConceptEntry` shape (confidence store):**
```typescript
{ concept: string; criticality: 'GENOTYPE'|'SELECTION'|'SHADOW'|'neutral'; score: number; applications: number; lastSeen: number; }
```

---

## §6 Security Model

cortex-dev is a local developer tool. `cortex check` exits with code 1 on violations — it does not write to external systems. The `GenomeWatcher` uses `fs.watch()` on `.genome/` only. `cortex context` prints to stdout — the consumer (animus inject, shell pipe) controls where it goes. No network calls in the core SDK.

---

## §7 Aliveness Test

"Can a new AI session on a 6-month-old project get full architectural context and know exactly where the AI's comprehension is weak — in under 2 minutes, without the developer explaining anything?"
