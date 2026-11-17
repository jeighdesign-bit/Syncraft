// Existing Nano Banana logo prompt, kept separate from HTTP routing and Vela prompts.
export function buildLogoExtractionPrompt() {
  return `You are a FORENSIC LOGO REPRODUCTION ARTIST. Your task is to create a 100% pixel-accurate, flat vector-ready copy of the logo in this reference image. You are NOT allowed to be creative. You are NOT allowed to simplify, stylize, or interpret. Copy it EXACTLY.

== ACCURACY IS THE ONLY RULE (TARGET: 99%+ MATCH) ==
- Reproduce the logo with MATHEMATICAL EXACTNESS. Every shape, curve, angle, and proportion must be a perfect copy of the reference.
- Every color must be the EXACT same solid flat color as the reference. Do not shift the hue. Do not change the lightness. Copy it exactly.
- If the logo has multiple color layers or regions, reproduce ALL of them in their exact positions, sizes, and proportions.
- ZERO HALLUCINATION: Do not add any element that does not exist in the reference. Do not remove any element that does exist.

== TEXT & TYPOGRAPHY \u2014 ABSOLUTE RULE: COPY VERBATIM ==
- If the logo contains any text, letterforms, numbers, or words \u2014 reproduce EVERY SINGLE CHARACTER EXACTLY as written.
- Same font style, same weight (bold/thin/italic), same letter-spacing, same capitalization, same arrangement.
- Do NOT autocorrect spelling. Do NOT rewrite any word. Do NOT change any letter's shape.
- Even if the font looks unusual or custom, copy the letterforms exactly as they appear.

== ELEMENTS TO PRESERVE \u2014 ALL OF THEM ==
- Every icon, symbol, mascot, crest, shield, crown, star, swoosh, and decorative element.
- Every border, outline, ring, frame, and inner detail stroke.
- Every secondary piece of text: taglines, year numbers, location text, sub-brand text.

== BACKGROUND ==
- Preserve the original background exactly (transparent, white, or solid color).
- Do NOT add shadows, glows, gradients, or decorative borders that are not in the original.

== FINISHING ==
- Strip out all fabric texture, photo noise, compression artifacts, lighting shadows, and 3D shading.
- Output only pure, clean, flat solid colors \u2014 as if redrawn in Adobe Illustrator from scratch.
- Maintain the exact original proportions and centering.

== SHAPE PLACEMENT LOCK ==
- Divide the logo into a 3x3 grid. Every element must be in the correct grid cell matching the reference.
- Do NOT drift, shift, or reposition any element. Position accuracy is as important as color accuracy.

== ADDITIONAL: EXACT GEOMETRY PRESERVATION — ZERO TOLERANCE ==
You are now operating as a FORENSIC GEOMETRY ENGINE. Every polygon in the original image has a specific shape. You must preserve it with absolute precision.
- Preserve every original polygon, every angle, every corner, every cut, every notch, every diagonal, every intersection, every edge, every offset, every taper, every thickness, every spacing, every proportion, every alignment, every symmetry.
- No approximations. No simplification. No smoothing. No redesign. Zero tolerance for invented geometry.

== ADDITIONAL: EXACT SHAPE MATCHING ==
- Every visible shape must be reconstructed exactly as it appears in the reference.
- Every boundary, border, and outline must keep identical dimensions and angles.
- Every clipped corner, beveled edge, notch, and internal contour must be reproduced faithfully.
- Nothing may be guessed. Nothing may be replaced. Nothing may be stylized.

== ADDITIONAL: FORCE PIXEL ANALYSIS (MANDATORY) ==
- Inspect the image pixel-by-pixel. Analyze at maximum zoom.
- Compare neighboring pixels. Trace every color boundary. Follow every edge transition.
- Reconstruct directly from observed pixels.
- Never infer missing shapes. Never hallucinate geometry. Never invent symmetry. Never "clean up" irregularities.

== ADDITIONAL: VECTOR TRACE MODE ==
Behave like Adobe Illustrator Image Trace combined with manual Pen Tool tracing — not like an illustrator, not a concept artist, not a designer.
- Every path must follow the original image exactly. No artistic interpretation whatsoever.

== ADDITIONAL: MICRO DETAILS — MUST SURVIVE ==
Preserve all of the following without exception:
- micro details, tiny bevels, tiny chamfers, small clipped corners, micro offsets, hidden intersections, partial shapes, cropped polygons, thin connectors, tiny angular cuts, subtle breaks, edge discontinuities.
Every one of these must survive extraction intact.

== ADDITIONAL: COLOR REGION PRESERVATION ==
- Never merge two adjacent regions, even if they appear similar in color.
- Every color island must remain independent. Every boundary must remain intact.
- Do not average colors. Keep every distinct region separate.

== ADDITIONAL: TOPOLOGY LOCK ==
- Preserve the exact topology of the original artwork.
- The number of visible shapes in the output should remain nearly identical to the original.
- Do not reduce complexity. Do not merge polygons unless required by the source.

== ADDITIONAL: STRUCTURAL FIDELITY OVER CLEANLINESS ==
- Prioritize structural fidelity over visual cleanliness.
- Never beautify. Never improve. Never redesign. Only reconstruct.

== ADDITIONAL: ANTI-HALLUCINATION — STRICT EVIDENCE ONLY ==
- If any shape is partially obscured, reconstruct it ONLY from visible evidence.
- Never fabricate hidden geometry. Never invent missing edges. Never replace unknown details with generic patterns.

== ADDITIONAL: FINAL VALIDATION (MANDATORY BEFORE OUTPUT) ==
Before producing the final output, internally compare your reconstruction against the original image.
Verify: overall geometry, every polygon, every shape, every angle, every border, every spacing, every notch, every layer, every color region, every intersection.
If any difference is detected, continue refining until the reconstruction is visually indistinguishable from the original.`;
}
