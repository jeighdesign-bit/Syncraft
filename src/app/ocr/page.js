"use client";

import { useState, useRef, useEffect } from "react";
import QRCode from "react-qr-code";
import { Monitor, ArrowLeft, Loader2, Download, Table2, Scan, FileImage, Clock, Zap } from "lucide-react";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import TopUpModal from "@/components/TopUpModal";
import "../globals.css";
import "../home.css";

export default function OcrPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const supabase = createClient();

  const [syncSessionId, setSyncSessionId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUrl, setSelectedUrl] = useState(null);
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [recentExtractions, setRecentExtractions] = useState([]);
  
  const [uploadMode, setUploadMode] = useState("file"); // "file" | "qr"

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        fetchCredits(session.user.id);
        fetchRecentExtractions(session.user.id);
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

  const fetchRecentExtractions = async (userId) => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .eq("trace_type", "ocr")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRecentExtractions(data);
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
        setExtractedData(null);
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
    setExtractedData(null);
  };

  const uploadAndProcessFile = async (file) => {
    setIsProcessing(true);
    setExtractedData(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) throw new Error("Please log in to extract data.");

      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ fileName: file.name, contentType: file.type })
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok || !urlData.uploadUrl) throw new Error(urlData.error || "Failed to get upload URL");
      
      const putRes = await fetch(urlData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });
      if (!putRes.ok) throw new Error("Failed to upload image to storage");

      await processOcrFromUrl(urlData.publicUrl);
    } catch (err) {
      console.error(err);
      if (err.message === "INSUFFICIENT_CREDITS") {
        setShowTopUpModal(true);
      } else {
        toast.error(err.message || "Failed to extract text.");
      }
      setIsProcessing(false);
    }
  };

  const processOcrFromUrl = async (url) => {
    setIsProcessing(true);
    setExtractedData(null);
    try {
      const formData = new FormData();
      formData.append("imageUrl", url);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch("/api/ocr-extract", { 
        method: "POST", 
        headers: { "Authorization": `Bearer ${token}` },
        body: formData 
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setExtractedData(result.data);
      fetchCredits(user.id);
      fetchRecentExtractions(user.id);
      toast.success("Data extracted successfully!");
    } catch (err) {
      console.error(err);
      if (err.message === "INSUFFICIENT_CREDITS") {
        setShowTopUpModal(true);
      } else {
        toast.error(err.message || "Failed to extract text.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!extractedData || extractedData.length === 0) return;
    const headers = Object.keys(extractedData[0]);
    const csvRows = [
      headers.join(","),
      ...extractedData.map(row => 
        headers.map(header => {
          let val = row[header] || "";
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            val = `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(",")
      )
    ];
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "extracted_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ height: "100vh", maxHeight: "100vh", overflow: "hidden", backgroundColor: "#262626", color: "#e0e0e0", display: "flex", flexDirection: "column", fontFamily: "var(--font-outfit), sans-serif" }}>
      
      {/* Header */}
      <header style={{ padding: "16px 32px", display: "flex", alignItems: "center", borderBottom: "1px solid #444", background: "#1a1a1a" }}>
        <button onClick={() => router.push('/')} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600", transition: "color 0.2s" }} onMouseEnter={e => e.currentTarget.style.color="#FFD700"} onMouseLeave={e => e.currentTarget.style.color="#666"}>
          <ArrowLeft size={16} /> BACK
        </button>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "10px" }}>
          <Table2 size={20} color="#FFD700" />
          <h1 style={{ fontSize: "14px", fontWeight: "600", margin: 0, color: "#fff", textTransform: "uppercase", letterSpacing: "2px" }}>OCR DATA EXTRACTION ENGINE</h1>
        </div>
        <div style={{ width: "100px", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={() => setShowTopUpModal(true)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2a2a2a", padding: "6px 12px", borderRadius: "0", cursor: "pointer", border: "1px solid #444", transition: "border-color 0.2s" }} onMouseOver={e => e.currentTarget.style.borderColor = "#FFD700"} onMouseOut={e => e.currentTarget.style.borderColor = "#444"}>
            <span style={{ color: "#FFD700", fontWeight: "bold", fontSize: "14px", fontFamily: "monospace" }}>{credits}</span>
            <span style={{ color: "#888", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>CREDITS</span>
          </div>
        </div>
      </header>

      {/* Main Split Content */}
      <main style={{ flex: 1, display: "flex", overflow: "hidden", padding: "20px", gap: "20px" }}>
        
        {/* LEFT COLUMN: Input & Image Preview */}
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", border: "1px solid #444", background: "#2a2a2a", overflow: "hidden", position: "relative" }}>
          {/* Top Edge Accent */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #FFD700, #444, #2a2a2a)" }} />
          
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #444", background: "#222", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>INPUT SOURCE</span>
            <span style={{ fontSize: "10px", color: "#444", fontFamily: "monospace" }}>// OCR_MODE_ACTIVE</span>
          </div>

          <div style={{ padding: "40px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {!previewImage ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: "100%", margin: "0 auto", width: "100%" }}>
                
                {/* Toggle Buttons */}
                <div style={{ display: "flex", width: "100%", border: "1px solid #444", marginBottom: "30px", background: "#1a1a1a" }}>
                  <button className="start-btn" onClick={() => setUploadMode("file")} style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "12px", borderRadius: "0", border: "none", borderRight: "1px solid #444", background: uploadMode === "file" ? "#222" : "transparent", color: uploadMode === "file" ? "#FFD700" : "#666", cursor: "pointer", transition: "all 0.2s", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>
                    <FileImage size={16} /> PC UPLOAD
                  </button>
                  <button className="start-btn" onClick={() => setUploadMode("qr")} style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "12px", borderRadius: "0", border: "none", background: uploadMode === "qr" ? "#222" : "transparent", color: uploadMode === "qr" ? "#FFD700" : "#666", cursor: "pointer", transition: "all 0.2s", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>
                    <Scan size={16} /> MOBILE SCAN
                  </button>
                </div>

                {uploadMode === "file" ? (
                  <div 
                    className="hero-upload-box"
                    onDragOver={handleDragOver} 
                    onDrop={handleDrop}
                    style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: "0", background: "#222", border: "1px solid #444", position: "relative", minHeight: "300px", padding: "40px" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {/* Corner Brackets */}
                    <div style={{ position: "absolute", top: -1, left: -1, width: "10px", height: "10px", borderTop: "2px solid #666", borderLeft: "2px solid #666" }} />
                    <div style={{ position: "absolute", top: -1, right: -1, width: "10px", height: "10px", borderTop: "2px solid #666", borderRight: "2px solid #666" }} />
                    <div style={{ position: "absolute", bottom: -1, left: -1, width: "10px", height: "10px", borderBottom: "2px solid #666", borderLeft: "2px solid #666" }} />
                    <div style={{ position: "absolute", bottom: -1, right: -1, width: "10px", height: "10px", borderBottom: "2px solid #666", borderRight: "2px solid #666" }} />
                    
                    <Monitor size={32} color="#666" style={{ marginBottom: "20px" }} />
                    <div style={{ fontSize: "14px", color: "#fff", fontWeight: "500", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>SELECT IMAGE FILE</div>
                    <div style={{ fontSize: "12px", color: "#666", fontFamily: "monospace" }}>or drag & drop to this viewport</div>
                    
                    <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelected(e.target.files[0])} accept="image/*" style={{ display: "none" }} />
                  </div>
                ) : (
                  <div className="hero-upload-box" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: "0", background: "#222", border: "1px solid #444", minHeight: "300px", padding: "40px" }}>
                    <div style={{ fontSize: "12px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "20px", textAlign: "center" }}>
                      ESTABLISH UPLINK VIA MOBILE DEVICE
                    </div>
                    <div style={{ background: "#fff", padding: "10px", display: "inline-block", border: "1px solid #000" }}>
                      <QRCode 
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/mobile?sync=${syncSessionId}`}
                        size={180} bgColor="#ffffff" fgColor="#000000" level="H"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #444", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", position: "relative", minHeight: 0 }}>
                  <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={previewImage} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                  <button className="start-btn" onClick={() => { setPreviewImage(null); setExtractedData(null); }} style={{ padding: "12px", flex: 1, background: "#222", color: "#888", border: "1px solid #444", cursor: "pointer", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600", transition: "all 0.2s" }} onMouseOver={e => {e.currentTarget.style.color="#fff"; e.currentTarget.style.borderColor="#666";}} onMouseOut={e => {e.currentTarget.style.color="#888"; e.currentTarget.style.borderColor="#444";}}>
                    CLEAR VIEWPORT
                  </button>
                  {!isProcessing && !extractedData && (
                    <button 
                      className="start-btn" 
                      onClick={() => {
                        if (selectedFile) uploadAndProcessFile(selectedFile);
                        else if (selectedUrl) processOcrFromUrl(selectedUrl);
                      }} 
                      style={{ padding: "12px", flex: 2, background: "#FFD700", color: "#000", border: "none", cursor: "pointer", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
                    >
                      <Zap size={14} /> INITIATE OCR EXTRACTION
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Results */}
        <div style={{ flex: "1", display: "flex", flexDirection: "column", border: "1px solid #444", background: "#2a2a2a" }}>
          
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #444", background: "#222", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>STRUCTURED DATA OUTPUT</span>
            {extractedData && extractedData.length > 0 && (
              <button onClick={handleDownloadCsv} style={{ padding: "4px 12px", background: "none", color: "#FFD700", border: "1px solid #FFD700", cursor: "pointer", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s" }} onMouseOver={e => {e.currentTarget.style.background="#FFD700"; e.currentTarget.style.color="#000";}} onMouseOut={e => {e.currentTarget.style.background="none"; e.currentTarget.style.color="#FFD700";}}>
                <Download size={12} /> EXPORT CSV
              </button>
            )}
          </div>

          <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#1a1a1a" }}>
            {!previewImage ? (
              <div style={{ position: "absolute", inset: 0, padding: "30px", overflowY: "auto" }}>
                <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "20px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>SYSTEM LOG // RECENT EXTRACTIONS</div>
                {recentExtractions.length === 0 ? (
                  <div style={{ marginTop: "100px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#444" }}>
                    <Table2 size={32} style={{ marginBottom: "15px" }} />
                    <p style={{ fontSize: "12px", fontFamily: "monospace", textTransform: "uppercase" }}>NO DATA RECORDS FOUND</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "15px" }}>
                    {recentExtractions.map(ext => (
                      <div key={ext.id} onClick={() => {
                        setPreviewImage(ext.original_image_url);
                        try { setExtractedData(JSON.parse(ext.svg_url)); } catch(e) {}
                      }} style={{ background: "#222", border: "1px solid #444", padding: "10px", cursor: "pointer", display: "flex", gap: "15px", alignItems: "center", transition: "border-color 0.2s" }} onMouseOver={e => e.currentTarget.style.borderColor="#888"} onMouseOut={e => e.currentTarget.style.borderColor="#444"}>
                        <div style={{ width: "60px", height: "60px", background: `url(${ext.original_image_url}) center/cover`, border: "1px solid #555" }}></div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "10px", color: "#FFD700", fontFamily: "monospace" }}>RECORD_{ext.id.substring(0,6).toUpperCase()}</span>
                          <span style={{ fontSize: "10px", color: "#666" }}>{new Date(ext.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : isProcessing ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#1a1a1a", zIndex: 5 }}>
                <Loader2 size={24} color="#FFD700" className="animate-spin" style={{ marginBottom: "16px" }} />
                <div style={{ fontSize: "14px", color: "#FFD700", fontWeight: "500" }}>Extracting data...</div>
              </div>
            ) : extractedData && extractedData.length > 0 ? (
              <div style={{ height: "100%", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left", color: "#ccc", fontFamily: "monospace" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#222", zIndex: 2, borderBottom: "1px solid #444" }}>
                    <tr>
                      {Object.keys(extractedData[0]).map((key, i) => (
                        <th key={key} style={{ padding: "12px 16px", color: "#FFD700", fontWeight: "normal", textTransform: "uppercase", letterSpacing: "1px", borderRight: i < Object.keys(extractedData[0]).length - 1 ? "1px solid #333" : "none" }}>
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #333", background: i % 2 === 0 ? "#1a1a1a" : "#222" }}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} style={{ padding: "10px 16px", borderRight: j < Object.values(row).length - 1 ? "1px solid #333" : "none" }}>{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : extractedData && extractedData.length === 0 ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#ff4444" }}>
                <div style={{ fontSize: "12px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "1px" }}>[ERROR] NO STRUCTURED DATA DETECTED IN VIEWPORT</div>
              </div>
            ) : null}
          </div>

        </div>
      </main>
      <TopUpModal show={showTopUpModal} onClose={() => setShowTopUpModal(false)} />
    </div>
  );
}
