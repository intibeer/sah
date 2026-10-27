# Local Workers compatibility evidence

Tested 2026-10-27. Status: **initial compatibility probe passed**, not a deployed app or completed M2 storage implementation. Reproduce using tools/workers-probe/README.md. Probe source and lockfile are committed and CI runs it separately on Node 24.

## Test conditions

Host Node 24.10.0; Miniflare 4.20260730.0 with its pinned workerd; compatibility date 2026-07-30 and nodejs_compat. This is the tested emulator date, not an assertion that today's production compatibility settings have been tested. A future deployment must update/retest against its chosen date/runtime.

Shopify React Router 4.0.0 and Shopify API 15.0.1. AI SDK 7.0.154; adapters: Google 4.0.106, OpenAI 4.0.103, Anthropic 4.0.89, DeepSeek 3.0.74, Mistral 4.0.73, xAI 5.0.31 and Groq 4.0.71. All are dev-only dependencies isolated from the main mock CLI.

No credentials loaded. Session/JWT/API-key strings are synthetic fixtures. Provider fetch functions return synthetic responses; SDK retries are disabled. A Miniflare outbound service denies all network fetches. The runner asserts zero attempted external calls during functionality checks and separately proves one intentional request is denied. Only a local loopback listener is opened. No remote D1, Shopify installation, model billing or deployment.

## Observed results

- The shared harness completes a trim-only synthetic task only after independent read-back in the Worker runtime.
- Shopify's React Router library initializes with a custom local D1 session fixture; malformed bearer input produces an authentication response rather than silently succeeding. A generic exception cannot satisfy this assertion.
- Shopify API verifies a locally signed synthetic token and rejects expired/wrong-audience variants.
- Local D1 stores, retrieves, finds and deletes a synthetic Shopify Session.
- All seven selected provider SDKs generate a request and parse text plus input/output token usage from one mocked non-streaming response. Each invokes its mock exactly once. Synthetic model IDs do not denote supported production profiles.

The initial xAI fixture exposed a different native Responses envelope from chat-completion providers; adding its required object marker fixed the fixture. This supports maintaining per-provider schema fixtures rather than assuming one OpenAI-compatible shape covers every SDK. The emulator requires explicit module registration for React Router's dynamic import expressions; no lazy route import is executed here.

## What remains unproved

Real embedded install/token exchange, refresh coordination, online staff permissions, app redirects/cookies/headers, webhook HMAC handling, actual Shopify API calls, all session properties and credential encryption, concurrent claims/budgets, deployed D1 consistency, Workflow replay/retention, full React Router UI bundling/lazy loading, provider structured output/tools/streaming/errors, data retention and real model availability/cost. All require subsequent milestones and some require external approval.

This probe is narrower than providers.md's offline-conformant level; the product still has no usable model adapters or model-selection UI. Do not relabel these SDK smoke tests as complete provider integration. Similarly, the simple D1 Session fixture is not packages/storage or an authenticated SaaS boundary.

## Implications for implementation

Proceed with the planned D1/portable SQLite storage ports and Workflows/Node runners. Retain the local JSON CLI as a fixture/demo, not as cloud storage. Use the libraries' Web API entrypoints and test actual auth/session behavior before connecting a store. Keep provider-specific schemas, explicit retries and usage handling. Future Workers should have generated binding types and a current tested compatibility date; the probe has no deployable Cloudflare config.

Official references checked 2026-10-27: [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/), [Cloudflare React Router](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/), [Shopify React Router library](https://shopify.dev/docs/api/shopify-app-react-router), [AI SDK providers](https://ai-sdk.dev/providers/ai-sdk-providers), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Installed source/types were used to validate the pinned API shapes. No full provider capability is inferred from this documentation.
