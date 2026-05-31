'use strict';

import { Criticality } from './confidence';

export interface ExtractedConcept {
  concept: string;
  file: string;
  criticality: Criticality;
}

const HEADING_RE = /^#{2,3}\s+(?:§\d+\s+)?(.+)$/gm;
const BOLD_RE    = /\*\*([^*\n]{2,40})\*\*/g;
const TICK_RE    = /`([^`\n]{2,40})`/g;

/**
 * Extract concepts from genome markdown files.
 * Headings, bold terms, and backtick terms are each treated as concepts.
 * Criticality is determined by source file.
 */
export function extractConcepts(
  genotypeMd: string,
  selectionMd: string
): ExtractedConcept[] {
  const concepts: ExtractedConcept[] = [];

  extractFromMd(genotypeMd,  'GENOTYPE',  concepts, '00_GENOTYPE.md');
  extractFromMd(selectionMd, 'SELECTION', concepts, '30_SELECTION.md');

  return dedupe(concepts);
}

function extractFromMd(
  md: string,
  criticality: Criticality,
  out: ExtractedConcept[],
  file: string
): void {
  let m: RegExpExecArray | null;

  const headingRe = new RegExp(HEADING_RE.source, 'gm');
  while ((m = headingRe.exec(md)) !== null) {
    const concept = m[1].trim();
    if (isUsableConcept(concept)) out.push({ concept, file, criticality });
  }

  const boldRe = new RegExp(BOLD_RE.source, 'g');
  while ((m = boldRe.exec(md)) !== null) {
    const concept = m[1].trim();
    if (isUsableConcept(concept)) out.push({ concept, file, criticality });
  }

  const tickRe = new RegExp(TICK_RE.source, 'g');
  while ((m = tickRe.exec(md)) !== null) {
    const concept = m[1].trim();
    if (isUsableConcept(concept)) out.push({ concept, file, criticality });
  }
}

function isUsableConcept(s: string): boolean {
  if (s.length < 3 || s.length > 60) return false;
  if (/^\s*$/.test(s)) return false;
  if (/^[0-9\s.]+$/.test(s)) return false;
  return true;
}

function dedupe(concepts: ExtractedConcept[]): ExtractedConcept[] {
  const seen = new Set<string>();
  return concepts.filter((c) => {
    const key = `${c.file}::${c.concept.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
 * Parse SELECTION §2 for the Cortex autonomous action policy thresholds.
 * Returns { genotype, selection, neutral } confidence thresholds.
 */
export function extractPolicy(selectionMd: string): Record<string, number> {
  const defaults = { genotype: 0.60, selection: 0.50, neutral: 0.75 };

  const genoMatch   = selectionMd.match(/GENOTYPE\s+concepts.*?<\s*([\d.]+)/i);
  const selectMatch = selectionMd.match(/SELECTION\s+concepts.*?<\s*([\d.]+)/i);
  const neutralMatch = selectionMd.match(/Neutral\s+concepts.*?>\s*([\d.]+)/i);

  return {
    genotype:  genoMatch   ? parseFloat(genoMatch[1])   : defaults.genotype,
    selection: selectMatch ? parseFloat(selectMatch[1]) : defaults.selection,
    neutral:   neutralMatch ? parseFloat(neutralMatch[1]) : defaults.neutral,
  };
}

/**
 * Parse SHADOW.md for forbidden zone entries.
 */
export function extractShadowEntries(
  shadowMd: string
): Array<{ id: string; title: string; constraint: string }> {
  const entries: Array<{ id: string; title: string; constraint: string }> = [];

  const entryRe = /###?\s+(Shadow\s+S?\d+[^\n]*)\n([\s\S]*?)(?=###?|$)/gi;
  let m: RegExpExecArray | null;

  while ((m = entryRe.exec(shadowMd)) !== null) {
    const title = m[1].trim();
    const body = m[2];
    const constraintMatch = body.match(/\*\*Constraint[:\s]+\*\*\s*(.+)/i);
    entries.push({
      id: title.replace(/\s+/g, '-').toLowerCase(),
      title,
      constraint: constraintMatch ? constraintMatch[1].trim() : '',
    });
  }

  return entries;
}

function extractSection(md: string, sectionTag: string): string | null {
  // No 'm' flag: $  matches end of string; \n##\s matches start of next heading.
  const escaped = sectionTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`##[^\\n]*${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = md.match(re);
  return m ? m[1] : null;
}
