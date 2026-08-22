"use client";

import { memo, useState, useRef, useCallback } from "react";
import { CheckCircle2, Scissors, X, XCircle } from "lucide-react";
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
                    <CheckCircle2 size={15} color="#64e6a2" strokeWidth={2.25} aria-hidden="true" />
                    DO: Include the Complete Visible Print
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Crop around all visible printable components. Include their edges and enough context to understand the layout.</p>
                  <svg viewBox="0 0 240 140" width="100%" height="140" role="img" aria-label="Correct crop: the crop frame surrounds every visible part of the connected printed design" style={{ display: "block", background: "radial-gradient(circle at 50% 46%, #1a201d 0%, #101211 64%, #0d0e0e 100%)", border: "1px solid rgba(100,230,162,0.12)", borderRadius: "8px", boxSizing: "border-box" }}>
                    <defs>
                      <linearGradient id="completeBanner" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#172734" />
                        <stop offset="0.55" stopColor="#263c4c" />
                        <stop offset="1" stopColor="#111b22" />
                      </linearGradient>
                      <filter id="completeCropGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <path d="M34 31Q120 25 206 31L204 110Q120 115 36 110Z" fill="url(#completeBanner)" stroke="#718997" strokeWidth="1.2" />
                    <path d="M34 31 77 28 49 110H36Z" fill="#315d81" opacity="0.85" />
                    <path d="m34 72 43-44h21l-58 75Z" fill="#d4ff59" opacity="0.75" />
                    <path d="M206 31 169 29l35 50Z" fill="#d4ff59" opacity="0.78" />
                    <path d="m204 78-42 34h42Z" fill="#375d78" opacity="0.9" />
                    <text x="120" y="47" fill="#f7fbfd" fontSize="8.5" fontWeight="800" textAnchor="middle" letterSpacing="1">COMMUNITY CHAPTER</text>
                    <text x="120" y="58" fill="#aebbc2" fontSize="5.5" fontWeight="600" textAnchor="middle" letterSpacing="1.7">ANNUAL GATHERING • 2026</text>
                    <circle cx="120" cy="84" r="21" fill="#17212a" stroke="#d4ff59" strokeWidth="2" />
                    <circle cx="120" cy="84" r="16" fill="none" stroke="#f1f7da" strokeWidth="1" strokeDasharray="2 2" />
                    <path d="m120 69 4.4 9 10 .8-7.6 6.4 2.4 9.8-9.2-5.2-9.2 5.2 2.4-9.8-7.6-6.4 10-.8Z" fill="#d4ff59" opacity="0.9" />
                    <path d="M43 39q77-9 154 0M43 103q77 8 154 0" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
                    <rect x="28" y="18" width="190" height="104" rx="3" fill="none" stroke="#f5fff9" strokeWidth="1.8" strokeDasharray="6 4" filter="url(#completeCropGlow)" />
                    <path d="M28 34V18h16 M202 18h16v16 M28 106v16h16 M202 122h16v-16" fill="none" stroke="#64e6a2" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="213" cy="24" r="12" fill="#64e6a2" />
                    <path d="m207.5 24 3.6 3.7 7.3-8" fill="none" stroke="#0b1510" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <XCircle size={15} color="#ff6767" strokeWidth={2.25} aria-hidden="true" />
                    DON'T: Isolate One Small Fragment
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Do not crop away related visible panels or strap sections. Hidden areas will not be invented.</p>
                  <svg viewBox="0 0 240 140" width="100%" height="140" role="img" aria-label="Incorrect crop: a small crop frame captures only one fragment and leaves related visible design panels outside" style={{ display: "block", background: "radial-gradient(circle at 50% 46%, #211919 0%, #121010 64%, #0e0d0d 100%)", border: "1px solid rgba(255,103,103,0.12)", borderRadius: "8px", boxSizing: "border-box" }}>
                    <defs>
                      <linearGradient id="fragmentBanner" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#172734" />
                        <stop offset="0.55" stopColor="#263c4c" />
                        <stop offset="1" stopColor="#111b22" />
                      </linearGradient>
                      <mask id="fragmentFocusMask">
                        <rect width="240" height="140" fill="white" />
                        <rect x="91" y="58" width="58" height="58" rx="3" fill="black" />
                      </mask>
                    </defs>
                    <g opacity="0.5">
                      <path d="M34 31Q120 25 206 31L204 110Q120 115 36 110Z" fill="url(#fragmentBanner)" stroke="#718997" strokeWidth="1.2" />
                      <path d="M34 31 77 28 49 110H36Z" fill="#315d81" opacity="0.85" />
                      <path d="m34 72 43-44h21l-58 75Z" fill="#d4ff59" opacity="0.75" />
                      <path d="M206 31 169 29l35 50Z" fill="#d4ff59" opacity="0.78" />
                      <path d="m204 78-42 34h42Z" fill="#375d78" opacity="0.9" />
                      <text x="120" y="47" fill="#f7fbfd" fontSize="8.5" fontWeight="800" textAnchor="middle" letterSpacing="1">COMMUNITY CHAPTER</text>
                      <text x="120" y="58" fill="#aebbc2" fontSize="5.5" fontWeight="600" textAnchor="middle" letterSpacing="1.7">ANNUAL GATHERING • 2026</text>
                      <circle cx="120" cy="84" r="21" fill="#17212a" stroke="#d4ff59" strokeWidth="2" />
                      <circle cx="120" cy="84" r="16" fill="none" stroke="#f1f7da" strokeWidth="1" strokeDasharray="2 2" />
                      <path d="m120 69 4.4 9 10 .8-7.6 6.4 2.4 9.8-9.2-5.2-9.2 5.2 2.4-9.8-7.6-6.4 10-.8Z" fill="#d4ff59" opacity="0.9" />
                    </g>
                    <rect width="240" height="140" fill="rgba(8,8,8,0.48)" mask="url(#fragmentFocusMask)" />
                    <rect x="91" y="58" width="58" height="58" rx="3" fill="rgba(255,103,103,0.06)" stroke="#ff9a9a" strokeWidth="1.8" strokeDasharray="6 4" />
                    <path d="M91 72V58h14 M135 58h14v14 M91 102v14h14 M135 116h14v-14" fill="none" stroke="#ff6767" strokeWidth="3" strokeLinecap="round" />
                    <path d="M47 43 62 58 M193 43l-15 15 M47 96l15-15 M193 96l-15-15" fill="none" stroke="#ff6767" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
                    <circle cx="160" cy="52" r="12" fill="#ff6767" />
                    <path d="m155.5 47.5 9 9 M164.5 47.5l-9 9" fill="none" stroke="#1b0c0c" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </>
            ) : project?.trace_type === 'logo' ? (
              <>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <CheckCircle2 size={15} color="#64e6a2" strokeWidth={2.25} aria-hidden="true" />
                    DO: Crop Tightly Around Logo
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Remove as much empty background as possible. Keep the box snug to the logo edges.</p>
                  <svg viewBox="0 0 240 140" width="100%" height="140" role="img" aria-label="Correct logo crop: a tight crop frame surrounds the complete sports club logo" style={{ display: "block", background: "radial-gradient(circle at 50% 45%, #1a201d 0%, #101211 64%, #0d0e0e 100%)", border: "1px solid rgba(100,230,162,0.12)", borderRadius: "8px", boxSizing: "border-box" }}>
                    <defs>
                      <linearGradient id="logoRibbon" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#512b73" />
                        <stop offset="1" stopColor="#231634" />
                      </linearGradient>
                      <linearGradient id="logoBall" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#f7ff8b" />
                        <stop offset="1" stopColor="#d4ff59" />
                      </linearGradient>
                      <filter id="logoCropGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <g>
                      <path d="M57 55 92 35M54 64l39-17M59 72l34-12" fill="none" stroke="#8b4cc2" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
                      <circle cx="113" cy="35" r="15" fill="url(#logoBall)" stroke="#a7c73e" strokeWidth="1.5" />
                      <circle cx="106" cy="30" r="2.2" fill="#526121" /><circle cx="116" cy="27" r="2.2" fill="#526121" /><circle cx="121" cy="37" r="2.2" fill="#526121" /><circle cx="109" cy="42" r="2.2" fill="#526121" />
                      <path d="M55 64 180 50l8 38L61 99Z" fill="#13161a" stroke="#624182" strokeWidth="2" />
                      <text x="122" y="81" fill="#f7fbfd" fontSize="30" fontWeight="900" fontStyle="italic" textAnchor="middle" letterSpacing="0.5">RALLY</text>
                      <path d="M71 88h104l-9 18H80Z" fill="url(#logoRibbon)" stroke="#7d4cab" strokeWidth="1.3" />
                      <text x="123" y="100" fill="#e8dff0" fontSize="7" fontWeight="700" textAnchor="middle" letterSpacing="2.2">SPORTS CLUB</text>
                      <path d="M87 112h72" stroke="#d4ff59" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
                    </g>
                    <rect x="46" y="14" width="150" height="108" rx="3" fill="none" stroke="#f5fff9" strokeWidth="1.8" strokeDasharray="6 4" filter="url(#logoCropGlow)" />
                    <path d="M46 30V14h16 M180 14h16v16 M46 106v16h16 M180 122h16v-16" fill="none" stroke="#64e6a2" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="201" cy="21" r="12" fill="#64e6a2" />
                    <path d="m195.5 21 3.6 3.7 7.3-8" fill="none" stroke="#0b1510" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <XCircle size={15} color="#ff6767" strokeWidth={2.25} aria-hidden="true" />
                    DON'T: Include Extra Space
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Do not leave huge margins around the logo. This reduces the AI resolution.</p>
                  <svg viewBox="0 0 240 140" width="100%" height="140" role="img" aria-label="Incorrect logo crop: the logo is tiny inside a crop frame with excessive empty space" style={{ display: "block", background: "radial-gradient(circle at 50% 46%, #211919 0%, #121010 64%, #0e0d0d 100%)", border: "1px solid rgba(255,103,103,0.12)", borderRadius: "8px", boxSizing: "border-box" }}>
                    <defs>
                      <linearGradient id="smallLogoRibbon" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#512b73" />
                        <stop offset="1" stopColor="#231634" />
                      </linearGradient>
                      <linearGradient id="smallLogoBall" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#f7ff8b" />
                        <stop offset="1" stopColor="#d4ff59" />
                      </linearGradient>
                    </defs>
                    <g transform="translate(78 44) scale(0.35)" opacity="0.72">
                      <path d="M57 55 92 35M54 64l39-17M59 72l34-12" fill="none" stroke="#8b4cc2" strokeWidth="3" strokeLinecap="round" />
                      <circle cx="113" cy="35" r="15" fill="url(#smallLogoBall)" stroke="#a7c73e" strokeWidth="1.5" />
                      <circle cx="106" cy="30" r="2.2" fill="#526121" /><circle cx="116" cy="27" r="2.2" fill="#526121" /><circle cx="121" cy="37" r="2.2" fill="#526121" /><circle cx="109" cy="42" r="2.2" fill="#526121" />
                      <path d="M55 64 180 50l8 38L61 99Z" fill="#13161a" stroke="#624182" strokeWidth="2" />
                      <text x="122" y="81" fill="#f7fbfd" fontSize="30" fontWeight="900" fontStyle="italic" textAnchor="middle">RALLY</text>
                      <path d="M71 88h104l-9 18H80Z" fill="url(#smallLogoRibbon)" stroke="#7d4cab" strokeWidth="1.3" />
                      <text x="123" y="100" fill="#e8dff0" fontSize="7" fontWeight="700" textAnchor="middle" letterSpacing="2.2">SPORTS CLUB</text>
                    </g>
                    <rect x="27" y="13" width="186" height="114" rx="3" fill="rgba(255,103,103,0.025)" stroke="#ff8b8b" strokeWidth="1.8" strokeDasharray="6 4" />
                    <path d="M27 29V13h16 M197 13h16v16 M27 111v16h16 M197 127h16v-16" fill="none" stroke="#ff6767" strokeWidth="3" strokeLinecap="round" />
                    <path d="M48 35 62 49 M192 35l-14 14 M48 105l14-14 M192 105l-14-14" fill="none" stroke="#ff6767" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
                    <circle cx="217" cy="20" r="12" fill="#ff6767" />
                    <path d="m212.5 15.5 9 9 M221.5 15.5l-9 9" fill="none" stroke="#1b0c0c" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <CheckCircle2 size={15} color="#64e6a2" strokeWidth={2.25} aria-hidden="true" />
                    DO: Crop Torso Only
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>Exclude sleeves. Keep the box tight to the main body.</p>
                  <svg viewBox="0 0 240 140" width="100%" height="140" role="img" aria-label="Correct crop: a tight crop box around the shirt torso with the sleeves left outside" style={{ display: "block", background: "radial-gradient(circle at 50% 42%, #1a201d 0%, #101211 62%, #0d0e0e 100%)", border: "1px solid rgba(100,230,162,0.12)", borderRadius: "8px", boxSizing: "border-box" }}>
                    <defs>
                      <pattern id="excludedSleeves" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="7" stroke="#65706a" strokeWidth="2" opacity="0.35" />
                      </pattern>
                      <filter id="cropGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <path d="M76 31 101 18h38l25 13 23 32-27 12-7 49H87l-7-49-27-12 23-32Z" fill="#171a19" stroke="#525b56" strokeWidth="1.5" />
                    <path d="M76 31 53 63l27 12 7-30Z M164 31l23 32-27 12-7-30Z" fill="url(#excludedSleeves)" stroke="#59625d" strokeWidth="1.2" />
                    <path d="M87 28h66l7 96H80l7-96Z" fill="rgba(100,230,162,0.12)" stroke="#64e6a2" strokeWidth="1.3" opacity="0.92" />
                    <rect x="82" y="22" width="76" height="106" rx="3" fill="none" stroke="#f5fff9" strokeWidth="1.8" strokeDasharray="6 4" filter="url(#cropGlow)" />
                    <path d="M82 37V22h15 M143 22h15v15 M82 113v15h15 M143 128h15v-15" fill="none" stroke="#64e6a2" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="178" cy="25" r="12" fill="#64e6a2" />
                    <path d="m172.5 25 3.6 3.7 7.3-8" fill="none" stroke="#0b1510" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: "600", fontSize: "13px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <XCircle size={15} color="#ff6767" strokeWidth={2.25} aria-hidden="true" />
                    DON'T: Include Sleeves
                  </div>
                  <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px", lineHeight: 1.5 }}>If you include sleeves, the AI will draw a shirt.</p>
                  <svg viewBox="0 0 240 140" width="100%" height="140" role="img" aria-label="Incorrect crop: a wide crop box includes the shirt sleeves" style={{ display: "block", background: "radial-gradient(circle at 50% 42%, #211919 0%, #121010 62%, #0e0d0d 100%)", border: "1px solid rgba(255,103,103,0.12)", borderRadius: "8px", boxSizing: "border-box" }}>
                    <defs>
                      <pattern id="includedSleeves" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="7" stroke="#ff6767" strokeWidth="2" opacity="0.32" />
                      </pattern>
                    </defs>
                    <path d="M76 31 101 18h38l25 13 23 32-27 12-7 49H87l-7-49-27-12 23-32Z" fill="#1b1818" stroke="#64605f" strokeWidth="1.5" />
                    <path d="M76 31 53 63l27 12 7-30Z M164 31l23 32-27 12-7-30Z" fill="url(#includedSleeves)" stroke="#ff6767" strokeWidth="1.5" />
                    <rect x="46" y="16" width="148" height="113" rx="3" fill="rgba(255,103,103,0.045)" stroke="#ff8b8b" strokeWidth="1.8" strokeDasharray="6 4" />
                    <path d="M46 31V16h15 M179 16h15v15 M46 114v15h15 M179 129h15v-15" fill="none" stroke="#ff6767" strokeWidth="3" strokeLinecap="round" />
                    <path d="M58 50 75 68 M182 50l-17 18" fill="none" stroke="#ff6767" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="206" cy="25" r="12" fill="#ff6767" />
                    <path d="m201.5 20.5 9 9 M210.5 20.5l-9 9" fill="none" stroke="#1b0c0c" strokeWidth="2.5" strokeLinecap="round" />
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
