'use strict';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { readLastSeal, sealGenome, runVerify, sha256, SealRecord } from './verify';

export interface GateResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface BadgeRecord {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
  ts: number;
}

export interface CloseResult {
  passed: boolean;
  gates: GateResult[];
  badge: BadgeRecord;
}

export function runClose(cwd: string, opts: { checkOnly?: boolean } = {}): CloseResult {
  const gates: GateResult[] = [];
  const lastSeal = readLastSeal(cwd);

  if (!opts.checkOnly) {
    gates.push(checkPhenotypeGate(cwd, lastSeal));
    gates.push(...checkDriftGates(cwd, lastSeal));
  }
  gates.push(...checkVerifyGates(cwd));

  const passed = gates.every((g) => g.passed);

  let badge: BadgeRecord;
  if (passed && !opts.checkOnly) {
    const newSeal = sealGenome(cwd);
    badge = writeBadge(cwd, true, newSeal.ts);
  } else {
    badge = writeBadge(cwd, passed, Date.now());
  }

  return { passed, gates, badge };
}

// ── Gate 1: PHENOTYPE freshness ──────────────────────────────────────────────

function checkPhenotypeGate(cwd: string, lastSeal: SealRecord | null): GateResult {
  if (!lastSeal) {
    return { name: 'phenotype-fresh', passed: true, message: 'PHENOTYPE — no prior seal, first session' };
  }
  const phenoPath = path.join(cwd, '.genome', '10_PHENOTYPE.md');
  if (!fs.existsSync(phenoPath)) {
    return { name: 'phenotype-fresh', passed: false, message: 'PHENOTYPE not found — run `cortex init`' };
  }
  if (fs.statSync(phenoPath).mtimeMs > lastSeal.ts) {
    return { name: 'phenotype-fresh', passed: true, message: 'PHENOTYPE updated this session ✓' };
  }
  return {
    name: 'phenotype-fresh',
    passed: false,
    message: 'PHENOTYPE not updated since last seal — update §1 focus before closing',
  };
}

// ── Gates 2a + 2b: drift detection ───────────────────────────────────────────

