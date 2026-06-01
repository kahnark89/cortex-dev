import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { syncGenome } from '../sync';

function makeGenome(dir: string): void {
  fs.mkdirSync(path.join(dir, '.genome'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), `
# 00_GENOTYPE — MyProject

## §2 Architecture Invariants
1. Zero runtime dependencies.

## §4 Hard Lines
- No direct DB writes from the API layer.
`, 'utf8');
  fs.writeFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), `
# 10_PHENOTYPE

## §1 Current focus

Building the payment module.

## §3 Open questions

- Should we use Stripe or Braintree?
`, 'utf8');
  fs.writeFileSync(path.join(dir, '.genome', '40_SHADOW.md'), `
# 40_SHADOW

### Shadow S001 — GraphQL

**Constraint:** Do not propose GraphQL.
`, 'utf8');
}

function cleanup(dir: string) { fs.rmSync(dir, { recursive: true, force: true }); }
function tmpDir() { return path.join(os.tmpdir(), `cortex-sync-${Date.now()}`); }

test('syncGenome: writes CLAUDE.md, .cursorrules, copilot-instructions', () => {
  const dir = tmpDir();
  makeGenome(dir);
  try {
    const result = syncGenome(dir);
    const written = result.targets.filter((t) => t.written);
    assert.strictEqual(written.length, 3, `Expected 3 written targets, got ${written.length}`);
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(dir, '.cursorrules')));
    assert.ok(fs.existsSync(path.join(dir, '.github', 'copilot-instructions.md')));
  } finally { cleanup(dir); }
});

test('syncGenome: generated files contain current focus', () => {
  const dir = tmpDir();
  makeGenome(dir);
  try {
    syncGenome(dir);
    const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.includes('payment module'), `CLAUDE.md should contain focus: ${claude.slice(0, 200)}`);
  } finally { cleanup(dir); }
});

test('syncGenome: generated files contain shadow entries', () => {
  const dir = tmpDir();
  makeGenome(dir);
  try {
    syncGenome(dir);
    const cursor = fs.readFileSync(path.join(dir, '.cursorrules'), 'utf8');
    assert.ok(cursor.includes('GraphQL'), `Expected GraphQL shadow entry in .cursorrules`);
  } finally { cleanup(dir); }
});

test('syncGenome: skips file that exists without generated marker', () => {
  const dir = tmpDir();
  makeGenome(dir);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# My custom CLAUDE.md\n', 'utf8');
  try {
    const result = syncGenome(dir);
    const claude = result.targets.find((t) => t.file.includes('CLAUDE.md'));
    assert.ok(claude?.skipped, 'Should skip user-owned CLAUDE.md');
    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('My custom CLAUDE.md'), 'Should not overwrite user-owned file');
  } finally { cleanup(dir); }
});

test('syncGenome: overwrites file that has generated marker', () => {
  const dir = tmpDir();
  makeGenome(dir);
  try {
    syncGenome(dir);
    // Run again — should overwrite without error
    const result2 = syncGenome(dir);
    const claude = result2.targets.find((t) => t.file.includes('CLAUDE.md'));
    assert.ok(claude?.written, 'Should overwrite previously generated file');
  } finally { cleanup(dir); }
});
