'use strict';

import { runAudit } from './audit';

export interface CheckViolation {
  level: 'error' | 'warning';
  file: string;
  message: string;
}

export interface CheckResult {
  status: 'pass' | 'fail';
  violations: CheckViolation[];
}

export function runCheck(cwd: string): CheckResult {
  const audit = runAudit(cwd);

  const violations: CheckViolation[] = audit.items
    .filter((i) => i.level !== 'pass')
    .map((i) => ({
      level: i.level === 'error' ? ('error' as const) : ('warning' as const),
      file: i.file,
      message: i.message,
    }));

  const errors = violations.filter((v) => v.level === 'error');
  return { status: errors.length > 0 ? 'fail' : 'pass', violations };
}

export function formatCheckResult(result: CheckResult): string {
  const lines: string[] = [result.status === 'pass' ? 'cortex check: PASS' : 'cortex check: FAIL'];

  for (const v of result.violations) {
    const icon = v.level === 'error' ? '  🔴' : '  ⚠ ';
    lines.push(`${icon}  ${v.message}`);
  }

  if (result.violations.length === 0) {
    lines.push('  ✓  All governance checks passed.');
  }

  return lines.join('\n');
}
