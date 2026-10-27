import { AuthorizationError, ensure, boundedInteger, digest, LIMITS, validateCatalog, validateProposal, type CatalogTool, type Decision, type Log, type Product, type Proposal } from '../../core/src/index.js';

/** Only mock data. No network implementation, credentials or Shopify SDK. */
export class MockShopify implements CatalogTool {
  private products: Product[];
  constructor(readonly storeId: string, products: unknown, private readonly log: Log, private readonly access: 'ready' | 'expired' = 'ready') {
    ensure(typeof storeId === 'string' && storeId.length > 0, 'Store ID required');
    validateCatalog(products);
    this.products = structuredClone(products);
  }
  private check(storeId: string, action: string): void {
    this.log(`tool.${action}.requested`, { storeId });
    if (this.access === 'expired') {
      this.log(`tool.${action}.denied`, { reason: 'Mock access expired' });
      throw new AuthorizationError('Mock access expired; restore access then resume');
    }
    if (storeId !== this.storeId) {
      this.log(`tool.${action}.denied`, { reason: 'Tenant mismatch' });
      throw new Error('Tenant mismatch');
    }
  }
  list(storeId: string, limit: number): Product[] {
    this.check(storeId, 'list');
    boundedInteger(limit, LIMITS.products, 'product limit');
    const result = structuredClone(this.products.slice(0, limit));
    this.log('tool.list.completed', { count: result.length });
    return result;
  }
  read(storeId: string, id: string): Product {
    this.check(storeId, 'read');
    const product = this.products.find(p => p.id === id);
    ensure(product, 'Product not found');
    this.log('tool.read.completed', { productId: id });
    return structuredClone(product);
  }
  update(storeId: string, p: Proposal, decision: Decision): void {
    this.check(storeId, 'update');
    validateProposal(p);
    ensure(decision?.choice === 'approve' && decision.digest === digest(p) && decision.revision === p.revision && decision.actor?.trim(), 'Explicit matching approval required');
    ensure(p.storeId === storeId, 'Proposal tenant mismatch');
    const product = this.products.find(product => product.id === p.productId);
    ensure(product && product[p.field] === p.before, 'Stale proposal: rescan required');
    product[p.field] = p.after;
    this.log('tool.update.completed', { productId: p.productId, field: p.field, before: p.before, after: p.after });
  }
  snapshot(): Product[] { return structuredClone(this.products); }
}
