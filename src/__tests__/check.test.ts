import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { runCheck, formatCheckResult } from '../check';

function makeProject(opts: { filled?: boolean; phenotypeAge?: number } = {}): string {
  const dir = path.join(os.tmpdir(), `cortex-check-${Date.now()}`);
  fs.mkdirSync(path.join(dir, '.genome'), { recursive: true });

  const placeholder = opts.filled === false ? '[Project Name]' : 'MyProject';

  fs.writeFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), `# 00_GENOTYPE — ${placeholder}\n\n## §2 Invariants\nSome invariant.\n`, 'utf8');

  const phenoPath = path.join(dir, '.genome', '10_PHENOTYPE.md');
  fs.writeFileSync(phenoPath, `# 10_PHENOTYPE\n\n## §1 Current focus\nBuilding things.\n`, 'utf8');
  if (opts.phenotypeAge) {
    const ts = Date.now() - opts.phenotypeAge * 24 * 60 * 60 * 1000;
    fs.utimesSync(phenoPath, new Date(ts), new Date(ts));
  }

  fs.writeFileSync(path.join(dir, '.genome', '20_EPIGENOME.md'), `# 20_EPIGENOME\n\n### E001 — First decision\n\nWe chose X.\n`, 'utf8');
  fs.writeFileSync(path.join(dir, '.genome', '30_SELECTION.md'), `# 30_SELECTION — ${placeholder}\n\n## §1 Heuristics\nThink first.\n`, 'utf8');
  fs.writeFileSync(path.join(dir, '.genome', '40_SHADOW.md'), `# 40_SHADOW\n\n### Shadow S001 — No GraphQL\n\n**Constraint:** Do not use GraphQL.\n`, 'utf8');

  return dir;
}

function cleanup(dir: string) { fs.rmSync(dir, { recursive: true, force: true }); }

test('runCheck: passes when genome is fully set up', () => {
  const dir = makeProject();
  try {
    const result = runCheck(dir);
    assert.strictEqual(result.status, 'pass');
    assert.ok(result.violations.every((v) => v.level === 'warning'), 'Only warnings allowed on pass');
  } finally { cleanup(dir); }
});

test('runCheck: fails when .genome/ does not exist', () => {
  const dir = path.join(os.tmpdir(), `cortex-nodir-${Date.now()}`);
  fs.mkdirSync(dir);
  try {
    const result = runCheck(dir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.violations.some((v) => v.level === 'error' && v.message.includes('.genome/')));
  } finally { cleanup(dir); }
});

test('runCheck: fails when GENOTYPE is still a template', () => {
  const dir = makeProject({ filled: false });
  try {
    const result = runCheck(dir);
    assert.strictEqual(result.status, 'fail');
    assert.ok(result.violations.some((v) => v.level === 'error' && v.file === '00_GENOTYPE.md'));
  } finally { cleanup(dir); }
});

test('runCheck: warns (not fails) when PHENOTYPE is stale', () => {
  const dir = makeProject({ phenotypeAge: 45 });
  try {
    const result = runCheck(dir);
    const staleViolation = result.violations.find((v) => v.file === '10_PHENOTYPE.md');
    assert.ok(staleViolation, 'Expected a PHENOTYPE violation');
    assert.strictEqual(staleViolation!.level, 'warning', 'Stale PHENOTYPE should be a warning, not an error');
    assert.strictEqual(result.status, 'pass', 'Stale PHENOTYPE alone should not block');
  } finally { cleanup(dir); }
});

test('formatCheckResult: includes PASS for passing result', () => {
  const result = { status: 'pass' as const, violations: [] };
  assert.ok(formatCheckResult(result).includes('PASS'));
});

test('formatCheckResult: includes FAIL and violation message', () => {
  const result = {
    status: 'fail' as const,
    violations: [{ level: 'error' as const, file: '00_GENOTYPE.md', message: 'GENOTYPE is still the template' }],
  };
  const out = formatCheckResult(result);
  assert.ok(out.includes('FAIL'));
  assert.ok(out.includes('GENOTYPE'));
});
