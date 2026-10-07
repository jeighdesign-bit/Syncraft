import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { usesNativeTraceUpscale, resizeTraceForUpscale } from "../src/lib/traceUpscale.mjs";

test("both garment modes always reach ESRGAN rather than the native resize branch", () => {
  for (const garment_mode of ["ERASE_LOGOS", "PRESERVE_LOGOS"]) {
    assert.equal(usesNativeTraceUpscale({ trace_type: "mockup", canvas_data: { garment_mode } }), false);
    assert.equal(usesNativeTraceUpscale({ trace_type: "mockup", canvas_data: {
      garment_mode, universal_recovery: { mode: "UNIVERSAL_BACKGROUND_ONLY" },
    } }), false);
  }
  for (const trace_type of ["logo", "upscale", "universal"]) {
    assert.equal(usesNativeTraceUpscale({ trace_type }), false);
  }
  assert.equal(usesNativeTraceUpscale(null), false);
  assert.equal(usesNativeTraceUpscale({ trace_type: "universal", canvas_data: {
    universal_recovery: { mode: "UNIVERSAL_BACKGROUND_ONLY" },
  } }), true);
});

test("Universal native resizing retains its 4x PNG output", async () => {
  const source = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#1640bd" } }).png().toBuffer();
  const result = await resizeTraceForUpscale(source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 12);
  assert.equal(metadata.height, 8);
  assert.equal(metadata.format, "png");
});
