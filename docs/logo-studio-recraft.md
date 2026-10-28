# Logo Studio: Recraft migration

Historical migration notes: creation has since returned to Nano Banana Pro. See [current providers and pricing](./logo-studio-providers.md). Recraft now supports Remove BG and Vectorize only.

New Logo Studio requests use the direct Recraft API. The UI components and four-logo project quota remain in place.

| Operation | Model / endpoint | Output | Provider list cost |
| --- | --- | --- | --- |
| Text | `recraftv4_styles_vector`, `images/generations` | SVG | $0.05 plus $0.005 for a new style |
| Image | `recraftv3_vector`, `images/imageToImage`, curated vector style | SVG | $0.08 per image |
| Sketch / variations | `recraftv4_1_vector`, `images/imageToImage` | SVG | $0.08 per image |
| Selected-area edit | `recraftv3_vector`, `images/inpaint` | SVG | $0.08 per image |
| Remove background | `images/removeBackground` | SVG for SVG input; PNG for raster | $0.01 |
| Vectorize existing raster | `images/vectorize` | SVG | $0.01 |

The existing `RECRAFT_API_TOKEN` or `RECRAFT_API_KEY` is required. `FAL_KEY` is only needed to recover legacy pending fal jobs; no new Logo Studio job submits to fal. Other product tools are unaffected.

Text generation uses the eight existing local category images as style references, resized to meet Recraft's minimum 256-pixel dimensions. References are bundled with the API route. Returned style IDs are cached per running server instance, so cold starts can incur the additional $0.005; the cache is an optimization, not durable style storage. The actual Recraft response units are recorded when provided. No automatic generation retry or provider fallback can add a second bill.

Edit mode shows an adjustable rectangle over the existing canvas. Drag to select, use arrow keys to move, and Shift + arrows to resize. The server validates normalized coordinates and builds a binary mask. Source and mask are both normalized to 1024 square pixels. Uploaded/reference SVGs are validated before rasterizing; vector background removal keeps the SVG input intact.

Results pass output validation and are copied into existing project storage. SVG output is used directly for downloads; PNG and JPG are rendered from it. Legacy Illustrator export retains its existing limits on unsupported vector effects. An existing SVG cannot be charged for another vectorization.

Recraft jobs persist their remote output before storage finalization, allowing polling/cron recovery without another generation. Existing signed-state, ledger idempotency, refunds, project ownership and quota checks remain authoritative.

Approved customer pricing: Text to Logo costs 4 credits per output; Image to Logo, Sketch to Logo, Variations and AI Edit cost 6; Remove BG and Vectorize cost 2. Four text outputs total 16 credits; four image/sketch outputs total 24. PNG/JPG/SVG downloads are included. Other product tools retain their existing prices. Refunds use the original ledger charge, including older 12-credit jobs. API units and Syncraft credits are separate currencies.

Validation includes mocked service/adapter tests, real image and mask processing, build checks, browser editing controls, and controlled live requests with synthetic artwork. See `outputs/recraft-live-*.json` for the locally recorded provider results; these contain temporary output URLs, not API credentials. No Syncraft account credits are deducted by the standalone provider checks. This is endpoint validation, not a broad logo-quality benchmark.

Official references:
- https://www.recraft.ai/docs/api-reference/models/recraft-v4-styles
- https://www.recraft.ai/docs/api-reference/tools/image-to-image
- https://www.recraft.ai/docs/api-reference/tools/inpainting
- https://www.recraft.ai/docs/api-reference/tools/remove-background
- https://www.recraft.ai/docs/api-reference/pricing

## Photo-reference regression correction

A real robot-photo case produced an abstract wordmark with V4.1 vector image-to-image. The saved source and raw provider SVG confirmed that this was generation drift, not a lost upload or a rendering error. A separate monitor-shaped result in the same history matched its own earlier sketch source.

Image-to-logo now uses V3 Vector with curated `Line art`, `Linocut` (retro), or `Vector art` styles, subject-first prompting and explicit secondary brand lettering. Its generated request is checked against V3's 1,000-character prompt limit before a job can be charged. Raster V4.1 and V3 candidates were compared during diagnosis; no raster/vectorize pipeline or extra customer charge was added. The customer price remains six credits.

The corrected adapter was exercised against the same photo and returned a recognizable robot illustration rather than an abstract wordmark. Fidelity is still approximate: pose/details may change and embedded captions can survive despite instructions. Valid SVG checks and endpoint tests establish technical compatibility, not guaranteed visual quality. Diagnostic samples are saved locally in `outputs/logo-reference-diagnosis/`; existing project assets were not overwritten.
