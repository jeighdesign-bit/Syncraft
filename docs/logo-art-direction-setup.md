# Text to Logo art direction setup

Implemented for Text to Logo generation only. Image/Sketch, direct edits, Variations and Recraft utilities retain their existing provider prompt paths.

## Configuration

The new compiler/planner is disabled by default. Add server-only environment settings to the appropriate local/deployment secret store:

```dotenv
LOGO_ART_DIRECTION_ENABLED=true
FAL_KEY=<existing fal API key>
LOGO_PLANNER_MODEL=qwen/qwen3-30b-a3b-instruct-2507
```

Restart the development server after configuration changes. Do not use `NEXT_PUBLIC_` for these settings. No extra SDK or database migration is required. The planner calls `https://fal.run/openrouter/router` using the existing fal key. No separate OpenRouter account/key or direct Google API is used. The adapter requests JSON and validates the result locally with a fifteen-second deadline. The deprecated fal any-llm endpoint is not used. Creation images continue through the existing fal Nano Banana Pro endpoint.

The default planner is Qwen3 30B A3B Instruct 2507, selected for low token cost. Direct Google credentials and the old `LOGO_PLANNER_API_KEY` setting are ignored by this adapter. The local configuration enables art direction; deployment defaults remain disabled. Only one planner call is made per batch, with at most 3,000 output tokens, reasoning and web search disabled, and no automatic paid retries. The model ID remains configurable server-side. Reported usage and cost are retained even when an otherwise successful response fails validation. Actual fal charges must be checked against provider usage; OpenRouter's published model prices alone do not establish fal's final charge.

Without a configured model/key, or after timeout/invalid JSON/provider rejection, enabled art direction uses the deterministic style-specific fallback. Its metadata records `mode: fallback` and the reason; it must not be described as a successful AI planning call. A fallback changes construction/composition by option, but has less semantic creativity than the AI path.

Set `LOGO_ART_DIRECTION_ENABLED=false` to return future text-generation batches to baseline prompt compilation. Submitted jobs retain their frozen compiled prompts and seeds. Existing Image/Sketch jobs are unaffected.

## Durability and billing

- The text client submits one batch; the server reserves 1–4 slots atomically and plans once.
- Replay returns the existing reservation and does not restart planning or submissions. Interrupted reservations expire through the existing timeout/refund path instead of blind paid resubmission.
- Each image is charged through its existing verified ledger key. Partial failure refunds only failed charged slots. Planning is recorded as separate fal provider usage with reported dollar cost retained; unknown cost remains null. Available token usage is retained.
- Planner/compiler data remains in signed server state and is excluded from public project snapshots.
- Plans, image seeds and compiler versions are stored with the jobs. No extra candidate images or aesthetic retries are generated.

## Verification

Run the Logo Studio tests including `tests/logoArtDirection.test.mjs`, then the production build. `node scripts/evals/logo-quality-eval.mjs` creates 24 offline baseline/fallback pilot entries and makes no provider calls. It is not a live AI planner benchmark and does not establish improved visual quality.

The paid visual pilot remains separate from the planner smoke test. Do not declare visual quality improvements based on functional or text-only tests alone. See the implementation plan for paired visual evaluation and the proposed acceptance gate. Local smoke-test evidence is saved under `outputs/logo-quality-pilot/`.

On 23 October 2026, the fal/Qwen planner passed live one-direction and four-direction JSON validation. The reported costs were $0.0000747 (467 tokens, about 2 seconds) and $0.000193 (952 tokens, about 4 seconds), respectively. These are observed text-planning costs, not image-generation prices or guarantees for future requests. Both smoke tests made zero image calls. Evidence: `fal-planner-smoke.json` and `fal-planner-four-directions.json`.

Provider references: [fal LLM router schema](https://fal.ai/models/openrouter/router/api), [Qwen planner model](https://openrouter.ai/qwen/qwen3-30b-a3b-instruct-2507), [fal Nano Banana Pro edit schema](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api).
