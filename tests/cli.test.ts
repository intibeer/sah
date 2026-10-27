import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Product, Run } from '../packages/core/src/index.js';

test('separate CLI processes persist approvals, rejection, denials, trace and idempotency', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sah-test-'));
  const entry = fileURLToPath(new URL('../apps/cli/src/index.js', import.meta.url));
  const command = (...args: string[]) => spawnSync(process.execPath, [entry, ...args, '--dir', dir], { encoding: 'utf8' });
  const state = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as { products: Product[]; runs: Run[]; events: { sequence: number; action: string }[] };
  try {
    assert.equal(command('init').status, 0);
    const before = state().products;
    assert.equal(command('scan', '--limit', '3').status, 0);
    assert.deepEqual(state().products, before);
    assert.equal(command('review').status, 0);
    assert.equal(command('apply').status, 1);
    const [p, rejected] = state().runs[0]!.proposals;
    assert.ok(p && rejected);
    assert.equal(command('approve', '--proposal', p.id).status, 1);
    assert.equal(command('approve', '--proposal', p.id, '--actor', 'local-merchant').status, 0);
    assert.equal(command('reject', '--proposal', rejected.id, '--actor', 'local-merchant').status, 0);
    assert.deepEqual(state().products, before);
    assert.equal(command('apply').status, 0);
    assert.equal(state().products[0]!.title, 'Canvas Tote');
    assert.equal(state().products[0]!.vendor, before[0]!.vendor);
    assert.match(command('apply').stdout, /Applied 0/);
    assert.equal(state().runs[0]!.applied.length, 1);
    assert.equal(command('trace').status, 0);
    const events = readFileSync(join(dir, 'trace.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as { action: string });
    for (const action of ['proposal.approve', 'proposal.reject', 'apply.denied', 'change.applied', 'change.skipped']) assert.ok(events.some(event => event.action === action));
    assert.deepEqual(state().events.map(event => event.sequence), state().events.map((_, i) => i + 1));
    assert.equal(command('init').status, 1);
    assert.equal(command('scan', '--limit', '101').status, 1);
    assert.equal(command('scan', '--unknown', 'yes').status, 1);
    writeFileSync(join(dir, 'command.lock'), '');
    assert.match(command('apply').stderr, /locked/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI interruption, auth recovery, verification failures, revision and cancellation persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sah-lifecycle-'));
  const entry = fileURLToPath(new URL('../apps/cli/src/index.js', import.meta.url));
  const command = (...args: string[]) => spawnSync(process.execPath, [entry, ...args, '--dir', dir], { encoding: 'utf8' });
  const state = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as { products: Product[]; runs: Run[]; events: { action: string }[] };
  const ok = (...args: string[]) => { const result = command(...args); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  try {
    ok('init'); ok('scan');
    const first = state().runs[0]!;
    for (const p of first.proposals) ok('approve', '--proposal', p.id, '--actor', 'merchant');
    ok('simulate', '--failure', 'auth-expired');
    assert.equal(command('apply').status, 1);
    assert.match(ok('status'), /blocked_auth/);
    ok('simulate', '--failure', 'interrupt');
    // Resume reconnects but is deliberately interrupted after its first write.
    assert.equal(command('resume').status, 1);
    assert.equal(state().runs[0]!.applied.length, 1);
    ok('resume');
    assert.equal(state().runs[0]!.applied.length, 3);
    assert.equal(state().events.filter(e => e.action === 'change.applied').length, 3);
    assert.equal(state().runs[0]!.attempts.filter(a => a.status === 'verified').length, 3);
    ok('simulate', '--failure', 'verification');
    assert.equal(command('verify').status, 1);
    assert.match(ok('status'), /partially_completed/);
    ok('simulate', '--failure', 'none'); ok('verify');
    ok('revise');
    const next = state().runs.at(-1)!;
    assert.equal(next.revision, 2); assert.equal(next.taskId, first.taskId);
    assert.equal(state().runs[0]!.status, 'superseded');
    assert.equal(command('apply', '--run', first.id).status, 1);
    ok('cancel');
    assert.equal(command('resume').status, 1);
    assert.equal(state().runs.at(-1)!.status, 'cancelled');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('legacy migration preserves applied history but invalidates pending approval', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sah-legacy-'));
  const entry = fileURLToPath(new URL('../apps/cli/src/index.js', import.meta.url));
  const command = (...args: string[]) => spawnSync(process.execPath, [entry, ...args, '--dir', dir], { encoding: 'utf8' });
  const state = () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as { version: number; simulation: string; products: Product[]; runs: Run[]; events: { action: string }[] };
  try {
    assert.equal(command('init').status, 0); assert.equal(command('scan').status, 0);
    const original = state(); const run = original.runs[0]!;
    for (const p of run.proposals.slice(0, 2)) assert.equal(command('approve', '--proposal', p.id, '--actor', 'legacy-merchant').status, 0);
    assert.equal(command('simulate', '--failure', 'interrupt').status, 0);
    assert.equal(command('apply').status, 1);
    const legacy = state(); legacy.version = 1;
    const legacyRun = legacy.runs[0]!;
    const oldIds = new Map<string, string>();
    const proposals = legacyRun.proposals.map(p => {
      const oldId = createHash('sha256').update(JSON.stringify([p.storeId, p.runId, p.productId, p.field, p.before, p.after, p.evidence.rule, p.evidence.productId, p.evidence.path, p.evidence.observed, p.evidence.explanation])).digest('hex');
      oldIds.set(p.id, oldId);
      return { id: oldId, storeId: p.storeId, runId: p.runId, productId: p.productId, field: p.field, before: p.before, after: p.after, evidence: p.evidence };
    });
    const oldRun = { id: legacyRun.id, storeId: legacyRun.storeId, scanned: legacyRun.scanned, findings: legacyRun.findings, proposals,
      applied: legacyRun.applied.map(id => oldIds.get(id)!),
      decisions: Object.fromEntries(Object.entries(legacyRun.decisions).map(([id, d]) => [oldIds.get(id)!, { digest: oldIds.get(id)!, actor: d.actor, choice: d.choice }])) };
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ version: 1, storeId: 'mock-shop', products: legacy.products, runs: [oldRun], events: legacy.events }));
    assert.equal(command('status').status, 0);
    const migrated = state();
    assert.equal(migrated.version, 2);
    assert.deepEqual(migrated.products, legacy.products);
    assert.equal(migrated.runs[0]!.applied.length, 1);
    assert.equal(Object.keys(migrated.runs[0]!.decisions).length, 1);
    assert.ok(migrated.events.some(e => e.action === 'state.migrated'));
    assert.equal(command('resume').status, 0);
    assert.equal(state().runs[0]!.applied.length, 1);
    assert.equal(state().runs[0]!.attempts[0]!.status, 'verified');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
