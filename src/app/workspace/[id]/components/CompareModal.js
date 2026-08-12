"use client";

import { memo, useRef, useState, useEffect } from "react";
import { CheckCircle, X, FolderDown, Download } from "lucide-react";

/** Fetches SVG text and injects inline for reliable cross-browser SVG rendering */
function InlineSVG({ url, style }) {
  const [svgHtml, setSvgHtml] = useState(null);
  useEffect(() => {
    if (!url) { setSvgHtml(null); return; }
    setSvgHtml(null);
    fetch(url)
      .then(r => r.text())
      .then(text => {
        const safe = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/\son\w+="[^"]*"/gi, '')
          .replace(/\son\w+='[^']*'/gi, '');
        if (safe.includes('<svg')) {
          const scaled = safe.replace(/<svg([^>]*?)>/i, (_, attrs) => {
            let clean = attrs;
            const wMatch = attrs.match(/\swidth=["']([^"']+)["']/i);
            const hMatch = attrs.match(/\sheight=["']([^"']+)["']/i);
            const vMatch = attrs.match(/\sviewBox=["']([^"']+)["']/i);

            clean = clean.replace(/\s+width=["'][^"']*["']/gi, '')
                         .replace(/\s+height=["'][^"']*["']/gi, '')
                         .replace(/\s+preserveAspectRatio=["'][^"']*["']/gi, '')
                         .replace(/\s+style=["'][^"']*["']/gi, '');

            if (!vMatch && wMatch && hMatch) {
              const w = parseFloat(wMatch[1].replace(/px/i, ''));
              const h = parseFloat(hMatch[1].replace(/px/i, ''));
              if (!isNaN(w) && !isNaN(h)) {
                clean += ` viewBox="0 0 ${w} ${h}"`;
              }
            }
            return `<svg${clean} style="width:100%;height:100%;display:block;" preserveAspectRatio="xMidYMid meet">`;
          });
          setSvgHtml(scaled);
        }
      })
      .catch(err => console.error('[InlineSVG] fetch failed:', err));
  }, [url]);
  if (!svgHtml) return null;
  return <div style={{ ...style, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svgHtml }} />;
}

/**
 * CompareModal — Before/After slider comparison modal.
 * DOM-direct clip-path manipulation for zero-lag slider dragging.
 */
