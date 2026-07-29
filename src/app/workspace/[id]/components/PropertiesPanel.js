"use client";

import { memo, useState } from "react";
import { Download, Monitor, ChevronDown, FolderDown, Loader2, X, ImageMinus, Eraser, Scissors } from "lucide-react";
import FeedbackWidget from "./FeedbackWidget";

// ─── Design tokens ─────────────────────────────────────────────────────────
// Shared spacing/type/color scale so every section in this panel reads as
// one system instead of independently-tuned magic numbers.
const COLOR = {
  panelBg: "#181818",
  surface: "#1e1e1e",
  border: "#2a2a2a",
  inputBg: "#212121",
  inputBorder: "#333",
  text: "#e2e2e2",
  textMuted: "#8a8a8a",
  textFaint: "#5a5a5a",
  accent: "#d4ff59",
  accentHover: "#bfe650",
  accentText: "#0a0a0a",
  dangerBg: "rgba(255,68,68,0.08)",
  dangerBorder: "#ff4444",
  dangerText: "#ff9d9d",
};
const SPACE = { xs: 4, sm: 8, md: 12, lg: 16 };
const RADIUS = 4;

const eyebrowStyle = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#fff",
  opacity: 0.8,
  letterSpacing: "1px",
  textTransform: "uppercase",
};

