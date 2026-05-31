# 20_EPIGENOME — cortex-dev

> **Append-only decision log.** Never edit or delete existing entries.
> Add new entries at the bottom. Each entry: date, decision, rationale, who.

---

## [2026-05-31] Five-file genome protocol as the session coherence schema

**Decision:** Five files (`GENOTYPE`, `PHENOTYPE`, `EPIGENOME`, `SELECTION`, `SHADOW`) numbered `00`–`40` in `.genome/`. The numbering ensures consistent sort order across all file systems.

**Rationale:** Tiered mutation rates (immutable invariants → live sprint state → append-only log) map naturally to different AI session behaviors. A single flat `CONTEXT.md` collapses all tiers and causes drift. The five-file split is the minimum viable structure that prevents this.

**Author:** Capps Consulting / initial build session

---

## [2026-05-31] SHADOW concepts score 0 always — not just policy, but code invariant

**Decision:** `ConfidenceDB.upsert()` hard-codes `score = 0` for any concept with `criticality === 'SHADOW'`, regardless of input parameters.

**Rationale:** SHADOW entries are rejected paths — architectural dead ends the team has explicitly ruled out. Treating them as learnable would allow the AI to slowly "re-discover" paths that were deliberately closed. The score 0 is a semantic statement: these are not concepts to be understood better, they are forbidden zones to be recognized and avoided.

**Author:** claude/cortex-animus-repos-eV8MC

---

## [2026-05-31] Zero-dep concept extraction: regex over AST

**Decision:** `concepts.ts` extracts concepts using regex on markdown (## headings, **bold**, `backtick` terms). No AST parser.

**Rationale:** An AST-based approach (e.g., unified/remark) would add runtime dependencies and language-specific parsers. The genome files are markdown written by humans following a convention — regex on that convention is sufficient and keeps the zero-dep constraint.

**Author:** claude/cortex-animus-repos-eV8MC

---

## [2026-05-31] Atomic write for ConfidenceDB (same pattern as animus Memory)

**Decision:** `ConfidenceDB.save()` writes to `<path>.tmp` then `fs.renameSync`.

**Rationale:** The watcher runs in the background and upserts on every genome file change. A crash mid-write without atomic rename would corrupt the confidence store, which is hard to reconstruct. Atomic rename prevents this at no performance cost.

**Author:** claude/cortex-animus-repos-eV8MC

---

## [2026-05-31] `cortex context` is stdout-only JSON with no side effects

**Decision:** `cortex context` prints `CortexContextBundle` to stdout and exits. It does not modify any files, write to `.cortex/`, or trigger events.

**Rationale:** stdout JSON makes the command safely pipeable: `cortex context | animus inject --from-cortex`. Side effects would make the command non-idempotent and break pipe-based workflows. The consumer (animus, shell scripts) decides what to do with the bundle.

**Author:** claude/cortex-animus-repos-eV8MC

---

## [2026-05-31] Integration with animus-sdk: optional, graceful, try/catch only

**Decision:** `context.ts` `detectAnimus()` wraps `require('animus-sdk')` in try/catch. cortex-dev has no `dependencies` entry for animus-sdk.

**Rationale:** cortex-dev is a standalone tool. Requiring animus-sdk would force every cortex user to install animus-sdk even if they don't use it. The try/catch pattern gives the integration "for free" if animus-sdk is present, silently degrades if it isn't.

**Author:** claude/cortex-animus-repos-eV8MC

---

## [2026-05-31] `extractSection` regex: no `m` flag, `(?=\n##\s|$)` lookahead

**Decision:** Section extraction uses `/## §N heading([\s\S]*?)(?=\n##\s|$)/` without the `m` (multiline) flag.

**Rationale:** With the `m` flag, `^` and `$` match line boundaries, not string boundaries. The lazy `[\s\S]*?` then stops at the first line boundary (matching empty string) instead of running to the next section heading. Removing `m` makes `$` match end-of-string, which is the intended anchor.

**Author:** claude/cortex-animus-repos-eV8MC

---

## [2026-05-31] Test output to `.dist-test/` separate from production `dist/`

**Decision:** `tsconfig.test.json` compiles to `.dist-test/`. Production `tsconfig.json` excludes `src/__tests__/`.

**Rationale:** Identical to animus-sdk decision. npm `"files": ["dist/"]` includes everything in `dist/` regardless of `.npmignore`. Separating test compilation keeps the published tarball clean.

**Author:** claude/cortex-animus-repos-eV8MC
