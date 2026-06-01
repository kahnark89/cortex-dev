'use strict';

/**
 * Extract the current focus from PHENOTYPE §1 (handles blank line after heading).
 */
export function extractFocus(phenotypeMd: string): string {
  const m = phenotypeMd.match(/##\s*§1[^\n]*\n+([^\n#][^\n]*)/);
  return m ? m[1].trim() : '(no focus set)';
}

/**
 * Parse PHENOTYPE §3 for open questions — lines starting with - or •.
 */
export function extractOpenQuestions(phenotypeMd: string): string[] {
  const section = extractSection(phenotypeMd, '§3');
  if (!section) return [];

  return section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•]\s+\S/.test(l))
    .map((l) => l.replace(/^[-•]\s+/, '').trim())
    .filter((l) => l.length > 0 && l !== '*');
}

/**
 * Parse SHADOW.md for forbidden-zone entries.
 */
export function extractShadowEntries(
  shadowMd: string,
): Array<{ id: string; title: string; constraint: string }> {
  const entries: Array<{ id: string; title: string; constraint: string }> = [];
  const entryRe = /###?\s+(Shadow\s+S?\d+[^\n]*)\n([\s\S]*?)(?=###?|$)/gi;
  let m: RegExpExecArray | null;

  while ((m = entryRe.exec(shadowMd)) !== null) {
    const title = m[1].trim();
    const body  = m[2];
    const constraintMatch = body.match(/\*\*Constraint[:\s]+\*\*\s*(.+)/i);
    entries.push({
      id: title.replace(/\s+/g, '-').toLowerCase(),
      title,
      constraint: constraintMatch ? constraintMatch[1].trim() : '',
    });
  }

  return entries;
}

/**
 * Extract the body of a genome section by its tag (e.g. '§2').
 * Returns the content between the matching heading and the next ## heading.
 */
export function extractSection(md: string, sectionTag: string): string | null {
  const escaped = sectionTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`##[^\\n]*${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = md.match(re);
  return m ? m[1] : null;
}
