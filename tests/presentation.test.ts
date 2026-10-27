import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveId, terminalText, TerminalView } from '../apps/cli/src/presentation.js';
import { audit } from '../packages/catalog-agent/src/index.js';
import { MockShopify } from '../packages/mock-shopify/src/index.js';
import type { Run } from '../packages/core/src/index.js';

test('short IDs resolve only exact or unique prefixes and reject ambiguous matches', () => {
  const ids = ['12345678aaaa', '12345678bbbb', 'abcdefghcccc'];
  assert.equal(resolveId(ids, ids[0]!, 'proposal'), ids[0]);
  assert.equal(resolveId(ids, '12345678a', 'proposal'), ids[0]);
  assert.throws(() => resolveId(ids, '12345678', 'proposal'), /ambiguous/);
  assert.throws(() => resolveId(ids, 'abcdefg', 'proposal'), /8 unique/);
});
test('human rendering escapes untrusted terminal controls and wraps without dropping values', () => {
  const text = '\x1b[2J\r\n\u202e';
  assert.equal(terminalText(text), '\\u001b[2J\\u000d\\u000a\\u202e');
  const log = () => {};
  const store = new MockShopify('mock\x1b[2J', [{ id: 'p', title: '  Canvas Tote  ', vendor: 'V', productType: 'T', description: 'D', variants: [] }], log);
  const run = audit(store, store.storeId, 'r', 1, log);
  const output = new TerminalView(false, true, 32).review(run);
  assert.ok(!output.includes('\x1b'));
  assert.ok(output.includes('\\u001b[2J'));
  assert.ok(output.includes('- "  Canvas Tote  "'));
  assert.ok(output.includes('+ "Canvas Tote"'));
  assert.ok(output.split('\n').every(line => line.length <= 32));
});
test('CLI supports readable views and short approval IDs while preserving structured output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sah-style-'));
  const entry = fileURLToPath(new URL('../apps/cli/src/index.js', import.meta.url));
  const command = (...args: string[]) => spawnSync(process.execPath, [entry, ...args, '--dir', dir], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const ok = (...args: string[]) => { const result = command(...args); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  try {
    assert.ok(JSON.parse(ok('init', '--json')).message);
    assert.equal(JSON.parse(ok('scan', '--json')).scanned, 3);
    const run = JSON.parse(ok('review', '--json', '--color', 'always')) as Run;
    const plain = ok('review', '--plain', '--ascii');
    assert.match(plain, /The review desk/);
    assert.match(plain, /Needs your judgment/);
    assert.match(plain, /- "  Canvas Tote  "/);
    assert.ok(!plain.includes('\x1b'));
    assert.ok(!ok('status', '--pretty', '--color', 'always').includes('\x1b'), 'NO_COLOR overrides forced color');
    const proposal = run.proposals[0]!;
    ok('approve', '--proposal', proposal.id.slice(0, 12), '--actor', 'merchant', '--run', run.id.slice(0, 8), '--json');
    const reviewed = JSON.parse(ok('review', '--json')) as Run;
    assert.equal(reviewed.decisions[proposal.id]?.choice, 'approve');
    assert.equal(reviewed.applied.length, 0);
    assert.equal(command('approve', '--proposal', proposal.id.slice(0, 7), '--actor', 'merchant').status, 1);
    assert.match(ok('history', '--plain', '--limit', '3'), /The paper trail/);
    assert.ok(Array.isArray(JSON.parse(ok('history', '--json', '--limit', '3'))));
    for (const line of ok('trace', '--pretty').trim().split('\n')) assert.ok(JSON.parse(line).action);
    assert.equal(command('review', '--json', '--plain').status, 1);
    assert.equal(command('history', '--limit', '101').status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
