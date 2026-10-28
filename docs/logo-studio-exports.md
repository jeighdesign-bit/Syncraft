# Logo Studio downloads

The Download dropdown stays in the canvas action row. Every export is generated
by the authenticated `/api/logo-studio/export` endpoint from a finished job in a
verified project owned by the requester. The endpoint does not accept source URLs.
Downloads do not create provider requests, change project history, or charge credits.

- PNG: re-encoded PNG, retaining source alpha and resolution.
- JPG: quality 95 JPEG with a white matte for transparent pixels.
- SVG: the selected SVG, or the newest successful vector derivative of that exact
  selected raster logo. Unrelated vector versions are never substituted.
- AI: an Illustrator 7 compatible PostScript document containing actual RGB fill
  and editable Bezier-path operators. This is a legacy vector export, not modern
  Illustrator proprietary editing data, and not a renamed SVG/PDF.

SVG and AI require the existing Vectorize operation first. Its normal credit cost
is shown on the Vectorize button; opening the download menu never starts it.

## AI limitations

Legacy AI export supports the solid filled paths and basic geometry produced by
the vectorizer. It preserves compound-path fill rules, curve closing handles,
shape order, and aspect ratio. Text must already be outlines. Unsupported strokes,
transforms, CSS classes/styles, transparency, clipping, or gradients produce a
clear error instead of a visually changed file. Download the original SVG and
save it as AI in Illustrator for artwork using those features.

The writer uses the published Adobe Illustrator File Format Specification,
23 February 1998. Adobe describes the transition from PostScript-based AI to
the current format in its [AI format guide](https://www.adobe.com/creativecloud/file-types/image/vector/ai-file.html).

## Verification

Automated tests cover vector-source selection, transparent PNG, white-matte JPEG,
SVG rasterization, active-content rejection, AI artboard/color/path operators,
compound holes, and closing curves. PNG and JPG were also downloaded from the
live authenticated UI and checked as genuine 1024 x 1024 PNG/JPEG files. Legacy
AI has not yet been round-tripped through the Illustrator application.
