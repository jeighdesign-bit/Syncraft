"use client";

import { memo, useState, useRef, useCallback } from "react";
import { Scissors, X } from "lucide-react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { fetchWithAuthRetry, uploadImageToStorage } from "@/utils/uploadClient";

/**
 * CropModal — Isolated crop modal with its own state.
 * Only mounted when `show` is true — no cost when hidden.
 */
const CropModal = memo(function CropModal({
  show,
  project,
  supabase,
  onClose,
  onCropApplied,
  onLoginRequired,
}) {
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [cropError, setCropError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const imgRef = useRef(null);
  const isUniversal = project?.trace_type === "universal";
  const isMandatoryUniversalCrop = isUniversal && !project?.generated_image_url;

  const handleApply = useCallback(async () => {
    if (!completedCrop || !imgRef.current || !completedCrop.width || !completedCrop.height) {
      if (!project?.generated_image_url) {
        setCropError(isUniversal
          ? "Please draw a crop around the complete visible printed design."
          : "Please draw a crop area first! You must choose either the front or the back.");
        return;
      }
      onClose();
      return;
    }

    const canvas = document.createElement("canvas");
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const MAX_SIZE = 1536;
    let targetWidth = completedCrop.width * scaleX;
    let targetHeight = completedCrop.height * scaleY;

    if (targetWidth > MAX_SIZE || targetHeight > MAX_SIZE) {
      const ratio = Math.min(MAX_SIZE / targetWidth, MAX_SIZE / targetHeight);
      targetWidth *= ratio;
      targetHeight *= ratio;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0, 0, targetWidth, targetHeight
    );

    if (!isUniversal) onClose();
    setIsSaving(true);

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.90));

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) {
        setIsSaving(false);
        onLoginRequired?.();
        return;
      }

      const croppedImageUrl = await uploadImageToStorage(blob, {
        token,
        fileName: `crop_${Date.now()}.jpg`,
        contentType: "image/jpeg",
      });

      const cropResult = await fetchWithAuthRetry("/api/crop", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId: project.id, croppedImageUrl: croppedImageUrl }),
      }, token);
      const res = cropResult.response;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onCropApplied?.(croppedImageUrl);
      if (isUniversal) onClose();
    } catch (err) {
      onCropApplied?.(null, err.message);
    } finally {
      setIsSaving(false);
    }
  }, [completedCrop, project, supabase, onClose, onCropApplied, onLoginRequired, isUniversal]);

  if (!show || !project) return null;

  return (
    <div className="modal-overlay" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="modal-content" style={{ maxWidth: "1000px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "rgba(18, 18, 18, 0.85)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)", borderRadius: "16px", padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", fontSize: "18px", fontWeight: "600", color: "#fff", letterSpacing: "0.5px" }}>
            <Scissors size={18} style={{ marginRight: "10px", color: "#d4ff59" }} />
            Crop Pattern Region
          </h3>
          {!isMandatoryUniversalCrop && (
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "50%", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }} onMouseOut={e => { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "transparent"; }}>
              <X size={20} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "20px", flex: 1, minHeight: 0, flexDirection: "row" }}>
          {/* Left Column: The Cropper */}
          <div style={{ flex: "1 1 65%", backgroundColor: "#0a0a0a", backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.1) 1.5px, transparent 1.5px)", backgroundSize: "24px 24px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", display: "flex", justifyContent: "center", alignItems: "center", padding: "16px", minHeight: "400px", overflow: "hidden" }}>
            <ReactCrop
              crop={crop}
              onChange={c => { setCrop(c); setCropError(""); }}
              onComplete={c => setCompletedCrop(c)}
              style={{ display: "flex", justifyContent: "center", alignItems: "center", maxWidth: "100%", maxHeight: "100%" }}
            >
              <img
                ref={imgRef}
                src={`/api/proxy?url=${encodeURIComponent(project.original_image_url)}`}
                alt="Crop source"
                style={{ maxHeight: "65vh", maxWidth: "100%", objectFit: "contain", display: "block", margin: "0 auto" }}
                crossOrigin="anonymous"
                onLoad={e => { imgRef.current = e.currentTarget; }}
              />
            </ReactCrop>
          </div>

          {/* Right Column: The Guide */}
          <div style={{ flex: "0 0 320px", backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "24px", overflowY: "auto" }}>
            <div>
              <h4 style={{ margin: "0 0 6px", color: "#fff", fontSize: "14px", fontWeight: "600", letterSpacing: "0.3px", display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#d4ff59" }} />
                Crop Guide
              </h4>
              <p style={{ fontSize: "12px", color: "#888", margin: 0, lineHeight: 1.5 }}>Help the AI focus by isolating the pattern correctly.</p>
            </div>
            {isUniversal ? (
              <>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80" }} />
                    DO: Include the Complete Visible Print
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Crop around all visible printable components. Include their edges and enough context to understand the layout.</p>
                  <div style={{ height: 140, background: "#111", borderRadius: 6, padding: 18, boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ border: "2px dashed #fff", borderRadius: 4, background: "linear-gradient(135deg,#263238,#5b7c8d)" }} />
                    <div style={{ border: "2px dashed #fff", borderRadius: 4, background: "linear-gradient(45deg,#56652a,#d4ff59)" }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ff4444" }} />
                    DON'T: Isolate One Small Fragment
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Do not crop away related visible panels or strap sections. Hidden areas will not be invented.</p>
                  <div style={{ height: 140, background: "#111", borderRadius: 6, position: "relative" }}>
                    <div style={{ position: "absolute", inset: 18, opacity: .35, background: "linear-gradient(90deg,#263238 48%,transparent 48%,transparent 52%,#64742d 52%)" }} />
                    <div style={{ position: "absolute", width: 44, height: 48, left: 34, top: 43, border: "2px dashed #666" }} />
                  </div>
                </div>
              </>
            ) : project?.trace_type === 'logo' ? (
              <>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80" }} />
                    DO: Crop Tightly Around Logo
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Remove as much empty background as possible. Keep the box snug to the logo edges.</p>
                  <svg viewBox="5 5 90 90" width="100%" height="140" style={{ display: "block", backgroundColor: "#111", borderRadius: "6px", padding: "10px", boxSizing: "border-box" }}>
                    <circle cx="50" cy="50" r="20" fill="#fff" />
                    <path d="M 40 50 L 60 50 M 50 40 L 50 60" stroke="#000" strokeWidth="4" />
                    <rect x="28" y="28" width="44" height="44" fill="transparent" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" />
                    <rect x="26" y="26" width="4" height="4" fill="#fff" />
                    <rect x="70" y="26" width="4" height="4" fill="#fff" />
                    <rect x="26" y="70" width="4" height="4" fill="#fff" />
                    <rect x="70" y="70" width="4" height="4" fill="#fff" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ff4444" }} />
                    DON'T: Include Extra Space
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Do not leave huge margins around the logo. This reduces the AI resolution.</p>
                  <svg viewBox="5 5 90 90" width="100%" height="140" style={{ display: "block", backgroundColor: "#111", borderRadius: "6px", padding: "10px", boxSizing: "border-box" }}>
                    <circle cx="50" cy="50" r="20" fill="#666" />
                    <path d="M 40 50 L 60 50 M 50 40 L 50 60" stroke="#111" strokeWidth="4" />
                    <rect x="5" y="5" width="90" height="90" fill="rgba(255, 255, 255, 0.02)" stroke="#555" strokeWidth="1.5" strokeDasharray="3 3" />
                    <rect x="3" y="3" width="4" height="4" fill="#555" />
                    <rect x="93" y="3" width="4" height="4" fill="#555" />
                    <rect x="3" y="93" width="4" height="4" fill="#555" />
                    <rect x="93" y="93" width="4" height="4" fill="#555" />
                  </svg>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80" }} />
                    DO: Crop Torso Only
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Exclude sleeves. Keep the box tight to the main body.</p>
                  <svg viewBox="5 5 90 90" width="100%" height="140" style={{ display: "block", backgroundColor: "#111", borderRadius: "6px", padding: "10px", boxSizing: "border-box" }}>
                    <path d="M 20 20 L 40 10 L 60 10 L 80 20 L 90 40 L 75 45 L 70 90 L 30 90 L 25 45 L 10 40 Z" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
                    <path d="M 35 30 L 65 50 M 35 50 L 65 70 M 35 70 L 65 90" stroke="#222" strokeWidth="1.5" />
                    <rect x="25" y="10" width="50" height="80" fill="rgba(255, 255, 255, 0.05)" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" />
                    <rect x="23" y="8" width="4" height="4" fill="#fff" />
                    <rect x="73" y="8" width="4" height="4" fill="#fff" />
                    <rect x="23" y="88" width="4" height="4" fill="#fff" />
                    <rect x="73" y="88" width="4" height="4" fill="#fff" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ff4444" }} />
                    DON'T: Include Sleeves
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>If you include sleeves, the AI will draw a shirt.</p>
                  <svg viewBox="5 5 90 90" width="100%" height="140" style={{ display: "block", backgroundColor: "#111", borderRadius: "6px", padding: "10px", boxSizing: "border-box" }}>
                    <path d="M 20 20 L 40 10 L 60 10 L 80 20 L 90 40 L 75 45 L 70 90 L 30 90 L 25 45 L 10 40 Z" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
                    <rect x="5" y="5" width="90" height="90" fill="rgba(255, 255, 255, 0.02)" stroke="#555" strokeWidth="1.5" strokeDasharray="3 3" />
                    <rect x="3" y="3" width="4" height="4" fill="#555" />
                    <rect x="93" y="3" width="4" height="4" fill="#555" />
                    <rect x="3" y="93" width="4" height="4" fill="#555" />
                    <rect x="93" y="93" width="4" height="4" fill="#555" />
                  </svg>
                </div>
              </>
            )}
          </div>
        </div>

        {cropError && (
          <div style={{ color: "#ff9d9d", fontSize: "13px", marginTop: "16px", textAlign: "center", fontWeight: "600", background: "rgba(255,68,68,0.1)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,68,68,0.2)" }}>
            {cropError}
          </div>
        )}
        <div className="modal-actions" style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          {!isMandatoryUniversalCrop && <button
            onClick={onClose}
            style={{ padding: "12px 24px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", cursor: "pointer", fontWeight: "600", fontSize: "13px", transition: "all 0.2s" }}
            onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#fff"; }}
            onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#aaa"; }}
          >
            {project?.generated_image_url ? "Cancel" : "Keep Original (Skip Crop)"}
          </button>}
          <button 
            onClick={handleApply} 
            disabled={isSaving}
            style={{ 
              padding: "12px 24px", borderRadius: "8px", 
              border: "1px solid #d4ff59", 
              background: "#d4ff59", 
              color: "#0a0a0a", 
              fontWeight: "700", 
              fontSize: "13px",
              cursor: isSaving ? "not-allowed" : "pointer", 
              transition: "all 0.2s",
              boxShadow: "0 4px 14px rgba(212, 255, 89, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              opacity: isSaving ? 0.7 : 1
            }}
            onMouseOver={e => { if (!isSaving) e.currentTarget.style.background = "#bfe650"; }}
            onMouseOut={e => { if (!isSaving) e.currentTarget.style.background = "#d4ff59"; }}
          >
            {isSaving && <div className="animate-spin" style={{ width: "14px", height: "14px", border: "2px solid #0a0a0a", borderTopColor: "transparent", borderRadius: "50%" }} />}
            {isSaving ? "Saving..." : isUniversal ? "Apply Crop & Continue" : "Apply Crop & Extract"}
          </button>
        </div>
      </div>
    </div>
  );
});

export default CropModal;
