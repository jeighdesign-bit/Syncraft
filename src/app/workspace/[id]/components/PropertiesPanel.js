"use client";

import { memo, useRef, useState } from "react";
import { Download, Columns2, FolderDown, Loader2, X, ImageMinus, Eraser, Scissors, Expand, WandSparkles, ArrowUp } from "lucide-react";
import Select from '@/components/Select';
import styles from './PropertiesPanel.module.css';
import { CREDIT_COST } from "@/lib/pricing";
import CreditAmount from '@/components/CreditAmount';
import { DEFAULT_EXTRACTION_RESOLUTION, EXTRACTION_RESOLUTIONS, extractionCredits, extractionDisplayName, supportsExtractionResolution } from '@/lib/extractionResolution.mjs';
import { canResumeTraceUpscale } from "@/lib/traceRequestPolicy.mjs";
import { REFERENCE_CATEGORIES, normalizeReferenceCategory } from "@/lib/referenceCategories.mjs";
import { UNIVERSAL_AVAILABLE, UNIVERSAL_UNAVAILABLE_MESSAGE, isUniversalTraceType } from "@/lib/universalAvailability.mjs";
import { finalArtworkRaster } from '@/lib/artworkExport.mjs';

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
  justifyContent: "center",
  height: "48px",
  boxSizing: "border-box",
  padding: `0 ${SPACE.lg}px`,
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

const VECTOR_COLOR_OPTIONS = [
  { value: 'auto', label: 'Auto (Precision Balance)' },
  { value: '16', label: '16 Colors (High Detail)' },
  { value: '8', label: '8 Colors (Medium Detail)' },
  { value: '4', label: '4 Colors (Merges Shadows)' },
  { value: '2', label: '2 Colors (Solid / Line Art)' },
];

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

function AdobeAppIcon({ app, active = true }) {
  const isPhotoshop = app === "ps";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderRadius: 3,
        border: "1px solid rgba(255,255,255,0.8)",
        background: "#050505",
        color: "#ffffff",
        fontSize: 9,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: "-0.25px",
        opacity: active ? 1 : 0.4,
      }}
    >
      {isPhotoshop ? "Ps" : "Ai"}
    </span>
  );
}

/**
 * PropertiesPanel — Right sidebar.
 * Matches the "AI TRACE SETTINGS" design from the workspace screenshot.
 */
