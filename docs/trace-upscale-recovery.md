# HD upscale jobs

The extraction workflow uses `/api/trace-upscale` with `start`, `status`, and
`save` actions. The provider runs independently of the page. Each HTTP call is
bounded; there is no five-minute request waiting for inference to finish.

## Durable identity and recovery

One internal `provider_usage_logs` row uses provider `syncraft_upscale`, endpoint
`trace-upscale`, and a SHA-256 identity derived from project ID, exact saved flat
image URL, native/AI mode, and scale. The existing unique index reserves that
identity atomically. No database migration is required.

The actual Fal request ID is stored in `metadata.request_id` immediately after
submission. Progress reads reuse that ID. Finished provider output is stored in
`metadata.output_url` before downloads or uploads. Refreshing checks for an
existing job and reconnects; it never submits a missing job automatically.

Saving uses a compare-and-swap lease, a 150-second transfer budget, and an exact
source-image match when updating the project. A failed transfer returns the job
to `ready`; a retry downloads the existing output without repeating inference.
PNG optimization runs automatically before saving. A replacement is accepted
only when it is smaller and its decoded pixel hash, dimensions, channel count,
bit depth and density match the source. Unsupported profiles or an optimization
failure retain the original bytes. Other image formats retain provider bytes.
Native Universal background recovery retains its existing lossless 4x resize.

Large provider files start with a 64 KiB range probe, then use three concurrent
8 MiB range reads with validation and bounded retries. The small probe starts
the parallel reads sooner; larger parts reduce request overhead. Storage hosts
without range support use a bounded full read.

PNG packing uses adaptive filtering and compression level 4, with the same
decoded-pixel verification. This trades a slightly larger lossless file than
level 6 for less CPU time; it never increases the provider file size. R2 saves
use one PUT for these sub-100 MB outputs. Multipart uploads and R2 Local Uploads
were evaluated on 2026-10-30 but did not improve live transfer times from this
environment, so neither is enabled. Actual transfer speed still depends on
network and provider/storage load.

## Time limits

- Submission: one raw POST, at most 25 seconds. No transport replay by the SDK.
- Provider queue-start limit: 120 seconds; this does not limit running inference.
- Progress/result reads: 15 seconds each, retried by later client polls.
- Client polling: usually every 3 seconds, with slower checks while another
  request saves the file. After 10 minutes the view stops waiting and offers
  recovery; the provider job is retained.
- During a long save call, a local 15-second timer updates elapsed time without
  extra network requests. It stops when the call finishes or the view closes.
- Successful saves record download, optimization, upload and project-save
  durations in `metadata.save_timings_ms`, plus the total save duration and
  completion timestamp. Stage logs use JSON text so their timing fields survive
  development-log capture.
- A five-minute authenticated cron reconciles jobs and saves finished upscales
  after the browser closes. It does not initiate new inference.

## Submission ambiguity

A transport failure, lost submission response, or server error can occur after
the provider accepted a request. Such jobs remain `submission_unknown` and must
not be automatically resubmitted. The user sees support guidance. A stale
`submitting` reservation is also quarantined rather than released by age. Support
must verify the provider history before repairing an unconfirmed reservation.
Definite 4xx rejections can be retried by an explicit user action.

## Authorization and billing

Every action requires authentication, project edit permission, and owned source
storage. Status checks use their own rate limit. These routes never charge or
refund credits; they complete a previously paid extraction. A successful save
records the Fal usage receipt once using the provider request ID.

Older open clients using `/api/trace` step 2 receive recovery advice instead of
creating an untracked, blocking upscale. Saving a new flat image invalidates
the old upscale and SVG. Jobs for superseded artwork cannot overwrite it.

## Browser previews are separate from AI processing

A completed job does not mean the browser has finished downloading its image.
The original proxy streamed large raster files through an unbounded public
storage request, allowing a partially painted PNG to remain visible for minutes.

Flat-extract and comparison raster displays request
`/api/proxy?...&preview=1`, producing a WebP display derivative with a maximum
1600px edge and no enlargement. The HD canvas uses the original saved upscale
so zooming reveals its full resolution. Editors and downloads also use original
files.

SVG canvas and comparison displays add `svgPreview=1`, producing a lossless
WebP display derivative with a maximum 4096px edge. This avoids inserting
thousands of SVG paths into the page. The saved and downloaded SVG remains the
original vector document; Recraft handles vectorization.

The proxy validates storage hosts, uses bounded storage reads and receives the
complete body before returning success. Successful images can be cached for one
day. `next.config.mjs` leaves `/api/proxy` in charge of its own cache policy;
other API responses remain uncached. Cache keys include the complete source
URL, so new saved artwork receives a distinct preview.

In an earlier observed garment project, the source upscale was 16,015,826 bytes; the
display derivative was 93,820 bytes. Provider-reported inference time was 4.886
seconds. Earlier end-to-end recovery measurements also included reconnection,
status observation, transfer, and saving; they were not pure AI execution times.
