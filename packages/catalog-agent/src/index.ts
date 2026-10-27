import { boundedInteger, digest, LIMITS, TokenBudget, validateCatalog, type CatalogTool, type Field, type Finding, type Log, type Proposal, type Run } from '../../core/src/index.js';

export function audit(store: CatalogTool, storeId: string, runId: string, limit: number, log: Log, revision = 1, taskId = runId): Run {
  log('audit.started', { runId, storeId, limit, mode: 'deterministic', modelTokens: 0 });
  boundedInteger(limit, LIMITS.products, 'product limit');
  new TokenBudget(0).reserve(0);
  const products = store.list(storeId, limit);
  validateCatalog(products);
  const findings: Finding[] = [];
  const proposals: Proposal[] = [];
  const skus = new Map<string, { productId: string; path: string }[]>();
  for (const p of products) {
    for (const field of ['title', 'vendor', 'productType', 'description'] as const) {
      const value = p[field];
      if (!value.trim()) findings.push({ rule: 'missing-field', productId: p.id, path: field, observed: value, explanation: `Missing ${field}; merchant input needed. No value inferred.` });
      else if (field !== 'description' && value !== value.trim()) {
        const evidence: Finding = { rule: 'outer-whitespace', productId: p.id, path: field, observed: value, explanation: 'Remove leading/trailing whitespace; preserve internal content.' };
        findings.push(evidence);
        const payload = { storeId, runId, revision, productId: p.id, field: field as Field, before: value, after: value.trim(), evidence };
        proposals.push({ ...payload, id: digest(payload) });
      }
    }
    for (const variant of p.variants) {
      const path = `variants.${variant.id}.sku`;
      if (!variant.sku.trim()) findings.push({ rule: 'missing-sku', productId: p.id, path, observed: variant.sku, explanation: 'SKU absent; merchant must verify whether one is needed.' });
      else skus.set(variant.sku, [...(skus.get(variant.sku) ?? []), { productId: p.id, path }]);
    }
  }
  for (const [sku, occurrences] of skus) if (occurrences.length > 1) {
    for (const occurrence of occurrences) findings.push({ rule: 'duplicate-sku', ...occurrence, observed: sku, explanation: `Exact SKU appears ${occurrences.length} times in scanned subset; verify intended identity. Not necessarily an error.` });
  }
  for (const finding of findings) log('finding.recorded', { runId, ...finding });
  for (const proposal of proposals) log('proposal.created', { runId, proposalId: proposal.id, productId: proposal.productId, field: proposal.field, before: proposal.before, after: proposal.after });
  log('audit.completed', { runId, scanned: products.length, findings: findings.length, proposals: proposals.length, modelTokens: 0 });
  return { id: runId, taskId, revision, status: proposals.length ? 'awaiting_approval' : findings.length ? 'partially_completed' : 'completed', blocker: null, limit, attempts: [], storeId, scanned: products.length, findings, proposals, decisions: {}, applied: [] };
}
