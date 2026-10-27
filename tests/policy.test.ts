import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, decide, digest, TokenBudget, type Decision, type Log, type Product, type Proposal } from '../packages/core/src/index.js';
import { audit } from '../packages/catalog-agent/src/index.js';
import { MockShopify } from '../packages/mock-shopify/src/index.js';

const fixture: Product[] = JSON.parse(readFileSync(new URL('../../fixtures/catalog.json', import.meta.url), 'utf8')) as Product[];
function setup(products = fixture) {
  const events: { action: string; details: Record<string, unknown> }[] = [];
  const log: Log = (action, details) => { events.push({ action, details }); };
  const store = new MockShopify('shop-a', products, log);
  const run = audit(store, 'shop-a', 'run-a', 100, log);
  return { events, log, store, run };
}
test('read-only scan has observed evidence, scoped duplicate warnings and no fabricated values', () => {
  const { store, run } = setup();
  assert.deepEqual(store.snapshot(), fixture);
  assert.equal(run.findings.length, 8);
  assert.equal(run.proposals.length, 3);
  assert.ok(run.findings.filter(f => f.rule === 'duplicate-sku').every(f => f.explanation.includes('scanned subset')));
  for (const p of run.proposals) {
    assert.equal(p.before, fixture.find(product => product.id === p.productId)?.[p.field]);
    assert.equal(p.evidence.observed, p.before);
    assert.equal(p.after, p.before.trim());
  }
  assert.equal(run.proposals.some(p => p.productId.endsWith('/3')), false);
});
test('unapproved and rejected changes fail closed and are logged', () => {
  const { store, run, log, events } = setup();
  assert.throws(() => apply(run, store, 'shop-a', log), /approval/);
  decide(run, run.proposals[0]!.id, 'merchant', 'reject', log);
  assert.throws(() => apply(run, store, 'shop-a', log), /approval/);
  assert.deepEqual(store.snapshot(), fixture);
  assert.equal(events.filter(e => e.action === 'apply.denied').length, 2);
});
test('approve is read-only; exact approved edits apply once and include before/after trace', () => {
  const { store, run, log, events } = setup();
  const p = run.proposals[0]!;
  decide(run, p.id, 'merchant', 'approve', log);
  assert.deepEqual(store.snapshot(), fixture);
  assert.equal(apply(run, store, 'shop-a', log), 1);
  assert.equal(store.snapshot()[0]!.title, 'Canvas Tote');
  assert.equal(store.snapshot()[0]!.vendor, ' Northwind ');
  assert.equal(apply(run, store, 'shop-a', log), 0);
  assert.equal(events.filter(e => e.action === 'change.applied').length, 1);
  assert.ok(events.some(e => e.action === 'change.skipped'));
  assert.ok(events.some(e => e.details.before === p.before && e.details.after === p.after));
});
test('proposal edits after approval and invalid tool fields cannot execute', () => {
  const { run, store, log } = setup();
  const p = run.proposals[0]!;
  decide(run, p.id, 'merchant', 'approve', log);
  p.after = 'Malicious title';
  assert.throws(() => apply(run, store, 'shop-a', log), /trimming/);
  const forged = { ...p, field: 'description' } as unknown as Proposal;
  assert.throws(() => store.update('shop-a', forged, run.decisions[p.id]!), /allowlisted/);
  assert.deepEqual(store.snapshot(), fixture);
});
test('rehashed proposal cannot reuse approval for different content', () => {
  const { run, store, log } = setup();
  const p = run.proposals[0]!;
  decide(run, p.id, 'merchant', 'approve', log);
  const oldId = p.id;
  p.evidence.explanation = 'changed';
  p.id = digest(p);
  run.decisions[p.id] = run.decisions[oldId]!;
  assert.throws(() => apply(run, store, 'shop-a', log), /Approval digest/);
});
test('cross-tenant read, apply and transplanted run fail', () => {
  const { store, run, log } = setup();
  decide(run, run.proposals[0]!.id, 'merchant', 'approve', log);
  assert.throws(() => store.list('shop-b', 10), /Tenant/);
  assert.throws(() => store.read('shop-b', fixture[0]!.id), /Tenant/);
  assert.throws(() => apply(run, store, 'shop-b', log), /Tenant/);
  run.id = 'run-b';
  assert.throws(() => apply(run, store, 'shop-a', log), /context/);
  assert.deepEqual(store.snapshot(), fixture);
});
test('stale approved batch fails before any write', () => {
  const { run, log } = setup();
  for (const p of run.proposals) decide(run, p.id, 'merchant', 'approve', log);
  const changed = structuredClone(fixture);
  changed[1]!.productType = 'Merchant changed this';
  const store = new MockShopify('shop-a', changed, log);
  assert.throws(() => apply(run, store, 'shop-a', log), /Stale/);
  assert.deepEqual(store.snapshot(), changed);
  assert.deepEqual(run.applied, []);
});
test('caps validate before work and write budget prevents entire oversized batch', () => {
  const products = Array.from({ length: 11 }, (_, i) => ({ ...fixture[0]!, id: `p${i}`, vendor: 'Vendor', title: ' Trim ', variants: [] }));
  const { run, store, log } = setup(products);
  for (const p of run.proposals) decide(run, p.id, 'merchant', 'approve', log);
  assert.throws(() => apply(run, store, 'shop-a', log), /budget/);
  assert.deepEqual(store.snapshot(), products);
  for (const limit of [0, -1, 101, NaN, 1.5]) assert.throws(() => audit(store, 'shop-a', 'r', limit, log), /Invalid/);
  assert.equal(audit(store, 'shop-a', 'bounded', 1, log).scanned, 1);
  assert.throws(() => new MockShopify('s', [{ ...fixture[0], description: 'a'.repeat(16_385) }], log), /description/);
  assert.throws(() => new MockShopify('s', [fixture[0], fixture[0]], log), /duplicate/);
});
test('adapter requires explicit matching decision and returns copies', () => {
  const { store, run } = setup();
  assert.throws(() => store.update('shop-a', run.proposals[0]!, undefined as unknown as Decision), /approval/);
  const returned = store.list('shop-a', 1);
  returned[0]!.title = 'edited externally';
  assert.deepEqual(store.snapshot(), fixture);
});
test('zero token allowance, exact boundary and invalid reservations', () => {
  const zero = new TokenBudget(0);
  zero.reserve(0);
  assert.throws(() => zero.reserve(1), /budget/);
  const budget = new TokenBudget(10);
  budget.reserve(7); budget.reserve(3);
  assert.equal(budget.used, 10);
  for (const amount of [1, -1, NaN, Infinity, 0.5]) assert.throws(() => budget.reserve(amount), /budget/);
  assert.equal(budget.used, 10);
});
