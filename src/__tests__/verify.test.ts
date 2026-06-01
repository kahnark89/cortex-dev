import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  sha256, hashEntryFields, lastChainHash, GENESIS_HASH,
  sealGenome, readLastSeal, verifyChain, runVerify,
} from '../verify';

function tmpDir() { return path.join(os.tmpdir(), `cortex-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`); }
function cleanup(dir: string) { fs.rmSync(dir, { recursive: true, force: true }); }

function makeProject(dir: string, files: Partial<Record<string, string>> = {}): void {
  fs.mkdirSync(path.join(dir, '.genome'), { recursive: true });
  const defaults: Record<string, string> = {
    '00_GENOTYPE.md': '# 00_GENOTYPE — Test\n\n## §2 Invariants\nZero deps.\n',
    '10_PHENOTYPE.md': '# 10_PHENOTYPE\n\n## §1 Focus\nBuilding.\n',
    '20_EPIGENOME.md': '# 20_EPIGENOME\n\n',
    '30_SELECTION.md': '# 30_SELECTION — Test\n\n## §1 Heuristics\nThink.\n',
    '40_SHADOW.md':   '# 40_SHADOW\n\n',
  };
  for (const [f, content] of Object.entries({ ...defaults, ...files }) as [string, string][]) {
    fs.writeFileSync(path.join(dir, '.genome', f), content, 'utf8');
  }
}

// ── sha256 ────────────────────────────────────────────────────────────────────

test('sha256: returns sha256: prefixed hex string of length 71', () => {
  const h = sha256('hello');
  assert.ok(h.startsWith('sha256:'), `Got: ${h}`);
  assert.strictEqual(h.length, 7 + 64); // "sha256:" + 64 hex chars
});

test('sha256: same input always produces same output', () => {
  assert.strictEqual(sha256('cortex'), sha256('cortex'));
});

test('sha256: different inputs produce different hashes', () => {
  assert.notStrictEqual(sha256('a'), sha256('b'));
});

// ── hashEntryFields ───────────────────────────────────────────────────────────

test('hashEntryFields: deterministic for same inputs', () => {
  const h1 = hashEntryFields(GENESIS_HASH, 'E001', 'chose PostgreSQL', 'abc12345', '2026-06-01');
  const h2 = hashEntryFields(GENESIS_HASH, 'E001', 'chose PostgreSQL', 'abc12345', '2026-06-01');
  assert.strictEqual(h1, h2);
});

test('hashEntryFields: changes when prevHash changes', () => {
  const h1 = hashEntryFields(GENESIS_HASH, 'E001', 'chose PostgreSQL', 'abc12345', '2026-06-01');
  const h2 = hashEntryFields(sha256('different'), 'E001', 'chose PostgreSQL', 'abc12345', '2026-06-01');
  assert.notStrictEqual(h1, h2);
});

test('hashEntryFields: changes when subject changes', () => {
  const h1 = hashEntryFields(GENESIS_HASH, 'E001', 'chose PostgreSQL', 'abc12345', '2026-06-01');
  const h2 = hashEntryFields(GENESIS_HASH, 'E001', 'chose MongoDB', 'abc12345', '2026-06-01');
  assert.notStrictEqual(h1, h2);
});

// ── lastChainHash ─────────────────────────────────────────────────────────────

test('lastChainHash: returns GENESIS_HASH for file with no entries', () => {
  assert.strictEqual(lastChainHash('# 20_EPIGENOME\n\nNo entries yet.\n'), GENESIS_HASH);
});

test('lastChainHash: returns the last stored hash', () => {
  const fakeHash = 'sha256:' + 'a'.repeat(64);
  const md = `# 20_EPIGENOME\n\n### E001 — title\n\n> Prev-hash: ${GENESIS_HASH} | Hash: ${fakeHash}\n\n`;
  assert.strictEqual(lastChainHash(md), fakeHash);
});

// ── sealGenome / readLastSeal ─────────────────────────────────────────────────

test('sealGenome: creates seals.jsonl and returns record', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    const record = sealGenome(dir);
    assert.ok(record.root.startsWith('sha256:'));
    assert.ok(record.ts > 0);
    assert.ok('00_GENOTYPE.md' in record.files);
    assert.ok(fs.existsSync(path.join(dir, '.cortex', 'seals.jsonl')));
  } finally { cleanup(dir); }
});

test('readLastSeal: returns null when no seals file exists', () => {
  const dir = tmpDir();
  fs.mkdirSync(dir, { recursive: true });
  try {
    assert.strictEqual(readLastSeal(dir), null);
  } finally { cleanup(dir); }
});

