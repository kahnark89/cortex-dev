import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { runClose } from '../session';
import { sealGenome } from '../verify';

function tmpDir() {
  return path.join(os.tmpdir(), `cortex-session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

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

function makeGitProject(dir: string): void {
  makeProject(dir);
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  execSync('git add .genome', { cwd: dir });
  execSync('git commit -m "init genome"', { cwd: dir });
}

// Seal the project then backdate the seal 1 minute so subsequent git commits
// are clearly "after" the seal timestamp when testing drift detection.
function sealAndBackdate(dir: string): void {
  const record = sealGenome(dir);
  const sealsPath = path.join(dir, '.cortex', 'seals.jsonl');
  fs.writeFileSync(sealsPath, JSON.stringify({ ...record, ts: record.ts - 60000 }) + '\n', 'utf8');
}

function codeCommit(dir: string, filename = 'src/index.ts'): void {
  const fullPath = path.join(dir, filename);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `// update ${Date.now()}\n`, 'utf8');
  execSync(`git add "${filename}"`, { cwd: dir });
  execSync(`git commit -m "feat: update ${filename}"`, { cwd: dir });
}

// ── Gate 1: PHENOTYPE freshness ──────────────────────────────────────────────

test('runClose: gate 1 passes when no prior seal (first session)', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'phenotype-fresh');
    assert.ok(gate?.passed, `Expected gate 1 to pass: ${gate?.message}`);
  } finally { cleanup(dir); }
});

test('runClose: gate 1 fails when PHENOTYPE not updated since seal', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    sealGenome(dir); // seal runs after files are written, so mtime < seal.ts
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'phenotype-fresh');
    assert.strictEqual(gate?.passed, false);
  } finally { cleanup(dir); }
});

test('runClose: gate 1 passes when PHENOTYPE updated after seal', () => {
  const dir = tmpDir();
  makeProject(dir);
  try {
    // Backdate seal so PHENOTYPE mtime (now) is clearly > sealTs (60s ago)
    sealAndBackdate(dir);
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated focus.\n', 'utf8');
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'phenotype-fresh');
    assert.ok(gate?.passed, `Expected gate 1 to pass: ${gate?.message}`);
  } finally { cleanup(dir); }
});

// ── Gate 2a: code → genome drift ────────────────────────────────────────────

test('runClose: gate 2a passes when no code commits since seal', () => {
  const dir = tmpDir();
  makeGitProject(dir);
  try {
    sealAndBackdate(dir);
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'drift-code-to-genome');
    assert.ok(gate?.passed, `Expected gate 2a to pass: ${gate?.message}`);
  } finally { cleanup(dir); }
});

test('runClose: gate 2a fails when code changed but EPIGENOME unchanged', () => {
  const dir = tmpDir();
  makeGitProject(dir);
  try {
    sealAndBackdate(dir);
    codeCommit(dir);
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'drift-code-to-genome');
    assert.strictEqual(gate?.passed, false);
    assert.ok(gate!.message.includes('Changed:'));
  } finally { cleanup(dir); }
});

test('runClose: gate 2a passes when code changed and EPIGENOME updated', () => {
  const dir = tmpDir();
  makeGitProject(dir);
  try {
    sealAndBackdate(dir);
    codeCommit(dir);
    fs.appendFileSync(path.join(dir, '.genome', '20_EPIGENOME.md'), '\n## [2026-06-01] New decision\n\nContent.\n', 'utf8');
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'drift-code-to-genome');
    assert.ok(gate?.passed, `Expected gate 2a to pass: ${gate?.message}`);
  } finally { cleanup(dir); }
});

// ── Gate 2b: genome → code drift ────────────────────────────────────────────

test('runClose: gate 2b fails when EPIGENOME grew but no code changed', () => {
  const dir = tmpDir();
  makeGitProject(dir);
  try {
    sealAndBackdate(dir);
    fs.appendFileSync(path.join(dir, '.genome', '20_EPIGENOME.md'), '\n## [2026-06-01] Phantom decision\n\nContent.\n', 'utf8');
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'drift-genome-to-code');
    assert.strictEqual(gate?.passed, false);
    assert.ok(gate!.message.includes('ahead of implementation'));
  } finally { cleanup(dir); }
});

test('runClose: gate 2b passes when EPIGENOME grew and code also changed', () => {
  const dir = tmpDir();
  makeGitProject(dir);
  try {
    sealAndBackdate(dir);
    codeCommit(dir);
    fs.appendFileSync(path.join(dir, '.genome', '20_EPIGENOME.md'), '\n## [2026-06-01] Real decision\n\nContent.\n', 'utf8');
    fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'drift-genome-to-code');
    assert.ok(gate?.passed, `Expected gate 2b to pass: ${gate?.message}`);
  } finally { cleanup(dir); }
});

