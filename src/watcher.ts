'use strict';

import fs from 'fs';
import path from 'path';
import { ConfidenceDB } from './confidence';
import { extractConcepts } from './concepts';

export class GenomeWatcher {
  private genomeDir: string;
  private cortexDir: string;
  private watcher: fs.FSWatcher | null = null;

  constructor(genomeDir: string, cortexDir: string) {
    this.genomeDir = genomeDir;
    this.cortexDir = cortexDir;
  }

  /** Start watching .genome/ for changes. Accumulates concept confidence passively. */
  start(): void {
    if (!fs.existsSync(this.genomeDir)) {
      console.error('No .genome/ directory found. Run: cortex init');
      process.exit(1);
    }

    console.log(`Cortex: watching ${this.genomeDir} for changes...`);
    console.log('Press Ctrl+C to stop.\n');

    this.watcher = fs.watch(this.genomeDir, { recursive: false }, (_event: string, filename: string | Buffer | null) => {
      if (!filename || typeof filename !== 'string' || !filename.endsWith('.md')) return;
      this.onFileChange(filename);
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private onFileChange(filename: string): void {
    const genotypePath  = path.join(this.genomeDir, '00_GENOTYPE.md');
    const selectionPath = path.join(this.genomeDir, '30_SELECTION.md');

    if (!fs.existsSync(genotypePath) || !fs.existsSync(selectionPath)) return;

    const genotypeMd  = fs.readFileSync(genotypePath, 'utf8');
    const selectionMd = fs.readFileSync(selectionPath, 'utf8');
    const concepts = extractConcepts(genotypeMd, selectionMd);

    const db = new ConfidenceDB(path.join(this.cortexDir, 'confidence.json'));

    for (const c of concepts) {
      db.upsert({ ...c, context_distance: 0.5, correctness: 1.0 });
    }

    const ts = new Date().toISOString().slice(11, 19);
    console.log(`  [${ts}] ${filename} changed — updated ${concepts.length} concepts`);
  }
}
