'use strict';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { hashEntryFields, lastChainHash, sealGenome } from './verify';

export interface HarvestEntry {
  hash: string;
  date: string;
  author: string;
  subject: string;
  body: string;
}

export interface HarvestResult {
  entries: HarvestEntry[];
  applied: boolean;
}

const DECISION_RE = /^(DECISION|ADR|ARCH|WHY|BREAKING):\s*/i;
const MS: Record<string, number> = { d: 864e5, w: 6048e5, m: 2592e6 };

export function runHarvest(cwd: string, since = '30d', apply = false): HarvestResult {
  const entries = findDecisionCommits(cwd, since);
  if (apply && entries.length > 0) {
    appendToEpigenome(cwd, entries);
    sealGenome(cwd); // seal genome state after every apply
    return { entries, applied: true };
  }
  return { entries, applied: false };
}

function findDecisionCommits(cwd: string, since: string): HarvestEntry[] {
  const m = since.match(/^(\d+)(d|w|m)$/);
  if (!m) return [];

  const cutoff = new Date(Date.now() - parseInt(m[1], 10) * MS[m[2]]);
  const sinceStr = cutoff.toISOString().split('T')[0];

  let raw: string;
  try {
    raw = execSync(
      `git log --after="${sinceStr}" --format="%H%n%ad%n%an%n%s%n%b%n---END---" --date=short`,
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch {
    return [];
  }

  const entries: HarvestEntry[] = [];
  for (const block of raw.split('---END---')) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    if (lines.length < 4) continue;
    const [hash, date, author, subject, ...rest] = lines;
    const body = rest.join('\n').trim();

    if (DECISION_RE.test(subject) || touchesGenome(cwd, hash)) {
      entries.push({ hash: hash.slice(0, 8), date, author, subject, body });
    }
  }
  return entries;
}

function touchesGenome(cwd: string, hash: string): boolean {
  try {
    const out = execSync(`git diff-tree --no-commit-id -r --name-only ${hash}`, {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.includes('.genome/');
  } catch {
    return false;
  }
}

function appendToEpigenome(cwd: string, entries: HarvestEntry[]): void {
  const epigenomePath = path.join(cwd, '.genome', '20_EPIGENOME.md');
  if (!fs.existsSync(epigenomePath)) return;

  const existing = fs.readFileSync(epigenomePath, 'utf8');
  const nums = (existing.match(/^#{2,3}\s+E(\d+)/gm) || [])
    .map((line) => { const n = line.match(/E(\d+)/); return n ? parseInt(n[1], 10) : 0; });
  let next = nums.length > 0 ? Math.max(...nums) + 1 : 1;

  let prevHash = lastChainHash(existing);
  let append = '\n';

  for (const e of entries) {
    const id = `E${String(next).padStart(3, '0')}`;
    const cleanSubject = e.subject.replace(DECISION_RE, '');
    const today = new Date().toISOString().split('T')[0];

    // Hash = f(prevHash, id, subject, commitHash, date) — whitespace-agnostic
    const entryHash = hashEntryFields(prevHash, id, cleanSubject, e.hash, e.date);

    append += `### ${id} — ${cleanSubject}\n\n`;
    append += `> Harvested: ${today} | Commit: ${e.hash} | Author: ${e.author} | Date: ${e.date} | Prev-hash: ${prevHash} | Hash: ${entryHash}\n\n`;
    if (e.body) append += `${e.body}\n\n`;

    prevHash = entryHash;
    next++;
  }

  fs.appendFileSync(epigenomePath, append, 'utf8');
}