// ── Gate 3: chain integrity ──────────────────────────────────────────────────

test('runClose: gate 3 fails when EPIGENOME entry has tampered hash', () => {
  const dir = tmpDir();
  makeProject(dir);
  sealGenome(dir);
  const epiPath = path.join(dir, '.genome', '20_EPIGENOME.md');
  const fakeHash = 'sha256:' + 'a'.repeat(64);
  const genesis  = 'sha256:' + '0'.repeat(64);
  fs.appendFileSync(epiPath,
    `\n### E001 — chose PostgreSQL\n\n> Harvested: 2026-06-01 | Commit: abc12345 | Author: Test | Date: 2026-06-01 | Prev-hash: ${genesis} | Hash: ${fakeHash}\n\n`,
    'utf8');
  fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
  try {
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'chain-integrity');
    assert.strictEqual(gate?.passed, false);
  } finally { cleanup(dir); }
});

// ── Gate 4: no suspicious changes ────────────────────────────────────────────

test('runClose: gate 4 fails when protected file changed suspiciously', () => {
  const dir = tmpDir();
  makeProject(dir);
  sealGenome(dir);
  fs.appendFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), '\nUnauthorized change.\n', 'utf8');
  fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
  try {
    const result = runClose(dir);
    const gate = result.gates.find((g) => g.name === 'no-suspicious-changes');
    assert.strictEqual(gate?.passed, false);
    assert.strictEqual(result.passed, false);
  } finally { cleanup(dir); }
});

// ── Badge ─────────────────────────────────────────────────────────────────────

test('runClose: writes badge.json with verified schema on pass', () => {
  const dir = tmpDir();
  makeProject(dir);
  sealAndBackdate(dir);
  fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
  try {
    const result = runClose(dir);
    assert.ok(result.passed);
    const badge = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'badge.json'), 'utf8'));
    assert.strictEqual(badge.schemaVersion, 1);
    assert.strictEqual(badge.label, 'cortex');
    assert.strictEqual(badge.message, 'verified');
    assert.strictEqual(badge.color, 'brightgreen');
    assert.ok(typeof badge.ts === 'number');
  } finally { cleanup(dir); }
});

test('runClose: writes badge.json with unverified schema on fail', () => {
  const dir = tmpDir();
  makeProject(dir);
  sealGenome(dir);
  try {
    const result = runClose(dir);
    assert.strictEqual(result.passed, false);
    const badge = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'badge.json'), 'utf8'));
    assert.strictEqual(badge.message, 'unverified');
    assert.strictEqual(badge.color, 'red');
  } finally { cleanup(dir); }
});

test('runClose: writes badge.svg containing cortex and verified labels', () => {
  const dir = tmpDir();
  makeProject(dir);
  sealAndBackdate(dir);
  fs.appendFileSync(path.join(dir, '.genome', '10_PHENOTYPE.md'), '\nUpdated.\n', 'utf8');
  try {
    runClose(dir);
    const svg = fs.readFileSync(path.join(dir, '.cortex', 'badge.svg'), 'utf8');
    assert.ok(svg.startsWith('<svg'), 'Should be an SVG element');
    assert.ok(svg.includes('cortex'), 'Should include cortex label');
    assert.ok(svg.includes('verified'), 'Should include verified message');
  } finally { cleanup(dir); }
});

// ── --checkOnly mode ──────────────────────────────────────────────────────────

test('runClose: --checkOnly skips gates 1 and 2, does not seal', () => {
  const dir = tmpDir();
  makeProject(dir);
  sealGenome(dir);
  // PHENOTYPE not updated — gate 1 would fail in full mode
  try {
    const result = runClose(dir, { checkOnly: true });
    assert.ok(!result.gates.some((g) => g.name === 'phenotype-fresh'), 'Gate 1 should be absent');
    assert.ok(!result.gates.some((g) => g.name === 'drift-code-to-genome'), 'Gate 2a should be absent');
    assert.ok(!result.gates.some((g) => g.name === 'drift-genome-to-code'), 'Gate 2b should be absent');
    assert.ok(result.gates.some((g) => g.name === 'chain-integrity'), 'Gate 3 should be present');
    assert.ok(result.gates.some((g) => g.name === 'no-suspicious-changes'), 'Gate 4 should be present');
    // No new seal written — seals.jsonl still has exactly 1 line
    const lines = fs.readFileSync(path.join(dir, '.cortex', 'seals.jsonl'), 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1, 'Should not have written a new seal');
  } finally { cleanup(dir); }
});
