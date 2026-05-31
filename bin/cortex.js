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

function loadDist(module) {
  const p = path.join(__dirname, '..', 'dist', module + '.js');
  if (!fs.existsSync(p)) {
    console.error(`Error: dist/${module}.js not found. Run: npm run build`);
    process.exit(1);
  }
  return require(p);
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

  // If --with-animus flag is set, also run animus init
  if (process.argv.includes('--with-animus')) {
    console.log('\nRunning animus init...\n');
    try {
      require.resolve('animus-sdk');
      const { spawnSync } = require('child_process');
      spawnSync('animus', ['init'], { stdio: 'inherit' });
    } catch (_) {
      console.log('  ℹ  animus-sdk not installed — run: npm install animus-sdk && animus init');
    }
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

  if (arg === '--risk') {
    const { extractOpenQuestions } = loadDist('concepts');
    const questions = extractOpenQuestions(phenotype);
    if (questions.length > 0) {
      console.log('\nOpen questions (PHENOTYPE §3):');
      for (const q of questions) {
        console.log(`  • ${q}`);
      }
    } else {
      console.log('\nNo open questions in PHENOTYPE §3.');
    }

    const { ConfidenceDB } = loadDist('confidence');
    const db = new ConfidenceDB(path.join(cwd, '.cortex', 'confidence.json'));
    const risk = db.getRisk(0.60);
    const genoRisk = risk.filter(c => c.criticality === 'GENOTYPE');
    if (genoRisk.length > 0) {
      console.log(`\nComprehension risk: ${genoRisk.length} GENOTYPE concept(s) below threshold`);
      console.log('  Run `cortex map --critical` for details');
    } else {
      console.log('\nComprehension: all GENOTYPE concepts above threshold ✅');
    }
  } else {
    console.log('\n.cortex/ comprehension map: run `cortex map` for full view');
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
  const { ConfidenceDB } = loadDist('confidence');
  const db = new ConfidenceDB(path.join(cwd, '.cortex', 'confidence.json'));
  const store = db.load();

  if (store.concepts.length === 0) {
    console.log('Cortex comprehension map');
    console.log('─────────────────────────────────────────────');
    console.log('No concepts tracked yet.');
    console.log('Run `cortex watch` to start accumulating concept confidence.');
    return;
  }

  const policy = getPolicy();
  const showAll = arg !== '--critical';

  console.log('Cortex comprehension map');
  console.log('─────────────────────────────────────────────');

  const groups = [
    { label: `GENOTYPE concepts (block < ${policy.genotype}):`, filter: c => c.criticality === 'GENOTYPE' },
    { label: `SELECTION concepts (review < ${policy.selection}):`, filter: c => c.criticality === 'SELECTION' },
  ];
  if (showAll) {
    groups.push({ label: `Neutral concepts (flag < ${policy.neutral}):`, filter: c => c.criticality === 'neutral' });
  }

  for (const group of groups) {
    const concepts = store.concepts.filter(group.filter).sort((a, b) => a.score - b.score);
    if (concepts.length === 0) continue;

    console.log('\n' + group.label);
    for (const c of concepts) {
      const bar = buildBar(c.score);
      const threshold = group.filter({ criticality: 'GENOTYPE' })
        ? policy.genotype
        : group.filter({ criticality: 'SELECTION' })
          ? policy.selection
          : policy.neutral;

      const status = c.criticality === 'SHADOW'
        ? '🚫 BLOCKED'
        : c.score < (group.label.includes('GENOTYPE') ? policy.genotype : group.label.includes('SELECTION') ? policy.selection : policy.neutral)
          ? (group.label.includes('GENOTYPE') ? '🔴 BLOCK' : '⚠')
          : '✅';
      const label = c.concept.padEnd(24).slice(0, 24);
      console.log(`  ${label}  ${c.score.toFixed(2)}  ${bar}  ${c.applications} apps  ${status}`);
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`Last updated: ${new Date(store.updated).toLocaleString()}`);
}

function buildBar(score) {
  const filled = Math.round(score * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function getPolicy() {
  const selectionMd = readGenome('30_SELECTION.md') || '';
  try {
    const { extractPolicy } = loadDist('concepts');
    return extractPolicy(selectionMd);
  } catch (_) {
    return { genotype: 0.60, selection: 0.50, neutral: 0.75 };
  }
}

function watch() {
  const { GenomeWatcher } = loadDist('watcher');
  const watcher = new GenomeWatcher(
    path.join(cwd, '.genome'),
    path.join(cwd, '.cortex')
  );
  watcher.start();
}

function check() {
  const prNum = arg ? parseInt(arg, 10) : undefined;
  const { runCheck, formatCheckResult } = loadDist('check');
  const result = runCheck(cwd, prNum);
  console.log(formatCheckResult(result));
  if (result.status === 'fail') process.exitCode = 1;
}

function concept(filePath) {
  if (!filePath) {
    console.log('Usage: cortex concept <path>');
    process.exit(1);
  }
  const { ConfidenceDB } = loadDist('confidence');
  const db = new ConfidenceDB(path.join(cwd, '.cortex', 'confidence.json'));
  const store = db.load();

  const basename = path.basename(filePath);
  const matches = store.concepts.filter(c =>
    c.file === filePath || c.file === basename || filePath.endsWith(c.file)
  );

  if (matches.length === 0) {
    console.log(`No tracked concepts for: ${filePath}`);
    return;
  }

  console.log(`Concepts from ${filePath}:`);
  for (const c of matches.sort((a, b) => b.score - a.score)) {
    const bar = buildBar(c.score);
    console.log(`  ${c.concept.padEnd(30).slice(0, 30)}  ${c.score.toFixed(2)}  ${bar}  [${c.criticality}]`);
  }
}

function since(timerange) {
  if (!timerange) {
    console.log('Usage: cortex since <timerange>  (e.g. 7d, 2w, 1m)');
    process.exit(1);
  }
  const match = timerange.match(/^(\d+)(d|w|m)$/);
  if (!match) {
    console.log('Invalid timerange. Use format: 7d, 2w, 1m');
    process.exit(1);
  }
  const [, num, unit] = match;
  const msMap = { d: 864e5, w: 6048e5, m: 2592e6 };
  const cutoff = Date.now() - parseInt(num, 10) * msMap[unit];

  const { ConfidenceDB } = loadDist('confidence');
  const db = new ConfidenceDB(path.join(cwd, '.cortex', 'confidence.json'));
  const recent = db.load().concepts.filter(c => c.lastSeen >= cutoff);

  if (recent.length === 0) {
    console.log(`No concepts updated in the last ${timerange}.`);
    return;
  }

  console.log(`Concepts updated in the last ${timerange}:`);
  for (const c of recent.sort((a, b) => b.lastSeen - a.lastSeen)) {
    const ts = new Date(c.lastSeen).toLocaleDateString();
    console.log(`  ${c.concept.padEnd(30).slice(0, 30)}  ${c.score.toFixed(2)}  [${c.criticality}]  ${ts}`);
  }
}

// ── dispatch ───────────────────────────────────────────────────────────────

if      (cmd === 'init')                       init();
else if (cmd === 'status')                     status();
else if (cmd === 'log')                        log();
else if (cmd === 'shadow')                     shadow();
else if (cmd === 'hook' && arg === 'install')  hookInstall();
else if (cmd === 'map')                        map();
else if (cmd === 'watch')                      watch();
else if (cmd === 'check')                      check();
else if (cmd === 'concept')                    concept(arg);
else if (cmd === 'since')                      since(arg);
else {
  console.log('cortex-dev CLI\n');
  console.log('Usage:');
  console.log('  cortex init [--with-animus]   bootstrap .genome/ + .cortex/ in current project');
  console.log('  cortex hook install            install pre-commit guard');
  console.log('  cortex status                  phenotype focus');
  console.log('  cortex status --risk           open questions + comprehension risk summary');
  console.log('  cortex log                     epigenome (decision history)');
  console.log('  cortex shadow                  rejected paths + forbidden zone alerts');
  console.log('  cortex map                     full comprehension map');
  console.log('  cortex map --critical          GENOTYPE-class concepts only');
  console.log('  cortex watch                   watch .genome/ and accumulate concept confidence');
  console.log('  cortex check [--pr <number>]   CI gate — pass/fail based on confidence thresholds');
  console.log('  cortex concept <path>          concept grounding history for a file');
  console.log('  cortex since <timerange>       concepts updated in last N days/weeks/months');
}
