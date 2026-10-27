import { mkdirSync, openSync, closeSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { apply, cancel, decide, ensure, resume, status, supersede, verify, type Checkpoint, type Log, type Product, type Verifier } from '../../../packages/core/src/index.js';
import { audit } from '../../../packages/catalog-agent/src/index.js';
import { MockShopify } from '../../../packages/mock-shopify/src/index.js';
import { load, save, type Simulation, type State } from './state.js';

const usage = `SAH — local mock catalog audit (no model/network)
Commands:
  init                            Load bundled mock catalog
  scan [--limit 100]               Create read-only audit and proposals
  review [--run RUN_ID]            Show evidence, before/after and decisions
  approve --proposal ID --actor NAME [--run RUN_ID]
  reject  --proposal ID --actor NAME [--run RUN_ID]
  apply [--run RUN_ID]             Apply only explicitly approved mock edits
  verify [--run RUN_ID]            Independently read back attempted changes
  status [--run RUN_ID]            Show lifecycle state and next useful action
  resume [--run RUN_ID]            Reconcile attempts, then continue safe work
  cancel [--run RUN_ID]            Stop new writes for a task revision
  revise [--run RUN_ID] [--limit N] Rescan as a new revision; approvals go stale
  simulate --failure MODE         Mock only: none/auth-expired/verification/interrupt
  trace                           Print all recorded events as JSONL
Options:
  --dir PATH                      Local state directory (default .sah)
Scan is read-only. Approve/reject never writes product data.
Inspect state.json for catalog; trace.jsonl is a derived export.
`;

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') { console.log(usage); return; }
  ensure(['init', 'scan', 'review', 'approve', 'reject', 'apply', 'verify', 'status', 'resume', 'cancel', 'revise', 'simulate', 'trace'].includes(command), 'Unknown command');
  const options: Record<string, string> = {};
  const allowed: Record<string, string[]> = {
    init: ['dir'], scan: ['dir', 'limit'], review: ['dir', 'run'],
    approve: ['dir', 'run', 'proposal', 'actor'], reject: ['dir', 'run', 'proposal', 'actor'],
    apply: ['dir', 'run'], verify: ['dir', 'run'], status: ['dir', 'run'], resume: ['dir', 'run'],
    cancel: ['dir', 'run'], revise: ['dir', 'run', 'limit'], simulate: ['dir', 'failure'], trace: ['dir'],
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    ensure(key && args[i]?.startsWith('--') && allowed[command]?.includes(key) && value && !value.startsWith('--') && !(key in options), 'Invalid/duplicate option');
    options[key] = value;
  }
  const dir = resolve(options.dir ?? '.sah');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'state.json');
  const lock = join(dir, 'command.lock');
  let fd: number;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch { throw new Error('State is locked. If a previous process crashed, verify it has stopped before removing command.lock.'); }
  let state: State | undefined;
  let store: MockShopify | undefined;
  let failure: unknown;
  try {
    if (command === 'init') {
      ensure(!existsSync(file), 'Already initialized; choose a new --dir');
      const products: unknown = JSON.parse(readFileSync(new URL('../../../../fixtures/catalog.json', import.meta.url), 'utf8'));
      state = { version: 2, storeId: 'mock-shop', products: products as Product[], runs: [], events: [], simulation: 'none' };
    } else {
      ensure(existsSync(file), 'Run init first');
      state = load(file);
    }
    const current = state;
    const log: Log = (action, details) => current.events.push({ sequence: current.events.length + 1, at: new Date().toISOString(), action, details });
    store = new MockShopify(current.storeId, current.products, log, current.simulation === 'auth-expired' ? 'expired' : 'ready');
    const catalog = store;
    const persist = () => { current.products = catalog.snapshot(); save(dir, current); };
    const checkpoint: Checkpoint = stage => {
      if (stage === 'applied' && current.simulation === 'interrupt') {
        current.simulation = 'none';
        log('simulation.interrupted', { stage });
        persist();
        throw new Error('Simulated interruption after persisted write; resume to reconcile');
      }
      persist();
    };
    log('command.started', { command, options });
    try {
      if (command === 'init') {
        log('store.initialized', { storeId: current.storeId, products: current.products.length });
        console.log('Initialized mock-shop. Run scan, then review.');
      } else if (command === 'scan') {
        const run = audit(store, current.storeId, randomUUID(), Number(options.limit ?? 100), log);
        current.runs.push(run);
        console.log(JSON.stringify({ runId: run.id, scanned: run.scanned, findings: run.findings.length, proposals: run.proposals.length, modelTokens: 0 }, null, 2));
      } else if (command === 'simulate') {
        ensure(options.failure && ['none', 'auth-expired', 'verification', 'interrupt'].includes(options.failure), 'Invalid mock failure mode');
        current.simulation = options.failure as Simulation;
        log('simulation.configured', { mode: current.simulation });
        console.log(`Mock simulation: ${current.simulation}`);
      } else if (command === 'trace') {
        log('trace.viewed', {});
        console.log(current.events.map(event => JSON.stringify(event)).join('\n'));
      } else {
        const run = options.run ? current.runs.find(run => run.id === options.run) : current.runs.at(-1);
        ensure(run, 'Run not found; scan first');
        if (command === 'status') {
          console.log(JSON.stringify({ runId: run.id, taskId: run.taskId, ...status(run) }, null, 2));
        } else if (command === 'cancel') {
          cancel(run, log); console.log('Cancelled; existing attempts remain available for verification.');
        } else if (command === 'revise') {
          ensure(run.status !== 'superseded', 'Task is superseded; revise the latest revision');
          const next = audit(store, current.storeId, randomUUID(), Number(options.limit ?? run.limit), log, run.revision + 1, run.taskId);
          supersede(run, log); current.runs.push(next);
          console.log(JSON.stringify({ runId: next.id, taskId: next.taskId, ...status(next) }, null, 2));
        } else if (command === 'verify') {
          const verifier: Verifier | undefined = current.simulation === 'verification'
            ? () => ({ passed: false, observed: null, reason: 'Simulated read-back failure' }) : undefined;
          const count = verify(run, store, current.storeId, log, verifier, checkpoint);
          console.log(`Verified ${count} postconditions. ${JSON.stringify(status(run))}`);
          ensure(!run.attempts.some(a => a.status !== 'verified'), 'Verification incomplete; inspect status');
        } else if (command === 'resume') {
          ensure(current.simulation !== 'verification', 'Simulated verification failure active; clear it before resume');
          resume(run, store, current.storeId, log, checkpoint);
          console.log(JSON.stringify(status(run), null, 2));
        } else if (command === 'review') {
          log('run.reviewed', { runId: run.id });
          console.log(JSON.stringify(run, null, 2));
        } else if (command === 'approve' || command === 'reject') {
          decide(run, options.proposal ?? '', options.actor ?? '', command === 'approve' ? 'approve' : 'reject', log);
          console.log(`${command}: ${options.proposal}. Product data unchanged; apply is a separate command.`);
        } else {
          console.log(`Applied ${apply(run, store, current.storeId, log, checkpoint)} approved mock edits. Independent verification is required.`);
        }
      }
      log('command.completed', { command });
    } catch (error) {
      failure = error;
      log('command.failed', { command, reason: error instanceof Error ? error.message : 'Unknown error' });
    }
    persist();
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
  if (failure) throw failure;
}
try { main(); }
catch (error) { console.error(`SAH: ${error instanceof Error ? error.message : 'Unknown failure'}`); process.exitCode = 1; }
