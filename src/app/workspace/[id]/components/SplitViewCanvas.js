"use client";

import { memo, useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { Scissors, ZoomIn, ZoomOut, Maximize, AlertCircle, Eraser, Loader2, ImageMinus, Zap, Expand } from "lucide-react";
import ExtendCanvas from "./ExtendCanvas";

/**
 * InlineSVG — Fetches SVG text and injects it directly into the DOM.
 * More reliable than <img> (content-type issues) or <object> (doesn't reload on data change).
 */
function InlineSVG({ url, style }) {
  const [svgHtml, setSvgHtml] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) { setSvgHtml(null); return; }
    setLoading(true);
    setSvgHtml(null);
    fetch(url)
      .then(r => r.text())
      .then(text => {
        // Sanitize: strip script tags + inline event handlers before injection
        const safe = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/\son\w+="[^"]*"/gi, '')
          .replace(/\son\w+='[^']*'/gi, '');
        if (safe.includes('<svg')) {
          // Strip fixed width/height so SVG scales to fit container
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
      .catch(err => console.error('[InlineSVG] fetch failed:', err))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>Loading SVG...</div>;
  if (!svgHtml) return null;
  return (
    <div
      style={{ ...style, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}

const SplitViewCanvas = memo(function SplitViewCanvas({
  project,
  traceState,
  nodeErrors,
  leftControls,
  // Extend Design in-canvas editor. When extendMode is on, the output pane
  // becomes the drag-to-expand surface instead of the normal image view.
  extendMode = false,
  extendPads,
  extendSource,
  extendProcessing = false,
  onExtendPadsChange,
  onExtendSourceLoad,
  onUpscaleOutputInvalid,
}) {
  const [activeTab, setActiveTab] = useState("generated");
  const isUpscale = project?.trace_type === "upscale";
  const [zoomLevel, setZoomLevel] = useState(1);
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);
  const containerRef = useRef(null);

  const currentZoom = useRef(zoomLevel);
  currentZoom.current = zoomLevel;
  const pendingScrollRef = useRef(null);

  // Scroll to zoom to pointer
  const extendModeRef = useRef(extendMode);
  extendModeRef.current = extendMode;

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      if (extendModeRef.current) return; // no zoom while extending
      const z = currentZoom.current;
      const delta = Math.sign(e.deltaY) * 0.25;
      const newZ = Math.min(Math.max(0.25, z - delta), 5);
      if (newZ === z) return;

      const scale = newZ / z;
      const leftScroll = leftScrollRef.current;
      const rightScroll = rightScrollRef.current;
      
      if (leftScroll && rightScroll) {
        const rectL = leftScroll.getBoundingClientRect();
        const rectR = rightScroll.getBoundingClientRect();
        
        let active, rect;
        if (e.clientX >= rectL.left && e.clientX <= rectL.right && e.clientY >= rectL.top && e.clientY <= rectL.bottom) {
          active = leftScroll;
          rect = rectL;
        } else if (e.clientX >= rectR.left && e.clientX <= rectR.right && e.clientY >= rectR.top && e.clientY <= rectR.bottom) {
          active = rightScroll;
          rect = rectR;
        }

        if (active && rect) {
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          
          const pointX = active.scrollLeft + mouseX;
          const pointY = active.scrollTop + mouseY;
          
          pendingScrollRef.current = { 
            left: pointX * scale - mouseX, 
            top: pointY * scale - mouseY 
          };
        }
      }
      setZoomLevel(newZ);
    };

    const node = containerRef.current;
    if (node) {
      node.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      if (node) {
        node.removeEventListener("wheel", handleWheel);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (pendingScrollRef.current && leftScrollRef.current && rightScrollRef.current) {
      const { left, top } = pendingScrollRef.current;
      isSyncingLeft.current = true;
      isSyncingRight.current = true;
      
      leftScrollRef.current.scrollLeft = left;
      leftScrollRef.current.scrollTop = top;
      rightScrollRef.current.scrollLeft = left;
      rightScrollRef.current.scrollTop = top;
      
      pendingScrollRef.current = null;
    }
  }, [zoomLevel]);

  // Drag to pan state
  const [isGrabbing, setIsGrabbing] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (extendMode) return; // the extend editor owns pointer input
    if (e.target.closest('button')) return;
    setIsGrabbing(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e) => {
    if (!isGrabbing) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };

    if (leftScrollRef.current && rightScrollRef.current) {
      isSyncingLeft.current = true;
      isSyncingRight.current = true;
      leftScrollRef.current.scrollLeft -= dx;
      leftScrollRef.current.scrollTop -= dy;
      rightScrollRef.current.scrollLeft -= dx;
      rightScrollRef.current.scrollTop -= dy;
    }
  };

  const handlePointerUp = () => {
    setIsGrabbing(false);
  };

  // Derive proxy URLs
  const proxyOriginal = useMemo(() =>
    project?.original_image_url
      ? `/api/proxy?url=${encodeURIComponent(project.original_image_url)}`
      : null,
  [project?.original_image_url]);

  const proxyGenerated = useMemo(() =>
    project?.generated_image_url
      ? `/api/proxy?url=${encodeURIComponent(project.generated_image_url)}`
      : null,
  [project?.generated_image_url]);

  const proxyUpscaled = useMemo(() =>
    project?.upscaled_image_url
      ? `/api/proxy?url=${encodeURIComponent(project.upscaled_image_url)}`
      : null,
  [project?.upscaled_image_url]);

  const proxySvg = useMemo(() =>
    project?.svg_url
      ? `/api/proxy?url=${encodeURIComponent(project.svg_url)}`
      : null,
  [project?.svg_url]);

  // Sync scroll positions proportionally
  const handleLeftScroll = (e) => {
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    if (rightScrollRef.current) {
      isSyncingRight.current = true;
      const l = e.target;
      const r = rightScrollRef.current;
      const maxLX = l.scrollWidth - l.clientWidth;
      const maxRX = r.scrollWidth - r.clientWidth;
      if (maxLX > 0 && maxRX > 0) r.scrollLeft = (l.scrollLeft / maxLX) * maxRX;
      
      const maxLY = l.scrollHeight - l.clientHeight;
      const maxRY = r.scrollHeight - r.clientHeight;
      if (maxLY > 0 && maxRY > 0) r.scrollTop = (l.scrollTop / maxLY) * maxRY;
    }
  };

  const handleRightScroll = (e) => {
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    if (leftScrollRef.current) {
      isSyncingLeft.current = true;
      const r = e.target;
      const l = leftScrollRef.current;
      const maxLX = l.scrollWidth - l.clientWidth;
      const maxRX = r.scrollWidth - r.clientWidth;
      if (maxLX > 0 && maxRX > 0) l.scrollLeft = (r.scrollLeft / maxRX) * maxLX;
      
      const maxLY = l.scrollHeight - l.clientHeight;
      const maxRY = r.scrollHeight - r.clientHeight;
      if (maxLY > 0 && maxRY > 0) l.scrollTop = (r.scrollTop / maxRY) * maxLY;
    }
  };

  // Determine active URL
  let activeUrl = null;
  if (activeTab === "generated") activeUrl = proxyGenerated;
  else if (activeTab === "upscaled") activeUrl = proxyUpscaled;
  else if (activeTab === "svg") activeUrl = proxySvg;

  const hasShownSvgAlert = useRef(false);
  const [showSvgAlert, setShowSvgAlert] = useState(false);

  // Extend operates on the flat extract — force that tab while editing.
  useEffect(() => {
    if (extendMode) setActiveTab("generated");
  }, [extendMode]);

  // Auto-switch tabs when new stages complete OR start
  useEffect(() => {
    if (extendMode) return; // don't fight the forced tab during extend
    if (traceState === "step1") setActiveTab("generated");
    else if (traceState === "step2") setActiveTab("upscaled");
    else if (traceState === "step3") setActiveTab("svg");
    else if (traceState === "idle") {
      if (project?.upscaled_image_url) setActiveTab("upscaled");
      else if (project?.svg_url) setActiveTab("svg");
      else if (project?.generated_image_url) setActiveTab("generated");
    }
  }, [extendMode, traceState, project?.svg_url, project?.upscaled_image_url, project?.generated_image_url]);

  useEffect(() => {
    if (project?.svg_url && !hasShownSvgAlert.current && activeTab !== "svg") {
      setShowSvgAlert(true);
      hasShownSvgAlert.current = true;
      const t = setTimeout(() => setShowSvgAlert(false), 12000);
      return () => clearTimeout(t);
    }
  }, [project?.svg_url, activeTab]);

  // Right-side label
  const rightLabel = isUpscale ? "4X HD UPSCALE" : activeTab === "generated" ? "FLAT EXTRACT" : activeTab === "upscaled" ? "HD UPSCALE" : "VECTOR PREVIEW";

  const renderStatus = () => {
    if (traceState !== "idle") {
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
          <div 
            style={proxyOriginal ? { 
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maskImage: `url(${proxyOriginal})`, 
              maskSize: 'contain', 
              maskPosition: 'center', 
              maskRepeat: 'no-repeat',
              WebkitMaskImage: `url(${proxyOriginal})`,
              WebkitMaskSize: 'contain',
              WebkitMaskPosition: 'center',
              WebkitMaskRepeat: 'no-repeat'
            } : {}}
          >
            {proxyOriginal && (
              <img 
                src={proxyOriginal} 
                alt="Processing Background" 
                referrerPolicy="no-referrer"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            )}
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 10, 10, 0.75)', backdropFilter: 'blur(6px)' }}>
            <img 
              src="/Syncraft Logo-14.svg" 
              alt="Loading" 
              className="animate-spin" 
              style={{ width: '100px', height: '100px', filter: 'brightness(0) invert(0.6)', animationDuration: '2.5s', animationTimingFunction: 'linear' }} 
            />
          </div>
        </div>
      );
    }
    if (nodeErrors?.step2 || nodeErrors?.step3 || nodeErrors?.step4) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ff4444' }}>
          <AlertCircle size={32} style={{ marginBottom: '15px' }} />
          Trace Failed
        </div>
      );
    }
    if (!activeUrl) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', gap: '16px' }}>
          <Zap size={24} strokeWidth={1.5} style={{ color: '#444' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '400', letterSpacing: '0.3px', color: '#666' }}>
            Awaiting <span style={{ color: '#d4ff59', fontWeight: '500', opacity: 0.8 }}>{isUpscale ? "4K Upscale" : "Auto-Trace"}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Tab config
  const tabs = isUpscale
    ? [{ id: "generated", label: "4X HD UPSCALE", hasContent: !!project?.generated_image_url }]
    : [
        { id: "generated", label: "1. FLAT EXTRACT", hasContent: !!project?.generated_image_url },
        { id: "upscaled",  label: "2. HD UPSCALE",   hasContent: !!project?.upscaled_image_url },
        { id: "svg",       label: "3. VECTOR SVG",    hasContent: !!project?.svg_url },
      ];

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", backgroundColor: "#1a1a1a", position: "relative" }}>

      {/* ── Sub-toolbar: tool buttons LEFT, Tabs CENTER, zoom controls RIGHT ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", height: "48px", flexShrink: 0, gap: "12px", justifyContent: "space-between" }}>

        {/* Left: tool buttons (only in idle) */}
        <div style={{ display: "flex", flex: 1, gap: "8px", alignItems: "center" }}>
          {leftControls}
          {leftControls && <div style={{ width: "1px", height: "14px", background: "#333", margin: "0 8px" }} />}
          <span style={{ color: "#666", fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginRight: "6px" }}>ORIGINAL UPLOAD</span>
        </div>

        {/* Center: right-panel tab label (Segmented Control) */}
        <div style={{ display: "flex", background: "#0a0a0a", borderRadius: "10px", padding: "4px", gap: "2px", border: "1px solid #222", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.5)" }}>
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              disabled={extendMode}
              onClick={() => { if (extendMode) return; setActiveTab(tab.id); setShowSvgAlert(false); }}
              style={{
                padding: "6px 18px",
                background: activeTab === tab.id ? "rgba(255,255,255,0.08)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === tab.id ? "rgba(255,255,255,0.15)" : "transparent",
                borderRadius: "8px",
                color: activeTab === tab.id ? "#ffffff" : tab.hasContent ? "#888" : "#444",
                fontSize: "11px",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                fontWeight: activeTab === tab.id ? "600" : "500",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
                whiteSpace: "nowrap",
                boxShadow: activeTab === tab.id ? "0 2px 10px rgba(0,0,0,0.2)" : "none"
              }}
              onMouseOver={e => { if (activeTab !== tab.id) { e.currentTarget.style.color = "#ccc"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
              onMouseOut={e => { if (activeTab !== tab.id) { e.currentTarget.style.color = tab.hasContent ? "#888" : "#444"; e.currentTarget.style.background = "transparent"; } }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: zoom controls — replaced by an Extend-mode hint while editing */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px" }}>
          {extendMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#d4ff59", fontSize: "11px", fontWeight: 600, letterSpacing: "0.5px" }}>
              <Expand size={13} /> EXTEND MODE
            </div>
          ) : (
            <>
              <button onClick={() => setZoomLevel(z => Math.max(0.25, z - 0.25))} style={{ ...zoomBtnStyle, borderRadius: "6px" }} onMouseOver={e => { e.currentTarget.style.borderColor="#666"; e.currentTarget.style.color="#fff"; }} onMouseOut={e => { e.currentTarget.style.borderColor="#333"; e.currentTarget.style.color="#ccc"; }}>−</button>
              <span style={{ color: "#fff", fontSize: "11px", minWidth: "42px", textAlign: "center", fontWeight: "600", fontFamily: "monospace" }}>{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => setZoomLevel(z => Math.min(5, z + 0.25))} style={{ ...zoomBtnStyle, borderRadius: "6px" }} onMouseOver={e => { e.currentTarget.style.borderColor="#666"; e.currentTarget.style.color="#fff"; }} onMouseOut={e => { e.currentTarget.style.borderColor="#333"; e.currentTarget.style.color="#ccc"; }}>+</button>
              <div style={{ width: "1px", height: "14px", background: "#333", margin: "0 4px" }} />
              <button onClick={() => setZoomLevel(1)} style={{ ...zoomBtnStyle, border: "none", color: "#888", padding: "4px 8px", borderRadius: "6px" }} onMouseOver={e => { e.currentTarget.style.color="#fff"; e.currentTarget.style.background="rgba(255,255,255,0.08)"; }} onMouseOut={e => { e.currentTarget.style.color="#888"; e.currentTarget.style.background="transparent"; }}>
                <Maximize size={14} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />Fit
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Main canvas area ── */}
      <div 
        style={{ 
          display: "flex", 
          flex: 1, 
          overflow: "hidden", 
          cursor: isGrabbing ? "grabbing" : (zoomLevel > 1 ? "grab" : "default"), 
          userSelect: "none",
          backgroundColor: "#111111",
          backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "0 0"
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* LEFT PANEL: Original Image */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #2a2a2a" }}>
          <div ref={leftScrollRef} onScroll={handleLeftScroll} className="no-scrollbar" style={{ flex: 1, overflow: "auto", backgroundColor: "transparent", position: "relative" }}>
            {/* Canvas label */}
            <div style={{ position: "absolute", top: "14px", left: "14px", zIndex: 5, fontSize: "10px", fontWeight: "700", color: "#444", letterSpacing: "1.5px", textTransform: "uppercase", pointerEvents: "none" }}>ORIGINAL</div>
            {proxyOriginal ? (
              <div style={{ position: "relative", width: `${Math.max(100, zoomLevel * 100)}%`, height: `${Math.max(100, zoomLevel * 100)}%`, minWidth: "100%", minHeight: "100%" }}>
                <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "24px", boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <img src={proxyOriginal} draggable={false} alt="Original" style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, objectFit: "contain" }} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#444", fontSize: "12px" }}>Original image not found</div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Outputs */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div ref={rightScrollRef} onScroll={handleRightScroll} className="no-scrollbar" style={{ flex: 1, overflow: "auto", backgroundColor: "rgba(255,255,255,0.02)", position: "relative" }}>
            {/* Canvas label */}
            <div style={{ position: "absolute", top: "14px", left: "14px", zIndex: 5, fontSize: "10px", fontWeight: "700", color: extendMode ? "#d4ff59" : activeTab === "svg" ? "rgba(212, 255, 89,0.35)" : "#444", letterSpacing: "1.5px", textTransform: "uppercase", pointerEvents: "none" }}>{extendMode ? "EXTEND — FLAT EXTRACT" : rightLabel}</div>
            {extendMode ? (
              <ExtendCanvas
                proxyUrl={proxyGenerated}
                rawPads={extendPads}
                onPadsChange={onExtendPadsChange}
                source={extendSource}
                onSourceLoad={onExtendSourceLoad}
                busy={extendProcessing}
              />
            ) : activeUrl && traceState === "idle" ? (
              <div style={{ position: "relative", width: `${Math.max(100, zoomLevel * 100)}%`, height: `${Math.max(100, zoomLevel * 100)}%`, minWidth: "100%", minHeight: "100%" }}>
                <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "24px", boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {activeTab === "svg" ? (
                    <InlineSVG
                      url={activeUrl}
                      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    />
                  ) : (
                    <img
                      src={activeUrl}
                      data-fallback-src={isUpscale ? project?.generated_image_url || "" : ""}
                      onError={(event) => {
                        const fallback = event.currentTarget.dataset.fallbackSrc;
                        if (fallback && event.currentTarget.src !== fallback) {
                          event.currentTarget.removeAttribute("data-fallback-src");
                          event.currentTarget.src = fallback;
                        }
                      }}
                      onLoad={(event) => {
                        if (!isUpscale || !onUpscaleOutputInvalid) return;
                        try {
                          const canvas = document.createElement("canvas");
                          canvas.width = 32;
                          canvas.height = 32;
                          const context = canvas.getContext("2d", { willReadFrequently: true });
                          context.drawImage(event.currentTarget, 0, 0, 32, 32);
                          const pixels = context.getImageData(0, 0, 32, 32).data;
                          let brightest = 0;
                          for (let index = 0; index < pixels.length; index += 4) {
                            if (pixels[index + 3] === 0) continue;
                            brightest = Math.max(brightest, pixels[index], pixels[index + 1], pixels[index + 2]);
                          }
                          if (brightest <= 5) onUpscaleOutputInvalid();
                        } catch {
                          // The server validates the asset again before any repair;
                          // client-side sampling is only an early UI signal.
                        }
                      }}
                      draggable={false}
                      alt="Output"
                      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, objectFit: "contain", imageRendering: "auto" }}
                    />
                  )}
                </div>
              </div>
            ) : (
              renderStatus()
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
});

// ── Shared micro-styles ──────────────────────────────────────────────────────
const toolBtnStyle = {
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  color: "#ccc",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "11px",
  textTransform: "capitalize",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  fontWeight: "500",
};

const zoomBtnStyle = {
  background: "transparent",
  border: "1px solid #333",
  color: "#ccc",
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "500",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  lineHeight: 1,
};

export default SplitViewCanvas;
