# AgroVision Audit

Audit date: 2026-09-26

This audit reflects the current source tree. It does not claim that a feature works unless the implementation is present and a validation command or direct code inspection supports the claim. The baseline npm commands could not be completed in the current shell because command execution returned `PSSecurityException`.

## Existing Architecture

- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons, and Motion. The entry point is `src/main.tsx`; navigation and shared state are composed in `src/App.tsx`.
- Backend: Express 4 in `server.ts`, served together with Vite during development and bundled with esbuild for production.
- Agent layer: deterministic sensing/planning/persistence under `server/agent/`, with optional Gemini phrasing and an autonomous interval monitor.
- Persistence: server-side Supabase service-role client, an anon client factory for future authenticated flows, three agent tables, and the AgroVision domain schema in `supabase/schema.sql`.
- Data boundary: most feature views still use `src/data/mockData.ts` or component-local state; only selected AI and telemetry flows call the backend.
- There is no separate `backend/` or `api/` directory. The existing `server.ts` plus `server/agent/` is the current backend structure.

## Working Features (Implementation Present)

- React/Vite application composition and client-side navigation are present.
- Crop Doctor can submit base64 image data to `POST /api/ai/crop-doctor` and attempts Gemini vision when configured.
- Fertilizer Advisor can submit a request to `POST /api/ai/fertilizer-recommend`.
- Assistant can submit a farmer context and question to `POST /api/agent/run`.
- Smart Irrigation can read and update the process-local telemetry endpoint.
- The agent can sense in-memory soil data, create a deterministic decision, optionally phrase a response with Gemini, and persist agent records when Supabase is configured.
- Supabase tables have indexes and RLS enabled. The service-role client is server-only in the current source layout.

The dependency issue was resolved with `npm.cmd install`. `npm.cmd run lint`, `npm.cmd run build`, and backend smoke tests now pass for the exercised paths.

## Broken Features and Runtime Risks

- Crop Doctor now propagates successful scans to the parent state and returns `DISEASE_SERVICE_UNAVAILABLE` when no configured detection service returns a result. Successful vision analysis remains unverified without a configured Gemini or disease API credential.
- Crop Doctor now rejects remote image URLs and unsupported MIME types before model processing, reducing SSRF and malformed-upload risk.
- Weather and mandi sensing in `server/agent/tools.ts` are explicitly demo values. `WeatherView` and mandi cards use local mock data, so they are not live integrations.
- Marketplace, government schemes, profile editing, and admin data are client-local/static and do not persist through backend APIs.
- Without Supabase configured, soil telemetry remains process-local/demo and shared across farms; with Supabase configured, GET telemetry reads persisted records.
- Telemetry persistence is now owned by the agent workflow, removing the duplicate direct insert from the IoT POST path.
- Telemetry and decision persistence now surface Supabase write errors to the workflow.
- Before the fix, the autonomous monitor started on boot even when Supabase was not configured and could run costly AI work with no durable notification sink.
- Autonomous monitoring is now disabled when Supabase is not configured; this was verified in the fresh server startup log.
- The dashboard and Smart Irrigation view can show different telemetry because they use separate state paths.
- GET and POST unified-recommendation paths return different kinds of data, including hardcoded cards in the GET path.

## Incomplete Features

- n8n webhook orchestration is implemented as an opt-in validated adapter in `server/lib/n8n.ts`; it is not live until `N8N_WEBHOOK_URL` is configured.
- Ollama integration and configurable local model selection are absent.
- Authentication, authorization, user identity, and protected admin access are absent.
- OpenWeatherMap, Plant.id/custom disease API, Agmarknet, and Google Maps adapters are absent.
- Supabase domain tables for profiles, farms, crops, recommendations, chat, marketplace, schemes, and orders are absent.
- Supabase Auth/Storage and vector/RAG workflows are absent.
- The n8n request/response contract is implemented and returns `N8N_UNAVAILABLE` for transport or contract failures.
- Loading, retry, empty, and backend-error handling is inconsistent across views.
- Automated frontend, backend, agent, integration, and end-to-end tests are absent.
- Documentation only contains the AI Studio quick-start README; the requested architecture, API, database, n8n, Ollama, security, testing, deployment, and troubleshooting documents are absent.

## Duplicate or Unnecessary Code

- Gemini-backed legacy assistant behavior in `server.ts` overlaps with the newer agent route used by `AssistantView`; one canonical assistant path should be selected after compatibility is confirmed.
- Demo weather, mandi, crop scan, marketplace, scheme, and dashboard data is spread between `mockData.ts` and individual components.
- Telemetry is both updated in the in-memory store and written through separate direct/agent persistence paths.
- The project contains both `package-lock.json` and `bun.lock`, while the documented workflow only uses npm. This should be standardized deliberately, not removed blindly.

## API Problems

