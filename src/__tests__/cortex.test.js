'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CLI = path.join(__dirname, '..', '..', 'bin', 'cortex.js');

function run(dir, args, env) {
  return cp.spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: Object.assign({}, process.env, env) });
}
function sh(dir, cmd) { return cp.execSync(cmd, { cwd: dir, encoding: 'utf8' }); }

function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-'));
  sh(dir, 'git init -q && git config user.email t@t && git config user.name t');
  run(dir, ['init']);
  // map a concept + make it GENOTYPE-critical by mentioning it in GENOTYPE
  fs.writeFileSync(path.join(dir, '.cortex', 'concepts.json'), JSON.stringify({
    concepts: {
      'session-auth': { match: ['auth/'], description: 'session handling' },
      'billing':      { match: ['billing/'], description: 'money paths' }
    }
  }));
  fs.appendFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), '\nInvariant: session-auth tokens are opaque.\n');
  fs.mkdirSync(path.join(dir, 'auth'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'billing'), { recursive: true });
  return dir;
}

test('init scaffolds genome + cortex data files', () => {
  const dir = freshRepo();
  ['.genome/00_GENOTYPE.md', '.genome/40_SHADOW.md', '.cortex/concepts.json', '.cortex/confidence.json', 'AGENTS.md']
    .forEach(f => assert.ok(fs.existsSync(path.join(dir, f)), f + ' should exist'));
});

test('record: score grows with new contexts, plateaus on repeats, critical concepts grow slower', () => {
  const dir = freshRepo();
  fs.writeFileSync(path.join(dir, 'auth', 'session.js'), 'function login(t){ return verify(t) && open(t); }');
  fs.writeFileSync(path.join(dir, 'auth', 'refresh.js'), 'class Refresh { rotate(){ const k = this.keys.pop(); store(k); } }');
  fs.writeFileSync(path.join(dir, 'billing', 'invoice.js'), 'function total(items){ return items.reduce((s,i)=>s+i.amt,0); }');

  let r = run(dir, ['record', 'session-auth', 'auth/session.js']);
  assert.match(r.stdout, /context distance 1/, 'first application = fully new context');
  const db1 = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'confidence.json')));
  const s1 = db1.concepts['session-auth'].score;
  assert.ok(s1 > 0 && s1 <= 0.13, `critical concept grows at half rate (got ${s1})`);

  run(dir, ['record', 'session-auth', 'auth/refresh.js']);   // genuinely different file
  const s2 = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'confidence.json'))).concepts['session-auth'].score;
  assert.ok(s2 > s1, 'new context grows score');

  run(dir, ['record', 'session-auth', 'auth/session.js']);   // repeat of a known context
  const s3 = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'confidence.json'))).concepts['session-auth'].score;
  assert.ok(s3 - s2 < 0.02, `repeating a known context earns ~nothing (Δ ${(s3 - s2).toFixed(3)})`);

  run(dir, ['record', 'billing', 'billing/invoice.js']);     // neutral concept, same dist
  const sb = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'confidence.json'))).concepts['billing'].score;
  assert.ok(sb > s1, 'neutral concept grows faster than critical for same evidence');
});

test('record --fail decays score and both outcomes auto-append to EPIGENOME', () => {
  const dir = freshRepo();
  fs.writeFileSync(path.join(dir, 'billing', 'invoice.js'), 'function total(){ return 1; }');
  run(dir, ['record', 'billing', 'billing/invoice.js']);
  const before = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'confidence.json'))).concepts['billing'].score;
  run(dir, ['record', 'billing', 'billing/invoice.js', '--fail']);
  const after = JSON.parse(fs.readFileSync(path.join(dir, '.cortex', 'confidence.json'))).concepts['billing'].score;
  assert.ok(after < before, 'failure decays score');
  const epi = fs.readFileSync(path.join(dir, '.genome', '20_EPIGENOME.md'), 'utf8');
  assert.match(epi, /\[GroundLine\].*"billing".*ok/, 'success logged');
  assert.match(epi, /\[GroundLine\].*"billing".*FAIL/, 'failure logged');
});

