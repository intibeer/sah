import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, cancel, decide, resume, status, supersede, verify, type CatalogTool, type Log, type Product } from '../packages/core/src/index.js';
import { audit } from '../packages/catalog-agent/src/index.js';
import { MockShopify } from '../packages/mock-shopify/src/index.js';

const fixture = JSON.parse(readFileSync(new URL('../../fixtures/catalog.json', import.meta.url), 'utf8')) as Product[];
function setup() {
  const actions: string[] = [];
  const log: Log = action => { actions.push(action); };
  const store = new MockShopify('shop', fixture, log);
  const run = audit(store, 'shop', 'r', 100, log);
  decide(run, run.proposals[0]!.id, 'merchant', 'approve', log);
  return { store, run, log, actions };
}
test('applied is not verified and unresolved findings prevent a completed claim', () => {
  const { store, run, log } = setup();
  assert.equal(status(run).state, 'ready');
  apply(run, store, 'shop', log);
  assert.equal(status(run).state, 'verifying');
  assert.equal(status(run).verified, 0);
  verify(run, store, 'shop', log);
  assert.equal(status(run).state, 'partially_completed');
  assert.equal(status(run).verified, 1);
  assert.equal(status(run).unresolvedFindings, 5);
  assert.match(status(run).nextAction, /Review/);
});
test('a clean audit is complete, and a resolved trim-only audit completes only after read-back', () => {
  const log: Log = () => {};
  const store = new MockShopify('shop', [{ ...fixture[2]!, title: ' Notebook ' }], log);
  const run = audit(store, 'shop', 'r', 100, log);
  decide(run, run.proposals[0]!.id, 'm', 'approve', log);
  apply(run, store, 'shop', log);
  assert.equal(status(run).state, 'verifying');
  verify(run, store, 'shop', log);
  assert.equal(status(run).state, 'completed');
});
test('known write checkpoint interruption resumes with no duplicate effect', () => {
  const { run, store, log, actions } = setup();
  assert.throws(() => apply(run, store, 'shop', log, stage => { if (stage === 'applied') throw new Error('interrupted'); }), /interrupted/);
  const restored = structuredClone(run);
  const reloadedStore = new MockShopify('shop', store.snapshot(), log);
  resume(restored, reloadedStore, 'shop', log);
  assert.equal(restored.attempts[0]!.status, 'verified');
  assert.equal(actions.filter(a => a === 'tool.update.completed').length, 1);
});
test('ambiguous write reconciles postcondition without issuing another write', () => {
  const { run, store, log } = setup();
  let writes = 0;
  const uncertain: CatalogTool = {
    storeId: 'shop', list: (s, n) => store.list(s, n), read: (s, id) => store.read(s, id),
    update: (s, p, d) => { writes++; store.update(s, p, d); throw new Error('response lost'); },
  };
  assert.throws(() => apply(run, uncertain, 'shop', log), /response lost/);
  assert.equal(run.attempts[0]!.status, 'outcome_unknown');
  resume(run, uncertain, 'shop', log);
  assert.equal(run.attempts[0]!.status, 'verified');
  assert.equal(writes, 1);
});
test('uncertain intent with original value blocks automatic replay', () => {
  const { run, store, log } = setup();
  assert.throws(() => apply(run, store, 'shop', log, () => { throw new Error('crash before call'); }), /crash/);
  assert.throws(() => resume(run, store, 'shop', log), /automatic replay blocked/);
  assert.equal(run.attempts[0]!.status, 'outcome_unknown');
  assert.deepEqual(store.snapshot(), fixture);
  assert.throws(() => apply(run, store, 'shop', log), /Reconcile/);
});
test('read-back mismatch or failure never becomes completion or triggers a rewrite', () => {
  const { run, store, log } = setup();
  apply(run, store, 'shop', log);
  verify(run, store, 'shop', log, () => { throw new Error('verifier down'); });
  assert.equal(run.attempts[0]!.status, 'verification_failed');
  const edited = store.snapshot(); edited[0]!.title = 'Merchant edit';
  const current = new MockShopify('shop', edited, log);
  assert.throws(() => resume(run, current, 'shop', log), /automatic replay blocked/);
  assert.equal(current.snapshot()[0]!.title, 'Merchant edit');
  assert.equal(run.attempts[0]!.verification?.observed, 'Merchant edit');
});
test('a verifier cannot report success without matching observed evidence', () => {
  const { run, store, log } = setup();
  apply(run, store, 'shop', log);
  verify(run, store, 'shop', log, () => ({ passed: true, observed: null, reason: 'unsupported success claim' }));
  assert.equal(run.attempts[0]!.status, 'verification_failed');
  assert.equal(status(run).verified, 0);
});
test('cancellation between writes prevents the next effect and cannot be resumed', () => {
  const { run, store, log } = setup();
  decide(run, run.proposals[1]!.id, 'merchant', 'approve', log);
  assert.throws(() => apply(run, store, 'shop', log, stage => { if (stage === 'applied') cancel(run, log); }), /cancelled/);
  assert.equal(run.applied.length, 1);
  assert.equal(store.snapshot()[0]!.vendor, fixture[0]!.vendor);
  assert.equal(run.status, 'cancelled');
  assert.throws(() => resume(run, store, 'shop', log), /cancelled/);
  verify(run, store, 'shop', log); // Read-only reconciliation remains available.
  assert.equal(run.status, 'cancelled');
});
test('cancellation and approval replacement at intent checkpoint cannot bypass the gate', () => {
  const { run, store, log } = setup();
  assert.throws(() => apply(run, store, 'shop', log, () => { cancel(run, log); }), /cancelled/);
  assert.deepEqual(store.snapshot(), fixture);
  const fresh = setup();
  assert.throws(() => apply(fresh.run, fresh.store, 'shop', fresh.log, () => {
    fresh.run.decisions[fresh.run.proposals[0]!.id] = { ...fresh.run.decisions[fresh.run.proposals[0]!.id]!, choice: 'reject' };
  }), /Approval changed/);
  assert.deepEqual(fresh.store.snapshot(), fixture);
});
test('old revision approval and superseded task cannot execute', () => {
  const { run, store, log } = setup();
  run.decisions[run.proposals[0]!.id]!.revision = 0;
  assert.throws(() => apply(run, store, 'shop', log), /Stale approval revision/);
  run.revision++;
  assert.throws(() => apply(run, store, 'shop', log), /Stale task revision/);
  supersede(run, log);
  assert.throws(() => apply(run, store, 'shop', log), /superseded/);
  assert.throws(() => decide(run, run.proposals[0]!.id, 'm', 'approve', log), /superseded/);
});
test('expired mock authorization blocks, reconnect then resumes without duplicate writes', () => {
  const { run, store, log } = setup();
  const expired = new MockShopify('shop', fixture, log, 'expired');
  assert.throws(() => apply(run, expired, 'shop', log), /expired/);
  assert.equal(run.status, 'blocked_auth');
  resume(run, store, 'shop', log);
  assert.equal(run.attempts[0]!.status, 'verified');
  assert.equal(run.applied.length, 1);
});