const panelStyle = {
  width: "280px",
  background: COLOR.panelBg,
  borderLeft: `1px solid ${COLOR.border}`,
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  overflowY: "auto",
  color: COLOR.text,
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${SPACE.md}px ${SPACE.lg}px`,
  borderBottom: `1px solid ${COLOR.border}`,
  background: COLOR.surface,
  flexShrink: 0,
};

const sectionStyle = {
  padding: `${SPACE.lg}px`,
  borderBottom: `1px solid ${COLOR.border}`,
};

const fieldLabelStyle = {
  fontSize: "11px",
  fontWeight: 500,
  color: "#fff",
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  display: "block",
  marginBottom: SPACE.sm,
};

const selectStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "#fff",
  padding: "10px 32px 10px 12px",
  fontSize: "13px",
  appearance: "none",
  cursor: "pointer",
  outline: "none",
  transition: "all 0.2s",
};

const helpTextStyle = {
  marginTop: SPACE.sm,
  fontSize: "11px",
  color: "#777",
  lineHeight: 1.5,
  fontWeight: 400,
};

const noticeStyle = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-start",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "12px",
  fontSize: "11px",
  color: "#aaa",
  lineHeight: 1.5,
};

const noticeIconStyle = {
  flexShrink: 0,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "bold",
  fontSize: "10px"
};

/**
 * PropertiesPanel — Right sidebar.
 * Matches the "AI TRACE SETTINGS" design from the workspace screenshot.
 */
const PropertiesPanel = memo(function PropertiesPanel({
  project,
  traceState,
  isSavingCrop,
  userCredits,
  consoleRef,
  onExecuteTrace,
  onDownloadSvg,
  onDownloadRaster,
  onDownloadAll,
  onOpenCompare,
  onOpenCrop,
  onOpenRemoveBg,
  onOpenErase,
  onOpenTopUp,
}) {
  const [vectorColors, setVectorColors] = useState("auto");
  const [downloading, setDownloading] = useState(null);

  const isUnauthenticated = userCredits === null;
  const noCredits = !isUnauthenticated && userCredits < 12;
  const isCropped = project?.original_image_url?.includes("crop") || project?.generated_image_url;
  const isBusy = traceState !== "idle" || isSavingCrop;
  const hasSvg = !!project?.svg_url;

  const handleDownloadClick = async (type, handler) => {
    if (downloading) return;
    setDownloading(type);
    try {
      await handler();
    } finally {
      setDownloading(null);
    }
  };

  const traceButtonLabel = isSavingCrop
    ? "Saving Crop..."
    : traceState !== "idle"
    ? "Processing..."
    : isUnauthenticated
    ? "Login to Trace"
    : noCredits
    ? "Get More Credits"
    : !isCropped
    ? "Crop Image First"
    : "Run Syncraft (−12 Credits)";

  // "Unlocked" mirrors the original enable condition exactly — kept as its
  // own branch because this button has a 3-state style (busy / unlocked /
  // locked) that the simpler active/inactive secondary buttons don't need.
  const traceUnlocked = noCredits || isCropped;

  const svgActive = !!project?.svg_url && !downloading;
  const zipActive = !!project?.original_image_url && !downloading;
  const pngActive = !!project?.upscaled_image_url && !downloading;
  const compareActive = !!project?.svg_url;

  return (
    <aside style={panelStyle}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={headerStyle}>
        <span style={eyebrowStyle}>AI Trace Settings</span>
        <X size={13} color={COLOR.textFaint} style={{ cursor: "pointer" }} />
      </div>

      {/* ── Vector Engine ───────────────────────────────────── */}
      <div style={sectionStyle}>
        <label style={fieldLabelStyle}>Vector Engine (Beta)</label>
        <div style={{ position: "relative" }}>
          <select
            value={vectorColors}
            onChange={(e) => setVectorColors(e.target.value)}
            style={selectStyle}
            onFocus={e => e.target.style.borderColor = COLOR.accent}
            onBlur={e => e.target.style.borderColor = COLOR.inputBorder}
          >
            <option value="auto">Auto (Precision Balance)</option>
            <option value="16">16 Colors (High Detail)</option>
            <option value="8">8 Colors (Medium Detail)</option>
            <option value="4">4 Colors (Merges Shadows)</option>
            <option value="2">2 Colors (Solid / Line Art)</option>
          </select>
          <ChevronDown size={13} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: COLOR.textMuted, pointerEvents: "none" }} />
        </div>
        <p style={helpTextStyle}>
          Automatically balances detail and performance for the best vector output.
        </p>
      </div>

      {/* ── Notice ───────────────────────────────────────────── */}
      {/* Single always-visible notice — previously duplicated between an
          "Advanced Settings" accordion and the Actions section, toggling
          on the same collapse state and showing near-identical text. */}
      <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={noticeStyle}>
          <span style={noticeIconStyle}>!</span>
          <span>Image shows both the front and back of a shirt? Use the Crop Tool to isolate one side first, or tracing will fail.</span>
        </div>
      </div>

      {/* ── Activity Log ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "160px", borderBottom: `1px solid ${COLOR.border}` }}>
        <span style={{ ...eyebrowStyle, padding: `${SPACE.md}px ${SPACE.lg}px ${SPACE.sm}px` }}>Activity Log</span>
        <div className="console-area" ref={consoleRef} style={{ flex: 1, minHeight: "120px" }} />
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div style={{ ...sectionStyle, flexShrink: 0 }}>
        <span style={{ ...eyebrowStyle, display: "block", marginBottom: SPACE.md }}>Actions</span>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          <button
            onClick={onOpenRemoveBg}
            disabled={isBusy}
            style={secondaryBtnStyle(!isBusy)}
            onMouseOver={e => { if (!isBusy) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (!isBusy) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <ImageMinus size={14} /> Remove BG
          </button>
          <button
            onClick={onOpenErase}
            disabled={isBusy}
            style={secondaryBtnStyle(!isBusy)}
            onMouseOver={e => { if (!isBusy) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (!isBusy) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <Eraser size={14} /> Erase Noise
          </button>
          <button
            onClick={onOpenCrop}
            disabled={isBusy}
            style={secondaryBtnStyle(!isBusy)}
            onMouseOver={e => { if (!isBusy) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (!isBusy) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <Scissors size={14} /> Crop Region
          </button>
        </div>
      </div>

      {/* ── Exportation ────────────────────────────────────────── */}
      <div style={{ ...sectionStyle, flexShrink: 0, borderBottom: "none" }}>
        <span style={{ ...eyebrowStyle, display: "block", marginBottom: SPACE.md }}>Exportation</span>

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>

          {/* Primary slot: always the one next action, always first. */}
          {!hasSvg ? (
            <button
              onClick={() => {
                if (isBusy) return;
                if (isUnauthenticated || noCredits) { onOpenTopUp?.(); return; }
                if (isCropped) onExecuteTrace(vectorColors);
              }}
              disabled={isBusy || (!isCropped && !noCredits)}
              style={{
                width: "100%",
                background: isBusy ? "rgba(255,255,255,0.02)" : traceUnlocked ? "#ffffff" : "rgba(255,255,255,0.05)",
                border: isBusy ? "1px solid rgba(255,255,255,0.05)" : traceUnlocked ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: isBusy ? "#555" : traceUnlocked ? "#000000" : "#666",
                padding: "14px 16px",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.3px",
                whiteSpace: "nowrap",
                cursor: (!isBusy && traceUnlocked) ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACE.sm,
                opacity: isBusy ? 0.6 : 1,
                transition: "all 0.2s",
                boxShadow: (!isBusy && traceUnlocked) ? "0 4px 12px rgba(255,255,255,0.15)" : "none",
              }}
              onMouseOver={e => { if (!isBusy && traceUnlocked) e.currentTarget.style.background = "#e5e5e5"; }}
              onMouseOut={e => { if (!isBusy && traceUnlocked) e.currentTarget.style.background = "#ffffff"; }}
            >
              {traceButtonLabel}
            </button>
          ) : (
            <button
              onClick={() => handleDownloadClick('svg', onDownloadSvg)}
              disabled={!project?.svg_url || !!downloading}
              style={primaryBtnStyle(svgActive)}
              onMouseOver={e => { if (svgActive) e.currentTarget.style.background = "#e5e5e5"; }}
              onMouseOut={e => { if (svgActive) e.currentTarget.style.background = "#ffffff"; }}
            >
              {downloading === 'svg' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2.5} />}
              Export as SVG
            </button>
          )}

          {/* Secondary actions, in constant order regardless of pipeline stage. */}
          <button
            onClick={() => handleDownloadClick('all', onDownloadAll)}
            disabled={!zipActive}
            style={secondaryBtnStyle(zipActive)}
            onMouseOver={e => { if (zipActive) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (zipActive) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            {downloading === 'all' ? <Loader2 size={14} className="animate-spin" /> : <FolderDown size={14} />}
            Download All (ZIP)
          </button>

          <button
            onClick={() => handleDownloadClick('raster', onDownloadRaster)}
            disabled={!pngActive}
            style={secondaryBtnStyle(pngActive)}
            onMouseOver={e => { if (pngActive) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (pngActive) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            {downloading === 'raster' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export as PNG
          </button>

          <button
            onClick={onOpenCompare}
            disabled={!compareActive}
            style={secondaryBtnStyle(compareActive)}
            onMouseOver={e => { if (compareActive) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (compareActive) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <Monitor size={14} />
            Before / After Compare
          </button>

        </div>
      </div>
    </aside>
  );
});

function primaryBtnStyle(active) {
  return {
    width: "100%",
    background: active ? "#ffffff" : "rgba(255,255,255,0.05)",
    border: active ? "1px solid #ffffff" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: active ? "#000000" : "#666",
    padding: "14px 16px",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.3px",
    cursor: active ? "pointer" : "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    transition: "all 0.2s",
    boxShadow: active ? "0 4px 12px rgba(255,255,255,0.15)" : "none",
  };
}

function secondaryBtnStyle(active) {
  return {
    width: "100%",
    background: COLOR.surface,
    border: `1px solid ${COLOR.border}`,
    borderRadius: RADIUS,
    color: active ? "#bbb" : COLOR.textFaint,
    padding: "10px 16px",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    cursor: active ? "pointer" : "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    opacity: active ? 1 : 0.45,
    transition: "all 0.2s",
  };
}

export default PropertiesPanel;