const PropertiesPanel = memo(function PropertiesPanel({
  project,
  traceState,
  isSavingCrop,
  userCredits,
  extractionResolution = DEFAULT_EXTRACTION_RESOLUTION,
  onExtractionResolutionChange,
  consoleRef,
  onExecuteTrace,
  onRetryVector,
  onResumeUpscale,
  onDownloadSvg,
  onDownloadPsd,
  onDownloadRaster,
  onDownloadAll,
  onOpenCompare,
  onOpenCrop,
  onOpenRemoveBg,
  onOpenErase,
  onOpenAiEdit,
  onOpenTopUp,
  // Lifted to page.js: Extend Design re-runs the vectorize stage from there, so
  // the colour setting can no longer live only in this component.
  vectorColors,
  onVectorColorsChange,
  onReferenceCategoryChange,
  isSavingReferenceCategory = false,
  // Extend Design (in-canvas). The "Extend Design" action button becomes the
  // Proceed button while extendMode is on — same spot, per the requested flow.
  extendMode = false,
  extendProcessing = false,
  extendCanProceed = false,
  onEnterExtend,
  onProceedExtend,
  onCancelExtend,
  readOnly = false,
}) {
  const [downloading, setDownloading] = useState(null);
  const [exportError, setExportError] = useState('');
  const generationBarRef = useRef(null);

  const isUnauthenticated = userCredits === null;
  const executionCost = extractionCredits(extractionResolution, project?.trace_type);
  const noCredits = !isUnauthenticated && userCredits < executionCost;
  const isCropped = project?.original_image_url?.includes("crop") || project?.generated_image_url;
  const isBusy = traceState !== "idle" || isSavingCrop || extendMode || isSavingReferenceCategory;
  const isUniversal = project?.trace_type === "universal";
  const universalUnavailable = !UNIVERSAL_AVAILABLE && isUniversalTraceType(project?.trace_type);
  // Availability blocks creation/editing only. Real sharing permissions still
  // control exports, so owners can download their existing saved work.
  const editsLocked = readOnly || universalUnavailable;
  const editingAction = handler => (...args) => { if (!editsLocked) return handler?.(...args); };
  const referenceCategory = normalizeReferenceCategory(project?.canvas_data?.reference_category);
  const hasSvg = !!project?.svg_url;
  const canRetryVector = !!project?.upscaled_image_url && !hasSvg;
  const canResumeUpscale = canResumeTraceUpscale(project);
  // 'REFUNDED' is the sentinel a failed trace leaves in generated_image_url.
  const canExtend = !!project?.generated_image_url && project.generated_image_url !== "REFUNDED";

  const handleDownloadClick = async (type, handler) => {
    if (downloading || readOnly) return;
    setExportError('');
    setDownloading(type);
    try {
      await handler();
    } catch (error) {
      setExportError(error.message || 'Download failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const traceButtonLabel = universalUnavailable
    ? "Temporarily Unavailable"
    : isSavingCrop
    ? "Saving Crop..."
    : traceState !== "idle"
    ? "Processing..."
    : canRetryVector
    ? "Retry Syncraft Vector"
    : canResumeUpscale
    ? "Resume Syncraft Upscale (Free)"
    : isUnauthenticated
    ? "Login to Trace"
    : noCredits
    ? "Get More Credits"
    : !isCropped
    ? "Crop Image First"
    : "Generate Now";

  const showResolutionBar = supportsExtractionResolution(project) && !canRetryVector && !canResumeUpscale;
  const generationName = canRetryVector ? 'Syncraft Vector' : canResumeUpscale ? 'Syncraft Upscale'
    : extractionDisplayName(extractionResolution);
  const generationCost = canRetryVector ? null : canResumeUpscale ? 'Free' : executionCost;
  const runTrace = () => {
    if (editsLocked || isBusy) return;
    if (canRetryVector) { onRetryVector?.(vectorColors); return; }
    if (canResumeUpscale) { onResumeUpscale?.(vectorColors); return; }
    if (isUnauthenticated || noCredits) { onOpenTopUp?.(); return; }
    if (isCropped) onExecuteTrace(vectorColors);
  };

  const svgActive = !readOnly && !!project?.svg_url && !downloading;
  const psdActive = !readOnly && !!project?.svg_url && !downloading && !isBusy;
  const pngActive = !readOnly && !!finalArtworkRaster(project) && !downloading && !isBusy;
  const zipActive = !readOnly && (!!finalArtworkRaster(project) || hasSvg) && !downloading && !isBusy;
  const compareActive = !!project?.svg_url;
  const generationDetails = <>
    <span className={styles.resolutionValue}>{generationName}</span>
    {generationCost !== null && <span className={styles.creditCost} aria-live="polite" aria-atomic="true">{typeof generationCost === 'number' ? <CreditAmount amount={generationCost} /> : generationCost}</span>}
  </>;

  return (
    <aside className="workspace-properties" style={panelStyle}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={headerStyle}>
        <span style={eyebrowStyle}>AI Trace Settings</span>
      </div>

      {readOnly && (
        <div role="status" style={{ ...noticeStyle, margin: `${SPACE.md}px ${SPACE.lg}px 0`, borderColor: "rgba(212,255,89,0.22)" }}>
          <span style={{ ...noticeIconStyle, color: COLOR.accent }}>i</span>
          <span>View-only access. Editing tools and exports are locked.</span>
        </div>
      )}

      {universalUnavailable && (
        <div role="status" style={{ ...noticeStyle, margin: `${SPACE.md}px ${SPACE.lg}px 0`, borderColor: "rgba(212,255,89,0.22)" }}>
          <span style={{ ...noticeIconStyle, color: COLOR.accent }}>i</span>
          <div>
            <strong style={{ display: "block", color: COLOR.text, marginBottom: 4 }}>Temporarily Unavailable</strong>
            <span>{UNIVERSAL_UNAVAILABLE_MESSAGE} {readOnly ? 'Saved files remain available to view.' : 'You can still view and download saved files.'}</span>
          </div>
        </div>
      )}

      {/* ── Reference category / vector settings ─────────────── */}
      <div style={sectionStyle}>
        <label htmlFor="workspace-reference-setting" style={fieldLabelStyle}>{isUniversal ? 'Reference Category' : 'Vector Engine (Beta)'}</label>
        <div style={{ display: 'grid', minWidth: 0 }}>
          <Select
            id="workspace-reference-setting"
            aria-label={isUniversal ? 'Reference Category' : 'Vector Engine (Beta)'}
            aria-describedby="workspace-reference-help"
            disabled={editsLocked || (isUniversal && isBusy)}
            value={isUniversal ? referenceCategory : vectorColors}
            onChange={(e) => { if (!editsLocked) return isUniversal ? onReferenceCategoryChange?.(e.target.value) : onVectorColorsChange(e.target.value); }}
          >
            {(isUniversal ? REFERENCE_CATEGORIES : VECTOR_COLOR_OPTIONS).map(category => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </Select>
        </div>
        <p id="workspace-reference-help" role={isSavingReferenceCategory ? 'status' : undefined} style={helpTextStyle}>
          {isUniversal
            ? isSavingReferenceCategory ? 'Saving category...' : REFERENCE_CATEGORIES.find(category => category.value === referenceCategory).description
            : 'Automatically balances detail and performance for the best vector output.'}
        </p>
      </div>

      {/* ── Notice ───────────────────────────────────────────── */}
      {/* Single always-visible notice — previously duplicated between an
          "Advanced Settings" accordion and the Actions section, toggling
          on the same collapse state and showing near-identical text. */}
      {!universalUnavailable && <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={noticeStyle}>
          <span style={noticeIconStyle}>!</span>
          <span>{project?.trace_type === "universal"
            ? "Crop around the complete visible printed design. Hidden, cropped, or wrapped-back areas will not be claimed as exact."
            : "Not satisfied with the result? Run it again—AI can make mistakes or generate random details."}</span>
        </div>
      </div>}

      {/* ── Activity Log ─────────────────────────────────────── */}
      <div className={styles.activitySection}>
        <span className={styles.activityHeading} style={eyebrowStyle}>Activity</span>
        <div className="console-area" ref={consoleRef} role="log" aria-label="Generation activity" aria-live="polite" aria-relevant="additions text" />
        <div className={styles.activityEmpty}>
          <p className={styles.activityEmptyTitle}>Ready when you are</p>
          <p className={styles.activityEmptyHint}>Choose 1K, 2K or 4K, then tap ↑ to start. Progress will appear here.</p>
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div style={{ ...sectionStyle, flexShrink: 0 }}>
        <span style={{ ...eyebrowStyle, display: "block", marginBottom: SPACE.md }}>Actions</span>
        <div className="workspace-tool-list" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <button
            type="button"
            onClick={editingAction(onOpenAiEdit)}
            disabled={editsLocked || isBusy || !canExtend}
            style={secondaryBtnStyle(!editsLocked && !isBusy && canExtend)}
            title={canExtend ? "Describe a change to your generated artwork" : "Generate artwork first to unlock AI Edit"}
          >
            <WandSparkles size={14} aria-hidden="true" /> AI Edit <span className="workspace-tool-new" style={{ marginLeft: 0 }}>NEW</span><CreditAmount className={styles.actionCost} amount={CREDIT_COST.artworkEdit} unit="" />
          </button>
          <button
            onClick={editingAction(onOpenRemoveBg)}
            disabled={editsLocked || isBusy}
            style={secondaryBtnStyle(!editsLocked && !isBusy)}
            onMouseOver={e => { if (!editsLocked && !isBusy) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (!editsLocked && !isBusy) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <ImageMinus size={14} /> Remove BG <CreditAmount className={styles.actionCost} amount={CREDIT_COST.removeBg} unit="" />
          </button>
          <button
            onClick={editingAction(onOpenErase)}
            disabled={editsLocked || isBusy}
            style={secondaryBtnStyle(!editsLocked && !isBusy)}
            onMouseOver={e => { if (!editsLocked && !isBusy) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (!editsLocked && !isBusy) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <Eraser size={14} /> Erase Noise
          </button>
          <button
            onClick={editingAction(onOpenCrop)}
            disabled={editsLocked || isBusy}
            style={secondaryBtnStyle(!editsLocked && !isBusy)}
            onMouseOver={e => { if (!editsLocked && !isBusy) e.currentTarget.style.borderColor = "#484848"; }}
            onMouseOut={e => { if (!editsLocked && !isBusy) e.currentTarget.style.borderColor = COLOR.border; }}
          >
            <Scissors size={14} /> Crop Region
          </button>
          {/* Extend operates on the flat extract rather than the original upload,
              so it only unlocks once Stage 1 has produced one. In extend mode this
              same button becomes the Proceed/generate action (per the requested
              flow), with a Cancel beneath it. */}
          {!extendMode ? (
            <button
              onClick={editingAction(onEnterExtend)}
              disabled={editsLocked || isBusy || !canExtend}
              style={secondaryBtnStyle(!editsLocked && !isBusy && canExtend)}
              onMouseOver={e => { if (!editsLocked && !isBusy && canExtend) e.currentTarget.style.borderColor = "#484848"; }}
              onMouseOut={e => { if (!editsLocked && !isBusy && canExtend) e.currentTarget.style.borderColor = COLOR.border; }}
              title={canExtend ? "Drag the canvas edges to add space, then generate" : "Run Syncraft first — Extend works on the flat extract"}
            >
              <Expand size={14} /> Extend Design <CreditAmount className={styles.actionCost} amount={CREDIT_COST.extend} unit="" />
            </button>
          ) : (
            <>
              <button
                className="workspace-tool-primary"
                onClick={editingAction(onProceedExtend)}
                disabled={editsLocked || !extendCanProceed || extendProcessing}
                style={primaryExtendBtnStyle(!editsLocked && extendCanProceed && !extendProcessing)}
              >
                {extendProcessing ? (
                  <><Loader2 size={14} className="animate-spin" /> Extending…</>
                ) : (
                  <><Expand size={14} /> Extend Design <CreditAmount amount={CREDIT_COST.extend} unit="" /></>
                )}
              </button>
              <button
                onClick={onCancelExtend}
                disabled={extendProcessing}
                style={secondaryBtnStyle(!extendProcessing)}
                onMouseOver={e => { if (!extendProcessing) e.currentTarget.style.borderColor = "#484848"; }}
                onMouseOut={e => { if (!extendProcessing) e.currentTarget.style.borderColor = COLOR.border; }}
              >
                <X size={14} /> Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Run Syncraft and Compare intentionally share one workflow slot. Once
          an SVG exists, Compare replaces Run without becoming an export item. */}
      <div style={{ ...sectionStyle, flexShrink: 0 }}>
        {!hasSvg ? (
          <>
            <div className={styles.generationBar} ref={generationBarRef}>
              {showResolutionBar ? <div className={styles.resolutionPicker}>
                <Select compact portal portalAnchorRef={generationBarRef} displayLabel={generationDetails} aria-label="Extraction resolution" value={extractionResolution}
                  disabled={editsLocked || isBusy}
                  onChange={event => { if (!editsLocked && !isBusy) onExtractionResolutionChange?.(event.target.value); }}>
                  {EXTRACTION_RESOLUTIONS.map(option => <option key={option.value} value={option.value}>{option.label} · {option.value} — {extractionCredits(option.value, project?.trace_type)} credits</option>)}
                </Select>
              </div> : <div className={styles.generationDetails} data-disabled={editsLocked || isBusy}>{generationDetails}</div>}
              <button type="button" className={styles.generateButton}
                onClick={runTrace} disabled={editsLocked || isBusy || (!isCropped && !noCredits)}
                aria-label={traceButtonLabel === 'Generate Now' ? `Generate now with ${generationName} at ${extractionResolution} for ${executionCost} credits` : traceButtonLabel}
                title={traceButtonLabel === 'Generate Now' ? `${generationName} · ${executionCost} credits` : traceButtonLabel}
                aria-busy={isBusy}>
                <span className={styles.generateCircle}>
                  {isBusy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={20} strokeWidth={1.8} aria-hidden="true" />}
                </span>
              </button>
            </div>
            {!isBusy && traceButtonLabel !== 'Generate Now' && <p className={styles.generationStatus} role="status">{traceButtonLabel}</p>}
          </>
        ) : (
          <button
            type="button"
            onClick={onOpenCompare}
            disabled={!compareActive}
            className={`${styles.generationBar} ${styles.compareBar}`}
            title="Compare the original image and your result"
          >
            <span className={styles.compareLabel}>
              <Columns2 size={16} strokeWidth={1.7} aria-hidden="true" />
              <span>Compare before &amp; after</span>
            </span>
          </button>
        )}
      </div>

      {/* ── Exportation ────────────────────────────────────────── */}
      <div style={{ ...sectionStyle, flexShrink: 0, borderBottom: "none" }}>
        <span style={{ ...eyebrowStyle, display: "block", marginBottom: SPACE.md }}>Exportation</span>

        <div className="workspace-tool-list" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <button disabled={!svgActive} style={secondaryBtnStyle(svgActive)} onClick={() => handleDownloadClick('svg', onDownloadSvg)} title={hasSvg ? 'Download the saved vector' : 'Generate the Vector SVG first'}>
            {downloading === 'svg' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <AdobeAppIcon app="ai" active={svgActive} />} Export as SVG
          </button>
          <button disabled={!psdActive} style={secondaryBtnStyle(psdActive)} onClick={() => handleDownloadClick('psd', onDownloadPsd)} title={hasSvg ? 'Create a PSD with rasterized SVG layers' : 'Generate the Vector SVG first'}>
            {downloading === 'psd' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <AdobeAppIcon app="ps" active={psdActive} />} {downloading === 'psd' ? 'Preparing PSD…' : 'Export as PSD'}
          </button>
          <button onClick={() => handleDownloadClick('raster', () => onDownloadRaster('png'))} disabled={!pngActive} style={secondaryBtnStyle(pngActive)}>
            {downloading === 'raster' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
            {downloading === 'raster' ? 'Preparing PNG…' : 'Export as PNG'}
          </button>
          <button disabled={!pngActive} style={secondaryBtnStyle(pngActive)} onClick={() => handleDownloadClick('jpg', () => onDownloadRaster('jpg'))} title="JPEG uses a white background for transparent areas">
            {downloading === 'jpg' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />} {downloading === 'jpg' ? 'Preparing JPEG…' : 'Export as JPEG'}
          </button>
          <button type="button" disabled={!zipActive} onClick={() => handleDownloadClick('all', onDownloadAll)} style={secondaryBtnStyle(zipActive)}>
            {downloading === 'all' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FolderDown size={14} aria-hidden="true" />} {downloading === 'all' ? 'Preparing ZIP…' : 'Download all files (ZIP)'}
          </button>
          {exportError && <p role="alert" style={{ color: COLOR.dangerText, fontSize: 12, margin: '8px 0 0' }}>{exportError}</p>}
        </div>
      </div>
    </aside>
  );
});

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

// Accent "Proceed" button shown in the Actions slot during extend mode.
function primaryExtendBtnStyle(active) {
  return {
    width: "100%",
    background: active ? COLOR.accent : "rgba(212,255,89,0.15)",
    border: `1px solid ${active ? COLOR.accent : "rgba(212,255,89,0.3)"}`,
    borderRadius: RADIUS,
    color: active ? COLOR.accentText : "#7a7f6a",
    padding: "10px 16px",
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    cursor: active ? "pointer" : "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    transition: "all 0.2s",
  };
}

export default PropertiesPanel;
