"use client";

// ─── React & Routing ──────────────────────────────────────────────────────────
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// ─── Data & Auth ──────────────────────────────────────────────────────────────
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/components/Toast";
import { compressImageClientSide } from "@/utils/imageUtils";
import { fetchWithAuthRetry, uploadImageToStorage } from "@/utils/uploadClient";
import { trackEvent } from "@/lib/analytics.mjs";

import { ImageIcon, Trash2, X, Loader2, Scan, Scissors, Code2, Upload, ArrowRight } from "lucide-react";

// ─── Styles ───────────────────────────────────────────────────────────────────
import "./globals.css";
import "./home.css";

// ─── Components ───────────────────────────────────────────────────────────────
import TopUpModal from "@/components/TopUpModal";
import AccountCreditMenu from "@/components/AccountCreditMenu";
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
import PricingSection from "./components/PricingSection";
import FAQSection from "./components/FAQSection";
import GreatForSection from "./components/GreatForSection";
import FloatingPromoVideo from "./components/FloatingPromoVideo";
import FeedbackWidget from "@/app/workspace/[id]/components/FeedbackWidget";

const workflowFeatures = [
  "Garment Pattern Extraction",
  "Universal Design Recovery",
  "Logo & Wordmark Tracing",
  "Background Removal",
  "Image Upscaling",
  "Image to Vector",
  "Sublimation Design Extraction",
  "Artwork Recovery",
];

