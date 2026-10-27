// Synthetic local compatibility probe, not an authenticated merchant application.
import { shopifyApp, ApiVersion, AppDistribution, Session } from '@shopify/shopify-app-react-router/server';
import { shopifyApi } from '@shopify/shopify-api';
import { generateText } from 'ai';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createMistral } from '@ai-sdk/mistral';
import { createXai } from '@ai-sdk/xai';
import { createGroq } from '@ai-sdk/groq';
import { apply, decide, status, verify } from '../../packages/core/src/index.ts';
import { audit } from '../../packages/catalog-agent/src/index.ts';
import { MockShopify } from '../../packages/mock-shopify/src/index.ts';

const secret = 'synthetic-probe-secret-not-a-credential';
const apiKey = 'synthetic-probe-client';
const check = (value, message) => { if (!value) throw new Error(message); };
const b64 = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function jwt(payload) {
  const message = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return `${message}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
}
function sessionStorage(db) {
  return {
    storeSession: async session => { await db.prepare('INSERT OR REPLACE INTO sessions (id, shop, value) VALUES (?, ?, ?)').bind(session.id, session.shop, JSON.stringify(session)).run(); return true; },
    loadSession: async id => { const row = await db.prepare('SELECT value FROM sessions WHERE id = ?').bind(id).first(); return row ? new Session(JSON.parse(row.value)) : undefined; },
    deleteSession: async id => { await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run(); return true; },
    deleteSessions: async ids => { for (const id of ids) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run(); return true; },
    findSessionsByShop: async shop => (await db.prepare('SELECT value FROM sessions WHERE shop = ?').bind(shop).all()).results.map(row => new Session(JSON.parse(row.value))),
  };
}
const chatResponse = { id: 'fixture-chat', created: 1, model: 'fixture-model', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'fixture-ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } };
const responsesResponse = { object: 'response', id: 'fixture-response', created_at: 1, model: 'fixture-model', status: 'completed', error: null, incomplete_details: null, output: [{ id: 'fixture-message', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'fixture-ok', annotations: [] }] }], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } };
async function providers() {
  const results = {};
  const factories = {
    google: options => createGoogle(options)('gemini-fixture'),
    openai: options => createOpenAI(options).chat('gpt-fixture'),
    anthropic: options => createAnthropic(options)('claude-fixture'),
    deepseek: options => createDeepSeek(options)('deepseek-fixture'),
    mistral: options => createMistral(options)('mistral-fixture'),
    xai: options => createXai(options)('grok-fixture'),
    groq: options => createGroq(options)('groq-fixture'),
  };
  for (const [name, factory] of Object.entries(factories)) {
    let calls = 0;
    const model = factory({ apiKey: 'synthetic-probe-key', fetch: async (_url, init) => {
      calls++;
      check(init?.body && String(init.body).includes('fixture-prompt'), `${name}: unexpected request`);
      const response = name === 'google' ? { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'fixture-ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 } }
        : name === 'anthropic' ? { id: 'fixture-message', type: 'message', role: 'assistant', model: 'fixture-model', content: [{ type: 'text', text: 'fixture-ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 3, output_tokens: 1 } }
        : name === 'xai' ? responsesResponse : chatResponse;
      return Response.json(response);
    } });
    const result = await generateText({ model, prompt: 'fixture-prompt', maxRetries: 0, maxOutputTokens: 32 });
    check(result.text === 'fixture-ok' && calls === 1, `${name}: generation mismatch`);
    results[name] = { text: result.text, calls, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
  }
  return results;
}
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/egress-check') {
      try { const response = await fetch('https://denied.invalid'); return Response.json({ denied: response.status === 403 }); }
      catch { return Response.json({ denied: true }); }
    }
    try {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, shop TEXT NOT NULL, value TEXT NOT NULL)').run();
      const storage = sessionStorage(env.DB);
      const session = new Session({ id: 'offline_fixture.myshopify.com', shop: 'fixture.myshopify.com', state: 'synthetic', isOnline: false, accessToken: 'synthetic-probe-token' });
      await storage.storeSession(session);
      check((await storage.loadSession(session.id)).accessToken === session.accessToken, 'D1 session roundtrip');
      check((await storage.findSessionsByShop(session.shop)).length === 1, 'D1 session lookup');
      await storage.deleteSession(session.id);
      check(await storage.loadSession(session.id) === undefined, 'D1 session deletion');
      const config = { apiKey, apiSecretKey: secret, scopes: ['read_products'], apiVersion: ApiVersion.October26, logger: { level: 0 } };
      const app = shopifyApp({ ...config, appUrl: 'https://app.invalid', sessionStorage: storage, distribution: AppDistribution.AppStore });
      let rejected = false;
      try { const result = await app.authenticate.admin(new Request('https://app.invalid/app', { headers: { authorization: 'Bearer malformed' } })); rejected = result instanceof Response && result.status >= 300; }
      catch (error) {
        rejected = error instanceof Response && [302, 400, 401, 403].includes(error.status);
        if (!rejected) throw error;
      }
      check(rejected, 'Malformed identity must be rejected');
      const api = shopifyApi({ ...config, hostName: 'app.invalid', isEmbeddedApp: true });
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: 'https://fixture.myshopify.com/admin', dest: 'https://fixture.myshopify.com', aud: apiKey, sub: '1', exp: now + 60, nbf: now - 1, iat: now, jti: 'fixture' };
      check((await api.session.decodeSessionToken(await jwt(claims))).sub === '1', 'JWT signature verification');
      let expiredRejected = false;
      try { await api.session.decodeSessionToken(await jwt({ ...claims, exp: now - 120 })); } catch { expiredRejected = true; }
      check(expiredRejected, 'Expired JWT must be rejected');
      let audienceRejected = false;
      try { await api.session.decodeSessionToken(await jwt({ ...claims, aud: 'another-app' })); } catch { audienceRejected = true; }
      check(audienceRejected, 'Wrong JWT audience must be rejected');
      const log = () => {};
      const store = new MockShopify('fixture', [{ id: 'p', title: ' Trim ', vendor: 'V', productType: 'T', description: 'D', variants: [] }], log);
      const run = audit(store, 'fixture', 'r', 1, log);
      decide(run, run.proposals[0].id, 'synthetic-actor', 'approve', log);
      apply(run, store, 'fixture', log); verify(run, store, 'fixture', log);
      check(status(run).state === 'completed', 'Core lifecycle in Workers');
      return Response.json({ shopify: { initialized: true, malformedRejected: rejected, signatureVerified: true, expiredRejected, audienceRejected, d1SessionRoundtrip: true }, lifecycle: status(run), providers: await providers() });
    } catch (error) { return Response.json({ error: error.stack ?? String(error) }, { status: 500 }); }
  },
};
