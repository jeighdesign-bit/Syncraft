"use client";

import { memo, useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { Maximize, AlertCircle, Zap, Expand } from "lucide-react";
import GenerationLoading from '@/components/GenerationLoading';
import SvgPreview from '@/components/SvgPreview';
import ExtendCanvas from "./ExtendCanvas";
import WorkspaceTabs from "@/components/WorkspaceTabs";
import { canvasImageUrl, canvasZoomLayout, preferredCanvasTab } from '@/lib/workspacePreview.mjs';

function PreviewFeedback({ error = false, label, onRetry }) {
  return (
    <div role={error ? 'alert' : 'status'} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, color: '#c6c6c6', textAlign: 'center', fontSize: 13, background: '#151515' }}>
      {error ? <AlertCircle size={22} aria-hidden="true" /> : <GenerationLoading label={`Loading ${label.toLowerCase()} preview`} />}
      {error && <span>Preview couldn't load. Your saved file is safe.</span>}
      {error && <button onClick={onRetry} aria-label={`Retry ${label.toLowerCase()} preview`} style={{ minHeight: 44, padding: '8px 18px', background: '#d4ff59', color: '#151515', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Retry preview</button>}
    </div>
  );
}

function RasterPreview({ url, alt, style, onLoad, contentScale = 1 }) {
  const [attempt, setAttempt] = useState(0);
  const [readyKey, setReadyKey] = useState(null);
  const [failedKey, setFailedKey] = useState(null);
  const key = `${url}:${attempt}`;
  const loaded = readyKey === key;
  const failed = failedKey === key && !loaded;
  const source = attempt ? `${url}&preview_retry=${attempt}` : url;

  useEffect(() => {
    if (!url || loaded || failed) return;
    const timer = setTimeout(() => setFailedKey(key), 45_000);
    return () => clearTimeout(timer);
  }, [url, key, loaded, failed]);

  return <div style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-busy={!loaded && !failed}>
    <img key={key} src={source} alt={alt} draggable={false} decoding="async"
      onLoad={event => {
        if (!event.currentTarget.naturalWidth || !event.currentTarget.naturalHeight) { setFailedKey(key); return; }
        setReadyKey(key);
        setFailedKey(null);
        onLoad?.(event);
      }}
      onError={() => setFailedKey(key)}
      style={{ ...style, transform: `${style?.transform || ''} scale(${contentScale})`, transformOrigin: 'center', visibility: loaded ? 'visible' : 'hidden' }} />
    {!loaded && <PreviewFeedback error={failed} label={alt} onRetry={() => setAttempt(value => value + 1)} />}
  </div>;
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
      if (extendModeRef.current) return; // no zoom while extending
      const leftScroll = leftScrollRef.current;
      const rightScroll = rightScrollRef.current;
      if (!leftScroll || !rightScroll) return;

      const rectL = leftScroll.getBoundingClientRect();
      const rectR = rightScroll.getBoundingClientRect();

      let active, rect;
      if (e.clientX >= rectL.left && e.clientX <= rectL.right && e.clientY >= rectL.top && e.clientY <= rectL.bottom) {
        active = leftScroll;
        rect = rectL;
      } else if (e.clientX >= rectR.left && e.clientX <= rectR.right && e.clientY >= rectR.top && e.clientY <= rectR.bottom) {
        active = rightScroll;
        rect = rectR;
      } else {
        return;
      }

      // The wheel is the workspace's primary zoom gesture. Restricting it to
      // the image panes avoids changing zoom while users scroll elsewhere.
      e.preventDefault();
      const z = currentZoom.current;
      const delta = Math.sign(e.deltaY) * 0.25;
      const newZ = Math.min(Math.max(1, z - delta), 5);
      if (newZ === z) return;

      const scale = newZ / z;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const pointX = active.scrollLeft + mouseX;
      const pointY = active.scrollTop + mouseY;

      pendingScrollRef.current = {
        left: pointX * scale - mouseX,
        top: pointY * scale - mouseY
      };
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
    if (e.pointerType === "touch" && zoomLevel <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
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

  const previewOriginal = canvasImageUrl(proxyOriginal);
  const previewGenerated = canvasImageUrl(proxyGenerated);
  // The HD tab is the fidelity-inspection surface: render the saved upscale
  // itself so zooming reveals its real pixels instead of a 1600px derivative.
  const fullResolutionUpscaled = canvasImageUrl(proxyUpscaled, { fullResolution: true });
  const zoomLayout = canvasZoomLayout(zoomLevel);
  const zoomScrollStyle = { position: 'relative', width: `${zoomLayout.scrollPercent}%`, height: `${zoomLayout.scrollPercent}%`, minWidth: '100%', minHeight: '100%' };
  const fitCanvas = () => {
    pendingScrollRef.current = null;
    for (const scroll of [leftScrollRef.current, rightScrollRef.current]) {
      if (!scroll) continue;
      scroll.scrollLeft = 0;
      scroll.scrollTop = 0;
    }
    setZoomLevel(1);
  };

  // Match the uploaded orientation, including tall lanyard artwork.
  const rasterPreviewStyle = {
    width: "100%", height: "100%", minWidth: 0, minHeight: 0,
    objectFit: "contain", imageRendering: "auto",
  };

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
  if (activeTab === "generated") activeUrl = previewGenerated;
  else if (activeTab === "upscaled") activeUrl = fullResolutionUpscaled;
  else if (activeTab === "svg") activeUrl = proxySvg;

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
      setActiveTab(preferredCanvasTab(project));
      fitCanvas();
    }
  }, [extendMode, traceState, project?.svg_url, project?.upscaled_image_url, project?.generated_image_url]);

  const renderStatus = () => {
    if (traceState !== "idle") {
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
          <div
            style={previewOriginal ? {
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maskImage: `url(${previewOriginal})`,
              maskSize: 'contain',
              maskPosition: 'center',
              maskRepeat: 'no-repeat',
              WebkitMaskImage: `url(${previewOriginal})`,
              WebkitMaskSize: 'contain',
              WebkitMaskPosition: 'center',
              WebkitMaskRepeat: 'no-repeat'
            } : {}}
          >
            {previewOriginal && (
              <img
                src={previewOriginal}
                alt="Processing Background"
                referrerPolicy="no-referrer"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            )}
          </div>
          <GenerationLoading />
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
    <div ref={containerRef} className="split-canvas" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", backgroundColor: "#1a1a1a", position: "relative" }}>

      {/* ── Sub-toolbar: tool buttons LEFT, Tabs CENTER, zoom controls RIGHT ── */}
      <div className="split-canvas-toolbar" style={{ display: "flex", alignItems: "center", padding: "0 16px", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", height: "48px", boxSizing: "border-box", flexShrink: 0, gap: "12px", justifyContent: "space-between" }}>

        {/* Left: tool buttons (only in idle) */}
        <div className="canvas-toolbar-side canvas-toolbar-side--left">
          {leftControls}
        </div>

        {/* Center: right-panel tab label (Segmented Control) */}
        <WorkspaceTabs items={tabs} value={activeTab} disabled={extendMode} label="Output versions"
          onChange={setActiveTab} />

        {/* Right: zoom controls — replaced by an Extend-mode hint while editing */}
        <div className="canvas-toolbar-side canvas-toolbar-side--right">
          {extendMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#d4ff59", fontSize: "11px", fontWeight: 600, letterSpacing: "0.5px" }}>
              <Expand size={13} /> EXTEND MODE
            </div>
          ) : (
            <div className="canvas-zoom" role="group" aria-label="Canvas zoom">
              <button type="button" aria-label="Zoom out" disabled={zoomLevel <= 1} onClick={() => setZoomLevel(z => Math.max(1, z - 0.25))}>−</button>
              <span className="canvas-zoom__value">{Math.round(zoomLevel * 100)}%</span>
              <button type="button" aria-label="Zoom in" disabled={zoomLevel >= 5} onClick={() => setZoomLevel(z => Math.min(5, z + 0.25))}>+</button>
              <span className="canvas-zoom__divider" aria-hidden="true" />
              <button type="button" className="canvas-zoom__fit" aria-label="Fit images to canvas" onClick={fitCanvas}>
                <Maximize size={14} /> Fit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main canvas area ── */}
      <div className="split-canvas-panes"
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          cursor: isGrabbing ? "grabbing" : (zoomLevel > 1 ? "grab" : "default"),
          userSelect: "none",
          touchAction: zoomLevel > 1 ? "none" : "pan-y pinch-zoom",
          backgroundColor: "#111111",
          backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "0 0"
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* LEFT PANEL: Original Image */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #2a2a2a" }}>
          <div ref={leftScrollRef} onScroll={handleLeftScroll} className="no-scrollbar" style={{ flex: 1, overflow: "auto", backgroundColor: "transparent", position: "relative" }}>
            {previewOriginal ? (
              <div style={zoomScrollStyle}>
                <div className="split-canvas-preview-frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "24px", boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <RasterPreview
                    url={previewOriginal}
                    alt="Original"
                    contentScale={zoomLayout.contentScale}
                    style={rasterPreviewStyle}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#444", fontSize: "12px" }}>Original image not found</div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Outputs */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div ref={rightScrollRef} onScroll={handleRightScroll} className="no-scrollbar" style={{ flex: 1, overflow: "auto", backgroundColor: "rgba(255,255,255,0.02)", position: "relative" }}>
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
              <div style={zoomScrollStyle}>
                <div className="split-canvas-preview-frame" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: "24px", boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {activeTab === "svg" ? (
                    <SvgPreview
                      url={activeUrl}
                      contentScale={zoomLayout.contentScale}
                      style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    />
                  ) : (
                    <RasterPreview
                      url={activeUrl}
                      contentScale={zoomLayout.contentScale}
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
                      alt="Output"
                      style={rasterPreviewStyle}
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


export default SplitViewCanvas;
