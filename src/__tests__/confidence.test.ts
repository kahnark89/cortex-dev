import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { ConfidenceDB } from '../confidence';

function tmpPath(): string {
  return path.join(os.tmpdir(), `cortex-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('load returns empty store when file does not exist', () => {
  const db = new ConfidenceDB('/tmp/no-such-cortex.json');
  const store = db.load();
  assert.strictEqual(store.version, 1);
  assert.deepStrictEqual(store.concepts, []);
});

test('upsert creates a new concept entry', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'auth/session', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    const store = db.load();
    assert.strictEqual(store.concepts.length, 1);
    assert.strictEqual(store.concepts[0].concept, 'auth/session');
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('upsert increments score on repeated calls', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'event-sourcing', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    const after1 = db.load().concepts[0].score;
    db.upsert({ concept: 'event-sourcing', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    const after2 = db.load().concepts[0].score;
    assert.ok(after2 > after1, 'Score should increase on second upsert');
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('upsert increments applications counter', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'billing', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    db.upsert({ concept: 'billing', file: '00_GENOTYPE.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    const entry = db.load().concepts[0];
    assert.strictEqual(entry.applications, 2);
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('GENOTYPE criticality weight is higher than neutral', () => {
  const p1 = tmpPath();
  const p2 = tmpPath();
  try {
    const db1 = new ConfidenceDB(p1);
    const db2 = new ConfidenceDB(p2);
    db1.upsert({ concept: 'x', file: 'f.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    db2.upsert({ concept: 'x', file: 'f.md', criticality: 'neutral',  context_distance: 1.0, correctness: 1.0 });
    const genoScore    = db1.load().concepts[0].score;
    const neutralScore = db2.load().concepts[0].score;
    assert.ok(genoScore > neutralScore, 'GENOTYPE should accrue higher score than neutral');
  } finally {
    [p1, p2].forEach((p) => { if (fs.existsSync(p)) fs.unlinkSync(p); });
  }
});

test('SHADOW concepts always score 0', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'graphql', file: '40_SHADOW.md', criticality: 'SHADOW', context_distance: 1.0, correctness: 1.0 });
    const entry = db.load().concepts[0];
    assert.strictEqual(entry.score, 0, 'SHADOW concept should always have score 0');
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('score is clamped to [0, 1]', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    for (let i = 0; i < 200; i++) {
      db.upsert({ concept: 'very-known', file: 'f.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    }
    const score = db.load().concepts[0].score;
    assert.ok(score <= 1.0, `Score ${score} should not exceed 1.0`);
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('getRisk returns concepts below threshold', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'low-confidence', file: 'f.md', criticality: 'GENOTYPE', context_distance: 0.1, correctness: 0.1 });
    for (let i = 0; i < 50; i++) {
      db.upsert({ concept: 'high-confidence', file: 'f.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    }
    const risk = db.getRisk(0.60);
    assert.ok(risk.some((c) => c.concept === 'low-confidence'));
    assert.ok(!risk.some((c) => c.concept === 'high-confidence'));
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('getRisk returns sorted by score ascending', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'a', file: 'f.md', criticality: 'neutral', context_distance: 0.2, correctness: 1.0 });
    db.upsert({ concept: 'b', file: 'f.md', criticality: 'neutral', context_distance: 0.1, correctness: 1.0 });
    const risk = db.getRisk(1.0);
    if (risk.length >= 2) {
      assert.ok(risk[0].score <= risk[1].score, 'getRisk should sort ascending by score');
    }
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('getCritical returns only GENOTYPE concepts', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'geno-concept', file: 'f.md', criticality: 'GENOTYPE', context_distance: 1.0, correctness: 1.0 });
    db.upsert({ concept: 'neutral-concept', file: 'f.md', criticality: 'neutral', context_distance: 1.0, correctness: 1.0 });
    const critical = db.getCritical();
    assert.ok(critical.every((c) => c.criticality === 'GENOTYPE'));
    assert.ok(critical.some((c) => c.concept === 'geno-concept'));
    assert.ok(!critical.some((c) => c.concept === 'neutral-concept'));
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('atomic write: no .tmp file left after save', () => {
  const p = tmpPath();
  try {
    const db = new ConfidenceDB(p);
    db.upsert({ concept: 'x', file: 'f.md', criticality: 'neutral', context_distance: 1.0, correctness: 1.0 });
    assert.ok(!fs.existsSync(p + '.tmp'), '.tmp should not exist after save');
  } finally {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});
