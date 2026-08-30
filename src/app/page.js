"use client";

// ─── React & Routing ──────────────────────────────────────────────────────────
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Data & Auth ──────────────────────────────────────────────────────────────
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/components/Toast";
import { compressImageClientSide } from "@/utils/imageUtils";
import { fetchWithAuthRetry, uploadImageToStorage } from "@/utils/uploadClient";
import { trackEvent } from "@/lib/analytics.mjs";

import { ImageIcon, Monitor, LogIn, User, Trash2, LogOut, CheckCircle2, X, Loader2, Scan, Scissors, ShieldCheck, Code2, Upload, ShoppingBag } from "lucide-react";

// ─── Styles ───────────────────────────────────────────────────────────────────
import "./globals.css";
import "./home.css";

// ─── Components ───────────────────────────────────────────────────────────────
import TopUpModal from "@/components/TopUpModal";
import LoginModal from "./components/LoginModal";
import NewProjectModal from "./components/NewProjectModal";
import OnboardingModal from "./components/OnboardingModal";
import RecentProjects from "./components/RecentProjects";
import EduSection from "./components/EduSection";
import SamplesSection from "./components/SamplesSection";
import BeforeAfterSlider from "./components/BeforeAfterSlider";
import PromoModal from "./components/PromoModal";
import AIDisclaimerModal from "./components/AIDisclaimerModal";
import ProductionProofSection from "./components/TestimonialSection";
import FAQSection from "./components/FAQSection";
import GreatForSection from "./components/GreatForSection";
import QRCode from "react-qr-code";
import FeedbackWidget from "@/app/workspace/[id]/components/FeedbackWidget";

const marqueeFeatures = [
  "Garment Pattern Extraction",
  "Universal Design Recovery",
  "Logo & Wordmark Tracing",
  "Background Removal",
  "Image Upscaling",
  "Image to Vector",
  "Sublimation Design Extraction",
  "Artwork Recovery",
];

