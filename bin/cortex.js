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
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
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
  ensureDir(genomeDir);

  const tmplGenome = path.join(tmpl, '.genome');
  for (const f of fs.readdirSync(tmplGenome)) {
    copyTemplate(path.join(tmplGenome, f), path.join(genomeDir, f));
  }

  const agentsMd = path.join(cwd, 'AGENTS.md');
  const snippet  = fs.readFileSync(path.join(tmpl, 'AGENTS.md'), 'utf8');
  let existing = null;
  try {
    existing = fs.readFileSync(agentsMd, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (existing !== null) {
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
  console.log('  5. Run: cortex sync              — push genome into Cursor, Copilot, Claude');
}

function status() {
  const phenotype = readGenome('10_PHENOTYPE.md');
  if (!phenotype) { console.log('No .genome/ found. Run: cortex init'); process.exit(1); }

  const { extractFocus, extractOpenQuestions } = loadDist('concepts');
  console.log(`Current focus: ${extractFocus(phenotype)}`);
  const questions = extractOpenQuestions(phenotype);
  if (questions.length > 0) {
    console.log('\nOpen questions:');
    for (const q of questions) console.log(`  • ${q}`);
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
  const hook = `#!/bin/sh
# Cortex pre-commit guard
# GENOTYPE requires GENOTYPE-CHANGE: tag; SELECTION requires SELECTION-CHANGE: tag.
MSG_FILE=".git/COMMIT_EDITMSG"

check_protected() {
  FILE="$1"
  TAG="$2"
  if git diff --cached --name-only | grep -q "$FILE"; then
    if [ -f "$MSG_FILE" ] && grep -q "$TAG" "$MSG_FILE"; then
      echo "Cortex: $TAG found — allowing modification of $FILE."
    else
      echo "Cortex: Protected file $FILE modified without $TAG in commit message."
      echo "  Add '$TAG: <reason>' to your commit message, or unstage $FILE."
      exit 1
    fi
  fi
}

check_protected ".genome/00_GENOTYPE.md" "GENOTYPE-CHANGE"
check_protected ".genome/30_SELECTION.md" "SELECTION-CHANGE"
`;
  fs.writeFileSync(path.join(hooksDir, 'pre-commit'), hook, { mode: 0o755 });
  console.log('✓  Cortex pre-commit hook installed at .git/hooks/pre-commit');
}

function audit() {
  const { runAudit } = loadDist('audit');
  const result = runAudit(cwd);

  console.log('cortex audit');
  console.log('─────────────────────────────────────────────');
  for (const item of result.items) {
    const icon = item.level === 'pass' ? '  ✅' : item.level === 'warn' ? '  ⚠ ' : '  🔴';
    console.log(`${icon}  ${item.message}`);
  }
  console.log('─────────────────────────────────────────────');
  const healthIcon = result.health === 'green' ? '✅' : result.health === 'yellow' ? '⚠ ' : '🔴';
  console.log(`Genome health: ${healthIcon} ${result.health}`);

  if (result.health !== 'green') process.exitCode = 1;
}

function syncCmd() {
  const { syncGenome } = loadDist('sync');
  const result = syncGenome(cwd);

  for (const t of result.targets) {
    if (t.written)  console.log(`  ✓  ${t.file}`);
    if (t.skipped)  console.log(`  ⚠  ${t.file} — ${t.reason}`);
  }

  const written = result.targets.filter((t) => t.written).length;
  console.log(`\n${written} file${written === 1 ? '' : 's'} written. AI tools will now reflect your genome.`);
}

function harvest() {
  const apply = process.argv.includes('--apply');
  const sinceIdx = process.argv.indexOf('--since');
  const since = sinceIdx !== -1
    ? process.argv[sinceIdx + 1] || '30d'
    : (arg && arg !== '--apply' ? arg : '30d');

  const { runHarvest } = loadDist('harvest');
  const result = runHarvest(cwd, since, apply);

  if (result.entries.length === 0) {
    console.log(`No decision commits found in the last ${since}.`);
    console.log('Tip: prefix commit messages with DECISION:, ADR:, ARCH:, or WHY: to mark decisions.');
    return;
  }

  if (apply) {
    console.log(`Appended ${result.entries.length} entr${result.entries.length === 1 ? 'y' : 'ies'} to 20_EPIGENOME.md:`);
  } else {
    console.log(`Found ${result.entries.length} commit${result.entries.length === 1 ? '' : 's'} worth logging (last ${since}):\n`);
  }

  for (const e of result.entries) {
    console.log(`  [${e.hash}]  ${e.date}  ${e.subject}`);
    if (e.body) console.log(`              ${e.body.split('\n')[0]}`);
  }

  if (!apply) {
    console.log(`\nRun with --apply to append these to 20_EPIGENOME.md`);
  }
}

function check() {
  const { runCheck, formatCheckResult } = loadDist('check');
  const result = runCheck(cwd);
  console.log(formatCheckResult(result));
  if (result.status === 'fail') process.exitCode = 1;
}

function context() {
  const { buildContext } = loadDist('context');
  const bundle = buildContext(cwd);
  console.log(JSON.stringify(bundle, null, 2));
}

// ── dispatch ───────────────────────────────────────────────────────────────

if      (cmd === 'init')                       init();
else if (cmd === 'status')                     status();
else if (cmd === 'log')                        log();
else if (cmd === 'shadow')                     shadow();
else if (cmd === 'hook' && arg === 'install')  hookInstall();
else if (cmd === 'audit')                      audit();
else if (cmd === 'sync')                       syncCmd();
else if (cmd === 'harvest')                    harvest();
else if (cmd === 'check')                      check();
else if (cmd === 'context')                    context();
else {
  console.log('cortex-dev CLI\n');
  console.log('Usage:');
  console.log('  cortex init [--with-animus]   bootstrap .genome/ in current project');
  console.log('  cortex hook install            install pre-commit guard');
  console.log('  cortex status                  current focus + open questions');
  console.log('  cortex audit                   genome health check (staleness, completeness)');
  console.log('  cortex sync                    push genome into CLAUDE.md, .cursorrules, copilot-instructions');
  console.log('  cortex harvest [--since <range>] [--apply]');
  console.log('                                 find decision commits and optionally append to EPIGENOME');
  console.log('  cortex check                   CI gate — pass/fail on governance checks');
  console.log('  cortex log                     epigenome (decision history)');
  console.log('  cortex shadow                  rejected paths');
  console.log('  cortex context                 emit JSON context bundle (stdout)');
}
