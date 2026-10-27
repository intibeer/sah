import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
