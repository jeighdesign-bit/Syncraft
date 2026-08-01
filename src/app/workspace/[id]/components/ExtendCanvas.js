"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  evaluateExtendIntent,
  SAFE_SIDE_EXPANSION_FACTOR,
} from "@/lib/aspectRatio";

const ACCENT = "#d4ff59";
const VIEW_MARGIN = 40; // px of breathing room reserved inside the pane

// Each handle names the sides it grows.
const HANDLES = [
  { id: "n",  sides: ["top"],             cursor: "ns-resize",   x: "mid",  y: "0" },
  { id: "s",  sides: ["bottom"],          cursor: "ns-resize",   x: "mid",  y: "full" },
  { id: "w",  sides: ["left"],            cursor: "ew-resize",   x: "0",    y: "mid" },
  { id: "e",  sides: ["right"],           cursor: "ew-resize",   x: "full", y: "mid" },
  { id: "nw", sides: ["top", "left"],     cursor: "nwse-resize", x: "0",    y: "0" },
  { id: "ne", sides: ["top", "right"],    cursor: "nesw-resize", x: "full", y: "0" },
  { id: "sw", sides: ["bottom", "left"],  cursor: "nesw-resize", x: "0",    y: "full" },
  { id: "se", sides: ["bottom", "right"], cursor: "nwse-resize", x: "full", y: "full" },
];

/**
 * ExtendCanvas — the generative-expand editor rendered directly INSIDE the
 * workspace output pane (no modal). The user pulls the frame edges outward on
 * the real canvas; the hatched area is what the AI fills. The parent owns the
 * pad/source state and the Proceed action, so this component only reports drags
 * and draws the frame — exactly what the pane shows is what gets generated.
 */
