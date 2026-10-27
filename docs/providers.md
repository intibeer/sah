# Provider and model support plan

Status: V1 implementation scope, **not implemented provider support**. No provider packages are installed, credentials read or model APIs called. Founder requested multiple providers on 2026-10-27. Sources accessed the same day.

## Initial coverage

Required adapters: Google Gemini, OpenAI, Anthropic and DeepSeek. Additional initial targets: Mistral, xAI and Groq. Groq is an inference provider serving selected model families; it is distinct from xAI's Grok. Amazon Bedrock, Vertex AI, Azure OpenAI and local Ollama are later candidates because their identity/deployment requirements need separate validation. Do not promise all providers' features through a single lowest-common-denominator API.

Use a small SAH provider interface with AI SDK adapters as the initial transport recommendation. Its maintained provider catalog covers the selected services; validate installed versions, fetch transports, schema support and usage behavior in Node and Workers before committing dependencies. Using AI SDK does not require hosting on Vercel or using its gateway. Start with direct provider calls so an extra gateway is not mandatory. Cloudflare AI Gateway/Workers AI can be optional future routes, not prerequisites for these provider accounts.

Adapter documentation: [Gemini](https://ai-sdk.dev/providers/ai-sdk-providers/google), [provider catalog including OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers), [Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic), [DeepSeek](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek), [Mistral](https://ai-sdk.dev/providers/ai-sdk-providers/mistral), [xAI](https://ai-sdk.dev/providers/ai-sdk-providers/xai), [Groq](https://ai-sdk.dev/providers/ai-sdk-providers/groq). These are integration documentation, not live conformance evidence.

## Model profiles and capabilities

Configure provider ID, exact model ID/revision, task role, input/output limits, supported structured output/tool/streaming features, reasoning options, timeout, cost schedule and verification date. Validate provider and model before dispatch. Test one economical and one higher-quality profile where supported; there is no blanket claim that an entire model family works.

Keep product-facing roles such as catalog-proposals separate from exact model IDs. Operators choose a supported profile and see its provider, cost policy and data destination. Pin IDs where the API permits, record resolved model/version in traces and require re-evaluation when an alias changes. Do not hard-code a moving latest model or silently switch to another provider.

Current official model references to consult when profiles are added: [Gemini](https://ai.google.dev/gemini-api/docs/models), [OpenAI](https://developers.openai.com/api/docs/models), [Anthropic](https://platform.claude.com/docs/en/models/overview), [DeepSeek](https://api-docs.deepseek.com/). Specific production model IDs and prices are intentionally not selected from marketing names alone. Account availability and feature differences remain validation work.

## SAH contract

The provider receives a bounded catalog snapshot and a proposal-only schema. It returns drafts with source field references, validated output, provider request ID, resolved model, finish status and usage breakdown where available. The core, not the model or SDK, validates evidence, permissions, budgets, approvals and execution. No arbitrary GraphQL, shell access or credential-bearing tool context reaches the model.

Do not require native tool calling to generate catalog drafts if structured output is sufficient. Models without a required capability fail locally with an actionable error. Normalize outcomes such as invalid credentials, rate-limited, timeout, malformed output, unsupported capability and unknown usage without hiding provider-specific diagnostic references. Do not store hidden reasoning or secrets in traces.

## Costs, credentials and fallback

Before calling, reserve worst-case input/output/reasoning usage and monetary allowance using a versioned price profile. Include cached/uncached and other billable categories where applicable. Reject a call whose upper bound cannot be established. Missing usage after a timeout remains reserved and unresolved; do not count it as zero.

Disable overlapping automatic retries across SDK and Workflow layers. A billable request with uncertain outcome is reconciled or explicitly retried within the approved budget, not replayed freely. No automatic provider/model failover by default: failover changes data destination, cost and output semantics. An explicit fallback policy needs eligible profiles, permitted destinations, separate reservations and a bounded attempt count.

Hosted provider keys are operator-managed Worker secrets; self-hosted keys are operator-managed server secrets. Future merchant BYOK requires encrypted per-tenant credentials and access controls, not plain browser storage. Provider terms, payload retention and allowed destinations are recorded before sending real catalog content. Log profile IDs, usage and cost metadata with redacted errors, not keys or full unneeded product text.

## What counts as supported

1. Implemented: a transport and model profile exist.
2. Offline-conformant: recorded synthetic request/response/error tests pass in Node and Workers, including streaming termination, usage absence, injection, invalid JSON and unsupported capabilities.
3. Live-verified: a named profile passed an explicitly authorized minimal smoke test with a date, runtime and bounded spend.
4. Pilot-enabled: operator explicitly enables the profile for named tenants with budgets and payload policy.

V1's deterministic audit and fake provider work without keys. The four requested provider adapters must be offline-conformant before calling the provider layer V1-ready; Mistral/xAI/Groq use the same acceptance suite. Live verification requires separate paid-use approval and is reported per profile, never implied by adding a package. Keep all real provider calls disabled until that gate.
