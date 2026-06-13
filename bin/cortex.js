#!/usr/bin/env node
'use strict';
/* cortex-dev CLI. Single file, zero deps, sectioned for cheap targeted edits:
 *   [io] [policy] [groundline math] [shadow] [commands] [dispatch]
 * Data files:
 *   .genome/*.md            — human+AI readable project judgment
 *   .cortex/concepts.json   — concept → path patterns (user-edited)
 *   .cortex/confidence.json — GroundLine evidence db (CLI-owned)            */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const argv = process.argv.slice(2);
const cmd = argv[0];
const cwd = process.cwd();
const tmpl = path.join(__dirname, '..', 'templates');

// ── [io] ────────────────────────────────────────────────────────────────────
const gPath = f => path.join(cwd, '.genome', f);
const cPath = f => path.join(cwd, '.cortex', f);
const readGenome = f => fs.existsSync(gPath(f)) ? fs.readFileSync(gPath(f), 'utf8') : null;
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
const writeJson = (p, obj) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); };
const ensureDir = p => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const flag = name => argv.includes(name);
const flagVal = name => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null; };
const git = args => { try { return cp.execSync('git ' + args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim(); } catch (e) { return null; } };

const concepts = () => readJson(cPath('concepts.json'), { concepts: {} }).concepts;
const confidence = () => readJson(cPath('confidence.json'), { concepts: {} });
const saveConfidence = db => writeJson(cPath('confidence.json'), db);

// ── [policy] ────────────────────────────────────────────────────────────────
// SELECTION.md may carry a ```cortex-policy {json}``` block. Defaults otherwise.
function policy() {
  const def = { auto_merge: 0.70, review: 0.40, gain: 0.25, fail_decay: 0.6, critical_block: 0.60 };
  const sel = readGenome('30_SELECTION.md');
  if (!sel) return def;
  // Merge every cortex-policy block in order — a later block (e.g. appended
  // override) wins over the template's default block for any key it sets.
  const blocks = [...sel.matchAll(/```cortex-policy\s*\n([\s\S]*?)```/g)];
  for (const b of blocks) {
    try { Object.assign(def, JSON.parse(b[1])); } catch (e) { /* malformed block: keep prior values */ }
  }
  return def;
}

// Criticality from genome mentions: GENOTYPE → 2.0, SELECTION → 1.5, else 1.0.
// Critical concepts need MORE evidence to earn the same score (gain divided by weight).
function criticality(name) {
  const probe = name.toLowerCase().replace(/[-_]/g, ' ');
  const has = f => { const t = readGenome(f); return t && t.toLowerCase().replace(/[-_]/g, ' ').includes(probe); };
  return has('00_GENOTYPE.md') ? 2.0 : has('30_SELECTION.md') ? 1.5 : 1.0;
}

// ── [groundline math] ───────────────────────────────────────────────────────
// Structural fingerprint: 32-bucket normalized histogram of hashed code tokens.
function fingerprint(text) {
  const h = new Array(32).fill(0);
  const toks = text.match(/[A-Za-z_]\w*|[^\sA-Za-z_]/g) || [];
  for (const t of toks) {
    let x = 5381;
    for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0;
    h[((x % 32) + 32) % 32]++;
  }
  const n = toks.length || 1;
  return h.map(v => v / n);
}

// Jensen–Shannon divergence, log2 → bounded [0,1].
function jsd(p, q) {
  const kl = (a, b) => a.reduce((s, ai, i) => ai > 0 && b[i] > 0 ? s + ai * Math.log2(ai / b[i]) : s, 0);
  const m = p.map((v, i) => (v + q[i]) / 2);
  return 0.5 * kl(p, m) + 0.5 * kl(q, m);
}

// context_distance: how far this application site sits from everything seen before.
// Distance to the CLOSEST prior fingerprint — repeating a known context earns ~0.
function contextDistance(fp, priors) {
  if (!priors || !priors.length) return 1.0;
  return Math.min(...priors.map(p => jsd(fp, p)));
}

function conceptsForFile(file) {
  const all = concepts(), hits = [];
  for (const name in all) {
    const pats = all[name].match || [];
    if (pats.some(p => p.includes('*')
      ? new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(file)
      : file.includes(p))) hits.push(name);
  }
  return hits;
}

// ── [shadow] ────────────────────────────────────────────────────────────────
// Forbidden zones: "**Forbidden:** pat1, pat2" lines inside shadow entries.
function forbiddenZones() {
  const sh = readGenome('40_SHADOW.md');
  if (!sh) return [];
  const zones = []; let id = '(shadow)', reason = '';
  for (const line of sh.split('\n')) {
    const head = line.match(/^###\s+Shadow\s+(\S+)\s*[—-]?\s*(.*)/i);
    if (head) { id = head[1]; reason = head[2]; continue; }
    const why = line.match(/^\*\*Why rejected:\*\*\s*(.+)/i);
    if (why) reason = why[1];
    const fz = line.match(/^\*\*Forbidden:\*\*\s*(.+)/i);
    if (fz) fz[1].split(',').map(s => s.trim()).filter(Boolean)
      .forEach(p => zones.push({ id, pattern: p, reason }));
  }
  return zones;
}

const matchZone = (file, z) => z.pattern.includes('*')
  ? new RegExp('^' + z.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(file)
  : file.includes(z.pattern);

// ── [commands] ──────────────────────────────────────────────────────────────
function init() {
  console.log('Initialising Cortex...\n');
  ensureDir(path.join(cwd, '.genome'));
  ensureDir(path.join(cwd, '.cortex'));

  for (const f of fs.readdirSync(path.join(tmpl, '.genome'))) {
    const dest = gPath(f);
    if (fs.existsSync(dest)) console.log(`  ⚠  .genome/${f} already exists — skipping`);
    else { fs.copyFileSync(path.join(tmpl, '.genome', f), dest); console.log(`  ✓  .genome/${f}`); }
  }
  if (!fs.existsSync(cPath('concepts.json'))) {
    writeJson(cPath('concepts.json'), { _doc: 'concept name → { match: [path substrings or globs], description }. Criticality is derived automatically: name mentioned in GENOTYPE → critical (2.0), in SELECTION → elevated (1.5), else neutral (1.0).', concepts: { 'example-concept': { match: ['src/example/'], description: 'replace me' } } });
    console.log('  ✓  .cortex/concepts.json');
  } else console.log('  ⚠  .cortex/concepts.json already exists — skipping');
  if (!fs.existsSync(cPath('confidence.json'))) { writeJson(cPath('confidence.json'), { concepts: {} }); console.log('  ✓  .cortex/confidence.json'); }

  const agentsMd = path.join(cwd, 'AGENTS.md');
  const snippet = fs.readFileSync(path.join(tmpl, 'AGENTS.md'), 'utf8');
  if (fs.existsSync(agentsMd)) {
    if (!fs.readFileSync(agentsMd, 'utf8').includes('## Cortex')) {
      fs.appendFileSync(agentsMd, '\n\n' + snippet); console.log('  ✓  Appended Cortex section to AGENTS.md');
    } else console.log('  ⚠  AGENTS.md already has a Cortex section — skipping');
  } else { fs.writeFileSync(agentsMd, snippet); console.log('  ✓  Created AGENTS.md'); }

  console.log('\nNext steps:');
  console.log('  1. Fill in .genome/00_GENOTYPE.md   — project thesis, invariants, hard lines');
  console.log('  2. Fill in .genome/10_PHENOTYPE.md  — current focus (one sentence)');
  console.log('  3. Fill in .genome/30_SELECTION.md  — heuristics + the cortex-policy block');
  console.log('  4. Map your concepts in .cortex/concepts.json');
  console.log('  5. cortex hook install');
}

/* commit-msg hook (NOT pre-commit): pre-commit fires before the message exists,
 * so a GENOTYPE-CHANGE tag could never be honored and a stale COMMIT_EDITMSG
 * from the PREVIOUS commit would silently unlock protected files. commit-msg
 * receives the live message file as $1 — the only correct interception point. */
function hookInstall() {
  const hooksDir = path.join(cwd, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) { console.log('No .git/hooks directory found. Is this a git repo?'); process.exit(1); }
  const hook = `#!/bin/sh
# Cortex guard — blocks GENOTYPE/SELECTION edits without a GENOTYPE-CHANGE tag.
PROTECTED=".genome/00_GENOTYPE.md .genome/30_SELECTION.md"
for f in $PROTECTED; do
  if git diff --cached --name-only | grep -qx "$f"; then
    if grep -q "GENOTYPE-CHANGE" "$1"; then
      echo "Cortex: GENOTYPE-CHANGE tag found — allowing protected file modification."
    else
      echo "Cortex: protected file $f modified without GENOTYPE-CHANGE tag in commit message."
      echo "  Add 'GENOTYPE-CHANGE: <reason>' to the commit message, or unstage $f."
      exit 1
    fi
  fi
done
`;
  fs.writeFileSync(path.join(hooksDir, 'commit-msg'), hook, { mode: 0o755 });
  const stalePre = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(stalePre) && fs.readFileSync(stalePre, 'utf8').includes('Cortex')) {
    fs.unlinkSync(stalePre);
    console.log('✓  Removed stale Cortex pre-commit hook (wrong phase — see hook comments)');
  }
  console.log('✓  Cortex commit-msg hook installed at .git/hooks/commit-msg');
}

/* record: the GroundLine data entry point. An AI session (or post-merge CI) calls
 * this after applying a concept: cortex record <concept> <file> [--fail] [--note ".."]
 * Updates evidence db + auto-appends an EPIGENOME line (append-only respected). */
function record() {
  const [, name, file] = argv;
  if (!name || !file) { console.log('Usage: cortex record <concept> <file> [--fail] [--note "..."]'); process.exit(1); }
  if (!concepts()[name]) { console.log(`Unknown concept "${name}". Add it to .cortex/concepts.json first.`); process.exit(1); }
  const fp_ = path.join(cwd, file);
  if (!fs.existsSync(fp_)) { console.log(`File not found: ${file}`); process.exit(1); }

  const P = policy();
  const db = confidence();
  const c = db.concepts[name] = db.concepts[name] || { score: 0, apps: [], fps: [] };
  const fp = fingerprint(fs.readFileSync(fp_, 'utf8'));
  const dist = +contextDistance(fp, c.fps).toFixed(3);
  const ok = !flag('--fail');
  const w = criticality(name);

  if (ok) c.score = Math.min(1, c.score + (P.gain * dist * (1 - c.score)) / w);
  else c.score = c.score * P.fail_decay;
  c.score = +c.score.toFixed(3);
  c.weight = w;
  c.apps.push({ t: Date.now(), file, dist, ok, note: flagVal('--note') || undefined });
  c.fps.push(fp); if (c.fps.length > 8) c.fps.shift();
  saveConfidence(db);

  const epi = gPath('20_EPIGENOME.md');
  if (fs.existsSync(epi)) {
    fs.appendFileSync(epi, `\n- [GroundLine] ${new Date().toISOString().slice(0, 10)} — "${name}" applied in \`${file}\` (dist ${dist}, ${ok ? 'ok' : 'FAIL'}) → score ${c.score}\n`);
  }
  const ctxs = new Set(c.apps.filter(a => a.dist > 0.15).map(a => a.file)).size || 1;
  console.log(`${ok ? '✓' : '✗'}  "${name}" ${ok ? 'grounded' : 'failed'} in ${file}`);
  console.log(`   context distance ${dist} · weight ${w} · score ${c.score} (${c.apps.length} applications, ~${ctxs} distinct contexts)`);
}

function changedFiles() {
  const staged = git('diff --cached --name-only');
  if (staged) return { files: staged.split('\n').filter(Boolean), source: 'staged' };
  const head = git('diff --name-only HEAD~1 2>/dev/null') || git('diff --name-only HEAD~1');
  if (head) return { files: head.split('\n').filter(Boolean), source: 'last commit' };
  return { files: [], source: 'none' };
}

/* check: the gate. Exit 2 = shadow violation, 1 = critical low confidence, 0 = clean. */
function check() {
  const P = policy();
  const db = confidence().concepts;
  const pr = flagVal('--pr');
  const { files, source } = changedFiles();
  if (!files.length) { console.log('Cortex check: no changed files found (nothing staged, no parent commit).'); return; }
  console.log(`Cortex check${pr ? ' — PR #' + pr : ''} (${source}: ${files.length} file${files.length > 1 ? 's' : ''})\n`);

  const zones = forbiddenZones();
  let worst = 0;
  const seen = new Set();

  for (const f of files) {
    for (const z of zones) if (matchZone(f, z)) {
      console.log(`🔴 Cortex [SHADOW VIOLATION]: ${f}`);
      console.log(`   Matches Shadow ${z.id}${z.reason ? ' (' + z.reason + ')' : ''}. Architect override required.\n`);
      worst = Math.max(worst, 2);
    }
    for (const name of conceptsForFile(f)) {
      if (seen.has(name + '|' + f)) continue;
      seen.add(name + '|' + f);
      const c = db[name];
      const score = c ? c.score : 0;
      const w = criticality(name);
      const cls = w === 2 ? 'GENOTYPE concept' : w === 1.5 ? 'SELECTION concept' : 'concept';
      if (w === 2 && score < P.critical_block) {
        console.log(`🔴 Cortex [LOW CONFIDENCE]: ${f} — "${name}" ${score.toFixed(2)} (${cls})`);
        console.log(`   Below critical_block ${P.critical_block}. Human review required before merge.\n`);
        worst = Math.max(worst, 1);
      } else if (score < P.review) {
        console.log(`⚠️  Cortex [LOW CONFIDENCE]: ${f} — "${name}" ${score.toFixed(2)} (${cls})`);
        console.log(`   Below review threshold ${P.review}. Review recommended.\n`);
      } else if (score >= P.auto_merge) {
        const ctxs = c ? new Set(c.apps.filter(a => a.dist > 0.15).map(a => a.file)).size : 0;
        console.log(`✅ Cortex [OK]: ${f} — "${name}" ${score.toFixed(2)} (${c.apps.length} applications, ${ctxs} distinct contexts)`);
        console.log(`   Auto-merge eligible per SELECTION policy.\n`);
      } else {
        console.log(`◻  Cortex [MID]: ${f} — "${name}" ${score.toFixed(2)} — between review (${P.review}) and auto-merge (${P.auto_merge}).\n`);
      }
    }
  }
  if (worst === 0) console.log('No genome violations.');
  process.exit(worst);
}

function bar(v) { const n = Math.round(v * 20); return '█'.repeat(n) + '░'.repeat(20 - n); }

function map_() {
  const db = confidence().concepts;
  const critOnly = flag('--critical');
  const names = Object.keys(concepts()).filter(n => !critOnly || criticality(n) === 2);
  if (!names.length) { console.log(critOnly ? 'No GENOTYPE-class concepts mapped.' : 'No concepts in .cortex/concepts.json yet.'); return; }
  console.log(`Cortex comprehension map${critOnly ? ' — GENOTYPE-class only' : ''}`);
  console.log('─'.repeat(62));
  names.map(n => ({ n, c: db[n], w: criticality(n) }))
    .sort((a, b) => (b.w - a.w) || ((a.c ? a.c.score : 0) - (b.c ? b.c.score : 0)))
    .forEach(({ n, c, w }) => {
      const s = c ? c.score : 0;
      const tag = w === 2 ? 'GENOTYPE ' : w === 1.5 ? 'SELECTION' : '         ';
      console.log(`${tag} ${bar(s)} ${s.toFixed(2)}  ${n}${c ? ` (${c.apps.length} apps)` : '  (no evidence yet)'}`);
    });
}

function conceptCmd() {
  const name = argv[1];
  if (!name) { console.log('Usage: cortex concept <name>'); process.exit(1); }
  const c = confidence().concepts[name];
  const meta = concepts()[name];
  if (!meta && !c) { console.log(`Unknown concept "${name}".`); process.exit(1); }
  console.log(`Concept: ${name}  ·  weight ${criticality(name)}  ·  score ${c ? c.score : 0}`);
  if (meta) console.log(`Match: ${(meta.match || []).join(', ')}${meta.description ? '  —  ' + meta.description : ''}`);
  if (c && c.apps.length) {
    console.log('\nGrounding history:');
    c.apps.forEach(a => console.log(`  ${new Date(a.t).toISOString().slice(0, 10)}  ${a.ok ? 'ok  ' : 'FAIL'}  dist ${a.dist}  ${a.file}${a.note ? '  — ' + a.note : ''}`));
  }
  const epi = readGenome('20_EPIGENOME.md');
  if (epi) {
    const lines = epi.split('\n').filter(l => l.toLowerCase().includes(name.toLowerCase()) && !l.startsWith('- [GroundLine]'));
    if (lines.length) { console.log('\nEpigenome mentions:'); lines.slice(0, 8).forEach(l => console.log('  ' + l.trim())); }
  }
}

function since() {
  const m = (argv[1] || '').match(/^(\d+)d$/);
  if (!m) { console.log('Usage: cortex since <N>d   e.g. cortex since 30d'); process.exit(1); }
  const cutoff = Date.now() - (+m[1]) * 86400000;
  const db = confidence().concepts;
  let any = false;
  console.log(`Comprehension activity — last ${m[1]} days`);
  console.log('─'.repeat(62));
  for (const n in db) {
    const recent = db[n].apps.filter(a => a.t >= cutoff);
    if (!recent.length) continue;
    any = true;
    const fails = recent.filter(a => !a.ok).length;
    console.log(`${n}: ${recent.length} application${recent.length > 1 ? 's' : ''}${fails ? ` (${fails} failed)` : ''} → score ${db[n].score}`);
  }
  if (!any) console.log('No recorded applications in this window.');
}

function status() {
  const phenotype = readGenome('10_PHENOTYPE.md');
  if (!phenotype) { console.log('No .genome/ found. Run: cortex init'); process.exit(1); }
  const fm = phenotype.match(/##\s*§1[^\n]*\n([^\n#]+)/);
  console.log(`Current focus: ${fm ? fm[1].trim() : '(§1 Current focus not found in PHENOTYPE)'}`);

  const P = policy();
  const db = confidence().concepts;
  const names = Object.keys(concepts());
  const risky = names.filter(n => criticality(n) >= 1.5 && (db[n] ? db[n].score : 0) < P.review);
  const zones = forbiddenZones();
  console.log(`Concepts mapped: ${names.length}  ·  forbidden zones: ${zones.length}  ·  critical/elevated below review threshold: ${risky.length}`);

  if (flag('--risk')) {
    console.log('');
    if (!risky.length && !zones.length) console.log('No risk items. ');
    risky.forEach(n => console.log(`⚠️  "${n}" — score ${(db[n] ? db[n].score : 0).toFixed(2)} (weight ${criticality(n)}) below review threshold ${P.review}`));
    zones.forEach(z => console.log(`⛔ Shadow ${z.id} forbidden zone active: ${z.pattern}`));
  } else {
    console.log('\ncortex map — full comprehension view · cortex status --risk — risk items only');
  }
}

function log_() {
  const epi = readGenome('20_EPIGENOME.md');
  if (!epi) { console.log('No .genome/20_EPIGENOME.md found.'); process.exit(1); }
  console.log(epi);
}

function shadow_() {
  const sh = readGenome('40_SHADOW.md');
  if (!sh) { console.log('No .genome/40_SHADOW.md found.'); process.exit(1); }
  console.log(sh);
  const zones = forbiddenZones();
  if (zones.length) {
    console.log('\nActive forbidden zones (machine-enforced by `cortex check`):');
    zones.forEach(z => console.log(`  ⛔ ${z.id}: ${z.pattern}`));
  }
}

// ── [dispatch] ──────────────────────────────────────────────────────────────
if (cmd === 'init') init();
else if (cmd === 'hook' && argv[1] === 'install') hookInstall();
else if (cmd === 'status') status();
else if (cmd === 'log') log_();
else if (cmd === 'shadow') shadow_();
else if (cmd === 'map') map_();
else if (cmd === 'concept') conceptCmd();
else if (cmd === 'since') since();
else if (cmd === 'record') record();
else if (cmd === 'check') check();
else {
  console.log('cortex-dev CLI\n');
  console.log('Usage:');
  console.log('  cortex init                       bootstrap .genome/ + .cortex/ in current project');
  console.log('  cortex hook install               install commit-msg guard for protected genome files');
  console.log('  cortex status [--risk]            phenotype focus + risk summary');
  console.log('  cortex log                        epigenome (decisions + GroundLine auto-entries)');
  console.log('  cortex shadow                     rejected paths + active forbidden zones');
  console.log('  cortex map [--critical]           comprehension map (GENOTYPE-class only with --critical)');
  console.log('  cortex concept <name>             grounding history + epigenome mentions for one concept');
  console.log('  cortex since <N>d                 comprehension activity in the last N days');
  console.log('  cortex record <concept> <file>    record a concept application  [--fail] [--note "..."]');
  console.log('  cortex check [--pr <n>]           gate: shadow violations + confidence (exit 2/1/0)');
}
