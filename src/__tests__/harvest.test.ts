import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { runHarvest } from '../harvest';

function makeGitProject(): string {
  const dir = path.join(os.tmpdir(), `cortex-harvest-${Date.now()}`);
  fs.mkdirSync(path.join(dir, '.genome'), { recursive: true });
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  return dir;
}

function commit(dir: string, message: string, file = 'README.md') {
  fs.writeFileSync(path.join(dir, file), `update ${Date.now()}\n`, 'utf8');
  execSync(`git add ${file}`, { cwd: dir });
  execSync(`git commit -m "${message}"`, { cwd: dir });
}

function cleanup(dir: string) { fs.rmSync(dir, { recursive: true, force: true }); }

test('runHarvest: finds commits prefixed with DECISION:', () => {
  const dir = makeGitProject();
  try {
    commit(dir, 'DECISION: chose PostgreSQL over MongoDB');
    commit(dir, 'fix: typo in readme');
    const result = runHarvest(dir, '7d');
    assert.ok(result.entries.some((e) => e.subject.includes('PostgreSQL')));
    assert.ok(!result.entries.some((e) => e.subject.includes('typo')));
  } finally { cleanup(dir); }
});

test('runHarvest: finds commits that touch .genome/ files', () => {
  const dir = makeGitProject();
  try {
    commit(dir, 'regular commit', 'README.md');
    // commit touching .genome/
    fs.writeFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), '# update\n', 'utf8');
    execSync('git add .genome/00_GENOTYPE.md', { cwd: dir });
    execSync('git commit -m "update architecture"', { cwd: dir });

    const result = runHarvest(dir, '7d');
    assert.ok(result.entries.some((e) => e.subject.includes('update architecture')));
  } finally { cleanup(dir); }
});

test('runHarvest: does not apply by default', () => {
  const dir = makeGitProject();
  const epiPath = path.join(dir, '.genome', '20_EPIGENOME.md');
  fs.writeFileSync(epiPath, '# 20_EPIGENOME\n\n', 'utf8');
  try {
    commit(dir, 'DECISION: use Redis for caching');
    const result = runHarvest(dir, '7d', false);
    assert.ok(result.entries.length > 0);
    assert.strictEqual(result.applied, false);
    const content = fs.readFileSync(epiPath, 'utf8');
    assert.ok(!content.includes('Redis'), 'Should not have appended without --apply');
  } finally { cleanup(dir); }
});

test('runHarvest: appends to EPIGENOME when apply=true', () => {
  const dir = makeGitProject();
  const epiPath = path.join(dir, '.genome', '20_EPIGENOME.md');
  fs.writeFileSync(epiPath, '# 20_EPIGENOME\n\n', 'utf8');
  try {
    commit(dir, 'DECISION: use Redis for caching');
    const result = runHarvest(dir, '7d', true);
    assert.ok(result.applied);
    const content = fs.readFileSync(epiPath, 'utf8');
    assert.ok(content.includes('Redis'), 'Should have appended to EPIGENOME');
    assert.ok(content.includes('E001'), 'Should have entry ID');
  } finally { cleanup(dir); }
});

test('runHarvest: returns empty array when no decision commits found', () => {
  const dir = makeGitProject();
  try {
    commit(dir, 'fix: correct spacing');
    commit(dir, 'refactor: extract helper');
    const result = runHarvest(dir, '7d');
    assert.strictEqual(result.entries.length, 0);
  } finally { cleanup(dir); }
});

test('runHarvest: returns empty array when not a git repo', () => {
  const dir = path.join(os.tmpdir(), `no-git-${Date.now()}`);
  fs.mkdirSync(dir);
  try {
    const result = runHarvest(dir, '7d');
    assert.strictEqual(result.entries.length, 0);
  } finally { cleanup(dir); }
});
