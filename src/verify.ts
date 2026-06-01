'use strict';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Genesis hash used as prev-hash for the first chained entry
export const GENESIS_HASH = 'sha256:' + '0'.repeat(64);

const GENOME_FILES = [
  '00_GENOTYPE.md', '10_PHENOTYPE.md', '20_EPIGENOME.md',
  '30_SELECTION.md', '40_SHADOW.md',
] as const;

const PROTECTED   = new Set(['00_GENOTYPE.md', '30_SELECTION.md']);
const APPEND_ONLY = new Set(['20_EPIGENOME.md', '40_SHADOW.md']);

// Matches the full " | Hash: sha256:<64 hex>" field in a blockquote line
const HASH_FIELD_RE  = / \| Hash: sha256:[a-f0-9]{64}/;
const STORED_HASH_RE = /\| Hash: (sha256:[a-f0-9]{64})/;

export interface ChainBreak {
  entry: string;
  expected: string;
  got: string;
}

export interface SealFileEntry {
  hash: string;
  size: number;
}

export interface SealRecord {
  ts: number;
  root: string;
  files: Record<string, SealFileEntry>;
}

export interface SealDiff {
  file: string;
  /** 'appended' = append-only file grew; 'modified' = expected churn (PHENOTYPE); 'suspicious' = protected file or shrinkage */
  status: 'new' | 'appended' | 'modified' | 'suspicious';
}

export interface VerifyResult {
  chainChecked: number;
  chainValid: boolean;
  chainBreaks: ChainBreak[];
  hasSeal: boolean;
  sealMatch: boolean;
  sealDiff: SealDiff[];
  health: 'green' | 'yellow' | 'red';
}

// ── hashing helpers ──────────────────────────────────────────────────────────

export function sha256(input: string): string {
  return 'sha256:' + crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Canonical hash for a harvested EPIGENOME entry.
 * Inputs are the key semantic fields — whitespace-agnostic.
 */
export function hashEntryFields(
  prevHash: string,
  id: string,
  subject: string,
  commitHash: string,
  date: string,
): string {
  return sha256([prevHash, id, subject, commitHash, date].join('\0'));
}

/** Return the last stored Hash value from an EPIGENOME file, or GENESIS_HASH. */
export function lastChainHash(epigenomeMd: string): string {
  const matches = [...epigenomeMd.matchAll(/\| Hash: (sha256:[a-f0-9]{64})/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : GENESIS_HASH;
}

// ── sealing ──────────────────────────────────────────────────────────────────

export function sealGenome(cwd: string): SealRecord {
  const genomeDir = path.join(cwd, '.genome');
  const cortexDir = path.join(cwd, '.cortex');
  if (!fs.existsSync(cortexDir)) fs.mkdirSync(cortexDir, { recursive: true });

  const files: SealRecord['files'] = {};
  for (const f of GENOME_FILES) {
    const p = path.join(genomeDir, f);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    files[f] = { hash: sha256(content), size: Buffer.byteLength(content, 'utf8') };
  }

  // Root = hash of sorted "file:hash" pairs — a simplified Merkle roll-up
  const rootInput = GENOME_FILES
    .filter((f) => files[f])
    .map((f) => `${f}:${files[f].hash}`)
    .join('\n');

  const record: SealRecord = { ts: Date.now(), root: sha256(rootInput), files };
  fs.appendFileSync(path.join(cortexDir, 'seals.jsonl'), JSON.stringify(record) + '\n', 'utf8');
  return record;
}

export function readLastSeal(cwd: string): SealRecord | null {
  const p = path.join(cwd, '.cortex', 'seals.jsonl');
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  try { return JSON.parse(lines[lines.length - 1]) as SealRecord; } catch { return null; }
}

// ── chain verification ────────────────────────────────────────────────────────

export function verifyChain(
  epigenomeMd: string,
): { checked: number; valid: boolean; breaks: ChainBreak[] } {
  const breaks: ChainBreak[] = [];
  let checked = 0;

  // Split on entry-style headings: ## [date], ### E001, ## 01
  const blocks = epigenomeMd
    .split(/(?=^#{2,3}\s+(?:\[|\d|E\d))/gm)
    .filter((b) => /^#{2,3}\s+(?:\[|\d|E\d)/m.test(b));

  for (const block of blocks) {
    const storedHashM = block.match(STORED_HASH_RE);
    if (!storedHashM) continue; // pre-verification entry — skip gracefully

    const storedHash = storedHashM[1];

    // Re-extract the canonical fields used when the hash was computed
    const headingM  = block.match(/^#{2,3}\s+(\S+)\s+—\s+(.+)/m);
    const commitM   = block.match(/\| Commit: ([a-f0-9]+)/);
    const dateM     = block.match(/\| Date: (\d{4}-\d{2}-\d{2})/);
    const prevHashM = block.match(/\| Prev-hash: (sha256:[a-f0-9]+)/);

    if (!headingM || !commitM || !dateM || !prevHashM) continue; // incomplete metadata — skip

    const id      = headingM[1];
    const subject = headingM[2].trim();
    const commit  = commitM[1];
    const date    = dateM[1];
    const prevH   = prevHashM[1];

    const expected = hashEntryFields(prevH, id, subject, commit, date);
    checked++;

    if (expected !== storedHash) {
      breaks.push({
        entry: block.split('\n')[0].trim(),
        expected,
        got: storedHash,
      });
    }
  }

  return { checked, valid: breaks.length === 0, breaks };
}

// ── full verify ───────────────────────────────────────────────────────────────

export function runVerify(cwd: string): VerifyResult {
  const genomeDir = path.join(cwd, '.genome');

  // 1. EPIGENOME hash chain
  let chainChecked = 0, chainValid = true;
  const chainBreaks: ChainBreak[] = [];
  const epigenomePath = path.join(genomeDir, '20_EPIGENOME.md');
  if (fs.existsSync(epigenomePath)) {
    const r = verifyChain(fs.readFileSync(epigenomePath, 'utf8'));
    chainChecked = r.checked;
    chainValid   = r.valid;
    chainBreaks.push(...r.breaks);
  }

  // 2. Genome state vs last seal
  const lastSeal = readLastSeal(cwd);
  const hasSeal  = lastSeal !== null;
  let sealMatch  = true;
  const sealDiff: SealDiff[] = [];

  if (lastSeal) {
    for (const f of GENOME_FILES) {
      const p = path.join(genomeDir, f);
      if (!fs.existsSync(p)) continue;

      const content = fs.readFileSync(p, 'utf8');
      const currHash = sha256(content);
      const currSize = Buffer.byteLength(content, 'utf8');
      const sealEntry = lastSeal.files[f];

      if (!sealEntry)                   { sealDiff.push({ file: f, status: 'new' });                                                       continue; }
      if (currHash === sealEntry.hash)  continue; // unchanged

      sealMatch = false;
      if (PROTECTED.has(f)) {
        sealDiff.push({ file: f, status: 'suspicious' });
      } else if (APPEND_ONLY.has(f)) {
        sealDiff.push({ file: f, status: currSize >= sealEntry.size ? 'appended' : 'suspicious' });
      } else {
        sealDiff.push({ file: f, status: 'modified' }); // PHENOTYPE: expected high-churn
      }
    }
  }

  const isSuspicious = chainBreaks.length > 0 || sealDiff.some((d) => d.status === 'suspicious');
  const health: VerifyResult['health'] = isSuspicious ? 'red' : (!hasSeal ? 'yellow' : 'green');

  return { chainChecked, chainValid, chainBreaks, hasSeal, sealMatch, sealDiff, health };
}
