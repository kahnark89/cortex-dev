# 40_SHADOW — cortex-dev

> **Append-only.** Never edit or delete existing entries.
> Each entry: ID, what was tried, why it was ruled out, date.

---

## S001 — AST-based concept extraction

**Tried:** Using a markdown AST parser (unified/remark) to extract concepts from genome files.

**Ruled out:** Any AST parser is a runtime dependency, which breaks the zero-dep constraint. The genome files are structured markdown written by humans following a convention — regex on that convention (headings, bold, backticks) is sufficient and requires no external packages. If the convention is followed, regex extraction is reliable.

**Date:** 2026-05-31

---

## S002 — Hard-requiring animus-sdk in cortex-dev

**Tried:** Making animus-sdk a runtime `dependency` of cortex-dev so `cortex context` could always include a mood-line.

**Ruled out:** cortex-dev is a standalone governance tool — it should work on any project regardless of whether animus-sdk is installed. Hard-requiring animus-sdk would force all cortex users to install animus-sdk. The try/catch `require('animus-sdk')` pattern gives the integration when present and degrades silently when absent.

**Date:** 2026-05-31

---

## S003 — `m` (multiline) flag in `extractSection` regex

**Tried:** Using `/## §N heading([\s\S]*?)(?=^##\s|$)/m` (with multiline flag) to extract genome sections.

**Ruled out:** With the `m` flag, `$` matches end-of-line, not end-of-string. The lazy `[\s\S]*?` stops at the first line boundary, matching an empty string. The result: `extractOpenQuestions` returns empty even when §3 has bullet points. Fix: remove `m` flag, use `(?=\n##\s|$)` so `$` anchors to end-of-string.

**Date:** 2026-05-31

---

## S004 — Conditional SHADOW blocking (score-based or intensity-based)

**Tried:** Making SHADOW blocking conditional — e.g., "block only if the SHADOW concept score exceeds some threshold" or "allow if intensity is low."

**Ruled out:** SHADOW entries are architectural dead ends that the team has explicitly decided to close. Any condition that allows a SHADOW concept to "pass" undermines the entire SHADOW mechanism. The unconditional block is the semantic value — SHADOW means "we have already decided this path is wrong, regardless of how much the AI thinks it understands it."

**Date:** 2026-05-31

---

## S005 — `cortex context` writing to disk / producing side effects

**Tried:** Having `cortex context` also update `.cortex/last-context.json` as a cache when it runs.

**Ruled out:** `cortex context` is designed to be piped. Side effects in a pipe command are surprising and break idempotency. If a user runs `cortex context | animus inject --from-cortex` multiple times, the side effect fires multiple times. Cache-at-read is an anti-pattern here. If caching is needed in future, it should be a separate `cortex context --cache` flag with explicit opt-in.

**Date:** 2026-05-31