test('check: shadow Forbidden zone blocks with exit 2; critical low confidence exits 1', () => {
  const dir = freshRepo();
  fs.appendFileSync(path.join(dir, '.genome', '40_SHADOW.md'),
    '\n### Shadow S03 — PKCE-only flow\n**Why rejected:** breaks embedded webviews\n**Forbidden:** auth/oauth-pkce\n');
  fs.writeFileSync(path.join(dir, 'auth', 'oauth-pkce.js'), 'pkce();');
  sh(dir, 'git add auth/oauth-pkce.js');
  let r = run(dir, ['check', '--pr', '7']);
  assert.strictEqual(r.status, 2, 'shadow violation exits 2');
  assert.match(r.stdout, /SHADOW VIOLATION/);
  assert.match(r.stdout, /S03/);

  sh(dir, 'git reset -q');
  fs.writeFileSync(path.join(dir, 'auth', 'session.js'), 'login();');
  sh(dir, 'git add auth/session.js');
  r = run(dir, ['check']);
  assert.strictEqual(r.status, 1, 'GENOTYPE concept with no evidence exits 1');
  assert.match(r.stdout, /LOW CONFIDENCE/);
  assert.match(r.stdout, /GENOTYPE concept/);
});

test('check: well-grounded concept reports auto-merge eligible, exit 0', () => {
  const dir = freshRepo();
  // ground "billing" (neutral) above auto_merge with several distinct contexts
  for (let i = 0; i < 8; i++) {
    fs.writeFileSync(path.join(dir, 'billing', `m${i}.js`),
      ['function a(x){return x+' + i + '}', 'class B' + i + '{run(){loop(' + i + ')}}', 'const c=' + i + ';export default c', 'if(' + i + '>2){throw new Error("x")}'][i % 4] + ' // variant ' + i + Math.random());
    run(dir, ['record', 'billing', `billing/m${i}.js`]);
  }
  fs.writeFileSync(path.join(dir, 'billing', 'new.js'), 'pay();');
  sh(dir, 'git add billing/new.js');
  const r = run(dir, ['check']);
  assert.strictEqual(r.status, 0, 'exit 0: ' + r.stdout);
  assert.match(r.stdout, /Auto-merge eligible|MID/, r.stdout);
});

test('commit-msg hook: blocks protected edits without tag, allows with tag', () => {
  const dir = freshRepo();
  sh(dir, 'git add -A && git commit -qm "base"');
  run(dir, ['hook', 'install']);
  assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'commit-msg')));
  fs.appendFileSync(path.join(dir, '.genome', '00_GENOTYPE.md'), '\nnew invariant\n');
  sh(dir, 'git add .genome/00_GENOTYPE.md');
  let blocked = false;
  try { sh(dir, 'git commit -qm "sneaky edit"'); } catch (e) { blocked = true; }
  assert.ok(blocked, 'untagged protected edit must be blocked');
  sh(dir, 'git commit -qm "GENOTYPE-CHANGE: ratified by architect"');
});

test('map, status --risk, concept, since all read the evidence db', () => {
  const dir = freshRepo();
  fs.writeFileSync(path.join(dir, 'auth', 'session.js'), 'login();');
  run(dir, ['record', 'session-auth', 'auth/session.js', '--note', 'first pass']);
  let r = run(dir, ['map']);
  assert.match(r.stdout, /GENOTYPE.*session-auth/s);
  r = run(dir, ['map', '--critical']);
  assert.match(r.stdout, /session-auth/);
  assert.doesNotMatch(r.stdout, /billing/);
  r = run(dir, ['status', '--risk']);
  assert.match(r.stdout, /session-auth/, 'low-score critical concept appears in risk view');
  r = run(dir, ['concept', 'session-auth']);
  assert.match(r.stdout, /first pass/);
  r = run(dir, ['since', '30d']);
  assert.match(r.stdout, /session-auth: 1 application/);
});

test('policy block in SELECTION.md overrides defaults', () => {
  const dir = freshRepo();
  const sel = path.join(dir, '.genome', '30_SELECTION.md');
  fs.appendFileSync(sel, '\n```cortex-policy\n{ "review": 0.99 }\n```\n');
  fs.writeFileSync(path.join(dir, 'billing', 'x.js'), 'x();');
  sh(dir, 'git add billing/x.js');
  const r = run(dir, ['check']);
  assert.match(r.stdout, /Below review threshold 0.99/, r.stdout);
});
