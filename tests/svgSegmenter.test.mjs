import assert from "node:assert/strict";
import test from "node:test";

import { segmentSvgLayers } from "../src/lib/svgSegmenter.js";

test("semantic layer processing preserves the provider SVG byte-for-byte", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><clipPath id="crop"><path d="M0 0H100V100H0Z"/></clipPath></defs>
  <g transform="translate(4 6)" opacity=".8" clip-path="url(#crop)">
    <path d="M0 0H90V90H0Z" fill="#072d52"/>
    <g style="mix-blend-mode:multiply"><path d="M0 80L50 20L90 80Z" fill="#ff6a00"/></g>
    <path d="M10 76L50 30L80 76Z" fill="#ffc21c"/>
  </g>
</svg>`;

  const result = await segmentSvgLayers(svg, "unused", "image/png", "jersey");

  assert.equal(result, svg);
});