const landingNavItems = [
  { id: "creative-tools", label: "Features" },
  { id: "how-it-works", label: "How It Works" },
  { id: "samples-section", label: "Examples" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
];

const landingScrollSectionIds = [
  "creative-tools",
  "how-it-works",
  "samples-section",
  "pricing",
  "production-proof",
  "faq",
];

// Originals are resized to a 2048px JPEG before upload. This limit protects
// browser memory while allowing modern phone/camera files larger than 10MB.
const MAX_SOURCE_IMAGE_MB = 25;

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
  const [selectedPricingPlan, setSelectedPricingPlan] = useState("pro");
  const [topUpInitialStep, setTopUpInitialStep] = useState(1);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeLandingSection, setActiveLandingSection] = useState(null);
  const [showPsdUpdate, setShowPsdUpdate] = useState(true);
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
    setShowPsdUpdate(localStorage.getItem("syncraft-psd-export-update-dismissed-v1") !== "1");
  }, []);

  useEffect(() => {
    const scrollContainer = containerRef.current;
    if (!scrollContainer) return undefined;

    let animationFrame = null;
    const updateActiveSection = () => {
      animationFrame = null;
      const containerBounds = scrollContainer.getBoundingClientRect();
      const activationLine = containerBounds.top + Math.min(containerBounds.height * 0.38, 360);
      let currentSection = null;

      landingScrollSectionIds.forEach((id) => {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= activationLine) currentSection = id;
      });

      setActiveLandingSection((current) => current === currentSection ? current : currentSection);
    };
    const scheduleUpdate = () => {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    scrollContainer.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      scrollContainer.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
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

    return () => {
      window.removeEventListener("dragover", handleGlobalDragOver);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const pendingPlan = sessionStorage.getItem("syncraft_pending_pricing_plan");
    if (!pendingPlan) return;

    sessionStorage.removeItem("syncraft_pending_pricing_plan");
    setSelectedPricingPlan(pendingPlan);
    setTopUpInitialStep(2);
    setShowLoginModal(false);
    setShowTopUpModal(true);
  }, [user]);

  // Handle Return from Online Payments (PayMongo QR Ph / Dodo / Polar)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const topupStatus = params.get("topup");
    if (!topupStatus) return;

    if (["paymongo-return", "dodo-return", "polar-return"].includes(topupStatus)) {
      trackEvent("checkout_return", { payment_provider: topupStatus.split("-")[0] });
      toast.success("Payment completed! Your credits are being credited.");
      if (user?.id) fetchCredits(user.id);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (["paymongo-cancelled", "dodo-cancelled", "polar-cancelled"].includes(topupStatus)) {
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
            setPublicStats({ totalUsers: data.totalUsers, avatars: data.avatars || [] });
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

    const maxSizeInMB = MAX_SOURCE_IMAGE_MB;
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
    const maxSizeInMB = MAX_SOURCE_IMAGE_MB;
    if (file.size > maxSizeInMB * 1024 * 1024) {
      toast.error(`File is too large! Maximum allowed size is ${maxSizeInMB}MB.`);
      return;
    }
    setPendingFile(file);
    setShowModal(true);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="start-screen-container" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => setOpenMenuId(null)}>
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

          <div className="landing-header-inner">
          {/* Left: Brand navigation */}
          <div className="landing-header-brand">
            <button
              type="button"
              className="landing-home-logo"
              onClick={() => {
                const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
                containerRef.current?.scrollTo({ top: 0, behavior });
                window.scrollTo({ top: 0, behavior });
              }}
              aria-label="Back to the top of the Syncraft landing page"
            >
              <img src="/logo.svg" alt="" width={765} height={137} />
            </button>
          </div>

          <nav className="landing-header-nav" aria-label="Landing page navigation">
            {landingNavItems.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={activeLandingSection === id ? "landing-header-nav__active" : undefined}
                aria-current={activeLandingSection === id ? "location" : undefined}
                onClick={() => setActiveLandingSection(id)}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Right: Auth & Credits */}
          <div className="syncraft-header-controls">
            {user ? (
              <AccountCreditMenu
                user={user}
                credits={credits}
                onOpenTopUp={() => {
                  setSelectedPricingPlan("pro");
                  setTopUpInitialStep(1);
                  setShowTopUpModal(true);
                }}
                onSignOut={handleLogout}
              />
            ) : (
              <button type="button" onClick={handleLogin} className="header-sign-in">
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* FULL WIDTH HERO SECTION */}
      <div style={{ position: "relative", width: "calc(100% + 40px)", marginLeft: "-20px", marginRight: "-20px", backgroundColor: "#1a1a1a", backgroundImage: user ? "radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)" : "radial-gradient(ellipse at 50% 78%, rgba(255, 184, 45, 0.16) 0%, rgba(255, 184, 45, 0.075) 30%, transparent 64%), radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)", backgroundSize: user ? "24px 24px" : "100% 100%, 24px 24px", backgroundPosition: user ? "0 0" : "center, 0 0", backgroundRepeat: user ? "repeat" : "no-repeat, repeat", paddingTop: "100px", paddingBottom: user ? "40px" : "110px", color: "#fff" }}>
        {user && showPsdUpdate && (
          <aside className="product-update-banner" aria-label="Product update">
            <div className="product-update-banner__inner">
              <div className="product-update-banner__message">
                <img
                  className="product-update-banner__ps"
                  src="https://www.adobe.com/cc-shared/assets/img/product-icons/svg/photoshop.svg"
                  alt=""
                  width="20"
                  height="20"
                />
                <span className="product-update-banner__copy">
                  <strong><span>NEW UPDATE:</span> Export your designs as layered PSD files.</strong>
                  <span>Open organized raster layers directly in Photoshop.</span>
                </span>
              </div>
              <button
                type="button"
                className="product-update-banner__dismiss"
                aria-label="Dismiss PSD export update"
                onClick={() => {
                  localStorage.setItem("syncraft-psd-export-update-dismissed-v1", "1");
                  setShowPsdUpdate(false);
                }}
              >
                <X size={16} />
              </button>
            </div>
          </aside>
        )}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px", position: "relative", zIndex: 2 }}>

          <div className="hero-section" style={{ justifyContent: "flex-start", margin: 0 }}>
            {/* LOGO AND UPLOAD BOX (ALWAYS VISIBLE) */}
            <div className="hero-left" style={{ margin: "0" }}>
              {user ? (
                <>
              <div className="start-logo" style={{ marginBottom: "30px", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                {/* BRAND BADGE */}
                <img src="/logo_full.png" alt="DesaynBro" width={1312} height={293} style={{ display: "block", width: "280px", height: "auto", maxWidth: "100%", margin: 0 }} />

                {/* PUBLIC STATS BADGE */}
                {publicStats.totalUsers > 0 && (
                  <div className="guest-beta-badge user-beta-badge">
                    <div className="guest-beta-avatars" aria-hidden="true">
                      {publicStats.avatars.map((url, i) => (
                        <img
                          key={url}
                          src={url}
                          alt=""
                          referrerPolicy="no-referrer"
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          style={{ zIndex: 10 - i }}
                        />
                      ))}
                    </div>
                    <div className="guest-beta-copy">
                      <strong>{publicStats.totalUsers.toLocaleString()}+</strong>
                      <span>Creatives using the Beta</span>
                    </div>
                  </div>
                )}

                <h1 className="user-hero-tagline">
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
                </>
              ) : (
                <div className="guest-hero-lead">
                  {publicStats.totalUsers > 0 && (
                    <div className="guest-beta-badge">
                      <div className="guest-beta-avatars" aria-hidden="true">
                        {publicStats.avatars.map((url, i) => (
                          <img
                            key={url}
                            src={url}
                            alt=""
                            referrerPolicy="no-referrer"
                            decoding="async"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                            style={{ zIndex: 10 - i }}
                          />
                        ))}
                      </div>
                      <div className="guest-beta-copy">
                        <strong>{publicStats.totalUsers.toLocaleString()}+</strong>
                        <span>Creatives using the Beta</span>
                      </div>
                    </div>
                  )}

                  <Image
                    className="guest-hero-art"
                    src="/landing%20page.png"
                    alt="Turn references into editable design"
                    width={3016}
                    height={1195}
                    priority
                  />

                  <h1 className="guest-hero-tagline">
                    Instantly transform your raster images (PNG, JPG) into ultra-clean, scalable vector graphics (SVG) using our advanced AI neural engine.
                  </h1>

                  <div className="guest-hero-cta">
                    <button type="button" className="guest-hero-cta__button" onClick={handleLogin}>
                      <span>Start Your First Design</span>
                      <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    <span className="guest-hero-cta__helper">Sign in to upload your image</span>
                  </div>
                </div>
              )}
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
                  borderRadius: '18px',
                  padding: '10px',
                  background: 'rgba(12, 12, 12, 0.68)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.11)',
                  boxShadow: '0 22px 50px rgba(0, 0, 0, 0.42)',
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
                      minimal
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

        <section id="creative-tools" className="toolkit-marquee" aria-label="Creative tools">
          <div className="toolkit-marquee__track">
            {[0, 1].map((copy) => (
              <ul className="toolkit-marquee__list" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {workflowFeatures.map((label) => (
                  <li className="toolkit-marquee__item" key={label}>
                    <span>{label}</span>
                    <span className="toolkit-marquee__dot" aria-hidden="true" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>  {/* ─── GREAT FOR SECTION ────────────────────────────────────────────── */}
        <GreatForSection />
        
        {/* ────────────────────────────────────────────────────────────────────── */}
        <div style={{ width: "100%", maxWidth: "1200px", margin: "60px auto 40px", padding: "0 20px" }}>
          <img src="/SYNCRAFT%20copy.jpg" alt="Syncraft AI production workflow for print-ready artwork" width={6000} height={2571} style={{ width: "100%", height: "auto", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }} />
        </div>

        <EduSection />

        {/* Feature Cards below Hero */}
        <SamplesSection />
        <PricingSection
          isSignedIn={Boolean(user)}
          onSelectPlan={(planKey) => {
            setSelectedPricingPlan(planKey);
            if (user) {
              setTopUpInitialStep(2);
              setShowTopUpModal(true);
            } else {
              sessionStorage.setItem("syncraft_pending_pricing_plan", planKey);
              setShowLoginModal(true);
            }
          }}
        />
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
          initialPlanKey={selectedPricingPlan}
          initialStep={topUpInitialStep}
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
                <a href="/acceptable-use">Acceptable Use</a>
                <a href="/copyright">Copyright</a>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("syncraft:open-cookie-settings"))}
                >
                  Cookie Settings
                </button>
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

      {/* Homepage-only floating video. Replace the source when the campaign video is ready. */}
      <FloatingPromoVideo
        src="/syncraft%20video/YAN%20ANG%20SYNCRAFT.mp4"
        dismissalKey="syncraft-floating-promo-yan-ang-syncraft-v1"
      />

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
