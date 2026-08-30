"use client";

import { useState, useRef, useEffect } from "react";
import QRCode from "react-qr-code";
import { Monitor, ArrowLeft, Loader2, Download, ImageIcon, Sparkles, Wand2, Home, Keyboard, ShieldAlert, Clock, Scan, ZoomIn, ZoomOut, Maximize, Upload } from "lucide-react";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import TopUpModal from "@/components/TopUpModal";
import { compressImageClientSide } from "@/utils/imageUtils";
import { uploadImageToStorage } from "@/utils/uploadClient";
import { trackEvent, trackExport } from "@/lib/analytics.mjs";
import FeedbackWidget from "@/app/workspace/[id]/components/FeedbackWidget";
import "../globals.css";
import "../home.css";

export default function UpscalePage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const supabase = createClient();

  const [syncSessionId, setSyncSessionId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [upscaledImage, setUpscaledImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [recentUpscales, setRecentUpscales] = useState([]);
  
  const [uploadMode, setUploadMode] = useState("file"); // "file" | "qr"
  const scrollContainerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const currentZoom = useRef(1);

  useEffect(() => {
    currentZoom.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      const z = currentZoom.current;
      const delta = Math.sign(e.deltaY) * 0.15;
      const newZ = Math.min(Math.max(0.25, z - delta), 5);
      if (newZ !== z) setZoom(newZ);
    };
    const el = scrollContainerRef.current;
    if (el) el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      if (el) el.removeEventListener("wheel", handleWheel);
    };
  }, [previewImage, upscaledImage]); // attach when image renders

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        fetchCredits(session.user.id);
        fetchRecentUpscales(session.user.id);
      } else {
        router.push("/");
      }
    };
    fetchSession();
  }, [router, supabase]);

  const fetchCredits = async (userId) => {
    const { data } = await supabase.from("profiles").select("credits").eq("id", userId).single();
    if (data) setCredits(data.credits);
  };

  useEffect(() => {
    const handleCreditsUpdate = () => {
      if (user?.id) fetchCredits(user.id);
    };
    window.addEventListener("syncraft:credits-updated", handleCreditsUpdate);
    return () => window.removeEventListener("syncraft:credits-updated", handleCreditsUpdate);
  }, [user]);

  const fetchRecentUpscales = async (userId) => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .eq("trace_type", "upscale")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRecentUpscales(data);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      let syncId = localStorage.getItem("globalSyncSessionId");
      if (!syncId) {
        syncId = crypto.randomUUID();
        localStorage.setItem("globalSyncSessionId", syncId);
      }
      setSyncSessionId(syncId);
    }
  }, []);

  useEffect(() => {
    const checkPendingImage = () => {
      const pendingUrl = sessionStorage.getItem("pendingMobileImage");
      if (pendingUrl && user) {
        sessionStorage.removeItem("pendingMobileImage");
        setPreviewImage(pendingUrl);
        setSelectedUrl(pendingUrl);
        setSelectedFile(null);
        setUpscaledImage(null);
        void startUpscaleProject({ url: pendingUrl, name: "Mobile Upscale" });
      }
    };
    checkPendingImage();
    const handleEvent = () => checkPendingImage();
    window.addEventListener("mobileImageRouted", handleEvent);
    return () => window.removeEventListener("mobileImageRouted", handleEvent);
  }, [user]);

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.files?.length > 0) handleFileSelected(e.dataTransfer.files[0]);
  };

  const handleFileSelected = (file) => {
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    setPreviewImage(objUrl);
    setSelectedFile(file);
    setSelectedUrl(null);
    setUpscaledImage(null);
    void startUpscaleProject({ file, name: file.name });
  };

  const uploadToS3 = async (file) => {
    let fileToUpload = file;
    if (file.size > 4 * 1024 * 1024) {
      fileToUpload = await compressImageClientSide(file, 2048, 0.85);
    }
    const fileExt = fileToUpload.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      return await uploadImageToStorage(fileToUpload, { token, fileName });
    } catch (error) {
      console.error(error);
      throw new Error("Image upload failed");
    }
  };

  const startUpscaleProject = async ({ file = null, url = null, name = "4K Upscale" } = {}) => {
    if (!file && !url) return;
    trackEvent("upload_start", { tool: "upscale", source: file ? "file" : "mobile_sync" });
    setIsProcessing(true);
    try {
      let finalUrl = url;
      if (file) {
        finalUrl = await uploadToS3(file);
      } else if (url?.startsWith("blob:")) {
        const blobRes = await fetch(url);
        const blob = await blobRes.blob();
        finalUrl = await uploadToS3(blob);
      }

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          imageUrl: finalUrl,
          traceType: "upscale",
          projectName: name.replace(/\.[^.]+$/, "") || "4K Upscale",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.projectId) throw new Error(data.error || "Failed to create upscale project");
      trackEvent("tool_selected", { tool: "upscale" });
      trackEvent("upload_complete", { tool: "upscale" });
      router.push(`/workspace/${data.projectId}`);
    } catch (err) {
      trackEvent("upload_failure", { tool: "upscale", reason: "project_creation_failed" });
      toast.error(err.message || "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpscale = async () => {
    await startUpscaleProject({ file: selectedFile, url: selectedUrl, name: selectedFile?.name || "4K Upscale" });
  };

  const handleDownload = async (url) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `upscaled_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      trackExport({ tool: "upscale", format: "png" });
    } catch (err) {
      toast.error("Failed to download image");
    }
  };

  return (
    <div className="app-container">

      {/* Top Menu Bar */}
      <header style={{ padding: "16px 32px", display: "flex", alignItems: "center", borderBottom: "1px solid #444", background: "#1a1a1a" }}>
        <button onClick={() => router.push('/')} style={{ display: "flex", alignItems: "center", gap: "7px", background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600", transition: "color 0.2s", padding: "6px 10px" }} onMouseEnter={e => e.currentTarget.style.color="#d4ff59"} onMouseLeave={e => e.currentTarget.style.color="#555"}>
          <img src="/logo.svg" alt="Syncraft Home" style={{ height: "18px", width: "auto", opacity: 0.9 }} />
        </button>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
          <h1 style={{ fontSize: "14px", fontWeight: "600", margin: 0, color: "#fff", textTransform: "uppercase", letterSpacing: "2px" }}>UPSCALE STUDIO</h1>
        </div>
        <div style={{ width: "200px", display: "flex", justifyContent: "flex-end", gap: "16px", alignItems: "center" }}>
          <div onClick={() => setShowTopUpModal(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2a2a2a", padding: "6px 14px", borderRadius: "14px", cursor: "pointer", border: "1px solid #444", transition: "border-color 0.2s" }} onMouseOver={e => e.currentTarget.style.borderColor = "#d4ff59"} onMouseOut={e => e.currentTarget.style.borderColor = "#444"}>
            {credits !== null && credits <= 0 ? (
              <span style={{ color: "#fff", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>BUY CREDITS</span>
            ) : (
              <>
                <span style={{ color: "#d4ff59", fontWeight: "bold", fontSize: "14px", fontFamily: "monospace" }}>{credits !== null ? credits : "-"}</span>
                <span style={{ color: "#888", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>CREDITS</span>
              </>
            )}
          </div>
        </div>
      </header>


      <main className="main-workspace" style={{ padding: 0 }}>
        
        {/* Split View Workspace */}
        <div className="canvas-area" style={{ padding: 0, display: "flex", flexDirection: "column", backgroundColor: "#0a0a0a", backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }}>
          
          <div style={{ display: "flex", borderBottom: "1px solid #1f1f1f", background: "#0a0a0a", height: "40px" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #1f1f1f", color: !upscaledImage ? "#d4ff59" : "#666", fontWeight: "700", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap", padding: "0 10px" }}>
              1. ORIGINAL UPLOAD
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: upscaledImage ? "#d4ff59" : "#666", fontWeight: "700", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap", padding: "0 10px" }}>
              2. 4X HD UPSCALE
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "40px", position: "relative" }}>
            {(!previewImage && !upscaledImage) ? (
              <div className="hero-upload-box"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                style={{ 
                  maxWidth: "420px", 
                  width: "100%", 
                  background: "rgba(20, 20, 20, 0.8)", 
                  backdropFilter: "blur(20px)",
                  padding: "16px", 
                  borderRadius: "24px", 
                  display: "flex", 
                  flexDirection: "column", 
                  boxShadow: "0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)", 
                  border: "1px solid rgba(255,255,255,0.08)" 
                }}
              >
                <div 
                  style={{ 
                    width: "100%", 
                    flex: 1, 
                    background: "transparent", 
                    borderRadius: "16px", 
                    padding: "20px", 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center" 
                  }}
                >
                  {/* Selector Buttons Row */}
                  <div style={{ display: "flex", gap: "6px", width: "100%", marginBottom: "24px", flexWrap: "nowrap", background: "rgba(0,0,0,0.4)", padding: "4px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <button
                      onClick={() => setUploadMode("file")}
                      style={{
                        flex: 1,
                        background: uploadMode !== "qr" ? "#2a2a2a" : "transparent",
                        color: uploadMode !== "qr" ? "#ffffff" : "#888",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "12px",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        fontWeight: "600",
                        letterSpacing: "0.2px",
                        transition: "all 0.2s ease",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        boxShadow: uploadMode !== "qr" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                      }}
                      onMouseEnter={(e) => {
                        if (uploadMode === "qr") e.currentTarget.style.color = "#ccc";
                      }}
                      onMouseLeave={(e) => {
                        if (uploadMode === "qr") e.currentTarget.style.color = "#888";
                      }}
                    >
                      <Monitor size={14} /> Open PC File
                    </button>
                    <button
                      onClick={() => setUploadMode("qr")}
                      style={{
                        flex: 1,
                        background: uploadMode === "qr" ? "#2a2a2a" : "transparent",
                        color: uploadMode === "qr" ? "#ffffff" : "#888",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "12px",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        fontWeight: "600",
                        letterSpacing: "0.2px",
                        transition: "all 0.2s ease",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        boxShadow: uploadMode === "qr" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                      }}
                      onMouseEnter={(e) => {
                        if (uploadMode !== "qr") e.currentTarget.style.color = "#ccc";
                      }}
                      onMouseLeave={(e) => {
                        if (uploadMode !== "qr") e.currentTarget.style.color = "#888";
                      }}
                    >
                      <Scan size={14} /> Scan Phone
                    </button>
                  </div>
                  
                  <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelected(e.target.files[0])} accept="image/*" style={{ display: "none" }} />
                  
                  {uploadMode === "qr" ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: "12px" }}>
                      <div style={{ background: "#ffffff", padding: "12px", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.1)" }}>
                        <QRCode value={`${typeof window !== "undefined" ? window.location.origin : "https://syncraftech.com"}/mobile?sync=${syncSessionId}`} size={120} />
                      </div>
                      <p style={{ color: "#888", margin: 0, fontSize: "12px", textAlign: "center", lineHeight: 1.5 }}>
                        Scan with your mobile camera to upload directly.
                      </p>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current.click()}
                      style={{ 
                        width: "100%", 
                        minHeight: "140px", 
                        border: "1.5px dashed rgba(255,255,255,0.15)", 
                        borderRadius: "14px", 
                        display: "flex", 
                        flexDirection: "column", 
                        alignItems: "center", 
                        justifyContent: "center", 
                        gap: "10px", 
                        cursor: "pointer", 
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#ffffff";
                        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <Upload size={20} color="#888" />
                      <span style={{ color: "#aaa", fontSize: "13px", fontWeight: "600" }}>Upload Image file</span>
                      <span style={{ color: "#555", fontSize: "11px" }}>or drop file here</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div 
                  ref={scrollContainerRef}
                  style={{ 
                    flex: 1,
                    width: "100%", height: "100%", 
                    overflow: "auto", 
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                >
                  <div style={{ zoom: zoom, transition: "zoom 0.1s ease-out", display: "flex", justifyContent: "center", alignItems: "center", minWidth: "100%", minHeight: "100%" }}>
                    <img src={upscaledImage || previewImage} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.8))" }} alt="Preview" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Properties Panel */}
        <div style={{ width: "280px", background: "#181818", borderLeft: "1px solid #2a2a2a", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
          
          <div style={{ padding: "16px", borderBottom: "1px solid #2a2a2a" }}>
            <div style={{ fontSize: "10px", color: "#8a8a8a", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "12px", display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Actions</span>
            </div>
            
            <button 
              className={isProcessing || (!previewImage && !upscaledImage) ? "btn-primary" : "btn-primary highlight"}
              onClick={handleUpscale} 
              disabled={isProcessing || (!previewImage && !upscaledImage)}
              style={{ 
                width: "100%", marginBottom: "8px", padding: "12px 16px", 
                fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", 
                gap: "8px", fontWeight: 700, borderRadius: "4px",
                border: isProcessing || (!previewImage && !upscaledImage) ? "1px solid #333" : "1px solid #d4ff59",
                background: isProcessing || (!previewImage && !upscaledImage) ? "rgba(212,255,89,0.08)" : "#d4ff59",
                color: isProcessing || (!previewImage && !upscaledImage) ? "#555" : "#0a0a0a",
              }}
            >
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {isProcessing ? "CREATING WORKSPACE" : "CONTINUE TO WORKSPACE"}
            </button>

            <button 
              onClick={() => {
                if(upscaledImage) handleDownload(upscaledImage);
              }}
              disabled={!upscaledImage}
              style={{ 
                width: "100%", marginBottom: "16px", padding: "10px 16px", 
                fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", 
                background: "#1e1e1e", color: !upscaledImage ? "#5a5a5a" : "#bbb", 
                border: "1px solid #2a2a2a", borderRadius: "4px", 
                cursor: !upscaledImage ? "not-allowed" : "pointer", 
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                opacity: !upscaledImage ? 0.45 : 1, transition: "all 0.2s"
              }}
              onMouseOver={e => { if(upscaledImage) e.currentTarget.style.borderColor = "#484848"; }}
              onMouseOut={e => { if(upscaledImage) e.currentTarget.style.borderColor = "#2a2a2a"; }}
            >
              <Download size={14} /> DOWNLOAD RESULT
            </button>

            {upscaledImage && (
              <FeedbackWidget 
                projectId={syncSessionId} 
              />
            )}
          </div>

          <div style={{ padding: "16px" }}>
            <div style={{ fontSize: "10px", color: "#8a8a8a", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
              <span>History</span>
            </div>

            {/* Privacy Notice */}
            <div style={{ background: "linear-gradient(90deg, rgba(212, 255, 89, 0.05) 0%, rgba(212, 255, 89, 0.01) 100%)", borderLeft: "2px solid #d4ff59", borderRadius: "0 8px 8px 0", padding: "12px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <ShieldAlert size={14} color="#d4ff59" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#d4ff59" }}>Privacy First</p>
                <p style={{ margin: 0, fontSize: "10.5px", color: "#888", lineHeight: 1.4 }}>All uploaded and generated images are permanently deleted after 3 days to protect your privacy.</p>
              </div>
            </div>
            
            {recentUpscales.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", border: "1px dashed #333", background: "transparent", borderRadius: "8px" }}>
                <Clock size={24} color="#555" style={{ margin: "0 auto 8px" }} />
                <p style={{ margin: 0, color: "#666", fontSize: "11px" }}>No recent upscales</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recentUpscales.map(item => (
                  <div key={item.id} className="history-card" onClick={() => router.push(`/workspace/${item.id}`)} style={{ display: "flex", gap: "12px", padding: "10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: "0", transition: "all 0.2s", position: "relative", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.background = "#151515"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.background = "#111"; }}>
                    <div style={{ width: "48px", height: "48px", background: "#0a0a0a", border: "1px solid #333", borderRadius: "0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      <img src={item.original_image_url} alt="Upscale project source" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover", transition: "transform 0.3s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                      <p style={{ margin: "0 0 4px", color: "#ddd", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name || "4K Upscale"}
                      </p>
                      <span style={{ fontSize: "10px", color: "#666", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={10} /> {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                   <button
                      onClick={(event) => { event.stopPropagation(); router.push(`/workspace/${item.id}`); }}
                      title="Open upscale workspace"
                      style={{ alignSelf: "center", background: "transparent", border: "1px solid #444", color: "#888", width: "28px", height: "28px", borderRadius: "0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#d4ff59"; e.currentTarget.style.color = "#d4ff59"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#888"; }}
                    >
                      <Wand2 size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>

      {showTopUpModal && <TopUpModal onClose={() => setShowTopUpModal(false)} user={user} />}
    </div>
  );
}
