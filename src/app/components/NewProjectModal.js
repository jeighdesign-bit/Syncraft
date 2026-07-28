"use client";

import { memo, useState } from "react";
import { Shirt, X, Scissors } from "lucide-react";

const LogoIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 9h8M8 12h5M8 15h3"/>
  </svg>
);

function TraceOptionCard({ value, current, onChange, title, description }) {
  const active = current === value;
  return (
    <div
      onClick={() => onChange(value)}
      style={{
        display: "flex", alignItems: "flex-start", gap: "14px",
        padding: "16px 18px",
        border: active ? "1px solid #d4ff59" : "1px solid #333",
        borderRadius: "10px", cursor: "pointer",
        background: active ? "linear-gradient(180deg, rgba(212, 255, 89, 0.08) 0%, rgba(212, 255, 89, 0.02) 100%)" : "linear-gradient(180deg, #1a1a1a 0%, #151515 100%)",
        boxShadow: active ? "0 4px 20px rgba(212, 255, 89, 0.08)" : "none",
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = "#555"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = "#333"; }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        border: active ? "1px solid #d4ff59" : "1px solid #555",
        background: active ? "rgba(212, 255, 89, 0.2)" : "transparent",
        transition: "all 0.2s",
      }}>
        {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d4ff59", boxShadow: "0 0 6px rgba(212,255,89,0.8)" }} />}
      </div>
      <div>
        <p style={{ margin: "0 0 4px 0", color: active ? "#fff" : "#e2e2e2", fontSize: "14px", fontWeight: 600, letterSpacing: "0.2px" }}>{title}</p>
        <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>{description}</p>
      </div>
    </div>
  );
}

