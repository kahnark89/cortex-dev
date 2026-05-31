import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractConcepts,
  extractOpenQuestions,
  extractPolicy,
  extractShadowEntries,
} from '../concepts';

const SAMPLE_GENOTYPE = `
# 00_GENOTYPE — My Project

## §1 Project Thesis
We build **a reliable payment system** for small businesses.

## §2 Architecture Invariants
1. All state changes flow through \`event-sourcing\`
2. **auth/session** tokens never stored in localStorage

## §4 Hard Lines
- No direct database writes from the API layer
`;

const SAMPLE_SELECTION = `
# 30_SELECTION

## §1 Architect Decision Heuristics

1. Prefer explicit over implicit

## §2 Cortex Autonomous Action Policy

\`\`\`
GENOTYPE concepts:  block if confidence < 0.60; never auto-merge
SELECTION concepts: require review if confidence < 0.50
SHADOW concepts:    block always
Neutral concepts:   auto-merge if confidence > 0.75 and tests pass
\`\`\`
`;

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

test('extractConcepts: extracts headings as GENOTYPE concepts from GENOTYPE file', () => {
  const concepts = extractConcepts(SAMPLE_GENOTYPE, '');
  const names = concepts.map((c) => c.concept);
  assert.ok(names.some((n) => n.toLowerCase().includes('project thesis')), `Expected "Project Thesis" in: ${names}`);
});

test('extractConcepts: extracts bold terms as GENOTYPE concepts', () => {
  const concepts = extractConcepts(SAMPLE_GENOTYPE, '');
  const names = concepts.map((c) => c.concept);
  assert.ok(names.some((n) => n === 'a reliable payment system' || n.includes('auth/session')), `Expected bold terms in: ${names}`);
});

test('extractConcepts: extracts backtick terms as GENOTYPE concepts', () => {
  const concepts = extractConcepts(SAMPLE_GENOTYPE, '');
  const names = concepts.map((c) => c.concept);
  assert.ok(names.some((n) => n === 'event-sourcing'), `Expected backtick term "event-sourcing" in: ${names}`);
});

test('extractConcepts: assigns GENOTYPE criticality to genotype-sourced concepts', () => {
  const concepts = extractConcepts(SAMPLE_GENOTYPE, '');
  assert.ok(concepts.every((c) => c.criticality === 'GENOTYPE'));
});

test('extractConcepts: assigns SELECTION criticality to selection-sourced concepts', () => {
  const concepts = extractConcepts('', SAMPLE_SELECTION);
  assert.ok(concepts.every((c) => c.criticality === 'SELECTION'));
});

test('extractConcepts: deduplicates concepts from same file', () => {
  const doubledMd = SAMPLE_GENOTYPE + '\n' + SAMPLE_GENOTYPE;
  const concepts = extractConcepts(doubledMd, '');
  const names = concepts.map((c) => c.concept);
  const unique = new Set(names.map((n) => n.toLowerCase()));
  assert.strictEqual(names.length, unique.size, 'No duplicate concepts expected');
});

test('extractConcepts: returns empty array for empty inputs', () => {
  const concepts = extractConcepts('', '');
  assert.strictEqual(concepts.length, 0);
});

test('extractOpenQuestions: extracts bullet lines from §3', () => {
  const questions = extractOpenQuestions(SAMPLE_PHENOTYPE);
  assert.ok(questions.length >= 3, `Expected at least 3 questions, got: ${questions.join(', ')}`);
  assert.ok(questions.some((q) => q.includes('confidence.json')));
  assert.ok(questions.some((q) => q.includes('context_distance')));
});

test('extractOpenQuestions: returns empty array when §3 has no bullet points', () => {
  const md = `## §3 Open questions\n\n(nothing yet)\n\n## §4 Next\n`;
  const questions = extractOpenQuestions(md);
  assert.strictEqual(questions.length, 0);
});

test('extractOpenQuestions: returns empty for markdown with no §3', () => {
  const questions = extractOpenQuestions('# No sections here');
  assert.strictEqual(questions.length, 0);
});

test('extractPolicy: parses GENOTYPE threshold from SELECTION', () => {
  const policy = extractPolicy(SAMPLE_SELECTION);
  assert.ok(Math.abs(policy.genotype - 0.60) < 0.001, `Expected 0.60, got ${policy.genotype}`);
});

test('extractPolicy: parses SELECTION threshold', () => {
  const policy = extractPolicy(SAMPLE_SELECTION);
  assert.ok(Math.abs(policy.selection - 0.50) < 0.001, `Expected 0.50, got ${policy.selection}`);
});

test('extractPolicy: parses neutral threshold', () => {
  const policy = extractPolicy(SAMPLE_SELECTION);
  assert.ok(Math.abs(policy.neutral - 0.75) < 0.001, `Expected 0.75, got ${policy.neutral}`);
});

test('extractPolicy: falls back to defaults on empty input', () => {
  const policy = extractPolicy('');
  assert.strictEqual(policy.genotype, 0.60);
  assert.strictEqual(policy.selection, 0.50);
  assert.strictEqual(policy.neutral, 0.75);
});

test('extractShadowEntries: extracts shadow entries by ID and title', () => {
  const entries = extractShadowEntries(SAMPLE_SHADOW);
  assert.ok(entries.length >= 2, `Expected at least 2 shadow entries, got ${entries.length}`);
  assert.ok(entries.some((e) => e.title.includes('GraphQL')));
  assert.ok(entries.some((e) => e.title.includes('MongoDB')));
});

test('extractShadowEntries: returns empty array for empty shadow file', () => {
  const entries = extractShadowEntries('# 40_SHADOW\n\n*No rejected paths yet.*');
  assert.strictEqual(entries.length, 0);
});