test('readLastSeal: returns the last written seal', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    sealGenome(dir);
    const seal = readLastSeal(dir);
    assert.ok(seal !== null);
    assert.ok(seal!.root.startsWith('sha256:'));
  } finally { cleanup(dir); }
});

test('sealGenome: root changes when a file changes', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    const r1 = sealGenome(dir);
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nNew content.\n', 'utf8');
    const r2 = sealGenome(dir);
    assert.notStrictEqual(r1.root, r2.root);
  } finally { cleanup(dir); }
});

// ── verifyChain ───────────────────────────────────────────────────────────────

function makeChainedEntry(id: string, subject: string, commit: string, date: string, prevHash: string): { text: string; hash: string } {
  const entryHash = hashEntryFields(prevHash, id, subject, commit, date);
  const text = `### ${id} — ${subject}\n\n> Harvested: ${date} | Commit: ${commit} | Author: Test | Date: ${date} | Prev-hash: ${prevHash} | Hash: ${entryHash}\n\n`;
  return { text, hash: entryHash };
}

test('verifyChain: passes for correctly chained entries', () => {
  const e1 = makeChainedEntry('E001', 'chose PostgreSQL', 'abc12345', '2026-06-01', GENESIS_HASH);
  const e2 = makeChainedEntry('E002', 'chose Redis', 'def67890', '2026-06-02', e1.hash);
  const md = `# 20_EPIGENOME\n\n${e1.text}${e2.text}`;
  const result = verifyChain(md);
  assert.strictEqual(result.checked, 2);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.breaks.length, 0);
});

test('verifyChain: detects a tampered entry', () => {
  const e1 = makeChainedEntry('E001', 'chose PostgreSQL', 'abc12345', '2026-06-01', GENESIS_HASH);
  // Tamper: change subject but keep original hash
  const tampered = e1.text.replace('chose PostgreSQL', 'chose MongoDB');
  const md = `# 20_EPIGENOME\n\n${tampered}`;
  const result = verifyChain(md);
  assert.strictEqual(result.checked, 1);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.breaks.length, 1);
  assert.ok(result.breaks[0].entry.includes('E001'));
});

test('verifyChain: skips entries without Hash field', () => {
  const md = `# 20_EPIGENOME\n\n## [2026-05-31] Old entry\n\nNo hash field.\n\n`;
  const result = verifyChain(md);
  assert.strictEqual(result.checked, 0);
  assert.strictEqual(result.valid, true); // no entries to check = valid
});

test('verifyChain: returns empty breaks for empty EPIGENOME', () => {
  const result = verifyChain('# 20_EPIGENOME\n\n');
  assert.strictEqual(result.checked, 0);
  assert.strictEqual(result.valid, true);
});

// ── runVerify ─────────────────────────────────────────────────────────────────

test('runVerify: yellow when no seal exists', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    const result = runVerify(dir);
    assert.strictEqual(result.hasSeal, false);
    assert.strictEqual(result.health, 'yellow');
  } finally { cleanup(dir); }
});

test('runVerify: green after sealing with no changes', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    sealGenome(dir);
    const result = runVerify(dir);
    assert.strictEqual(result.hasSeal, true);
    assert.strictEqual(result.sealMatch, true);
    assert.strictEqual(result.health, 'green');
  } finally { cleanup(dir); }
});

test('runVerify: detects suspicious GENOTYPE change as red', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    sealGenome(dir);
    fs.appendFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), '\nUnauthorized change.\n', 'utf8');
    const result = runVerify(dir);
    assert.strictEqual(result.health, 'red');
    const suspicious = result.sealDiff.find((d) => d.file === '00_GENOTYPE.md');
    assert.strictEqual(suspicious?.status, 'suspicious');
  } finally { cleanup(dir); }
});

test('runVerify: classifies EPIGENOME growth as appended (not suspicious)', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    sealGenome(dir);
    fs.appendFileSync(path.join(dir, '.genome', '20_EPIGENOME.md'), '\n## [2026-06-01] New decision\n\nContent.\n', 'utf8');
    const result = runVerify(dir);
    const epiDiff = result.sealDiff.find((d) => d.file === '20_EPIGENOME.md');
    assert.strictEqual(epiDiff?.status, 'appended', `Expected appended, got ${epiDiff?.status}`);
    assert.notStrictEqual(result.health, 'red');
  } finally { cleanup(dir); }
});

test('runVerify: PHENOTYPE change is classified as modified (expected)', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    sealGenome(dir);
    fs.writeFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '# Updated focus\n', 'utf8');
    const result = runVerify(dir);
    const phenoDiff = result.sealDiff.find((d) => d.file === '10_PHENOTYPE.md');
    assert.strictEqual(phenoDiff?.status, 'modified');
    assert.notStrictEqual(result.health, 'red');
  } finally { cleanup(dir); }
});
