'use strict';

import fs from 'fs';
import path from 'path';
import { runAudit, AuditItem } from './audit';
import { extractFocus, extractOpenQuestions } from './concepts';

export interface AnimusPresence {
  present: boolean;
  moodLine?: string;
  schemaName?: string;
}

export interface CortexContextBundle {
  version: 2;
  generatedAt: number;
  genome: {
    focus: string;
    openQuestions: string[];
    hasGenotype: boolean;
    hasEpigenome: boolean;
    hasShadow: boolean;
    hasSelection: boolean;
  };
  audit: {
    health: 'green' | 'yellow' | 'red';
    items: AuditItem[];
  };
  animus: AnimusPresence;
}

export function buildContext(cwd: string): CortexContextBundle {
  const genomeDir = path.join(cwd, '.genome');

  const phenotypePath  = path.join(genomeDir, '10_PHENOTYPE.md');
  const genotypePath   = path.join(genomeDir, '00_GENOTYPE.md');
  const epigenomePath  = path.join(genomeDir, '20_EPIGENOME.md');
  const shadowPath     = path.join(genomeDir, '40_SHADOW.md');
  const selectionPath  = path.join(genomeDir, '30_SELECTION.md');

  const phenotypeMd = fs.existsSync(phenotypePath) ? fs.readFileSync(phenotypePath, 'utf8') : '';

  const focus = extractFocus(phenotypeMd);

  const audit = runAudit(cwd);

  return {
    version: 2,
    generatedAt: Date.now(),
    genome: {
      focus,
      openQuestions: extractOpenQuestions(phenotypeMd),
      hasGenotype:  fs.existsSync(genotypePath),
      hasEpigenome: fs.existsSync(epigenomePath),
      hasShadow:    fs.existsSync(shadowPath),
      hasSelection: fs.existsSync(selectionPath),
    },
    audit: {
      health: audit.health,
      items:  audit.items,
    },
    animus: detectAnimus(cwd),
  };
}

function detectAnimus(cwd: string): AnimusPresence {
  const schemaPath = path.join(cwd, 'animus', 'agent.schema.json');
  if (!fs.existsSync(schemaPath)) return { present: false };

  const schemaRaw  = fs.readFileSync(schemaPath, 'utf8');
  const schemaName = (JSON.parse(schemaRaw).name as string) ?? '(unnamed)';

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Animus } = require('animus-sdk') as { Animus: new (c: unknown) => { compile(): string } };
    const memPath = path.join(cwd, 'animus', 'agent.memory.json');
    const agent = new Animus({ schema: schemaPath, memory: memPath });
    return { present: true, moodLine: agent.compile(), schemaName };
  } catch (_) {
    return { present: true, moodLine: undefined, schemaName };
  }
}
