"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { X, Image as ImageIcon, FileText } from "lucide-react";

export default function GlobalMobileSync() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [receivedImage, setReceivedImage] = useState(null);

  useEffect(() => {
    let syncId = localStorage.getItem("globalSyncSessionId");
    if (!syncId) {
      syncId = crypto.randomUUID();
      localStorage.setItem("globalSyncSessionId", syncId);
    }
  }, []);

  useEffect(() => {
    const syncId = localStorage.getItem("globalSyncSessionId");
    if (!syncId) return;

    const channel = supabase.channel(`mobile_sync_${syncId}`)
      .on('broadcast', { event: 'image_uploaded' }, (payload) => {
        setReceivedImage(payload.payload.imageUrl);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const bc = new BroadcastChannel("mobile_sync_channel");
      bc.onmessage = (event) => {
        if (event.data.type === "MODAL_HANDLED") {
          setReceivedImage(null);
        }
      };
      return () => bc.close();
    }
  }, []);

  if (!receivedImage) return null;

  const handleRoute = (destination) => {
    sessionStorage.setItem('pendingMobileImage', receivedImage);
    setReceivedImage(null);
    
    // Notify other tabs to close their modal
    const bc = new BroadcastChannel("mobile_sync_channel");
    bc.postMessage({ type: "MODAL_HANDLED" });
    bc.close();

    if (destination === 'tracer') {
      if (pathname !== '/') router.push('/');
      else window.dispatchEvent(new Event('mobileImageRouted'));
    } else if (destination === 'ocr') {
      if (pathname !== '/ocr') router.push('/ocr');
      else window.dispatchEvent(new Event('mobileImageRouted'));
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10,10,10,0.9)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)" }}>
      <div style={{ background: "#1a1a1a", border: "1px solid #444", width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
        
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#222" }}>
          <span style={{ fontSize: "12px", color: "#FFD700", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold" }}>Incoming Mobile Uplink</span>
          <button onClick={() => setReceivedImage(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1a1a" }}>
          <p style={{ color: "#aaa", fontSize: "14px", marginBottom: "20px", textAlign: "center" }}>Photo received from your mobile device. Where would you like to route this data?</p>
          
          <div style={{ width: "100%", height: "250px", border: "1px solid #333", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: "24px" }}>
            <img src={receivedImage} alt="Received from mobile" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>

          <div style={{ display: "flex", width: "100%", gap: "16px" }}>
            <button 
              onClick={() => handleRoute('tracer')}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "24px", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={e => {e.currentTarget.style.borderColor = "#FFD700"; e.currentTarget.style.color = "#FFD700";}}
              onMouseOut={e => {e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff";}}
            >
              <ImageIcon size={32} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", letterSpacing: "1px" }}>GARMENT TRACER</span>
                <span style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Convert to Vector SVG</span>
              </div>
            </button>

            <button 
              onClick={() => handleRoute('ocr')}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", padding: "24px", background: "#222", border: "1px solid #444", color: "#fff", cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={e => {e.currentTarget.style.borderColor = "#FFD700"; e.currentTarget.style.color = "#FFD700";}}
              onMouseOut={e => {e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff";}}
            >
              <FileText size={32} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", letterSpacing: "1px" }}>DATA OCR</span>
                <span style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Extract Text/CSV</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
