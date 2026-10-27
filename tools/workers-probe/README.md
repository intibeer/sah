# Offline Workers compatibility probe

This isolated development package tests the M2 runtime assumption without deploying, reading credentials or contacting Shopify/model APIs. Requires Node **22+**; CI uses Node 24. Main CLI still supports Node 20.18+. From this directory:

```sh
npm ci --ignore-scripts
npm test
```

Miniflare/workerd binds loopback; a sandbox may require permission for that. All external fetches are intercepted by a denying outbound service. Provider adapters use explicit in-memory fetch fixtures; no real model keys are used. The runner checks zero outbound attempts during the functional probe, then deliberately tests the denial guard. No Cloudflare account or CLI login is needed.

The probe bundles the actual core/catalog/mock modules, Shopify React Router/API libraries and seven AI SDK adapters into a local Worker. It tests:

- Core approve/apply/read-back verification under nodejs_compat.
- Shopify app construction and rejection of a malformed identity request.
- Shopify API validation of a locally signed synthetic JWT; expired and wrong-audience tokens are rejected.
- Synthetic Session round-trip, lookup and deletion through local D1. The fixture storage uses a plain synthetic token and is **not** the production encrypted session adapter.
- Gemini/OpenAI/Anthropic/DeepSeek/Mistral/xAI/Groq request generation, response parsing and usage mapping for one synthetic non-streaming response each, with SDK retries disabled.

Results and precise limits are recorded in [compatibility report](../../docs/workers-compatibility.md). Passing this probe does not mean OAuth installation/refresh, all React Router routes, deployed storage or full provider conformance works.

Versions are pinned in this package's lockfile, separate from the main application's dependencies. Compatibility date 2026-07-30 matches the pinned emulator generation; it is not the intended production compatibility date. Update and retest the runtime before deployment. Modules are explicitly registered because React Router contains dynamic import expressions; the probe does not exercise lazy route loading.
