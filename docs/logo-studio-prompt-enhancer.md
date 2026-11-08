# Logo Studio prompt enhancer

Implemented for Text to Logo creation only. Image models, image sizes, credit charges and other tools remain unchanged.

## User workflow

- Compact **Enhance** action in the prompt toolbar, disabled for an empty idea.
- Clicking **Enhance** shows loading in the button, then applies the clearer idea directly in the prompt field. There is no modal or acceptance step.
- Clicking **Enhance** again asks for another clarification of the original idea, with the previous enhancement as context. No automatic paid retries.
- **Undo** restores the previous prompt. Applied metadata survives draft reload and saved creation recipes; manual editing clears it. Late responses cannot overwrite newer edits.
- Generate waits for a pending enhancement, so it cannot submit the previous idea while the text is being rewritten. Errors use the existing toast and leave the idea unchanged.
- Brand name, tagline, palette, style and settings are never rewritten or applied by this feature. Actual brand/tagline values are not sent to the enhancer.

## Provider and costs

`POST /api/logo-studio/enhance` uses the existing server-side `FAL_KEY` with `https://fal.run/openrouter/router`, model `openai/gpt-6-luna`. No additional package, image call or new credential is required.

The request disables web search, requests JSON containing one `enhancedPrompt`, and caps output at 600 tokens. Suggestions normally target 15–35 words. Malformed, partial, oversized or unexpected structured output is rejected. Missing explicit exclusions are retained in the visible suggestion; the complete original idea remains authoritative in the generation compiler as well.

A measured live probe took 2,070 ms, with 367 input tokens, 51 output tokens and a fal-reported cost of **$0.0000622**. This is one observed request, not a fixed price or latency promise. The existing provider usage ledger records the actual reported cost (or unknown), model, status and token counts, without storing raw prompts in usage metadata.

The enhancer does not deduct Syncraft credits. Existing image pricing is untouched. Signed-in access, project edit permissions when a project is supplied, an 8 KB request limit, and existing rate-limit infrastructure (10/minute, 200/day per user) bound abuse. Same request IDs share one in-process result for five minutes; this is not distributed exactly-once delivery.

## Generation integration

Accepted suggestions carry versioned original/enhanced text. Validation rejects stale metadata and rejects enhancement metadata in Image, Sketch, AI Edit, variations and utility requests. Text batch and direct creation both compile the original brief plus the accepted clarification, with selected controls and separate brand wording retained. Normal creation without an accepted enhancement follows the existing pipeline.

The original brief, explicit exclusions and separate controls limit drift. A text model can still infer unwanted details; the user can edit the enhanced idea or use Undo. This cannot guarantee perfect image-model compliance or better logo quality on every brief.

The [gallery review](logo-studio-gallery-review.md) added a shared, versioned design vocabulary in `logoStyleLanguage.mjs`. The enhancer receives the same style construction used by Text generation plus a narrowly scoped enhancement focus. It adds a concrete relationship only when relevant, without pasting the backend instructions into the visible idea. Existing enhancement recipe versions remain compatible.

## Verification

Unit and service tests exercise provider payloads, reported costs, failures, same-ID replay, authorization and limits, stale metadata, original intent, public recipe reuse, actual image-submission prompts, unchanged routing and unchanged credit charges. UI checks verify direct application without a dialog, loading, Undo and protection for newer manual edits. No new image generation is required for these checks.

Provider documentation: [fal OpenRouter API](https://fal.ai/models/openrouter/router/api).
