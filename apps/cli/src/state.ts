import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, ensure, validateCatalog, type Product, type Proposal, type Run } from '../../../packages/core/src/index.js';

export interface Event { sequence: number; at: string; action: string; details: Record<string, unknown> }
export type Simulation = 'none' | 'auth-expired' | 'verification' | 'interrupt';
export interface State { version: 2; storeId: string; products: Product[]; runs: Run[]; events: Event[]; simulation: Simulation }

export function load(file: string): State {
  const raw = readFileSync(file);
  ensure(raw.byteLength <= 64 * 1024 * 1024, 'State too large');
  const data = JSON.parse(raw.toString('utf8')) as State;
  ensure((Number(data.version) === 1 || data.version === 2) && Array.isArray(data.runs) && Array.isArray(data.events), 'Unsupported/invalid state');
  validateCatalog(data.products);
  ensure(typeof data.storeId === 'string' && data.storeId.length > 0, 'Invalid store');
  if (Number(data.version) === 1) {
    for (const run of data.runs) {
      ensure(run.storeId === data.storeId && Array.isArray(run.proposals) && Array.isArray(run.applied), 'Invalid legacy run');
      const applied = new Set(run.applied);
      const oldDecisions = run.decisions;
      run.taskId = run.id; run.revision = 1; run.limit = 100;
      run.blocker = null; run.status = 'awaiting_approval'; run.attempts = [];
      run.decisions = {}; run.applied = [];
      run.proposals = run.proposals.map(old => {
        const p: Proposal = { ...old, revision: 1 };
        p.id = digest(p);
        if (applied.has(old.id)) {
          run.applied.push(p.id);
          run.decisions[p.id] = { digest: p.id, revision: 1, actor: oldDecisions[old.id]?.actor ?? 'legacy-local-history', choice: 'approve' };
          run.attempts.push({ id: `${run.id}:${p.id}`, revision: 1, proposalId: p.id, status: 'applied', verification: null });
        }
        return p;
      });
    }
    data.version = 2; data.simulation = 'none';
    data.events.push({ sequence: data.events.length + 1, at: new Date().toISOString(), action: 'state.migrated', details: { from: 1, to: 2, pendingApprovalsInvalidated: true, appliedHistoryPreserved: true } });
  }
  ensure(['none', 'auth-expired', 'verification', 'interrupt'].includes(data.simulation), 'Invalid simulation');
  for (const run of data.runs) {
    ensure(run.storeId === data.storeId && typeof run.taskId === 'string' && Number.isSafeInteger(run.revision) && run.revision > 0 && Array.isArray(run.attempts), 'Invalid task state');
  }
  return data;
}

export function save(dir: string, state: State): void {
  const temp = join(dir, `state-${randomUUID()}.tmp`);
  writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, join(dir, 'state.json'));
  writeFileSync(join(dir, 'trace.jsonl'), state.events.map(event => JSON.stringify(event)).join('\n') + '\n', { mode: 0o600 });
}
