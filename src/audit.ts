'use strict';

import fs from 'fs';
import path from 'path';
import { readLastSeal, runVerify } from './verify';

export interface AuditItem {
  file: string;
  level: 'pass' | 'warn' | 'error';
  message: string;
}

export interface AuditResult {
  items: AuditItem[];
  health: 'green' | 'yellow' | 'red';
}

const TEMPLATE_PLACEHOLDER = '[Project Name]';
const STALE_DAYS = 30;

export function runAudit(cwd: string): AuditResult {
  const genomeDir = path.join(cwd, '.genome');
  const items: AuditItem[] = [];

  if (!fs.existsSync(genomeDir)) {
    return {
      items: [{ file: '.genome/', level: 'error', message: '.genome/ not found — run `cortex init`' }],
      health: 'red',
    };
  }

  checkFilled(path.join(genomeDir, '00_GENOTYPE.md'), '00_GENOTYPE.md',
    'GENOTYPE is still the template — fill in your architecture invariants', items);

  checkFreshness(path.join(genomeDir, '10_PHENOTYPE.md'), '10_PHENOTYPE.md', items);

  checkEpigenomeEntries(path.join(genomeDir, '20_EPIGENOME.md'), items);

  checkFilled(path.join(genomeDir, '30_SELECTION.md'), '30_SELECTION.md',
    'SELECTION is still the template — fill in your decision heuristics', items);

  checkShadowEntries(path.join(genomeDir, '40_SHADOW.md'), items);

  checkVerification(cwd, items);

  const hasError = items.some((i) => i.level === 'error');
  const hasWarn  = items.some((i) => i.level === 'warn');
  const health: AuditResult['health'] = hasError ? 'red' : hasWarn ? 'yellow' : 'green';

  return { items, health };
}

function checkFilled(filePath: string, file: string, errorMsg: string, items: AuditItem[]): void {
  if (!fs.existsSync(filePath)) {
    items.push({ file, level: 'error', message: `${file} not found` });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(TEMPLATE_PLACEHOLDER)) {
    items.push({ file, level: 'error', message: errorMsg });
  } else {
    items.push({ file, level: 'pass', message: `${file} — filled in` });
  }
}

function checkFreshness(filePath: string, file: string, items: AuditItem[]): void {
  if (!fs.existsSync(filePath)) {
    items.push({ file, level: 'error', message: `${file} not found` });
    return;
  }
  const stat = fs.statSync(filePath);
  const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  if (ageDays > STALE_DAYS) {
    const d = Math.floor(ageDays);
    items.push({ file, level: 'warn', message: `${file} not updated in ${d} days — is this still the focus?` });
  } else {
    const d = Math.floor(ageDays);
    const when = d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`;
    items.push({ file, level: 'pass', message: `${file} — updated ${when}` });
  }
}

function checkEpigenomeEntries(filePath: string, items: AuditItem[]): void {
  if (!fs.existsSync(filePath)) {
    items.push({ file: '20_EPIGENOME.md', level: 'error', message: '20_EPIGENOME.md not found' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  // Matches: ## [2026-...  /  ### E001  /  ### 01  (entry-style headings, not plain prose headings)
  const count = (content.match(/^#{2,3}\s+(?:\[|\d|E\d)/gm) || []).length;
  if (count === 0) {
    items.push({
      file: '20_EPIGENOME.md', level: 'warn',
      message: 'EPIGENOME has no decisions logged yet — run `cortex harvest` to pull from git',
    });
  } else {
    items.push({ file: '20_EPIGENOME.md', level: 'pass', message: `EPIGENOME — ${count} decision${count === 1 ? '' : 's'} logged` });
  }
}

function checkVerification(cwd: string, items: AuditItem[]): void {
  const lastSeal = readLastSeal(cwd);
  if (!lastSeal) {
    items.push({ file: '.cortex/seals.jsonl', level: 'warn', message: 'No genome seal yet — run `cortex seal` to start tamper-detection' });
    return;
  }

  const result = runVerify(cwd);

  if (result.chainBreaks.length > 0) {
    items.push({ file: '20_EPIGENOME.md', level: 'error', message: `EPIGENOME chain break — ${result.chainBreaks.length} tampered entr${result.chainBreaks.length === 1 ? 'y' : 'ies'} detected` });
  } else if (result.chainChecked > 0) {
    items.push({ file: '20_EPIGENOME.md', level: 'pass', message: `EPIGENOME chain — ${result.chainChecked} entr${result.chainChecked === 1 ? 'y' : 'ies'} verified ✓` });
  }

  const suspicious = result.sealDiff.filter((d) => d.status === 'suspicious');
  if (suspicious.length > 0) {
    items.push({ file: suspicious.map((d) => d.file).join(', '), level: 'error', message: `Suspicious changes since last seal: ${suspicious.map((d) => d.file).join(', ')}` });
  } else if (result.hasSeal) {
    items.push({ file: '.cortex/seals.jsonl', level: 'pass', message: 'Genome seal — no suspicious changes since last seal' });
  }
}

function checkShadowEntries(filePath: string, items: AuditItem[]): void {
  if (!fs.existsSync(filePath)) {
    items.push({ file: '40_SHADOW.md', level: 'error', message: '40_SHADOW.md not found' });
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const count = (content.match(/^#{2,3}\s+Shadow/gmi) || []).length;
  if (count === 0) {
    items.push({ file: '40_SHADOW.md', level: 'warn', message: 'SHADOW has no rejected approaches documented yet' });
  } else {
    items.push({ file: '40_SHADOW.md', level: 'pass', message: `SHADOW — ${count} rejected approach${count === 1 ? '' : 'es'} documented` });
  }
}
