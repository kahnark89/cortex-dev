import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { runCheck, formatCheckResult } from '../check';
import { ConfidenceDB } from '../confidence';

function makeTmpProject(): string {
  const dir = path.join(os.tmpdir(), `cortex-proj-${Date.now()}`);
  fs.mkdirSync(path.join(dir, '.genome'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.cortex'), { recursive: true });

  const selectionMd = `
## §2 Cortex Autonomous Action Policy

\`\`\`
GENOTYPE concepts:  block if confidence < 0.60; never auto-merge
SELECTION concepts: require review if confidence < 0.50
SHADOW concepts:    block always
Neutral concepts:   auto-merge if confidence > 0.75 and tests pass
\`\`\`
  `;

  fs.writeFileSync(path.join(dir, '.genome', '30_SELECTION.md'), selectionMd, 'utf8');
  fs.writeFileSync(path.join(dir, '.genome', '40_SHADOW.md'), '# 40_SHADOW\n\n*No entries.*', 'utf8');

  return dir;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('runCheck: passes when confidence store is empty', () => {
  const dir = makeTmpProject();
  try {
    const result = runCheck(dir);
    assert.strictEqual(result.status, 'pass', 'Empty confidence store should pass');
  } finally {
    cleanup(dir);
  }
});

test('runCheck: fails when GENOTYPE concept is below threshold', () => {
  const dir = makeTmpProject();
  try {
    const db = new ConfidenceDB(path.join(dir, '.cortex', 'confidence.json'));
    // Add a low-score GENOTYPE concept
    db.upsert({ concept: 'auth', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 0.1, correctness: 0.1 });

    const result = runCheck(dir);
    assert.strictEqual(result.status, 'fail', 'Low GENOTYPE confidence should cause failure');
    assert.ok(result.violations.some((v) => v.level === 'error' && v.concept === 'auth'));
  } finally {
    cleanup(dir);
  }
});

test('runCheck: warning (not error) for SELECTION concept below threshold', () => {
  const dir = makeTmpProject();
  try {
    const db = new ConfidenceDB(path.join(dir, '.cortex', 'confidence.json'));
    db.upsert({ concept: 'event-sourcing', file: '30_SELECTION.md', criticality: 'SELECTION', context_distance: 0.1, correctness: 0.1 });

    const result = runCheck(dir);
    // Should have a warning but NOT fail (warnings don't block)
    assert.ok(result.violations.some((v) => v.level === 'warning' && v.concept === 'event-sourcing'));
    assert.strictEqual(result.status, 'pass', 'SELECTION below threshold is a warning, not an error');
  } finally {
    cleanup(dir);
  }
});

test('runCheck: SHADOW concept always produces error', () => {
  const dir = makeTmpProject();
  try {
    const db = new ConfidenceDB(path.join(dir, '.cortex', 'confidence.json'));
    db.upsert({ concept: 'graphql', file: '40_SHADOW.md', criticality: 'SHADOW', context_distance: 1.0, correctness: 1.0 });

    const result = runCheck(dir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.violations.some((v) => v.level === 'error' && v.concept === 'graphql'));
  } finally {
    cleanup(dir);
  }
});

test('runCheck: passes when all concepts are above thresholds', () => {
  const dir = makeTmpProject();
  try {
    const db = new ConfidenceDB(path.join(dir, '.cortex', 'confidence.json'));
    // Add a well-grounded GENOTYPE concept (above 0.60 threshold)
    for (let i = 0; i < 20; i++) {
      db.upsert({ concept: 'auth', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    }
    const result = runCheck(dir);
    const errors = result.violations.filter((v) => v.level === 'error');
    assert.strictEqual(errors.length, 0, 'No errors expected when score is high enough');
  } finally {
    cleanup(dir);
  }
});

test('formatCheckResult: includes PASS for passing result', () => {
  const result = { status: 'pass' as const, violations: [] };
  const output = formatCheckResult(result);
  assert.ok(output.includes('PASS'));
});

test('formatCheckResult: includes FAIL and violation message for failing result', () => {
  const result = {
    status: 'fail' as const,
    violations: [{ level: 'error' as const, file: 'f.md', concept: 'auth', message: 'auth confidence 0.10 < 0.60 — BLOCK' }],
  };
  const output = formatCheckResult(result);
  assert.ok(output.includes('FAIL'));
  assert.ok(output.includes('auth'));
});
