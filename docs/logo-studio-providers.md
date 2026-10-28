# Logo Studio: current providers and credits

Logo Studio uses Nano Banana 2 for creation and editing by default. Set the server environment variable `LOGO_STUDIO_NANO_MODEL=pro` to route new Logo Studio jobs to Nano Banana Pro when a quality comparison or rollback is needed. Previously queued jobs retain their recorded endpoint. This setting does not change other Syncraft features that use Pro. Recraft handles background removal and vectorization.

| Action | Provider / endpoint | Customer credits | Standard API cost |
| --- | --- | ---: | ---: |
| Text to Logo | fal `fal-ai/nano-banana-2` | 8 / logo | $0.08 |
| Image / Sketch to Logo | fal `fal-ai/nano-banana-2/edit` | 8 / logo | $0.08 |
| Variations / AI Edit | fal `fal-ai/nano-banana-2/edit` | 8 / output | $0.08 |
| Remove BG | Recraft `images/removeBackground` | 2 | $0.01 |
| Vectorize | Recraft `images/vectorize` | 2 | $0.01 |

Each creation request asks for one PNG at 1K, with web search disabled. The existing client batch creates up to four separate jobs, totaling 32 credits. A selected generated PNG plus optional vectorization totals 10 credits and approximately $0.09 in provider cost at default settings. PNG/JPG downloads are included. Once an SVG derivative exists, it can be downloaded again without another vectorization charge; the original PNG remains available.

`FAL_KEY` is required for creation; `RECRAFT_API_TOKEN` or `RECRAFT_API_KEY` is required only for the supporting tools. Recraft creation is no longer an available path in the active adapter. Existing Recraft jobs with a persisted remote output can still finish saving. Previously submitted fal jobs use the same durable queue recovery as new jobs. Refunds reference the original ledger transaction, preserving old 4/6/12-credit charges correctly.

Existing SVG history entries remain downloadable. For new Nano edits or variations, a validated SVG is rasterized into a PNG reference server-side. Background removal preserves native SVG input. AI Edit returns to instruction-based editing; the previous Recraft rectangle-mask UI and its 1,000-character prompt restriction are no longer required. The four-logo generation quota remains, with edit and utility derivatives excluded.

The UI preserves existing components and shows matching server prices. Closing a preview still shows the empty canvas; a new requested job reopens its preview when the queue completes. Selecting a historical version explicitly cancels that automatic selection.

Logo Studio's **Share** header action reuses the existing workspace sharing dialog and `/api/project-share` invitations. Owners manage access; invited editors can create and refine logos using their own credits, while invited viewers can preview and download saved outputs. Every generation shares the project's existing four-logo quota. Access, revocation and the three-day project expiry are checked on reads, downloads and writes. Canvas signatures remain bound to the project owner, and a signed job records its billed user so owner/cron reconciliation attributes provider costs and refunds to the original payer. Opening the dialog or copying a link does not make a project public.

Sharing checks cover owner/editor/viewer roles, rejected uninvited access, revocation, expiry, editor charges and refunds, shared quotas, role-aware controls, and authorized downloads. The sharing dialog was checked locally without sending an invitation or changing anyone's access.

Validation covers provider routing, reference payloads, queued saves, owner isolation, price/batch totals, idempotency, refunds, old Recraft saves, native SVG utility operations and downloads. A standalone live Nano request with the existing robot reference is used to check output quality without changing the user's saved project or Syncraft credit balance. API charges for that test are separate.

Official references:
- https://fal.ai/models/fal-ai/nano-banana-2/api
- https://fal.ai/models/fal-ai/nano-banana-2/edit/api
- https://fal.ai/models/fal-ai/nano-banana-pro/edit/api
- https://www.recraft.ai/docs/api-reference/pricing
