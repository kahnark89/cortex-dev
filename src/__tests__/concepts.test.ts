import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOpenQuestions, extractShadowEntries, extractSection } from '../concepts';

const SAMPLE_PHENOTYPE = `
# 10_PHENOTYPE

## §1 Current focus

Building the GroundLine backend.

## §3 Open questions (incl. proposed GENOTYPE changes awaiting sign-off)

- Should confidence.json be per-branch or global?
- Is context_distance reliable from diff only?
- Does the shadow gate need an override flag?

## §4 Next actions

1. Implement confidence.ts
`;

const SAMPLE_SHADOW = `
# 40_SHADOW

### Shadow S001 — GraphQL Gateway

**Proposed:** Replace REST with GraphQL
**Why rejected:** Added complexity without benefit at current scale
**Constraint:** Do not propose GraphQL without re-opening this decision with scale metrics.

### Shadow S002 — MongoDB

**Proposed:** Use MongoDB as primary store
**Why rejected:** Inconsistent query semantics for our billing model
**Constraint:** Primary store must be relational.
`;

test('extractOpenQuestions: extracts bullet lines from §3', () => {
  const questions = extractOpenQuestions(SAMPLE_PHENOTYPE);
  assert.ok(questions.length >= 3, `Expected at least 3 questions, got: ${questions.join(', ')}`);
  assert.ok(questions.some((q) => q.includes('confidence.json')));
  assert.ok(questions.some((q) => q.includes('context_distance')));
});

test('extractOpenQuestions: returns empty array when §3 has no bullet points', () => {
  const md = `## §3 Open questions\n\n(nothing yet)\n\n## §4 Next\n`;
  assert.strictEqual(extractOpenQuestions(md).length, 0);
});

test('extractOpenQuestions: returns empty for markdown with no §3', () => {
  assert.strictEqual(extractOpenQuestions('# No sections here').length, 0);
});

test('extractShadowEntries: extracts shadow entries by title', () => {
  const entries = extractShadowEntries(SAMPLE_SHADOW);
  assert.ok(entries.length >= 2, `Expected at least 2 entries, got ${entries.length}`);
  assert.ok(entries.some((e) => e.title.includes('GraphQL')));
  assert.ok(entries.some((e) => e.title.includes('MongoDB')));
});

test('extractShadowEntries: extracts constraint text', () => {
  const entries = extractShadowEntries(SAMPLE_SHADOW);
  const graphql = entries.find((e) => e.title.includes('GraphQL'));
  assert.ok(graphql?.constraint.includes('scale metrics'));
});

test('extractShadowEntries: returns empty array for empty shadow file', () => {
  assert.strictEqual(extractShadowEntries('# 40_SHADOW\n\n*No rejected paths yet.*').length, 0);
});

test('extractSection: returns body of a named section', () => {
  const md = `## §1 Focus\n\nSome focus text.\n\n## §2 Other\n\nOther text.\n`;
  const body = extractSection(md, '§1');
  assert.ok(body?.includes('Some focus text.'), `Got: ${body}`);
  assert.ok(!body?.includes('Other text.'), 'Should not bleed into next section');
});

test('extractSection: returns null when section not found', () => {
  assert.strictEqual(extractSection('# No sections', '§99'), null);
});
