'use strict';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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
      `git log --after="${sinceStr}" --format="%H%n%ad%n%an%n%s%n%b%n---FILES---" --name-only --date=short`,
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch {
    return [];
  }

  const entries: HarvestEntry[] = [];
  const blocks = raw.split(/(?=^[a-f0-9]{40}\n)/m); // Split by commit hash

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Split into commit info and files
    const parts = trimmed.split('\n---FILES---\n');
    const infoLines = parts[0].split('\n');

    if (infoLines.length < 4) continue;
    const [hash, date, author, subject, ...rest] = infoLines;
    const body = rest.join('\n').trim();
    const files = parts[1] || '';

    if (DECISION_RE.test(subject) || files.includes('.genome/')) {
      entries.push({ hash: hash.slice(0, 8), date, author, subject, body });
    }
  }
  return entries;
}

function appendToEpigenome(cwd: string, entries: HarvestEntry[]): void {
  const epigenomePath = path.join(cwd, '.genome', '20_EPIGENOME.md');
  if (!fs.existsSync(epigenomePath)) return;

  const existing = fs.readFileSync(epigenomePath, 'utf8');
  const nums = (existing.match(/^#{2,3}\s+E(\d+)/gm) || [])
    .map((line) => { const n = line.match(/E(\d+)/); return n ? parseInt(n[1], 10) : 0; });
  let next = nums.length > 0 ? Math.max(...nums) + 1 : 1;

  let append = '\n';

  for (const e of entries) {
    const id = `E${String(next).padStart(3, '0')}`;
    const cleanSubject = e.subject.replace(DECISION_RE, '');
    const today = new Date().toISOString().split('T')[0];

    append += `### ${id} — ${cleanSubject}\n\n`;
    append += `> Harvested: ${today} | Commit: ${e.hash} | Author: ${e.author} | Date: ${e.date}\n\n`;
    if (e.body) append += `${e.body}\n\n`;

    next++;
  }

  fs.appendFileSync(epigenomePath, append, 'utf8');
}
