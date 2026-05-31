#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const cmd  = process.argv[2];
const arg  = process.argv[3];
const cwd  = process.cwd();
const tmpl = path.join(__dirname, '..', 'templates');

// ── helpers ────────────────────────────────────────────────────────────────

function readGenome(file) {
  const p = path.join(cwd, '.genome', file);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyTemplate(src, dest) {
  if (fs.existsSync(dest)) {
    console.log(`  ⚠  ${dest.replace(cwd + '/', '')} already exists — skipping`);
  } else {
    fs.copyFileSync(src, dest);
    console.log(`  ✓  ${dest.replace(cwd + '/', '')}`);
  }
}

// ── commands ───────────────────────────────────────────────────────────────

function init() {
  console.log('Initialising Cortex...\n');

  const genomeDir  = path.join(cwd, '.genome');
  const cortexDir  = path.join(cwd, '.cortex');
  ensureDir(genomeDir);
  ensureDir(cortexDir);

  const tmplGenome = path.join(tmpl, '.genome');
  for (const f of fs.readdirSync(tmplGenome)) {
    copyTemplate(path.join(tmplGenome, f), path.join(genomeDir, f));
  }

  const agentsMd = path.join(cwd, 'AGENTS.md');
  const snippet  = fs.readFileSync(path.join(tmpl, 'AGENTS.md'), 'utf8');
  if (fs.existsSync(agentsMd)) {
    const existing = fs.readFileSync(agentsMd, 'utf8');
    if (!existing.includes('## Cortex')) {
      fs.appendFileSync(agentsMd, '\n\n' + snippet);
      console.log('  ✓  Appended Cortex section to AGENTS.md');
    } else {
      console.log('  ⚠  AGENTS.md already has a Cortex section — skipping');
    }
  } else {
    fs.writeFileSync(agentsMd, snippet);
    console.log('  ✓  Created AGENTS.md');
  }

  console.log('\nNext steps:');
  console.log('  1. Fill in .genome/00_GENOTYPE.md  — project thesis, invariants, hard lines');
  console.log('  2. Fill in .genome/10_PHENOTYPE.md — current focus (one sentence)');
  console.log('  3. Fill in .genome/30_SELECTION.md — architect decision heuristics');
  console.log('  4. Run: cortex hook install');
}

function status() {
  const phenotype = readGenome('10_PHENOTYPE.md');
  if (!phenotype) {
    console.log('No .genome/ found. Run: cortex init');
    process.exit(1);
  }
  const focusMatch = phenotype.match(/##\s*§1[^\n]*\n([^\n#]+)/);
  const focus = focusMatch ? focusMatch[1].trim() : '(§1 Current focus not found in PHENOTYPE)';
  console.log(`Current focus: ${focus}`);
  console.log('\n.cortex/ comprehension map: run `cortex map` for full view');

  if (arg === '--risk') {
    console.log('\n[Risk items — full implementation pending]');
    console.log('  cortex map --critical  to see GENOTYPE-class low-confidence concepts');
  }
}

function log() {
  const epi = readGenome('20_EPIGENOME.md');
  if (!epi) { console.log('No .genome/20_EPIGENOME.md found.'); process.exit(1); }
  console.log(epi);
}

function shadow() {
  const sh = readGenome('40_SHADOW.md');
  if (!sh) { console.log('No .genome/40_SHADOW.md found.'); process.exit(1); }
  console.log(sh);
}

function hookInstall() {
  const hooksDir = path.join(cwd, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    console.log('No .git/hooks directory found. Is this a git repo?');
    process.exit(1);
  }
  const hookPath = path.join(hooksDir, 'pre-commit');
  const hook = `#!/bin/sh
# Cortex pre-commit guard
# Blocks modifications to GENOTYPE or SELECTION without a GENOTYPE-CHANGE tag in the commit message.
PROTECTED=".genome/00_GENOTYPE.md .genome/30_SELECTION.md"
MSG_FILE=".git/COMMIT_EDITMSG"
for f in $PROTECTED; do
  if git diff --cached --name-only | grep -q "$f"; then
    if [ -f "$MSG_FILE" ] && grep -q "GENOTYPE-CHANGE" "$MSG_FILE"; then
      echo "Cortex: GENOTYPE-CHANGE tag found — allowing protected file modification."
    else
      echo "Cortex: Protected file $f modified without GENOTYPE-CHANGE tag in commit message."
      echo "  Add 'GENOTYPE-CHANGE: <reason>' to your commit message, or unstage $f."
      exit 1
    fi
  fi
done
`;
  fs.writeFileSync(hookPath, hook, { mode: 0o755 });
  console.log('✓  Cortex pre-commit hook installed at .git/hooks/pre-commit');
}

function map() {
  console.log('Cortex comprehension map');
  console.log('─────────────────────────────────────────────');
  console.log('[Full implementation pending — confidence.db not yet populated]');
  console.log('');
  console.log('Run `cortex watch` to start accumulating concept confidence from your sessions.');
  if (arg === '--critical') {
    console.log('\nCritical (GENOTYPE-class) concepts only:');
    const genotype = readGenome('00_GENOTYPE.md');
    if (!genotype) { console.log('  No .genome/00_GENOTYPE.md found.'); return; }
    console.log('  [Concept extraction from GENOTYPE — pending AST integration]');
  }
}

// ── dispatch ───────────────────────────────────────────────────────────────

if      (cmd === 'init')                       init();
else if (cmd === 'status')                     status();
else if (cmd === 'log')                        log();
else if (cmd === 'shadow')                     shadow();
else if (cmd === 'hook' && arg === 'install')  hookInstall();
else if (cmd === 'map')                        map();
else {
  console.log('cortex-dev CLI\n');
  console.log('Usage:');
  console.log('  cortex init                bootstrap .genome/ + .cortex/ in current project');
  console.log('  cortex hook install        install pre-commit guard');
  console.log('  cortex status              phenotype focus + risk summary');
  console.log('  cortex status --risk       only low-confidence + shadow-flagged items');
  console.log('  cortex log                 epigenome (decisions + auto-entries)');
  console.log('  cortex shadow              rejected paths + forbidden zone alerts');
  console.log('  cortex map                 full comprehension map');
  console.log('  cortex map --critical      GENOTYPE-class concepts only');
}