function SocialIcon({ name }) {
  const paths = {
    facebook: <path fill="currentColor" stroke="none" d="M13.5 21v-7h2.5l.5-3h-3V9.1c0-.9.3-1.6 1.7-1.6H16V4.8c-.4-.1-1.2-.2-2.2-.2-2.2 0-3.8 1.4-3.8 3.9V11H7.5v3H10v7h3.5Z" />,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
    tiktok: <path fill="currentColor" stroke="none" d="M14.5 4c.2 1.8 1.2 3.2 3 3.8v2.7c-1.1-.1-2.1-.5-3-1.2v5.7a4.6 4.6 0 1 1-4-4.6v2.8a1.8 1.8 0 1 0 1.2 1.7V4h2.8Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export default function StartScreen() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef(null);
  const upscaleInputRef = useRef(null);
  const bgRemoveInputRef = useRef(null);
  const containerRef = useRef(null);

  const [syncSessionId, setSyncSessionId] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [isQrConnected, setIsQrConnected] = useState(false);

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [recentProjects, setRecentProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);

  // ─── UI State ───────────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showCopyrightNotice, setShowCopyrightNotice] = useState(true);
  const [pendingFile, setPendingFile] = useState(null); // holds file waiting for type selection

  // ─── Modal Specific State ───────────────────────────────────────────────────
  const [modalProjectName, setModalProjectName] = useState("Untitled Design");
  const [modalTraceType, setModalTraceType] = useState("mockup_erase");
  const [projectToDelete, setProjectToDelete] = useState(null);

  // ─── Public Stats State ─────────────────────────────────────────────────────
  const [publicStats, setPublicStats] = useState({ totalUsers: 0, avatars: [] });
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);

  // ─── Initialization ─────────────────────────────────────────────────────────
  useEffect(() => {
    setShowCopyrightNotice(localStorage.getItem("syncraft-copyright-notice-dismissed") !== "1");
  }, []);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        fetchRecentProjects(session.user.id);
        fetchCredits(session.user.id);
      } else {
        setIsLoadingProjects(false);
      }
    };
    fetchSession();

    const handleGlobalDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes("Files")) {
        setIsDraggingGlobal(true);
      }
    };
    window.addEventListener("dragover", handleGlobalDragOver);

    const handleScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("dragover", handleGlobalDragOver);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Handle QR Sync Session Generation
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

  // Handle Return from Online Payments (PayMongo QR Ph / Dodo)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const topupStatus = params.get("topup");
    if (!topupStatus) return;

    if (topupStatus === "paymongo-return" || topupStatus === "dodo-return") {
      trackEvent("checkout_return", { payment_provider: topupStatus.split("-")[0] });
      toast.success("Payment completed! Your credits are being credited.");
      if (user?.id) fetchCredits(user.id);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (topupStatus === "paymongo-cancelled" || topupStatus === "dodo-cancelled") {
      trackEvent("checkout_cancelled", { payment_provider: topupStatus.split("-")[0] });
      toast.info("Payment checkout was cancelled.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user]);

  // Reactive credits sync without page reload
  useEffect(() => {
    const handleCreditsUpdate = () => {
      if (user?.id) fetchCredits(user.id);
    };
    window.addEventListener("syncraft:credits-updated", handleCreditsUpdate);
    return () => window.removeEventListener("syncraft:credits-updated", handleCreditsUpdate);
  }, [user]);

  // Handle Routed Mobile Image
  useEffect(() => {
    const checkPendingImage = async () => {
      const pendingUrl = sessionStorage.getItem("pendingMobileImage");
      if (pendingUrl && user) {
        sessionStorage.removeItem("pendingMobileImage");
        setIsQrConnected(true);
        setShowQrModal(false);

        try {
          const response = await fetch(pendingUrl);
          const blob = await response.blob();
          const mimeType = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
          const file = new File([blob], "mobile-upload.jpg", { type: mimeType });

          const mobileTraceType = sessionStorage.getItem("mobileTraceType");
          if (mobileTraceType) {
            sessionStorage.removeItem("mobileTraceType");
            handleFileUpload(file, mobileTraceType === "bg_remover", mobileTraceType);
          } else {
            handleFileUpload(file);
          }
        } catch (error) {
          console.error("Failed to process routed mobile upload:", error);
          toast.error("Failed to load received image.");
        }
      }
    };

    checkPendingImage();
    const handleEvent = () => checkPendingImage();
    window.addEventListener("mobileImageRouted", handleEvent);

    return () => {
      window.removeEventListener("mobileImageRouted", handleEvent);
    };
  }, [user]);

  // Fetch Public Stats — re-fetch whenever user returns to this tab/page
  useEffect(() => {
    const fetchStats = () => {
      fetch(`/api/public-stats?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setPublicStats({ totalUsers: data.totalUsers, avatars: data.avatars });
          }
        })
        .catch(console.error);
    };

    fetchStats(); // initial load

    // Re-fetch when user switches back to this tab (catches new sign-ups immediately)
    const handleVisibility = () => { if (document.visibilityState === "visible") fetchStats(); };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", fetchStats);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", fetchStats);
    };
  }, []);

  const fetchCredits = async (userId) => {
    const { data } = await supabase.from("profiles").select("credits, created_at").eq("id", userId).single();
    if (data) {
      setCredits(data.credits);
      const isNew = data.created_at && (Date.now() - new Date(data.created_at).getTime()) < 60000;
      if (isNew && !localStorage.getItem("onboarding_seen")) {
        setShowOnboarding(true);
        localStorage.setItem("onboarding_seen", "1");
      }
    }
  };

  const fetchRecentProjects = async (userId) => {
    setIsLoadingProjects(true);

    // Only fetch projects from the last 3 days since R2 objects are auto-deleted after 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", threeDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) setRecentProjects(data);
    setIsLoadingProjects(false);
  };

  // ─── Auth Handlers ──────────────────────────────────────────────────────────
  const handleLogin = () => {
    setShowLoginModal(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRecentProjects([]);
  };

  // ─── Project Actions ────────────────────────────────────────────────────────
  const saveRename = async (e, id) => {
    e.stopPropagation();

    const originalProject = recentProjects.find(p => p.id === id);
    const originalName = originalProject?.name;
    const newName = editValue.trim();

    if (!newName || newName === originalName) {
      setEditingId(null);
      return;
    }

    // 1. Optimistic Update (update UI first, close editor)
    setRecentProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
    setEditingId(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      // 2. Background Request
      const res = await fetch("/api/project", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ projectId: id, newName: newName })
      });

      // 3. Rollback if server responds with error
      if (!res.ok) {
        console.error("Failed to rename project on server. Reverting UI.");
        setRecentProjects(prev => prev.map(p => p.id === id ? { ...p, name: originalName } : p));
      }
    } catch (err) {
      // 3. Rollback if network error occurs
      console.error("Network error while renaming project. Reverting UI.", err);
      setRecentProjects(prev => prev.map(p => p.id === id ? { ...p, name: originalName } : p));
    }
  };

  const deleteProject = async () => {
    if (!projectToDelete) return;
    const id = projectToDelete.id;
    setRecentProjects(prev => prev.filter(p => p.id !== id));
    setProjectToDelete(null);
    setOpenMenuId(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch(`/api/project?id=${id}`, {
        method: "DELETE",
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
    } catch (err) {
      console.error("Failed to delete", err);
      fetchRecentProjects(user?.id);
    }
  };

  // ─── Upload Logic ───────────────────────────────────────────────────────────
  const handleFileUpload = async (file, isBgRemover = false, mobileTraceType = null) => {
    if (!file || !file.type.startsWith("image/")) return;

    const finalTraceType = isBgRemover ? "bg_remover" : (mobileTraceType || modalTraceType);

    // Limit upload to 10MB to save bandwidth and prevent AI processing timeouts
    const maxSizeInMB = isBgRemover ? 20 : 10;
    if (file.size > maxSizeInMB * 1024 * 1024) {
      trackEvent("upload_failure", { tool: finalTraceType, reason: "file_too_large" });
      toast.error(`File is too large! Maximum allowed size is ${maxSizeInMB}MB.`);
      return;
    }

    trackEvent("upload_start", {
      tool: finalTraceType,
      source: mobileTraceType ? "mobile_sync_or_quick_action" : "desktop_upload",
    });
    setIsUploading(true);
    try {
      // 1. Compress Image
      let fileToUpload = file;
      try {
        fileToUpload = await compressImageClientSide(file, 2048, 0.85); // 2048px max, 85% quality
      } catch (compressErr) {
        console.warn("Compression failed, uploading original:", compressErr);
      }

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) { setIsUploading(false); handleLogin(); return; }

      const uploadedImageUrl = await uploadImageToStorage(fileToUpload, { token });

      const isUpscale = finalTraceType === "upscale";

      const uploadResult = await fetchWithAuthRetry("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          imageUrl: uploadedImageUrl,
          projectName: (isBgRemover || isUpscale)
            ? file.name.replace(/\.[^/.]+$/, "")
            : (modalProjectName || file.name),
          traceType: finalTraceType
          // userId intentionally omitted — server reads from verified token
        })
      }, token);
      const response = uploadResult.response;

      const data = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "Project creation failed");

      trackEvent("tool_selected", { tool: finalTraceType });
      trackEvent("upload_complete", { tool: finalTraceType });

      if (isBgRemover) {
        router.push(`/bg-remover/${data.projectId}`);
      } else {
        router.push(`/workspace/${data.projectId}`);
      }
    } catch (error) {
      trackEvent("upload_failure", {
        tool: finalTraceType,
        reason: error?.code === "AUTH_SESSION_EXPIRED" ? "auth_session_expired" : "project_creation_failed",
      });
      console.error("Upload error:", error);
      if (error?.code === "AUTH_SESSION_EXPIRED") {
        setUser(null);
        setRecentProjects([]);
        setShowLoginModal(true);
        toast.error("Your login session expired. Please log in again, then retry.");
      } else {
        toast.error("Failed to create project: " + error.message);
      }
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!user) { setShowLoginModal(true); return; }
    if (e.dataTransfer.files?.length > 0) handleFileUpload(e.dataTransfer.files[0]);
  };

  // Open type-selection modal with a pre-selected file (from drop or file picker)
  const openModalWithFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (!user) { setShowLoginModal(true); return; }
    const maxSizeInMB = 10;
    if (file.size > maxSizeInMB * 1024 * 1024) {
      toast.error(`File is too large! Maximum allowed size is ${maxSizeInMB}MB.`);
      return;
    }
    setPendingFile(file);
    setShowModal(true);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="start-screen-container" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => setOpenMenuId(null)}>
      {/* Global Drag & Drop Overlay */}
      {isDraggingGlobal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.95)", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "4px dashed #d4ff59" }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setIsDraggingGlobal(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingGlobal(false);
            if (e.dataTransfer.files?.length > 0) {
              openModalWithFile(e.dataTransfer.files[0]);
            }
          }}
        >
          <div style={{ background: "#d4ff59", padding: "24px", borderRadius: "50%", marginBottom: "24px" }}><ImageIcon size={48} color="#000" /></div>
          <h2 style={{ color: "#d4ff59", fontSize: "32px", margin: 0, fontWeight: "800" }}>Drop your image anywhere</h2>
          <p style={{ color: "#aaa", fontSize: "16px", marginTop: "12px" }}>Release to start tracing instantly.</p>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "64px", background: "rgba(17, 17, 17, 0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)", zIndex: 50, display: "flex", justifyContent: "center", padding: "0 20px" }}>

          <div style={{ display: "flex", width: "100%", maxWidth: "1200px", alignItems: "center", justifyContent: "space-between" }}>
          {/* Left: Brand navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", opacity: scrolled ? 1 : 0, pointerEvents: scrolled ? "auto" : "none", transition: "opacity 0.3s ease" }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <img src="/logo.svg" alt="Syncraft Navbar Logo" width={765} height={137} style={{ height: "32px", width: "auto" }} />
            </div>
          </div>

          {/* Right: Auth & Credits */}
          <div className="syncraft-header-controls">
            {user ? (
              <>
                {/* Store Navigation */}
                <Link
                  href="/store"
                  aria-label="Open Syncraft Store"
                  className="syncraft-header-control syncraft-header-control--store"
                >
                  <ShoppingBag size={14} aria-hidden="true" />
                  STORE
                </Link>

                {/* Premium Credits Badge */}
                <button
                  type="button"
                  onClick={() => setShowTopUpModal(true)}
                  className="syncraft-header-control"
                  aria-label={credits <= 0 ? "Buy credits. Open top up" : `${credits} credits. Open top up`}
                >
                  {credits <= 0 ? (
                    "BUY CREDITS"
                  ) : (
                    <>
                      <span className="syncraft-header-control__value">{credits}</span>
                      <span className="syncraft-header-control__label">CREDITS</span>
                    </>
                  )}
                </button>

                {/* Profile Pill */}
                <div className="syncraft-header-control">
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} referrerPolicy="no-referrer" className="syncraft-header-control__avatar" alt="Avatar" />
                  ) : <div className="syncraft-header-control__avatar" style={{ background: "#333", display: "flex", alignItems: "center", justifyContent: "center" }}><User size={14} color="#aaa" /></div>}
                  <span className="syncraft-header-control__text">{user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0]}</span>
                </div>

                {/* Logout Icon Button */}
                <button onClick={handleLogout} style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.color = "#ff4444"; e.currentTarget.style.background = "rgba(255,68,68,0.1)"; }} onMouseOut={e => { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "transparent"; }} title="Logout">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button onClick={handleLogin} className="start-btn" style={{ background: "#d4ff59", color: "#000", borderColor: "#d4ff59", display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", padding: "8px 16px", borderRadius: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
                <LogIn size={16} /> Log In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* FULL WIDTH HERO SECTION */}
      <div style={{ position: "relative", width: "calc(100% + 40px)", marginLeft: "-20px", marginRight: "-20px", background: "#1a1a1a", paddingTop: "100px", paddingBottom: "40px", color: "#fff" }}>
        {showCopyrightNotice && (
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", background: "#111", borderBottom: "1px solid rgba(255,255,255,0.08)", zIndex: 3 }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", color: "#d8d8d8", fontSize: "12px", lineHeight: "1.5", textAlign: "center" }}>
              <ShieldCheck size={15} color="#d4ff59" style={{ flexShrink: 0 }} />
              <span>
                Copyright reminder: only upload or generate designs you own, are authorized to use, or have rights to process. Unauthorized copyrighted or trademarked content may be removed.
              </span>
              <button
                type="button"
                aria-label="Dismiss copyright notice"
                onClick={() => {
                  localStorage.setItem("syncraft-copyright-notice-dismissed", "1");
                  setShowCopyrightNotice(false);
                }}
                style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto" }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px", position: "relative", zIndex: 2 }}>

          <div className="hero-section" style={{ justifyContent: "flex-start", margin: 0 }}>
            {/* LOGO AND UPLOAD BOX (ALWAYS VISIBLE) */}
            <div className="hero-left" style={{ margin: "0" }}>
              <div className="start-logo" style={{ marginBottom: "30px", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                <img src="/logo.svg" alt="Syncraft Logo" width={765} height={137} style={{ width: "350px", maxWidth: "100%", height: "auto", margin: 0 }} />

                {/* BRAND BADGE */}
                <img src="/logo_full.png" alt="Syncraft" width={1312} height={293} style={{ display: "block", width: "132px", height: "auto", maxWidth: "100%", marginTop: "12px" }} />

                {/* PUBLIC STATS BADGE */}
                {publicStats.totalUsers > 0 && (
                  <div style={{ 
                    display: "inline-flex", 
                    alignItems: "center", 
                    background: "linear-gradient(135deg, rgba(212, 255, 89, 0.08) 0%, rgba(20,20,20,0) 100%)", 
                    border: "1px solid rgba(212, 255, 89, 0.15)", 
                    padding: "6px 16px 6px 6px", 
                    borderRadius: "99px", 
                    marginTop: "24px", 
                    gap: "14px",
                    boxShadow: "0 8px 32px rgba(212, 255, 89, 0.05)",
                    backdropFilter: "blur(10px)"
                  }}>

                    {/* Avatar Group (Real User Profiles) */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {publicStats.avatars.length > 0 && publicStats.avatars.map((url, i) => (
                        <img 
                          key={i} 
                          src={url} 
                          alt="User" 
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23888888'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
                          }}
                          style={{ 
                            width: "32px", 
                            height: "32px", 
                            borderRadius: "50%", 
                            border: "2px solid #111", 
                            marginLeft: i > 0 ? "-14px" : "0", 
                            backgroundColor: "#222", 
                            objectFit: "cover", 
                            zIndex: 10 - i, 
                            boxShadow: "0 4px 10px rgba(0,0,0,0.4)"
                          }} 
                        />
                      ))}
                    </div>

                    {/* Stats Info (Modern Layout) */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#aaa", fontWeight: "500", letterSpacing: "0.2px" }}>
                      <span style={{ color: "#d4ff59", fontWeight: "700" }}>
                        {publicStats.totalUsers.toLocaleString()}+
                      </span>
                      Creatives using the Beta
                    </div>
                  </div>
                )}

                <h1 style={{
                  fontSize: "15px", 
                  color: "#e2e2e2", 
                  textAlign: "center", 
                  margin: "24px 0 0",
                  maxWidth: "580px", 
                  lineHeight: "1.6", 
                  textWrap: "balance", 
                  fontWeight: "600"
                }}>
                  Instantly transform your raster images (PNG, JPG) into ultra-clean, scalable vector graphics (SVG) using our advanced AI neural engine.
                </h1>
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "nowrap", justifyContent: "center", width: "100%", overflowX: "auto" }}>
                {/* "New Project" and "Open PC" were removed — both landed on the exact
                    same category-picker modal as clicking the upload box below, just
                    in a different order. The upload box remains the single entry point
                    for that flow. */}
                <button className="start-btn" onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginModal(true); return; } setShowQrModal(true); }} disabled={isUploading} style={actionBtnStyle({ disabled: isUploading })} {...actionBtnHover({ disabled: isUploading })}>
                  <Scan size={13} /> Scan Phone
                </button>
                <button className="start-btn" onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginModal(true); return; } upscaleInputRef.current?.click(); }} disabled={isUploading} style={actionBtnStyle({ disabled: isUploading })} {...actionBtnHover({ disabled: isUploading })}>
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} Image Upscale
                </button>
                <button className="start-btn" onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginModal(true); return; } bgRemoveInputRef.current.click(); }} disabled={isUploading} style={actionBtnStyle({ accent: true, disabled: isUploading })} {...actionBtnHover({ accent: true, disabled: isUploading })}>
                  <Scissors size={13} /> BG Remover
                </button>
              </div>

              <div
                id="syncraft-upload"
                className="hero-upload-box"
                style={{ 
                  flex: 1, 
                  scrollMarginTop: "120px",
                  background: "#262626", 
                  padding: "16px", 
                  borderRadius: "28px", 
                  display: "flex", 
                  flexDirection: "column", 
                  boxShadow: "0 10px 30px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1)", 
                  border: "1px solid rgba(255,255,255,0.05)"
                }}
              >
                <div 
                  style={{ 
                    width: "100%", 
                    flex: 1, 
                    background: "#111111", 
                    backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 10px)",
                    borderRadius: "20px", 
                    padding: "36px 24px", 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    cursor: "pointer", 
                    transition: "all 0.2s ease", 
                    border: "1px solid rgba(255,255,255,0.05)",
                    position: "relative"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#161616";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.backgroundImage = "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 10px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#111111";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.backgroundImage = "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 10px)";
                  }}
                  onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginModal(true); return; } fileInputRef.current.click(); }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files?.length > 0) {
                      openModalWithFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", color: "#fff", marginBottom: "20px" }}>
                    <div style={{ 
                      width: "48px", 
                      height: "48px", 
                      borderRadius: "50%", 
                      background: "rgba(255,255,255,0.05)", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      border: "1px solid rgba(255,255,255,0.08)",
                      marginBottom: "8px"
                    }}>
                      {isUploading ? <Loader2 size={20} className="animate-spin" color="#ffffff" /> : <Upload size={20} color="#ffffff" />}
                    </div>
                    <div style={{ fontWeight: "700", fontSize: "16px", letterSpacing: "0.5px" }}>
                      {isUploading ? "UPLOADING..." : "UPLOAD IMAGES"}
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                    <span style={{ color: "#777", fontSize: "13px" }}>or drop an image here</span>
                    <span style={{ color: "#555", fontSize: "11px", letterSpacing: "0.5px" }}>PNG, JPG, JPEG, WEBP</span>
                  </div>

                  {/* Elegant checkbox placement inside the dark box */}
                  <div 
                    style={{ 
                      marginTop: "24px",
                      paddingTop: "16px",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      width: "100%",
                      maxWidth: "280px",
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      gap: "8px"
                    }}
                    onClick={(e) => e.stopPropagation()} // prevent triggering file upload when clicking checkbox container
                  >
                    <input 
                      type="checkbox" 
                      id="aiEnhance" 
                      defaultChecked 
                      style={{ 
                        width: "15px", 
                        height: "15px", 
                        accentColor: "#ffffff", 
                        cursor: "pointer" 
                      }} 
                    />
                    <label 
                      htmlFor="aiEnhance" 
                      style={{ 
                        fontSize: "12px", 
                        color: "#888", 
                        cursor: "pointer", 
                        fontWeight: "500", 
                        userSelect: "none" 
                      }}
                    >
                      Enhance with AI <span style={{ color: "#555" }}>(Removes noise)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL — Recent Projects (logged in) OR Sample Extractions (guest) */}
            {user ? (
              <div className="hero-right" style={{ width: "100%" }}>
                <RecentProjects
                  user={user}
                  isLoadingProjects={isLoadingProjects}
                  recentProjects={recentProjects}
                  editingId={editingId}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onNavigate={(proj) => router.push(proj.trace_type === 'bg_remover' ? `/bg-remover/${proj.id}` : `/workspace/${proj.id}`)}
                  onStartEditing={(e, proj) => { e.stopPropagation(); setOpenMenuId(null); setEditingId(proj.id); setEditValue(proj.name); }}
                  onCancelEditing={(e) => { e.stopPropagation(); setEditingId(null); }}
                  onSaveRename={saveRename}
                  onConfirmDelete={(e, proj) => { e.stopPropagation(); setProjectToDelete(proj); }}
                />
              </div>
            ) : (
              <div className="hero-right" style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
                {/* Single featured recovery sample */}
                <div style={{
                  position: 'relative',
                  borderRadius: '24px',
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                  borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 30px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                  width: '100%',
                  maxWidth: '560px'
                }}>
                  <div style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)',
                    position: 'relative',
                    zIndex: 2,
                    background: 'transparent'
                  }}>
                    <BeforeAfterSlider
                      title="Universal print recovery"
                      rasterUrl="/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Reference.webp"
                      vectorUrl="/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Upscaled.webp"
                      originalLabel="Original Reference"
                      resultLabel="Recovered Flat Art"
                      height="360px"
                      objectFit="cover"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CLEAN STRAIGHT DIVIDER (Replaced curved wave for new UI) */}
        <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "1px", background: "linear-gradient(to right, transparent, #333, transparent)" }}></div>
      </div>

      {/* Main Content Wrapper (For the rest of the page) */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" }}>

        {/* SCROLLING FEATURE MARQUEE */}
        <div className="marquee-container" style={{ 
          padding: "20px 0",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.022) 50%, transparent)", 
          borderTop: "1px solid rgba(255,255,255,0.09)",
          borderBottom: "1px solid rgba(255,255,255,0.09)",
          width: "100%",
          marginBottom: "0px",
          marginTop: "24px"
        }}>
          <div className="marquee-content">
            {[...marqueeFeatures, ...marqueeFeatures].map((label, index) => (
              <div className="marquee-feature-group" key={`${label}-${index}`}>
                <span className="marquee-feature">{label}</span>
                <span className="marquee-separator" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        {/* ─── GREAT FOR SECTION ────────────────────────────────────────────── */}
        <GreatForSection />
        
        {/* ────────────────────────────────────────────────────────────────────── */}
        <div style={{ width: "100%", maxWidth: "1200px", margin: "60px auto 40px", padding: "0 20px" }}>
          <img src="/Banner.webp" alt="Syncraft AI production workflow for print-ready artwork" width={1600} height={691} style={{ width: "100%", height: "auto", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }} />
        </div>

        <EduSection />

        {/* Feature Cards below Hero */}
        <SamplesSection />
        <ProductionProofSection />
        <FAQSection />
        {/* Hidden File Input — shows type-selector modal before uploading */}
        <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files[0]) openModalWithFile(e.target.files[0]); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />
        <input type="file" ref={upscaleInputRef} onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0], false, "upscale"); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />
        <input type="file" ref={bgRemoveInputRef} onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0], true); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />

        {/* ─── Modals ────────────────────────────────────────────────────────── */}
        <NewProjectModal
          show={showModal}
          projectName={modalProjectName} setProjectName={setModalProjectName}
          traceType={modalTraceType} setTraceType={setModalTraceType}
          isUploading={isUploading}
          onClose={() => { setShowModal(false); setPendingFile(null); }}
          onSelectImage={() => {
            if (pendingFile) {
              handleFileUpload(pendingFile);
            } else {
              fileInputRef.current.click();
            }
          }}
          onSelectBgRemover={() => {
            bgRemoveInputRef.current.click();
          }}
        />

        <OnboardingModal
          show={showOnboarding}
          onClose={() => setShowOnboarding(false)}
        />

        <TopUpModal
          show={showTopUpModal}
          user={user}
          supabase={supabase}
          onClose={() => setShowTopUpModal(false)}
          onLoginRequired={() => { setShowTopUpModal(false); setShowLoginModal(true); }}
          onCreditUpdated={() => { if (user?.id) fetchCredits(user.id); }}
        />

        <LoginModal
          show={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          supabase={supabase}
        />

        {/* Delete Confirmation Modal */}
        {projectToDelete && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: "400px", textAlign: "center" }}>
              <div className="modal-icon text-danger" style={{ marginBottom: "15px" }}>
                <Trash2 size={48} strokeWidth={1} color="#ff4444" />
              </div>
              <h3 style={{ marginBottom: "10px" }}>Delete Project?</h3>
              <p style={{ color: "#888", marginBottom: "25px", fontSize: "13px" }}>
                Are you sure you want to delete <strong>"{projectToDelete.name}"</strong>? This will permanently remove the project and its files from the cloud. This action cannot be undone.
              </p>
              <div className="modal-actions" style={{ justifyContent: "center" }}>
                <button className="btn-secondary" onClick={() => setProjectToDelete(null)}>Cancel</button>
                <button className="btn-primary bg-danger" style={{ backgroundColor: "#ff4444", color: "#fff" }} onClick={deleteProject}>Delete Forever</button>
              </div>
            </div>
          </div>
        )}

        {/* QR Sync Modal */}
        {showQrModal && (
          <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px", textAlign: "center", padding: "40px", position: "relative" }}>

              {/* Minimal Close Button */}
              <button
                onClick={() => setShowQrModal(false)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "none",
                  border: "none",
                  color: "#666",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; e.currentTarget.style.background = "none"; }}
              >
                <X size={20} />
              </button>

              <h3 style={{ margin: "0 0 10px 0", fontSize: "24px" }}>Scan to Upload</h3>
              <p style={{ color: "#aaa", margin: "0 0 30px 0", fontSize: "14px" }}>
                Point your phone's camera at this QR code. Take a picture of your logo or business card, and it will magically appear here.
              </p>

              <div style={{ background: "#fff", padding: "20px", borderRadius: "16px", display: "inline-block", marginBottom: "30px" }}>
                <QRCode
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/mobile?sync=${syncSessionId}`}
                  size={220}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                />
              </div>

              {isQrConnected ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#22c55e" }}>
                  <CheckCircle2 size={18} /> <span style={{ fontWeight: "bold" }}>Receiving Image...</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#888" }}>
                  <Monitor size={16} className="animate-pulse" /> <span>Waiting for your phone...</span>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Uploading Overlay */}
        {isUploading && !showModal && (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: "340px", textAlign: "center", padding: "40px 30px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Loader2 size={32} color="#d4ff59" className="animate-spin" style={{ marginBottom: "20px" }} />
              <div style={{ fontSize: "16px", color: "#fff", fontWeight: "600", marginBottom: "8px" }}>Preparing Image...</div>
              <p style={{ color: "#aaa", margin: 0, fontSize: "13px", lineHeight: "1.6" }}>
                Transferring your photo to the workspace.
              </p>
            </div>
          </div>
        )}


        <footer className="site-footer">
          <div className="site-footer-main">
            <div className="site-footer-brand">
              <img src="/logo.svg" alt="Syncraft" width={765} height={137} />
              <p>AI-powered production tools for clean SVG tracing, background removal, upscaling, and print-ready artwork delivery.</p>
              <div className="site-footer-socials" aria-label="Social media">
                <a href="https://web.facebook.com/profile.php?id=61562539277199" target="_blank" rel="noreferrer" aria-label="Syncraft on Facebook"><SocialIcon name="facebook" /></a>
                <button type="button" disabled aria-label="Instagram profile coming soon"><SocialIcon name="instagram" /></button>
                <a href="https://www.tiktok.com/@syncraftech1" target="_blank" rel="noreferrer" aria-label="Syncraft on TikTok"><SocialIcon name="tiktok" /></a>
              </div>
            </div>

            <nav className="site-footer-links" aria-label="Footer navigation">
              <div>
                <h3>Resources</h3>
                <a href="/privacy">Privacy Policy</a>
                <a href="/terms">Terms of Service</a>
                <a href="/refunds">Refund Policy</a>
                <a href="#faq">FAQ</a>
              </div>
              <div>
                <h3>Company</h3>
                <a href="/#syncraft-upload">Workspace</a>
                <a href="/store">Store</a>
                <a href="/image-upscaler">Image Upscaler</a>
                <a href="/image-to-vector">Image to Vector</a>
                <a href="/docs/api">API Documentation</a>
                <a href="https://m.me/105884602605306" target="_blank" rel="noreferrer">Customer Support</a>
              </div>
            </nav>
          </div>
          <div className="site-footer-bottom">© 2024–2026 Syncraft. All rights reserved.</div>
        </footer>

      </div>


      {/* Promo Popup (Removed) */}
      {/* <PromoModal onBuyClick={() => window.open('https://m.me/105884602605306', '_blank')} /> */}

      {/* AI Guidelines Popup (Removed) */}
      {/* <AIDisclaimerModal /> */}

      {/* ─── SEO: FAQ Structured Data (JSON-LD) ─────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is Syncraft?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Syncraft is an AI-powered tool for authorized sublimation jersey design extraction, vector auto-tracing, logo enhancement, background removal, and image upscaling. It is built for print shops and apparel designers who need cleaner production files faster.",
                },
              },
              {
                "@type": "Question",
                "name": "How do I extract a flat sublimation design from a jersey mockup?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Upload an authorized jersey mockup to Syncraft, choose Garment Pattern Extraction, and review the AI-assisted flat artwork before using it in production.",
                },
              },
              {
                "@type": "Question",
                "name": "Can Syncraft convert my logo to an SVG vector?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. Syncraft can auto-trace supported PNG or JPG logos into scalable SVG artwork that you can review and refine in Adobe Illustrator, CorelDRAW, or Inkscape.",
                },
              },
              {
                "@type": "Question",
                "name": "Does Syncraft support background removal for sublimation designs?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. Syncraft has an AI background remover for supported jersey designs, logos, and product photos, with transparent PNG output.",
                },
              },
              {
                "@type": "Question",
                "name": "Can I upscale a low-resolution sublimation design?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Syncraft can improve the resolution of supported sublimation designs, jersey artwork, and logos. Always review fine details and print-provider requirements before production.",
                },
              },
              {
                "@type": "Question",
                "name": "Is Syncraft free to use?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Syncraft is a prepaid credit service. Credit packages currently start at ₱60, and each tool displays its credit cost before processing.",
                },
              },
              {
                "@type": "Question",
                "name": "What file formats does Syncraft support?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Syncraft accepts PNG, JPG, JPEG, and WebP uploads. Depending on the tool, it can output SVG files, higher-resolution PNG images, and transparent PNG cutouts.",
                },
              },
            ],
          }),
        }}
      />
      


      {/* ─── SEO: HowTo Structured Data ─────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            "name": "How to Extract a Flat Sublimation Design from a Jersey Mockup",
            "description":
              "Use Syncraft to create a flatter production starting point from an authorized jersey photo or mockup, then review the result before manufacturing.",
            "totalTime": "PT2M",
            "tool": {
              "@type": "HowToTool",
              "name": "Syncraft Garment Pattern Extraction",
            },
            "step": [
              {
                "@type": "HowToStep",
                "position": 1,
                "name": "Upload Your Jersey Image",
                "text": "Upload a photo or mockup of the jersey you want to extract. Supported formats: PNG, JPG.",
                "url": "https://syncraftech.com",
              },
              {
                "@type": "HowToStep",
                "position": 2,
                "name": "Choose Flat Extract Mode",
                "text": "Select the 'Flat Extract' or 'Auto-Trace' option and let the AI remove the 3D shirt shape and correct perspective.",
                "url": "https://syncraftech.com",
              },
              {
                "@type": "HowToStep",
                "position": 3,
                "name": "Review and Upscale",
                "text": "Review the AI-generated flat design and optionally upscale it to 4K for high-resolution sublimation printing.",
                "url": "https://syncraftech.com",
              },
              {
                "@type": "HowToStep",
                "position": 4,
                "name": "Export as SVG or PNG",
                "text": "Download your clean, print-ready flat design as an SVG vector or 4K PNG file.",
                "url": "https://syncraftech.com",
              },
            ],
          }),
        }}
      />
    </div>
  );
}

// ─── Hero action row ─────────────────────────────────────────────────────────
// Monochrome "product card" look — dark textured chips with a light frame
// border, one inverted (white-on-black) primary instead of a colour accent.
// Hover lives in JS rather than the .start-btn CSS rule because an inline
// `background` outranks a stylesheet :hover, which is why the old row never
// highlighted.

const ACTION_BTN = {
  bg: "#111111",
  bgHover: "#1a1a1a",
  border: "rgba(255,255,255,0.14)",
  borderHover: "rgba(255,255,255,0.32)",
  text: "#e8e8e8",
  primaryBg: "#262626",
  primaryBgHover: "#333333",
  primaryText: "#ffffff",
};

// Faint diagonal hairlines, matching the subtle texture on the dark card in
// the reference — kept off the inverted (white) primary button, which stays
// flat like the card's plain white frame.
const ACTION_BTN_TEXTURE =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 9px)";

function actionBtnStyle({ accent = false, disabled = false } = {}) {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "12px 20px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "800",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    backgroundColor: "#111111",
    border: "1px solid #555555",
    color: "#ffffff",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    transition: "all 0.25s ease-out",
  };
}

function actionBtnHover({ accent = false, disabled = false } = {}) {
  if (disabled) return {};
  return {
    onMouseEnter: (e) => {
      e.currentTarget.style.backgroundColor = "#1a1a1a";
      e.currentTarget.style.borderColor = "#777777";
      e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.backgroundColor = "#111111";
      e.currentTarget.style.borderColor = "#555555";
      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    },
  };
}