- Request bodies are manually destructured without schema validation or consistent error codes.
- `farmId` is accepted from the request and is not authorized against an authenticated farmer.
- There is no consistent API error envelope, request correlation ID, rate limiting, or security middleware.
- Crop Doctor accepts remote URLs and fetches them server-side without SSRF protections.
- The 35 MB JSON limit is broad and permits abuse; image validation is not equivalent to MIME/body validation.
- Health output exposes configuration presence. This is low risk but should be minimized in production.
- External data endpoints required by the product contract do not exist yet.

## Database Problems

- The current schema only stores agent telemetry, decisions, and notifications.
- Tables have no application-user ownership model or farmer/farm foreign keys.
- RLS is enabled, but all current operations use a service-role client and no authenticated authorization boundary exists.
- Persistence failures are not propagated to callers or recorded for operations visibility.
- No migration/versioning workflow is documented.

## Authentication Problems

- No Supabase Auth or other authentication flow exists.
- The Navbar role selector is presentation state, not authorization.
- The admin view is reachable by client-side navigation with no server-side permission check.
- Agent history and notifications can be queried for an arbitrary farm ID.

## Security Problems

- No rate limiting, security headers, CORS policy, CSRF strategy, input schemas, audit logging, or authorization middleware is present.
- The unrestricted remote-image fetch is an SSRF risk.
- IoT ingestion has no device authentication, range checks, replay protection, or rate limit.
- User-controlled text is interpolated into AI prompts without explicit prompt-injection boundaries.
- The service-role key is correctly kept out of frontend imports, but the application has not yet established authenticated user-to-farm authorization.
- `.env.example` and `README.md` disagree about `.env` versus `.env.local`; `dotenv.config()` only loads `.env` by default.

## AI Problems

- Gemini is the only implemented LLM provider; Ollama is absent.
- The agent planner is deterministic and does not classify the requested intent or select tools dynamically.
- Weather and market inputs are demo values, so the agent can produce reasoning from fabricated current conditions.
- Fallback replies and fallback disease results blur the distinction between unavailable data and verified data.
- Confidence and uncertainty are not consistently represented in the assistant/agent response contract.
- The required safety system prompt and structured response validation are not present as a shared boundary.

## n8n Requirements

The server-side n8n adapter is implemented with a configured webhook URL and optional secret. It validates the response schema, maps `farmer_id`, `farm_id`, language, location, crop, message, and context, applies a timeout, and returns a stable `N8N_UNAVAILABLE` error when n8n is unavailable. The frontend remains unaware of the webhook secret.

## Ollama Requirements

Add a configurable server-side adapter using `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. Check availability at startup or health time, do not hard-code a model, and report `OLLAMA_UNAVAILABLE` without silently presenting unavailable model output as verified advice. Hardware/model selection remains an environment and operator decision.

## Supabase Requirements

Keep the current agent tables as a starting point, then add only the domain tables required by live features. Add authenticated ownership relationships and RLS policies before exposing farmer-specific data. Define migrations and explicit persistence/error behavior. Do not add pgvector until a real document corpus, embedding provider, retrieval query, and evaluation path exist.

## External API Requirements

- Weather: add an OpenWeatherMap adapter only when `OPENWEATHER_API_KEY` is configured; return source and retrieval time.
- Disease: add a Plant.id/custom adapter only when configured; otherwise return `DISEASE_SERVICE_UNAVAILABLE` and let the UI explain the limitation.
- Mandi: add a validated Agmarknet/approved source adapter only when credentials and a supported endpoint are confirmed; never synthesize prices.
- Maps: add Google Maps only for an implemented location/map workflow; do not add an unused credential.

## Recommended Implementation Order

1. Resolve the local Node/npm execution issue, install dependencies, and capture baseline build/type diagnostics.
2. Add the audit and implementation documentation baseline.
3. Add shared validation, stable error codes, security headers, CORS policy, rate limiting, and safe image handling.
4. Fix the existing scan callback and telemetry consistency without changing the visual UI.
5. Add a canonical backend service boundary for n8n and implement the request/response contract with unavailable-service handling.
6. Add configurable Ollama integration and health diagnostics; keep Gemini as an explicit provider until the local model path is verified.
7. Replace fabricated weather/market inputs with adapters or explicit `data_unavailable` responses.
8. Introduce authentication, farm ownership, Supabase RLS policies, and persisted profiles/farms before exposing domain data.
9. Add marketplace, schemes, weather, and recommendation APIs incrementally, preserving each existing view.
10. Add tests for schemas, adapters, error paths, localization, and the end-to-end agent flow.
11. Run security, performance, frontend, backend, and integration validation; update documentation with only verified status.

## Current Environment Gaps

The repository contains `.env.example` but no visible `.env`. The example now includes Gemini, Supabase, and n8n variables; Ollama, weather, disease, mandi, maps, and auth variables remain unconfigured. Git is not available in the current shell, so a logical Git checkpoint cannot be created from this environment.

## Audit Conclusion

AgroVision is a working-looking React/Express prototype with a partially implemented Gemini/Supabase agent loop and an opt-in n8n adapter, not yet the requested n8n/Ollama-backed production architecture. The next priority is shared authentication/authorization and rate limiting, followed by Ollama and real external-data adapters or explicit unavailable states. Existing UI components should remain in place and be connected incrementally.