function getCodeChangedFiles(cwd: string, sealTs: number): string[] {
  // Subtract 1s to catch commits made in the same second as the seal
  const sealIso = new Date(sealTs - 1000).toISOString();
  try {
    const out = execSync(
      `git log --after="${sealIso}" --name-only --pretty="" -- ':!.genome/*' ':!.cortex/*' ':!node_modules/*' ':!dist/*' ':!.dist-test/*'`,
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return [...new Set(out.split('\n').map((l) => l.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function checkDriftGates(cwd: string, lastSeal: SealRecord | null): GateResult[] {
  if (!lastSeal) return [];

  const epiPath = path.join(cwd, '.genome', '20_EPIGENOME.md');
  const sealEpiHash = lastSeal.files['20_EPIGENOME.md']?.hash ?? null;
  const currEpiHash = fs.existsSync(epiPath) ? sha256(fs.readFileSync(epiPath, 'utf8')) : null;
  const epiChanged = sealEpiHash !== null && currEpiHash !== null && currEpiHash !== sealEpiHash;

  const changedFiles = getCodeChangedFiles(cwd, lastSeal.ts);
  const codeChanged = changedFiles.length > 0;

  const gates: GateResult[] = [];

  // 2a: code changed without a genome entry → decisions may be missing
  if (codeChanged && !epiChanged) {
    const listed = changedFiles.slice(0, 5).join(', ');
    const extra  = changedFiles.length > 5 ? ` (+${changedFiles.length - 5} more)` : '';
    gates.push({
      name: 'drift-code-to-genome',
      passed: false,
      message: `Code changed since last seal but EPIGENOME has no new entries — run \`cortex harvest --apply\` or add a manual entry\n    Changed: ${listed}${extra}`,
    });
  } else {
    const reason = codeChanged
      ? 'Code changes documented in EPIGENOME ✓'
      : 'No code changes since last seal ✓';
    gates.push({ name: 'drift-code-to-genome', passed: true, message: reason });
  }

  // 2b: genome grew without code change → next session will assume this work is done
  if (epiChanged && !codeChanged) {
    gates.push({
      name: 'drift-genome-to-code',
      passed: false,
      message: 'EPIGENOME has new entries but no code changed — genome may be ahead of implementation. Next session will assume this work is done.',
    });
  } else {
    const reason = epiChanged
      ? 'EPIGENOME entries backed by code changes ✓'
      : 'No EPIGENOME drift ✓';
    gates.push({ name: 'drift-genome-to-code', passed: true, message: reason });
  }

  return gates;
}

// ── Gates 3 + 4: chain integrity + no suspicious changes ─────────────────────

function checkVerifyGates(cwd: string): GateResult[] {
  const result = runVerify(cwd);
  const gates: GateResult[] = [];

  if (!result.chainValid) {
    const details = result.chainBreaks.map((b) => `\n    ${b.entry}`).join('');
    gates.push({
      name: 'chain-integrity',
      passed: false,
      message: `EPIGENOME chain break — ${result.chainBreaks.length} tampered entr${result.chainBreaks.length === 1 ? 'y' : 'ies'}${details}`,
    });
  } else {
    const n   = result.chainChecked;
    const msg = n > 0
      ? `EPIGENOME chain — ${n} entr${n === 1 ? 'y' : 'ies'} verified ✓`
      : 'EPIGENOME chain — no chained entries yet ✓';
    gates.push({ name: 'chain-integrity', passed: true, message: msg });
  }

  const suspicious = result.sealDiff.filter((d) => d.status === 'suspicious');
  if (suspicious.length > 0) {
    gates.push({
      name: 'no-suspicious-changes',
      passed: false,
      message: `Suspicious changes: ${suspicious.map((d) => d.file).join(', ')} — protected files modified outside cortex`,
    });
  } else {
    gates.push({ name: 'no-suspicious-changes', passed: true, message: 'No suspicious genome changes ✓' });
  }

  return gates;
}

// ── Badge generation ──────────────────────────────────────────────────────────

function writeBadge(cwd: string, passed: boolean, ts: number): BadgeRecord {
  const cortexDir = path.join(cwd, '.cortex');
  if (!fs.existsSync(cortexDir)) fs.mkdirSync(cortexDir, { recursive: true });

  const badge: BadgeRecord = {
    schemaVersion: 1,
    label: 'cortex',
    message: passed ? 'verified' : 'unverified',
    color: passed ? 'brightgreen' : 'red',
    ts,
  };

  fs.writeFileSync(path.join(cortexDir, 'badge.json'), JSON.stringify(badge, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(cortexDir, 'badge.svg'), renderBadgeSvg(badge), 'utf8');
  return badge;
}

function renderBadgeSvg(badge: BadgeRecord): string {
  const labelW  = 56;
  const msgW    = badge.message === 'verified' ? 66 : 78;
  const totalW  = labelW + msgW;
  const fill    = badge.message === 'verified' ? '#4c1' : '#e05d44';
  const labelCx = Math.round(labelW / 2);
  const msgCx   = labelW + Math.round(msgW / 2);
  const tLabel  = badge.label.length * 62;
  const tMsg    = badge.message.length * 62;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${badge.label}: ${badge.message}">
  <title>${badge.label}: ${badge.message}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalW}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${msgW}" height="20" fill="${fill}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="110">
    <text x="${labelCx * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${tLabel}" lengthAdjust="spacing">${badge.label}</text>
    <text x="${labelCx * 10}" y="140" transform="scale(.1)" textLength="${tLabel}" lengthAdjust="spacing">${badge.label}</text>
    <text x="${msgCx * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${tMsg}" lengthAdjust="spacing">${badge.message}</text>
    <text x="${msgCx * 10}" y="140" transform="scale(.1)" textLength="${tMsg}" lengthAdjust="spacing">${badge.message}</text>
  </g>
</svg>`;
}
