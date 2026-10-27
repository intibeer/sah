import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { apply, decide, ensure, type Log, type Product, type Run } from '../../../packages/core/src/index.js';
import { audit } from '../../../packages/catalog-agent/src/index.js';
import { MockShopify } from '../../../packages/mock-shopify/src/index.js';

interface Event { sequence: number; at: string; action: string; details: Record<string, unknown> }
interface State { version: 1; storeId: string; products: Product[]; runs: Run[]; events: Event[] }
const usage = `SAH — local mock catalog audit (no model/network)
Commands:
  init                            Load bundled mock catalog
  scan [--limit 100]               Create read-only audit and proposals
  review [--run RUN_ID]            Show evidence, before/after and decisions
  approve --proposal ID --actor NAME [--run RUN_ID]
  reject  --proposal ID --actor NAME [--run RUN_ID]
  apply [--run RUN_ID]             Apply only explicitly approved mock edits
  trace                           Print all recorded events as JSONL
Options:
  --dir PATH                      Local state directory (default .sah)
Scan is read-only. Approve/reject never writes product data.
Inspect state.json for catalog; trace.jsonl is a derived export.
`;

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') { console.log(usage); return; }
  ensure(['init', 'scan', 'review', 'approve', 'reject', 'apply', 'trace'].includes(command), 'Unknown command');
  const options: Record<string, string> = {};
  const allowed: Record<string, string[]> = {
    init: ['dir'], scan: ['dir', 'limit'], review: ['dir', 'run'],
    approve: ['dir', 'run', 'proposal', 'actor'], reject: ['dir', 'run', 'proposal', 'actor'],
    apply: ['dir', 'run'], trace: ['dir'],
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
      const events: Event[] = [];
      state = { version: 1, storeId: 'mock-shop', products: products as Product[], runs: [], events };
    } else {
      ensure(existsSync(file), 'Run init first');
      ensure(readFileSync(file).byteLength <= 64 * 1024 * 1024, 'State too large');
      state = JSON.parse(readFileSync(file, 'utf8')) as State;
      ensure(state.version === 1 && Array.isArray(state.runs) && Array.isArray(state.events), 'Unsupported/invalid state');
    }
    const current = state;
    const log: Log = (action, details) => current.events.push({ sequence: current.events.length + 1, at: new Date().toISOString(), action, details });
    store = new MockShopify(current.storeId, current.products, log);
    log('command.started', { command, options });
    try {
      if (command === 'init') {
        log('store.initialized', { storeId: current.storeId, products: current.products.length });
        console.log('Initialized mock-shop. Run scan, then review.');
      } else if (command === 'scan') {
        const run = audit(store, current.storeId, randomUUID(), Number(options.limit ?? 100), log);
        current.runs.push(run);
        console.log(JSON.stringify({ runId: run.id, scanned: run.scanned, findings: run.findings.length, proposals: run.proposals.length, modelTokens: 0 }, null, 2));
      } else if (command === 'trace') {
        log('trace.viewed', {});
        console.log(current.events.map(event => JSON.stringify(event)).join('\n'));
      } else {
        const run = options.run ? current.runs.find(run => run.id === options.run) : current.runs.at(-1);
        ensure(run, 'Run not found; scan first');
        if (command === 'review') {
          log('run.reviewed', { runId: run.id });
          console.log(JSON.stringify(run, null, 2));
        } else if (command === 'approve' || command === 'reject') {
          decide(run, options.proposal ?? '', options.actor ?? '', command === 'approve' ? 'approve' : 'reject', log);
          console.log(`${command}: ${options.proposal}. Product data unchanged; apply is a separate command.`);
        } else {
          console.log(`Applied ${apply(run, store, current.storeId, log)} approved mock edits.`);
        }
      }
      log('command.completed', { command });
    } catch (error) {
      failure = error;
      log('command.failed', { command, reason: error instanceof Error ? error.message : 'Unknown error' });
    }
    current.products = store.snapshot();
    // Authoritative catalog, decisions, outcomes and events commit in one rename.
    const temp = join(dir, `state-${randomUUID()}.tmp`);
    writeFileSync(temp, JSON.stringify(current, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, file);
    writeFileSync(join(dir, 'trace.jsonl'), current.events.map(event => JSON.stringify(event)).join('\n') + '\n', { mode: 0o600 });
  } finally {
    closeSync(fd);
    unlinkSync(lock);
  }
  if (failure) throw failure;
}
try { main(); }
catch (error) { console.error(`SAH: ${error instanceof Error ? error.message : 'Unknown failure'}`); process.exitCode = 1; }
