'use strict';

import fs from 'fs';
import path from 'path';

export type Criticality = 'GENOTYPE' | 'SELECTION' | 'SHADOW' | 'neutral';

export interface ConceptEntry {
  concept: string;
  file: string;
  criticality: Criticality;
  score: number;
  applications: number;
  lastSeen: number;
}

export interface ConfidenceStore {
  version: 1;
  updated: number;
  concepts: ConceptEntry[];
}

const CRITICALITY_WEIGHTS: Record<Criticality, number> = {
  GENOTYPE:  1.5,
  SELECTION: 1.2,
  SHADOW:    0,
  neutral:   1.0,
};

const SCORE_STEP = 0.05;

export class ConfidenceDB {
  private storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  load(): ConfidenceStore {
    if (!fs.existsSync(this.storePath)) {
      return { version: 1, updated: Date.now(), concepts: [] };
    }
    return JSON.parse(fs.readFileSync(this.storePath, 'utf8')) as ConfidenceStore;
  }

  /** Atomic write via tmp-then-rename. */
  save(store: ConfidenceStore): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = this.storePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, this.storePath);
  }

  /**
   * Upsert a concept. Score formula:
   *   new_score = clamp01(old_score + STEP × context_distance × correctness × criticality_weight)
   * SHADOW concepts always score 0 (they are forbidden zones, never "learned").
   */
  upsert(
    entry: Omit<ConceptEntry, 'score' | 'applications' | 'lastSeen'> & {
      context_distance: number;
      correctness: number;
    }
  ): void {
    const store = this.load();
    const weight = CRITICALITY_WEIGHTS[entry.criticality] ?? 1.0;
    const delta = SCORE_STEP * entry.context_distance * entry.correctness * weight;

    const existing = store.concepts.find(
      (c) => c.concept === entry.concept && c.file === entry.file
    );

    if (existing) {
      existing.score = clamp01(existing.score + delta);
      existing.applications += 1;
      existing.lastSeen = Date.now();
    } else {
      store.concepts.push({
        concept: entry.concept,
        file: entry.file,
        criticality: entry.criticality,
        score: clamp01(delta),
        applications: 1,
        lastSeen: Date.now(),
      });
    }

    store.updated = Date.now();
    this.save(store);
  }

  /** Return all concepts with score below the given threshold (default 0.60), sorted ascending by score. */
  getRisk(threshold = 0.60): ConceptEntry[] {
    return this.load()
      .concepts.filter((c) => c.score < threshold)
      .sort((a, b) => a.score - b.score);
  }

  getCritical(): ConceptEntry[] {
    return this.load().concepts.filter((c) => c.criticality === 'GENOTYPE');
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
