'use strict';

import fs from 'fs';
import path from 'path';
import { ConfidenceDB, ConceptEntry } from './confidence';
import { extractPolicy, extractShadowEntries } from './concepts';

export interface CheckViolation {
  level: 'error' | 'warning';
  file: string;
  concept: string;
  message: string;
}

export interface CheckResult {
  status: 'pass' | 'fail';
  violations: CheckViolation[];
}

/**
 * Run the full cortex governance check.
 * Checks concept confidence scores against the policy thresholds in SELECTION.md.
 * Exits with code 1 on fail — suitable for CI gate use.
 */
export function runCheck(cwd: string, _prNumber?: number): CheckResult {
  const genomeDir  = path.join(cwd, '.genome');
  const cortexDir  = path.join(cwd, '.cortex');

  const selectionPath = path.join(genomeDir, '30_SELECTION.md');
  const shadowPath    = path.join(genomeDir, '40_SHADOW.md');

  const selectionMd = fs.existsSync(selectionPath)
    ? fs.readFileSync(selectionPath, 'utf8')
    : '';

  const shadowMd = fs.existsSync(shadowPath)
    ? fs.readFileSync(shadowPath, 'utf8')
    : '';

  const policy = extractPolicy(selectionMd);
  const shadowEntries = extractShadowEntries(shadowMd);

  const db = new ConfidenceDB(path.join(cortexDir, 'confidence.json'));
  const store = db.load();

  const violations: CheckViolation[] = [];

  for (const c of store.concepts) {
    switch (c.criticality) {
      case 'GENOTYPE':
        if (c.score < policy.genotype) {
          violations.push({
            level: 'error',
            file: c.file,
            concept: c.concept,
            message: `GENOTYPE concept "${c.concept}" confidence ${c.score.toFixed(2)} < ${policy.genotype} — BLOCK`,
          });
        }
        break;

      case 'SELECTION':
        if (c.score < policy.selection) {
          violations.push({
            level: 'warning',
            file: c.file,
            concept: c.concept,
            message: `SELECTION concept "${c.concept}" confidence ${c.score.toFixed(2)} < ${policy.selection} — requires review`,
          });
        }
        break;

      case 'SHADOW':
        violations.push({
          level: 'error',
          file: c.file,
          concept: c.concept,
          message: `SHADOW concept "${c.concept}" was touched — architect override required`,
        });
        break;

      case 'neutral':
        if (c.score < policy.neutral) {
          violations.push({
            level: 'warning',
            file: c.file,
            concept: c.concept,
            message: `Neutral concept "${c.concept}" confidence ${c.score.toFixed(2)} < ${policy.neutral}`,
          });
        }
        break;
    }
  }

  // Always block if any shadow entries exist and shadow concepts were touched
  if (shadowEntries.length > 0 && violations.some((v) => v.level === 'error' && v.concept)) {
    // Already added above
  }

  const errors = violations.filter((v) => v.level === 'error');

  return {
    status: errors.length > 0 ? 'fail' : 'pass',
    violations,
  };
}

/** Format a CheckResult for terminal output. */
export function formatCheckResult(result: CheckResult): string {
  const lines: string[] = [];

  if (result.status === 'pass') {
    lines.push('cortex check: PASS');
  } else {
    lines.push('cortex check: FAIL');
  }

  for (const v of result.violations) {
    const icon = v.level === 'error' ? '  🔴' : '  ⚠';
    lines.push(`${icon}  ${v.message}`);
  }

  if (result.violations.length === 0) {
    lines.push('  ✓  All concepts above threshold.');
  }

  return lines.join('\n');
}
