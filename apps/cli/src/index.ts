import { mkdirSync, openSync, closeSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { apply, boundedInteger, cancel, decide, ensure, resume, status, supersede, verify, type Checkpoint, type Log, type Product, type Verifier } from '../../../packages/core/src/index.js';
import { audit } from '../../../packages/catalog-agent/src/index.js';
import { MockShopify } from '../../../packages/mock-shopify/src/index.js';
import { load, save, type Simulation, type State } from './state.js';
import { resolveId, terminalText, TerminalView } from './presentation.js';

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
  history [--limit N]              A readable timeline of recent milestones
  trace                           Print all recorded events as JSONL
Options:
  --dir PATH                      Local state directory (default .sah)
  --pretty / --plain              Human view / human view without ANSI
  --json                          Structured output for scripts
  --color auto|always|never        Color control (respects NO_COLOR)
  --ascii                         Use ASCII decorations
Unique run/proposal ID prefixes of 8+ characters are accepted.
Scan is read-only. Approve/reject never writes product data.
Inspect state.json for catalog; trace.jsonl is a derived export.
`;

function main(): void {
  const [requested = 'help', ...args] = process.argv.slice(2);
  const command = requested === '--help' ? 'help' : requested;
  ensure(['init', 'scan', 'review', 'approve', 'reject', 'apply', 'verify', 'status', 'resume', 'cancel', 'revise', 'simulate', 'history', 'help', 'trace'].includes(command), 'Unknown command');
  const options: Record<string, string> = {};
  const allowed: Record<string, string[]> = {
    help: [], history: ['dir', 'limit'], init: ['dir'], scan: ['dir', 'limit'], review: ['dir', 'run'],
    approve: ['dir', 'run', 'proposal', 'actor'], reject: ['dir', 'run', 'proposal', 'actor'],
    apply: ['dir', 'run'], verify: ['dir', 'run'], status: ['dir', 'run'], resume: ['dir', 'run'],
    cancel: ['dir', 'run'], revise: ['dir', 'run', 'limit'], simulate: ['dir', 'failure'], trace: ['dir'],
  };
  const flags = new Set(['json', 'plain', 'pretty', 'ascii']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i]?.replace(/^--/, '');
    ensure(key && args[i]?.startsWith('--') && !(key in options), 'Invalid/duplicate option');
    if (flags.has(key)) { options[key] = 'true'; continue; }
    const value = args[++i];
    ensure((allowed[command]?.includes(key) || key === 'color') && value && !value.startsWith('--'), 'Invalid option');
    options[key] = value;
  }
  ensure(!options.color || ['auto', 'always', 'never'].includes(options.color), 'Color must be auto, always or never');
  ensure(!options.json || !(options.pretty || options.plain), 'Choose --json or a human view');
  const human = !options.json && Boolean(options.pretty || options.plain || process.stdout.isTTY);
  const color = human && !options.plain && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb'
    && options.color !== 'never' && (options.color === 'always' || Boolean(process.stdout.isTTY));
  const view = new TerminalView(color, Boolean(options.ascii || process.env.TERM === 'dumb'), process.stdout.columns);
  const structured = (data: unknown, pretty: () => string) => console.log(human ? pretty() : JSON.stringify(data, null, 2));
  const message = (text: string, hint = '') => console.log(options.json ? JSON.stringify({ message: text }) : human ? view.message(text, hint) : text);
  if (command === 'help') { console.log(options.json ? JSON.stringify({ usage }) : (human ? view.header('A small toolkit for careful commerce') + '\n' : '') + usage); return; }
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
        message('Initialized mock-shop. Run scan, then review.', 'Start with npm run demo -- scan');
      } else if (command === 'scan') {
        const run = audit(store, current.storeId, randomUUID(), Number(options.limit ?? 100), log);
        current.runs.push(run);
        structured({ runId: run.id, scanned: run.scanned, findings: run.findings.length, proposals: run.proposals.length, modelTokens: 0 }, () => view.summary(run));
      } else if (command === 'simulate') {
        ensure(options.failure && ['none', 'auth-expired', 'verification', 'interrupt'].includes(options.failure), 'Invalid mock failure mode');
        current.simulation = options.failure as Simulation;
        log('simulation.configured', { mode: current.simulation });
        message(`Mock simulation: ${current.simulation}`, 'Synthetic chaos. Real safeguards.');
      } else if (command === 'history') {
        const limit = Number(options.limit ?? 12);
        boundedInteger(limit, 100, 'history limit');
        const events = current.events.filter(event => !/^(tool|command|finding)\./.test(event.action) && event.action !== 'proposal.created');
        structured(events.slice(-limit), () => view.history(events, limit));
      } else if (command === 'trace') {
        log('trace.viewed', {});
        console.log(current.events.map(event => JSON.stringify(event)).join('\n'));
      } else {
        const runId = options.run ? resolveId(current.runs.map(run => run.id), options.run, 'run') : undefined;
        const run = runId ? current.runs.find(run => run.id === runId) : current.runs.at(-1);
        ensure(run, 'Run not found; scan first');
        if (command === 'status') {
          structured({ runId: run.id, taskId: run.taskId, ...status(run) }, () => view.summary(run, 'Mission control'));
        } else if (command === 'cancel') {
          cancel(run, log); message('Cancelled; existing attempts remain available for verification.', 'The paper trail stays. No new writes.');
        } else if (command === 'revise') {
          ensure(run.status !== 'superseded', 'Task is superseded; revise the latest revision');
          const next = audit(store, current.storeId, randomUUID(), Number(options.limit ?? run.limit), log, run.revision + 1, run.taskId);
          supersede(run, log); current.runs.push(next);
          structured({ runId: next.id, taskId: next.taskId, ...status(next) }, () => view.summary(next, 'A fresh revision'));
        } else if (command === 'verify') {
          const verifier: Verifier | undefined = current.simulation === 'verification'
            ? () => ({ passed: false, observed: null, reason: 'Simulated read-back failure' }) : undefined;
          const count = verify(run, store, current.storeId, log, verifier, checkpoint);
          if (human) console.log(view.summary(run, `Verified ${count} postconditions`));
          else if (options.json) console.log(JSON.stringify({ verifiedThisPass: count, ...status(run) }));
          else console.log(`Verified ${count} postconditions. ${JSON.stringify(status(run))}`);
          ensure(!run.attempts.some(a => a.status !== 'verified'), 'Verification incomplete; inspect status');
        } else if (command === 'resume') {
          ensure(current.simulation !== 'verification', 'Simulated verification failure active; clear it before resume');
          resume(run, store, current.storeId, log, checkpoint);
          structured(status(run), () => view.summary(run, 'Back on the trail'));
        } else if (command === 'review') {
          log('run.reviewed', { runId: run.id });
          structured(run, () => view.review(run));
        } else if (command === 'approve' || command === 'reject') {
          const proposalId = resolveId(run.proposals.map(p => p.id), options.proposal ?? '', 'proposal');
          decide(run, proposalId, options.actor ?? '', command === 'approve' ? 'approve' : 'reject', log);
          message(`${command}: ${proposalId}. Product data unchanged; apply is a separate command.`, command === 'approve' ? 'Permission recorded. Apply when ready, then verify.' : 'Your call. This proposal will stay untouched.');
        } else {
          const count = apply(run, store, current.storeId, log, checkpoint);
          message(`Applied ${count} approved mock edits. Independent verification is required.`, 'Trust, then verify: npm run demo -- verify');
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
catch (error) {
  const reason = error instanceof Error ? error.message : 'Unknown failure';
  if (process.argv.includes('--json')) console.error(JSON.stringify({ error: reason }));
  else console.error(`SAH: ${terminalText(reason)}`);
  process.exitCode = 1;
}
