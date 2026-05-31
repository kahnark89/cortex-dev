'use strict';

import fs from 'fs';
import path from 'path';
import { ConfidenceDB, ConceptEntry } from './confidence';
import { extractOpenQuestions, extractPolicy } from './concepts';

export interface AnimusPresence {
  present: boolean;
  moodLine?: string;
  schemaName?: string;
}

export interface CortexContextBundle {
  version: 1;
  generatedAt: number;
  genome: {
    focus: string;
    openQuestions: string[];
    hasGenotype: boolean;
    hasEpigenome: boolean;
    hasShadow: boolean;
    hasSelection: boolean;
  };
  comprehension: {
    riskConcepts: ConceptEntry[];
    criticalConcepts: ConceptEntry[];
    totalConcepts: number;
    overallHealth: 'green' | 'yellow' | 'red';
  };
  animus: AnimusPresence;
}

export function buildContext(cwd: string): CortexContextBundle {
  const genomeDir = path.join(cwd, '.genome');
  const cortexDir = path.join(cwd, '.cortex');

  const phenotypePath  = path.join(genomeDir, '10_PHENOTYPE.md');
  const genotypePath   = path.join(genomeDir, '00_GENOTYPE.md');
  const epigenomePath  = path.join(genomeDir, '20_EPIGENOME.md');
  const shadowPath     = path.join(genomeDir, '40_SHADOW.md');
  const selectionPath  = path.join(genomeDir, '30_SELECTION.md');

  const phenotypeMd  = fs.existsSync(phenotypePath)  ? fs.readFileSync(phenotypePath, 'utf8')  : '';
  const selectionMd  = fs.existsSync(selectionPath)  ? fs.readFileSync(selectionPath, 'utf8')  : '';

  const focusMatch = phenotypeMd.match(/##\s*§1[^\n]*\n([^\n#]+)/);
  const focus = focusMatch ? focusMatch[1].trim() : '(no focus set)';
  const openQuestions = extractOpenQuestions(phenotypeMd);

  const db = new ConfidenceDB(path.join(cortexDir, 'confidence.json'));
  const store = db.load();
  const policy = extractPolicy(selectionMd);

  const riskConcepts = store.concepts.filter(
    (c) => c.criticality !== 'SHADOW' && (
      (c.criticality === 'GENOTYPE'  && c.score < policy.genotype)  ||
      (c.criticality === 'SELECTION' && c.score < policy.selection) ||
      (c.criticality === 'neutral'   && c.score < policy.neutral)
    )
  );
  const criticalConcepts = store.concepts.filter((c) => c.criticality === 'GENOTYPE');
  const shadowViolations = store.concepts.filter((c) => c.criticality === 'SHADOW');

  let overallHealth: 'green' | 'yellow' | 'red' = 'green';
  if (shadowViolations.length > 0 || riskConcepts.some((c) => c.criticality === 'GENOTYPE')) {
    overallHealth = 'red';
  } else if (riskConcepts.length > 0) {
    overallHealth = 'yellow';
  }

  return {
    version: 1,
    generatedAt: Date.now(),
    genome: {
      focus,
      openQuestions,
      hasGenotype:  fs.existsSync(genotypePath),
      hasEpigenome: fs.existsSync(epigenomePath),
      hasShadow:    fs.existsSync(shadowPath),
      hasSelection: fs.existsSync(selectionPath),
    },
    comprehension: {
      riskConcepts,
      criticalConcepts,
      totalConcepts: store.concepts.length,
      overallHealth,
    },
    animus: detectAnimus(cwd),
  };
}

function detectAnimus(cwd: string): AnimusPresence {
  const schemaPath = path.join(cwd, 'animus', 'agent.schema.json');
  if (!fs.existsSync(schemaPath)) return { present: false };

  const schemaRaw = fs.readFileSync(schemaPath, 'utf8');
  const schemaName: string = JSON.parse(schemaRaw).name ?? '(unnamed)';

  try {
    // Graceful degradation: require animus-sdk if available, never hard-fail without it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Animus } = require('animus-sdk') as { Animus: new (c: unknown) => { compile(): string } };
    const memPath = path.join(cwd, 'animus', 'agent.memory.json');
    const agent = new Animus({ schema: schemaPath, memory: memPath });
    return { present: true, moodLine: agent.compile(), schemaName };
  } catch (_) {
    return { present: true, moodLine: undefined, schemaName };
  }
}