const NewProjectModal = memo(function NewProjectModal({
  show,
  projectName,
  setProjectName,
  traceType,
  setTraceType,
  isUploading,
  onClose,
  onSelectImage,
  onSelectBgRemover,
}) {
  const [step, setStep] = useState("category");
  const [category, setCategory] = useState(null);

  if (!show) return null;

  const handleCategorySelect = (cat) => {
    setCategory(cat);
    if (cat === "bg_remover") {
      // Skip details step — trigger file upload immediately
      onSelectBgRemover?.();
      handleClose();
      return;
    }
    if (cat === "logo") {
      setTraceType("logo");
    } else {
      setTraceType("mockup_erase");
    }
    setStep("details");
  };

  const handleBack = () => {
    setStep("category");
    setCategory(null);
  };

  const handleClose = () => {
    setStep("category");
    setCategory(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: step === "category" ? 540 : 480, position: "relative", transition: "max-width 0.3s ease", width: "100%" }}>

        <button
          onClick={handleClose}
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", borderRadius: "50%", padding: 4, transition: "all 0.2s" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; e.currentTarget.style.background = "none"; }}
        >
          <X size={18} />
        </button>

        {step === "category" && (
          <>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.5px", color: "#fff" }}>What are you tracing?</h2>
            <p style={{ margin: "0 0 28px 0", color: "#9ca3af", fontSize: "14px", letterSpacing: "0.2px" }}>Choose a category to get started.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                onClick={() => handleCategorySelect("garment")}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", border: "1px solid #333", borderRadius: 12, cursor: "pointer", background: "linear-gradient(180deg, #1a1a1a 0%, #151515 100%)", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative", overflow: "hidden" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d4ff59"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)"; e.currentTarget.children[0].style.background = "rgba(212, 255, 89, 0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.children[0].style.background = "#222"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 10, background: "#222", color: "#d4ff59", transition: "background 0.2s", flexShrink: 0 }}>
                  <Shirt size={22} strokeWidth={1.5} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#fff", fontSize: "15px", fontWeight: 600, letterSpacing: "0px" }}>Garment Pattern Extraction</p>
                  <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>Jerseys, shirts, mockups — extract the flat pattern as a production-ready SVG.</p>
                </div>
              </div>

              <div
                onClick={() => handleCategorySelect("logo")}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", border: "1px solid #333", borderRadius: 12, cursor: "pointer", background: "linear-gradient(180deg, #1a1a1a 0%, #151515 100%)", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative", overflow: "hidden" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d4ff59"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)"; e.currentTarget.children[0].style.background = "rgba(212, 255, 89, 0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.children[0].style.background = "#222"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 10, background: "#222", color: "#d4ff59", transition: "background 0.2s", flexShrink: 0 }}>
                  <LogoIcon />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#fff", fontSize: "15px", fontWeight: 600, letterSpacing: "0px" }}>Logo / Wordmark Tracing</p>
                  <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>Icons, emblems, wordmarks — vectorize with exact mathematical color and text precision.</p>
                </div>
              </div>

              <div
                onClick={() => handleCategorySelect("bg_remover")}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", border: "1px solid #333", borderRadius: 12, cursor: "pointer", background: "linear-gradient(180deg, #1a1a1a 0%, #151515 100%)", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative", overflow: "hidden" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d4ff59"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)"; e.currentTarget.children[0].style.background = "rgba(212, 255, 89, 0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.children[0].style.background = "#222"; }}
              >
                <div style={{ position: "absolute", top: 18, right: 20, background: "rgba(212, 255, 89, 0.15)", color: "#d4ff59", fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.5px", border: "1px solid rgba(212, 255, 89, 0.3)" }}>AI</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 10, background: "#222", color: "#d4ff59", transition: "background 0.2s", flexShrink: 0 }}>
                  <Scissors size={22} strokeWidth={1.5} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, paddingRight: 40 }}>
                  <p style={{ margin: "0 0 6px 0", color: "#fff", fontSize: "15px", fontWeight: 600, letterSpacing: "0px" }}>Background Remover</p>
                  <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>Remove backgrounds instantly with AI — perfect for products & portraits.</p>
                </div>
              </div>
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <button
              onClick={handleBack}
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "12px", padding: "0 0 20px 0", display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600, transition: "all 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.transform = "translateX(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.transform = "translateX(0)"; }}
            >
              ← Back
            </button>

            <h2 style={{ margin: "0 0 24px 0", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.5px", color: "#fff" }}>
              {category === "logo" ? "Logo / Wordmark Trace" : "Garment Trace"}
            </h2>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="modal-input"
                placeholder="e.g. Guardians Jersey 2025"
                style={{ width: "100%", background: "#1a1a1a", border: "1px solid #333", padding: "12px 14px", borderRadius: 8, color: "#fff", fontSize: "14px", transition: "border-color 0.2s", outline: "none" }}
                onFocus={(e) => e.target.style.borderColor = "#d4ff59"}
                onBlur={(e) => e.target.style.borderColor = "#333"}
              />
            </div>

            {category === "garment" && (
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label style={{ display: "block", marginBottom: 12, color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>Extraction Mode</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <TraceOptionCard
                    value="mockup_erase"
                    current={traceType}
                    onChange={setTraceType}
                    title="Extract Pattern Only"
                    description="Removes names, numbers, and logos — outputs a clean background pattern ready for re-printing."
                  />
                  <TraceOptionCard
                    value="mockup_preserve"
                    current={traceType}
                    onChange={setTraceType}
                    title="Keep All Artwork"
                    description="Preserves logos, chest badges, and design art exactly as they appear in the reference."
                  />
                </div>
              </div>
            )}

            {category === "logo" && (
              <div style={{ background: "linear-gradient(90deg, rgba(212, 255, 89, 0.05) 0%, rgba(212, 255, 89, 0.01) 100%)", borderLeft: "3px solid #d4ff59", borderRadius: "0 8px 8px 0", padding: "14px 16px", marginBottom: 24 }}>
                <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", lineHeight: 1.6 }}>
                  Works for <strong style={{ color: "#d4ff59", fontWeight: 600 }}>icons, emblems, combined logos, and text-only wordmarks.</strong> All text and colors will be preserved exactly as in the reference.
                </p>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleClose}>Cancel</button>
              <button className="btn-primary" onClick={onSelectImage} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Select Image & Create →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default NewProjectModal;
