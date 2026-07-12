"use client";

import { memo, useState } from "react";
import { Scissors, X, Loader2 } from "lucide-react";

/**
 * RemoveBgModal — Confirmation modal for AI Background Removal.
 * Only mounted when `show` is true.
 */
const RemoveBgModal = memo(function RemoveBgModal({
  show,
  project,
  supabase,
  onClose,
  onRemoveBgApplied,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!show) return null;

  const handleConfirm = async () => {
    if (!project?.id) return;
    setIsProcessing(true);
    setErrorMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch("/api/remove-bg", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove background.");
      }

      onRemoveBgApplied(data.original_image_url, null);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong.");
      onRemoveBgApplied(null, err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(5px)",
      padding: "20px"
    }}>
      <div style={{
        background: "#111", border: "1px solid #333", borderRadius: "8px",
        width: "100%", maxWidth: "500px", display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid #222",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#1a1a1a"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Scissors size={18} color="#FFD700" />
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#eee", letterSpacing: "1px", textTransform: "uppercase" }}>
              AI Background Remover
            </h3>
          </div>
          <button 
            onClick={onClose}
            disabled={isProcessing}
            style={{ 
              background: "none", border: "none", color: "#666", cursor: isProcessing ? "not-allowed" : "pointer", 
              padding: "4px", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.2s"
            }}
            onMouseOver={e => !isProcessing && (e.currentTarget.style.color = "#fff")}
            onMouseOut={e => !isProcessing && (e.currentTarget.style.color = "#666")}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Image Preview */}
          <div style={{
            width: "100%", height: "200px", background: "#0a0a0a", borderRadius: "4px",
            border: "1px solid #222", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
            backgroundImage: "linear-gradient(45deg, #111 25%, transparent 25%), linear-gradient(-45deg, #111 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #111 75%), linear-gradient(-45deg, transparent 75%, #111 75%)",
            backgroundSize: "20px 20px", backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px"
          }}>
            {project?.original_image_url && (
              <img 
                src={`/api/proxy?url=${encodeURIComponent(project.original_image_url)}`} 
                alt="Source" 
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            )}
          </div>

          <div style={{ color: "#aaa", fontSize: "14px", lineHeight: "1.5" }}>
            This will use Fal.ai BiRefNet to perfectly extract the foreground and remove the background.
          </div>

          {errorMsg && (
            <div style={{ color: "#ff4444", fontSize: "13px", padding: "10px", background: "rgba(255,68,68,0.1)", border: "1px solid #ff4444", borderRadius: "4px" }}>
              {errorMsg}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #222",
          display: "flex", justifyContent: "flex-end", gap: "12px", background: "#1a1a1a"
        }}>
          <button 
            onClick={onClose}
            disabled={isProcessing}
            style={{ 
              background: "transparent", color: "#aaa", border: "1px solid #444",
              padding: "10px 20px", borderRadius: "0", fontSize: "12px", fontWeight: "600",
              cursor: isProcessing ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "1px"
            }}
          >
            Cancel
          </button>
          
          <button 
            onClick={handleConfirm}
            disabled={isProcessing}
            style={{ 
              background: "#FFD700", color: "#000", border: "none",
              padding: "10px 20px", borderRadius: "0", fontSize: "12px", fontWeight: "600",
              cursor: isProcessing ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: "1px",
              display: "flex", alignItems: "center", gap: "8px", opacity: isProcessing ? 0.7 : 1
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Scissors size={14} />
                Remove Background (-1 Credit)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default RemoveBgModal;
