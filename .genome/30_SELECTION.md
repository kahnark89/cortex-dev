# 30_SELECTION — cortex-dev

> **Protected file.** Do not modify without architect sign-off.
> This file carries the architect's decision heuristics and the Cortex autonomous action policy.

---

## §1 Architect Decision Heuristics

1. **Zero-dep is a hard constraint, not a preference.** Any proposal to add a runtime dependency must be rejected unless there is no possible implementation using Node.js built-ins.
2. **EPIGENOME and SHADOW are append-only in the protocol and in the code.** Any UI or CLI that offers to edit existing entries is wrong.
3. **The five genome files are a published interface.** Their names, numbering, and roles cannot change without a major version bump and deprecation path.
4. **`cortex context` output format is a published interface.** `CortexContextBundle` field names and `version: 1` are stable. Add fields, never remove or rename.
5. **Prefer simple regex on markdown over complex parsing.** The genome files are author-controlled markdown, not arbitrary user input. Regex is sufficient and keeps the zero-dep constraint.
6. **SHADOW concepts block unconditionally.** Any proposal to make SHADOW blocking conditional (e.g., "unless intensity < X") is rejected. The unconditional block is the semantic value of SHADOW.

---

## §2 Cortex Autonomous Action Policy

```
GENOTYPE concepts:  block if confidence < 0.60; never auto-merge without human sign-off
SELECTION concepts: require review if confidence < 0.50
SHADOW concepts:    block always; architect override required
Neutral concepts:   auto-merge if confidence > 0.75 and tests pass
```

**Key GENOTYPE concepts for this repo:**
- `ConfidenceDB` / score formula / criticality weights
- `extractSection` / regex pattern / multiline flag behavior
- `CortexContextBundle` / `cortex context` JSON schema
- five-file genome protocol / file roles / mutation rates
- SHADOW always-zero score invariant
- atomic write pattern (`.tmp` → `renameSync`)

---

## §3 Review Triggers

- Any change to `ConfidenceDB.upsert()` or the score formula
- Any change that makes SHADOW concepts non-blocking
- Any change to `CortexContextBundle` that removes or renames existing fields
- Any change to the genome file names or numbering
- Any addition of a runtime dependency to `package.json`
- Any change to `"type"` in `package.json` (must stay CommonJS)
- Any change to `EPIGENOME` or `SHADOW` handling that allows edits to existing entries
- Any change that makes `cortex context` produce side effects