const ExtendCanvas = memo(function ExtendCanvas({
  proxyUrl,
  rawPads,
  onPadsChange,
  source,
  onSourceLoad,
  busy,
}) {
  const rootRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // The original flat-extract URL, frozen when it first loads. During the busy
  // phase the parent swaps generated_image_url to the new extended image; keeping
  // the frozen URL means the loading view still shows the design that is being
  // extended, at the geometry it actually occupies (no squished mismatch).
  const [displayUrl, setDisplayUrl] = useState(null);
  const dragRef = useRef(null);

  // Measure the pane so the frame scales to fit whatever space it is given.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The UI keeps exact per-side pixels; Nano's ratio carrier exists server-side,
  // generated canvas stay identical—no hidden aspect-ratio expansion.
  const rawPadded = source
    ? { width: source.width + rawPads.left + rawPads.right, height: source.height + rawPads.top + rawPads.bottom }
    : { width: 1, height: 1 };

  const plan = useMemo(
    () => (source ? evaluateExtendIntent({ width: source.width, height: source.height, rawPads }) : null),
    [source, rawPads],
  );

  // Dynamic fit: the whole (growing) canvas is always fitted to the pane. At
  // entry the crop equals the design, so it shows at full fit — no shrink on
  // open — then the view zooms out smoothly as the crop grows.
  const scale = useMemo(() => {
    if (!source || box.w < 40 || box.h < 40) return 0;
    return Math.min(
      (box.w - VIEW_MARGIN) / rawPadded.width,
      (box.h - VIEW_MARGIN) / rawPadded.height,
    );
  }, [source, box, rawPadded.width, rawPadded.height]);

  const onMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || !source) return;
    const dx = (e.clientX - d.startX) / d.scale;
    const dy = (e.clientY - d.startY) / d.scale;
    const np = { ...d.startPads };
    const maxH = source.width;   // total L+R may add up to 1x (→ 2x canvas)
    const maxV = source.height;
    for (const side of d.sides) {
      if (side === "right") np.right = clamp(d.startPads.right + dx, 0, maxH - np.left);
      if (side === "left") np.left = clamp(d.startPads.left - dx, 0, maxH - np.right);
      if (side === "bottom") np.bottom = clamp(d.startPads.bottom + dy, 0, maxV - np.top);
      if (side === "top") np.top = clamp(d.startPads.top - dy, 0, maxV - np.bottom);
    }
    const candidate = {
      top: Math.round(np.top), right: Math.round(np.right),
      bottom: Math.round(np.bottom), left: Math.round(np.left),
    };

    // Clamp using the same evaluated plan enforced by the server.
    const candidatePlan = evaluateExtendIntent({
      width: source.width,
      height: source.height,
      rawPads: candidate,
    });
    if (candidatePlan.reason !== "QUALITY_LIMIT") {
      onPadsChange(candidate);
      return;
    }

    let low = 0;
    let high = 1;
    let best = { ...d.startPads };
    for (let i = 0; i < 12; i++) {
      const t = (low + high) / 2;
      const trial = {
        top: Math.round(d.startPads.top + (candidate.top - d.startPads.top) * t),
        right: Math.round(d.startPads.right + (candidate.right - d.startPads.right) * t),
        bottom: Math.round(d.startPads.bottom + (candidate.bottom - d.startPads.bottom) * t),
        left: Math.round(d.startPads.left + (candidate.left - d.startPads.left) * t),
      };
      const trialPlan = evaluateExtendIntent({
        width: source.width,
        height: source.height,
        rawPads: trial,
      });
      if (trialPlan.reason === "QUALITY_LIMIT") {
        high = t;
      } else {
        low = t;
        best = trial;
      }
    }
    onPadsChange(best);
  }, [source, onPadsChange]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }, [onMove]);

  const onHandleDown = useCallback((sides) => (e) => {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { sides, startX: e.clientX, startY: e.clientY, startPads: { ...rawPads }, scale };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [busy, rawPads, scale, onMove, onUp]);

  // Frame layout from the RAW crop (what the user is dragging), centered in the
  // pane. No snapping here — the frame follows the pointer exactly.
  const pads = rawPads;
  const padded = rawPadded;
  const frameW = padded.width * scale;
  const frameH = padded.height * scale;
  const ox = (box.w - frameW) / 2;
  const oy = (box.h - frameH) / 2;
  const designW = source ? source.width * scale : 0;
  const designH = source ? source.height * scale : 0;
  const designX = ox + pads.left * scale;
  const designY = oy + pads.top * scale;
  const grew = pads.top + pads.right + pads.bottom + pads.left > 0;
  const qualityRatio = plan?.ok
    ? Math.max(
        plan.pads.left / source.width,
        plan.pads.right / source.width,
        plan.pads.top / source.height,
        plan.pads.bottom / source.height,
      )
    : 0;
  const quality = qualityRatio <= SAFE_SIDE_EXPANSION_FACTOR
    ? { label: "SAFE", color: ACCENT }
    : { label: "MODERATE", color: "#e0b34a" };
  const addedPercent = Math.round(qualityRatio * 100);

  return (
    <div
      ref={rootRef}
      // stopPropagation so dragging on the canvas never triggers the pane's pan.
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}
    >
      {/* Hidden loader that reports the flat extract's natural dimensions and
          freezes its URL for the loading view. */}
      {!source && proxyUrl && (
        <img
          src={proxyUrl}
          alt=""
          onLoad={(e) => {
            setDisplayUrl(proxyUrl);
            onSourceLoad({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight });
          }}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
        />
      )}

      {source && scale > 0 && (
        <>
          {/* The target canvas — hatched so the new area reads as "AI fills this".
              During the busy phase a light sweep animates across it so the empty
              region reads as "being filled". overflow:hidden clips the sweep. */}
          <div style={{
            position: "absolute", left: ox, top: oy, width: frameW, height: frameH, overflow: "hidden",
            border: `1px dashed ${ACCENT}`,
            backgroundImage: "repeating-linear-gradient(45deg, rgba(212,255,89,0.10) 0 6px, transparent 6px 12px)",
          }}>
            {busy && (
              <div style={{
                position: "absolute", top: 0, bottom: 0, width: "55%",
                background: "linear-gradient(90deg, transparent, rgba(212,255,89,0.22), transparent)",
                animation: "extendSweep 1.6s ease-in-out infinite",
              }} />
            )}
          </div>

          {/* The design being extended (frozen original), at the position it
              occupies within the frame. Sits above the hatch so the sweep only
              shows in the empty area around it. */}
          {(displayUrl || proxyUrl) && (
            <img
              src={displayUrl || proxyUrl}
              alt="Flat extract"
              draggable={false}
              style={{
                position: "absolute", left: designX, top: designY, width: designW, height: designH,
                objectFit: "fill", outline: "1px solid rgba(255,255,255,0.4)", userSelect: "none",
              }}
            />
          )}

          {/* Drag handles — hidden while busy. */}
          {!busy && HANDLES.map((h) => {
            const hx = h.x === "mid" ? frameW / 2 : h.x === "full" ? frameW : 0;
            const hy = h.y === "mid" ? frameH / 2 : h.y === "full" ? frameH : 0;
            return (
              <div
                key={h.id}
                onPointerDown={onHandleDown(h.sides)}
                style={{
                  position: "absolute", left: ox + hx, top: oy + hy, transform: "translate(-50%,-50%)",
                  width: 16, height: 16, borderRadius: 3, background: ACCENT, border: "2px solid #0a0a0a",
                  cursor: h.cursor, touchAction: "none", zIndex: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                }}
              />
            );
          })}

          {/* Readout / hint pill at the bottom of the pane. */}
          <div style={{
            position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap",
            background: "rgba(10,10,10,0.85)", border: "1px solid #2a2a2a", borderRadius: 8,
            padding: "7px 14px", fontSize: 11, color: "#bbb", backdropFilter: "blur(4px)", zIndex: 4,
          }}>
            {busy ? (
              <><Loader2 size={13} color={ACCENT} className="animate-spin" /> Extending design… <span style={{ color: "#777" }}>filling &amp; finalizing</span></>
            ) : grew ? (
              <>
                <span style={{ color: "#fff", fontWeight: 600 }}>
                  {source.width}×{source.height} → {plan?.padded?.width || padded.width}×{plan?.padded?.height || padded.height}
                </span>
                {plan && !plan.ok && plan.message
                  ? <span style={{ color: "#e0b34a" }}>{plan.message}</span>
                  : <>
                      <span style={{
                        color: quality.color,
                        border: `1px solid ${quality.color}55`,
                        background: `${quality.color}12`,
                        borderRadius: 999,
                        padding: "2px 7px",
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: "0.8px",
                      }}>{quality.label}</span>
                      <span style={{ color: "#aaa" }}>Adding {addedPercent}%</span>
                      <span style={{ color: "#777" }}>Click “Extend Design” to fill</span>
                    </>}
              </>
            ) : (
              <span>Drag any edge or corner outward to add space</span>
            )}
          </div>
        </>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes extendSweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
      `}} />
    </div>
  );
});

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export default ExtendCanvas;
