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

---

## [2026-06-01] Pre-commit hook: per-file change tags, not a single shared tag

**Decision:** `hookInstall()` generates a shell hook that checks `GENOTYPE-CHANGE` for `00_GENOTYPE.md` and `SELECTION-CHANGE` for `30_SELECTION.md` independently, rather than accepting `GENOTYPE-CHANGE` as a universal pass for both protected files.

**Rationale:** `00_GENOTYPE.md §4` states "Any commit touching these files must include `GENOTYPE-CHANGE:` or `SELECTION-CHANGE:` in the message." The prior hook accepted `GENOTYPE-CHANGE` for the SELECTION file, which allowed SELECTION modifications to bypass the intended `SELECTION-CHANGE` governance signal. Each tag has semantic meaning — using the wrong tag obscures what kind of protected change was made.

**Author:** claude/project-onboarding-XAXWx

---

## [2026-06-01] Remove dead shadow-entry block from `runCheck()`

**Decision:** Removed the empty `if (shadowEntries.length > 0 && ...)` block from `src/check.ts`, along with the `extractShadowEntries` import, `shadowPath`, `shadowMd`, and `shadowEntries` variables that only fed it.

**Rationale:** SHADOW blocking is fully handled by the `case 'SHADOW':` branch in the main concept loop — any SHADOW-criticality entry in the confidence store unconditionally pushes an error violation. The secondary block added after the loop was a no-op (empty body with a comment "Already added above") and imported dead surface area from `concepts.ts`. Removing it makes the invariant ("SHADOW always blocks") easier to see and audit in a single place.

**Author:** claude/project-onboarding-XAXWx

## [2026-06-01] v0.2 pivot: replace GroundLine with sync/audit/harvest

**Decision:** Removed the GroundLine confidence scoring subsystem (`confidence.ts`, `watcher.ts`, `cortex watch`, `cortex map`, `cortex since`, `cortex concept`, `cortex check` confidence gate). Replaced with three commands targeting the actual developer pain point: `cortex sync` (push genome into CLAUDE.md / .cursorrules / copilot-instructions.md), `cortex audit` (staleness and completeness checks), `cortex harvest` (pull decision commits from git into EPIGENOME). `cortex check` now gates on governance (genome filled in, not stale) rather than GroundLine confidence scores. `CortexContextBundle` bumped to version 2 with `audit` field replacing `comprehension`.

**Rationale:** GroundLine scored proxy signals (file edit frequency) rather than actual AI comprehension. Scores started at ~0.11 on a fresh project and required sustained background watcher activity to climb above the 0.60 GENOTYPE threshold — creating immediate false-positive CI failures and a friction wall before any value was delivered. The sync/audit/harvest model is tool-integrated (outputs land where AI tools already look), maintenance-light (works as a side-effect of normal git workflow), and immediately useful (a freshly-synced project gives every AI session current context from the first run).

**Author:** claude/project-onboarding-XAXWx (user-directed pivot, 2026-06-01)

---

## [2026-06-01] EPIGENOME hash chaining for tamper-evidence

**Decision:** Each entry appended by `cortex harvest --apply` now embeds two fields in its blockquote line: `Prev-hash: sha256:<hex>` (the stored hash of the previous entry, or the genesis hash for the first entry) and `Hash: sha256:<hex>` (computed as SHA-256 of the null-delimited canonical fields: prevHash, id, subject, commitHash, date). `cortex verify` re-derives each hash and flags any mismatch as a chain break.

**Rationale:** An AI session that silently rewrites EPIGENOME history (e.g., removing a decision it disagrees with, or inflating its own contribution) would break the chain at that entry. The chain gives the next session — and the architect — a cryptographic signal that something was tampered with, rather than requiring manual diffing of every entry. This is the core blockchain principle applied locally: immutability through linked hashes, with no network required.

**Author:** claude/project-onboarding-XAXWx (blockchain session, 2026-06-01)

---

## [2026-06-01] Genome seal as session boundary fingerprint

**Decision:** `cortex seal` computes SHA-256 of each genome file, combines them into a simplified Merkle root (SHA-256 of sorted `file:hash` pairs), and appends the record to `.cortex/seals.jsonl` as a single JSON line. `cortex verify` compares the current file hashes against the last seal record and classifies changes: GENOTYPE/SELECTION modifications = `suspicious` (red), EPIGENOME/SHADOW growth = `appended`, PHENOTYPE changes = `modified` (expected churn).

**Rationale:** Session-to-session tamper detection without a distributed network. Appending to an immutable JSONL file means the seal history is itself append-only — past seals cannot be silently removed without shortening the file, which is detectable. The per-file classification avoids false alarms on expected churn (PHENOTYPE updates, EPIGENOME growth) while catching unauthorized edits to protected invariants. Zero runtime dependencies: Node.js `crypto.createHash('sha256')` only.

**Author:** claude/project-onboarding-XAXWx (blockchain session, 2026-06-01)

---

## [2026-06-01] cortex close: session-end gate with bidirectional drift detection

**Decision:** `cortex close` enforces four gates before sealing the session and issuing a `.cortex/badge.json` (shields.io format) + `.cortex/badge.svg`: (1) PHENOTYPE updated since last seal; (2a) if code files changed since last seal, EPIGENOME must have new entries; (2b) if EPIGENOME has new entries, code must also have changed — preventing false genome claims; (3) EPIGENOME chain integrity; (4) no suspicious protected-file changes. `--check` mode (used by the pre-commit hook) runs only gates 3 and 4 without sealing, so mid-session commits aren't blocked.

**Rationale:** The blockchain session itself proved the gap: it ended without updating PHENOTYPE or EPIGENOME, leaving the next session with stale genome state. Gate (2b) catches the inverse problem: an AI session that writes optimistic EPIGENOME entries claiming work is done without backing code. Both directions of drift cause the same failure mode — a future session starts with a false picture of the codebase. The badge gives the project a machine-readable signal of session governance health that can be displayed in a README.

**Author:** claude/project-onboarding-XAXWx (session-gate session, 2026-06-01)
