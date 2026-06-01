import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { runAudit } from '../audit';

function makeGenome(dir: string, overrides: Record<string, string> = {}): void {
  fs.mkdirSync(path.join(dir, '.genome'), { recursive: true });

  const defaults: Record<string, string> = {
    '00_GENOTYPE.md': '# 00_GENOTYPE — MyProject\n\n## §2 Invariants\nSome invariant.\n',
    '10_PHENOTYPE.md': '# 10_PHENOTYPE\n\n## §1 Current focus\nBuilding stuff.\n',
    '20_EPIGENOME.md': '# 20_EPIGENOME\n\n### E001 — First decision\n\nWe chose X.\n',
    '30_SELECTION.md': '# 30_SELECTION — MyProject\n\n## §1 Heuristics\nThink first.\n',
    '40_SHADOW.md': '# 40_SHADOW\n\n### Shadow S001 — No GraphQL\n\n**Constraint:** No.\n',
  };

  for (const [file, content] of Object.entries({ ...defaults, ...overrides })) {
    fs.writeFileSync(path.join(dir, '.genome', file), content, 'utf8');
  }
}

function cleanup(dir: string) { fs.rmSync(dir, { recursive: true, force: true }); }

function tmpDir() { return path.join(os.tmpdir(), `cortex-audit-${Date.now()}`); }

test('runAudit: green when all files are filled in and fresh', () => {
  const dir = tmpDir();
  makeGenome(dir);
  try {
    const result = runAudit(dir);
    assert.strictEqual(result.health, 'green');
    assert.ok(result.items.every((i) => i.level === 'pass'));
  } finally { cleanup(dir); }
});

test('runAudit: red when .genome/ does not exist', () => {
  const dir = tmpDir();
  fs.mkdirSync(dir);
  try {
    const result = runAudit(dir);
    assert.strictEqual(result.health, 'red');
  } finally { cleanup(dir); }
});

test('runAudit: error when GENOTYPE contains template placeholder', () => {
  const dir = tmpDir();
  makeGenome(dir, { '00_GENOTYPE.md': '# 00_GENOTYPE — [Project Name]\n\nTemplate content.\n' });
  try {
    const result = runAudit(dir);
    const item = result.items.find((i) => i.file === '00_GENOTYPE.md');
    assert.strictEqual(item?.level, 'error');
    assert.strictEqual(result.health, 'red');
  } finally { cleanup(dir); }
});

test('runAudit: warn when PHENOTYPE is stale', () => {
  const dir = tmpDir();
  makeGenome(dir);
  const phenoPath = path.join(dir, '.genome', '10_PHENOTYPE.md');
  const oldTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  fs.utimesSync(phenoPath, oldTime, oldTime);
  try {
    const result = runAudit(dir);
    const item = result.items.find((i) => i.file === '10_PHENOTYPE.md');
    assert.strictEqual(item?.level, 'warn');
  } finally { cleanup(dir); }
});

test('runAudit: warn when EPIGENOME has no entries', () => {
  const dir = tmpDir();
  makeGenome(dir, { '20_EPIGENOME.md': '# 20_EPIGENOME\n\n*No entries yet.*\n' });
  try {
    const result = runAudit(dir);
    const item = result.items.find((i) => i.file === '20_EPIGENOME.md');
    assert.strictEqual(item?.level, 'warn');
  } finally { cleanup(dir); }
});

test('runAudit: warn when SHADOW has no entries', () => {
  const dir = tmpDir();
  makeGenome(dir, { '40_SHADOW.md': '# 40_SHADOW\n\n*No rejected paths yet.*\n' });
  try {
    const result = runAudit(dir);
    const item = result.items.find((i) => i.file === '40_SHADOW.md');
    assert.strictEqual(item?.level, 'warn');
  } finally { cleanup(dir); }
});