const CompareModal = memo(function CompareModal({
  show,
  project,
  onClose,
  onDownloadAll,
  onDownloadSvg,
}) {
  const isDraggingCompare = useRef(false);
  const [originalAspect, setOriginalAspect] = useState(null);
  const originalProxy = project?.original_image_url
    ? `/api/proxy?url=${encodeURIComponent(project.original_image_url)}`
    : null;

  useEffect(() => {
    if (!show || !originalProxy) return;
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth && image.naturalHeight) {
        setOriginalAspect(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = originalProxy;
    return () => { image.onload = null; };
  }, [show, originalProxy]);

  if (!show || !project) return null;

  return (
    <div
      className="modal-overlay"
      onMouseMove={(e) => {
        if (!isDraggingCompare.current) return;
        const container = document.getElementById("compare-container");
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let newPos = ((e.clientX - rect.left) / rect.width) * 100;
        newPos = Math.max(0, Math.min(100, newPos));
        // DIRECT DOM MANIPULATION — prevents massive lag vs setState
        const overlayImg = document.getElementById("compare-overlay-img");
        const sliderLine = document.getElementById("compare-slider-line");
        if (overlayImg) overlayImg.style.clipPath = `inset(0 ${100 - newPos}% 0 0)`;
        if (sliderLine) sliderLine.style.left = `${newPos}%`;
      }}
      onMouseUp={() => { isDraggingCompare.current = false; }}
      onMouseLeave={() => { isDraggingCompare.current = false; }}
    >
      <div className="modal-content" style={{ maxWidth: "1400px", width: "fit-content", padding: "0", overflow: "hidden", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)", background: "#111", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(10,10,10,0.8)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.05)", zIndex: 20, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircle size={18} color="#d4ff59" />
            <span style={{ fontWeight: "600", fontSize: "15px", color: "#fff", letterSpacing: "0.5px" }}>{project.trace_type === "upscale" ? "Upscale Complete" : "Trace Complete"}</span>
            <span style={{ color: "#666", fontSize: "13px", marginLeft: "8px", fontWeight: "400" }}>Drag slider to compare</span>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px", borderRadius: "50%", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }} onMouseOut={e => { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "transparent"; }}>
            <X size={18} />
          </button>
        </div>

        {/* Slider Compare Area */}
        <div
          style={{
            position: "relative", width: "100%", display: "flex", justifyContent: "center",
            background: "repeating-conic-gradient(#1e1e1e 0% 25%, #141414 0% 50%) 0 0 / 20px 20px",
            padding: "0"
          }}
        >
          <div
            id="compare-container"
            style={{
              position: "relative",
              overflow: "hidden", cursor: "ew-resize", userSelect: "none",
              boxShadow: "0 0 20px rgba(0,0,0,0.5)",
              width: originalAspect ? `min(85vw, calc(80vh * ${originalAspect}))` : "85vw",
              height: originalAspect ? `min(80vh, calc(85vw / ${originalAspect}))` : "80vh",
              aspectRatio: originalAspect || "auto",
              maxWidth: "85vw",
              maxHeight: "80vh",
            }}
            onMouseDown={(e) => {
              isDraggingCompare.current = true;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              const overlayImg = document.getElementById("compare-overlay-img");
              const sliderLine = document.getElementById("compare-slider-line");
              if (overlayImg) overlayImg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
              if (sliderLine) sliderLine.style.left = `${pct}%`;
            }}
          >
            {/* AFTER layer */}
            {project.upscaled_image_url || project.generated_image_url ? (
              <img
                src={`/api/proxy?url=${encodeURIComponent(project.upscaled_image_url || project.generated_image_url)}`}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", objectFit: "contain" }}
                alt="After"
              />
            ) : (
              <InlineSVG
                url={project.svg_url ? `/api/proxy?url=${encodeURIComponent(project.svg_url)}` : null}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              />
            )}

            {/* BEFORE layer — stretched to fill */}
            <div
              id="compare-overlay-img"
              style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                clipPath: "inset(0 50% 0 0)",
                willChange: "clip-path",
                transform: "translateZ(0)",
              }}
            >
              <img
                draggable={false}
                src={originalProxy}
                alt="Original"
                style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
              />
            </div>

            {/* Slider Line */}
            <div
              id="compare-slider-line"
              style={{
                position: "absolute", top: 0, bottom: 0, left: "50%",
                width: "2px", background: "#555",
                transform: "translateX(-50%) translateZ(0)", pointerEvents: "none", willChange: "left",
              }}
            >
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: "36px", height: "36px", background: "#333", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 12px rgba(0,0,0,0.5)", border: "1px solid #555", gap: "1px",
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              </div>
            </div>

            {/* Labels */}
            <div style={{ position: "absolute", bottom: "14px", left: "14px", background: "rgba(0,0,0,0.75)", padding: "4px 10px", borderRadius: "4px", color: "#aaa", fontSize: "11px", pointerEvents: "none", letterSpacing: "0.5px" }}>ORIGINAL (BEFORE)</div>
            <div style={{ position: "absolute", bottom: "14px", right: "14px", background: "rgba(0,0,0,0.75)", padding: "4px 10px", borderRadius: "4px", color: "#aaa", fontSize: "11px", pointerEvents: "none", letterSpacing: "0.5px" }}>
              {(project.upscaled_image_url || project.generated_image_url) ? "AI UPSCALED (AFTER)" : "VECTOR (AFTER)"}
            </div>
          </div>
        </div>


      </div>
    </div>
  );
});

export default CompareModal;
