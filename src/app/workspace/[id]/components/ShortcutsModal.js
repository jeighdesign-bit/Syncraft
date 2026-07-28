"use client";

import { memo } from "react";
import { Keyboard, X } from "lucide-react";

const SHORTCUTS = [
  { label: "Pan Canvas", key: "Hold Space + Drag" },
  { label: "Fit to Screen", key: "F" },
  { label: "Reset View (1:1)", key: "Esc" },
  { label: "Zoom In / Out", key: "Mouse Wheel" },
];

const ShortcutsModal = memo(function ShortcutsModal({ show, onClose }) {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="modal-content" style={{ maxWidth: "420px", background: "rgba(18, 18, 18, 0.85)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)", backdropFilter: "blur(12px)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#fff", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "0.5px" }}>
            <Keyboard size={18} color="#d4ff59" /> Keyboard Shortcuts
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px", borderRadius: "50%", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }} onMouseOut={e => { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "transparent"; }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {SHORTCUTS.map(({ label, key }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#aaa", fontSize: "14px", fontWeight: "400" }}>{label}</span>
              <span style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "500", letterSpacing: "0.5px" }}>{key}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "32px", textAlign: "center" }}>
          <button
            onClick={onClose}
            style={{ width: "100%", padding: "14px 16px", background: "#ffffff", color: "#000", border: "1px solid #ffffff", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 12px rgba(255,255,255,0.15)" }}
            onMouseOver={e => e.currentTarget.style.background = "#e5e5e5"}
            onMouseOut={e => e.currentTarget.style.background = "#ffffff"}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
});

export default ShortcutsModal;
