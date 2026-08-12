"use client";

import { memo, useEffect, useState } from "react";
import { Download, Info, Loader2, Monitor, ShieldCheck, Wand2 } from "lucide-react";
import { CREDIT_COST } from "@/lib/pricing";

const colors = {
  panel: "#181818",
  surface: "#1e1e1e",
  border: "#2a2a2a",
  text: "#e2e2e2",
  muted: "#8a8a8a",
  faint: "#5a5a5a",
  accent: "#d4ff59",
};

const GENERATION_ACTIVITY = [
  "Preparing the source image…",
  "Analyzing edges and fine details…",
  "Enhancing textures and clarity…",
  "Building the 4× HD result…",
  "Saving the image to project storage…",
];

const buttonStyle = (active, primary = false) => ({
  width: "100%",
  minHeight: "44px",
  padding: "11px 14px",
  borderRadius: "8px",
  border: `1px solid ${active && primary ? colors.accent : colors.border}`,
  background: active && primary ? colors.accent : colors.surface,
  color: active ? (primary ? "#0a0a0a" : "#c8c8c8") : colors.faint,
  cursor: active ? "pointer" : "not-allowed",
  opacity: active ? 1 : 0.5,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
});

const UpscalePropertiesPanel = memo(function UpscalePropertiesPanel({
  project,
  status,
  error,
  userCredits,
  onGenerate,
  onDownload,
  onCompare,
  onOpenTopUp,
}) {
  const [downloading, setDownloading] = useState(false);
  const [visibleActivityCount, setVisibleActivityCount] = useState(1);
  const legacyResult = status === "legacy";
  const hasResult = !!project?.generated_image_url && !legacyResult;
  const busy = status === "processing";
  const noCredits = userCredits !== null && userCredits < CREDIT_COST.upscale;

  useEffect(() => {
    if (!busy) {
      setVisibleActivityCount(1);
      return;
    }

    setVisibleActivityCount(1);
    const timers = [1800, 4200, 7200, 11000].map((delay, index) => (
      window.setTimeout(() => setVisibleActivityCount(index + 2), delay)
    ));
    return () => timers.forEach(window.clearTimeout);
  }, [busy]);

  const handleDownload = async () => {
    if (!hasResult || downloading) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <aside style={{ width: "280px", background: colors.panel, borderLeft: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto", color: colors.text }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${colors.border}`, background: colors.surface }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>AI Upscale Settings</span>
      </div>

      <div style={{ padding: "16px", borderBottom: `1px solid ${colors.border}` }}>
        <span style={{ display: "block", marginBottom: "10px", color: colors.muted, fontSize: "10px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>Output</span>
        <div style={{ padding: "12px", border: `1px solid ${colors.border}`, borderRadius: "8px", background: "rgba(255,255,255,0.025)" }}>
          <div style={{ color: "#fff", fontSize: "13px", fontWeight: 600, marginBottom: "5px" }}>4× HD image</div>
          <div style={{ color: colors.muted, fontSize: "11px", lineHeight: 1.5 }}>Enhances detail and resolution while preserving the original aspect ratio.</div>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="false" style={{ padding: "16px", borderBottom: `1px solid ${colors.border}`, flex: 1, minHeight: "170px" }}>
        <span style={{ display: "block", marginBottom: "12px", color: colors.muted, fontSize: "10px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>Activity</span>
        {busy ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
            {GENERATION_ACTIVITY.slice(0, visibleActivityCount).map((message, index) => {
              const isCurrent = index === visibleActivityCount - 1;
              return (
                <div key={message} style={{ display: "flex", gap: "9px", alignItems: "flex-start", color: isCurrent ? "#c8c8c8" : colors.muted, fontSize: "11px", lineHeight: 1.45 }}>
                  {isCurrent ? (
                    <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0, marginTop: "1px", color: colors.accent }} />
                  ) : (
                    <span aria-hidden="true" style={{ width: "6px", height: "6px", margin: "5px 4px 0", borderRadius: "50%", background: colors.accent, opacity: 0.65, flexShrink: 0 }} />
                  )}
                  <span>{message}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "9px", color: error ? "#ff9d9d" : colors.muted, fontSize: "11px", lineHeight: 1.55 }}>
            {hasResult ? <ShieldCheck size={15} color={colors.accent} style={{ flexShrink: 0 }} /> : <Info size={15} style={{ flexShrink: 0 }} />}
            <span>{error || (hasResult
              ? "Upscale complete. The result is stored with this project and remains available after refresh."
              : legacyResult
              ? "This older result used temporary provider storage. Restore it to permanent project storage at no extra charge."
              : `Ready to upscale. This operation uses ${CREDIT_COST.upscale} credits.`)}</span>
          </div>
        )}
      </div>

      <div style={{ padding: "16px", borderBottom: `1px solid ${colors.border}` }}>
        <span style={{ display: "block", marginBottom: "12px", color: colors.muted, fontSize: "10px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>Actions</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {!hasResult && (
            <button
              type="button"
              disabled={busy}
              onClick={!legacyResult && noCredits ? onOpenTopUp : onGenerate}
              style={buttonStyle(!busy, true)}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {busy ? "Generating…" : legacyResult ? "Restore Result (Free)" : noCredits ? "Get More Credits" : `Generate (−${CREDIT_COST.upscale})`}
            </button>
          )}
          <button type="button" disabled={!hasResult || downloading} onClick={handleDownload} style={buttonStyle(hasResult && !downloading)}>
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Download PNG
          </button>
          <button type="button" disabled={!hasResult} onClick={onCompare} style={buttonStyle(hasResult)}>
            <Monitor size={15} /> Before / After
          </button>
        </div>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", gap: "9px", color: colors.muted, fontSize: "10.5px", lineHeight: 1.5 }}>
        <ShieldCheck size={14} color={colors.accent} style={{ flexShrink: 0, marginTop: "1px" }} />
        <span>Uploaded and generated project assets follow Syncraft’s 3-day privacy lifecycle.</span>
      </div>
    </aside>
  );
});

export default UpscalePropertiesPanel;
