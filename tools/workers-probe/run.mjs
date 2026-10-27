import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const output = await build({ entryPoints: [new URL('./worker.mjs', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'], define: { 'process.env.NODE_ENV': '"test"' } });
let egressAttempts = 0;
const mf = new Miniflare({
  modules: [{ type: 'ESModule', path: 'probe.mjs', contents: output.outputFiles[0].text }],
  compatibilityDate: '2026-07-30', // Maximum tested date of the pinned workerd, not production config.
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'],
  outboundService: () => { egressAttempts++; return new Response('Outbound network denied by offline probe', { status: 403 }); },
});
try {
  const response = await mf.dispatchFetch('https://probe.invalid');
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result, null, 2));
  assert.equal(egressAttempts, 0, 'Probe must not attempt real network calls');
  for (const provider of ['google', 'openai', 'anthropic', 'deepseek', 'mistral', 'xai', 'groq']) {
    assert.equal(result.providers[provider].text, 'fixture-ok');
    assert.equal(result.providers[provider].calls, 1);
    assert.equal(result.providers[provider].inputTokens, 3);
    assert.equal(result.providers[provider].outputTokens, 1);
  }
  const blocked = await (await mf.dispatchFetch('https://probe.invalid/egress-check')).json();
  assert.equal(blocked.denied, true);
  assert.equal(egressAttempts, 1, 'Network guard must actually block outbound fetch');
  console.log(JSON.stringify({ runtime: process.version, compatibilityDate: '2026-07-30', outboundNetworkDenied: true, ...result }, null, 2));
} finally { await mf.dispose(); }
