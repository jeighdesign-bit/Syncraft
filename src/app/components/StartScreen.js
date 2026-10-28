"use client";

// ─── React & Routing ──────────────────────────────────────────────────────────
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// ─── Data & Auth ──────────────────────────────────────────────────────────────
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/components/Toast";
import { compressImageClientSide } from "@/utils/imageUtils";
import { fetchWithAuthRetry, uploadImageToStorage } from "@/utils/uploadClient";
import { trackEvent } from "@/lib/analytics.mjs";
import { readApiResponse } from "@/lib/apiResponse.mjs";
import { CREDIT_PLANS } from "@/lib/paymentPlans";

import { ImageIcon, Trash2, X, Loader2, Scissors, Upload, ArrowRight } from "lucide-react";

// ─── Styles ───────────────────────────────────────────────────────────────────
import "../globals.css";
import "../home.css";

// ─── Components ───────────────────────────────────────────────────────────────
import TopUpModal from "@/components/TopUpModal";
import LoginModal from "./LoginModal";
import NewProjectModal from "./NewProjectModal";
import WorkspaceSidebar from "./WorkspaceSidebar";
import WorkspaceRightPanel from "./WorkspaceRightPanel";
import LogoStudioIcon from "@/components/LogoStudioIcon";
import OnboardingModal from "./OnboardingModal";
import RecentProjects from "./RecentProjects";
import EduSection from "./EduSection";
import SamplesSection from "./SamplesSection";
import PromoModal from "./PromoModal";
import AIDisclaimerModal from "./AIDisclaimerModal";
import TestimonialSection from "./TestimonialSection";
import PricingSection from "./PricingSection";
import FAQSection from "./FAQSection";
import HeroShowcase from "./HeroShowcase";
import FloatingPromoVideo from "./FloatingPromoVideo";
import SectionBadge from "./SectionBadge";
import WhySyncraft from "./WhySyncraft";
import LogoStudioAnnouncement from "./LogoStudioAnnouncement";
import FeedbackWidget from "@/app/workspace/[id]/components/FeedbackWidget";

const landingNavItems = [
  { id: "how-it-works", label: "How It Works" },
  { id: "samples-section", label: "Examples" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
];

const landingScrollSectionIds = [
  "how-it-works",
  "samples-section",
  "pricing",
  "faq",
];

// Originals are resized to a 2048px JPEG before upload. This limit protects
// browser memory while allowing modern phone/camera files larger than 10MB.
const MAX_SOURCE_IMAGE_MB = 25;

const featuredTools = [
  "Garment Extraction",
  "Logo Extraction",
  "Logo Studio",
  "Background Removal",
  "Image Upscaling",
  "Image to Vector",
];

function AnimatedFeatureHeadline({ className = "" }) {
  const [activeTool, setActiveTool] = useState(0);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionPreference.matches) return undefined;

    const timer = window.setInterval(() => {
      setActiveTool((current) => (current + 1) % featuredTools.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <h1 className={`user-feature-headline ${className}`.trim()}>
      <span className="user-feature-headline__lead">Make more with</span>
      <span className="user-feature-headline__slot" aria-live="off">
        <span key={featuredTools[activeTool]} className="user-feature-headline__name">{featuredTools[activeTool]}</span>
      </span>
    </h1>
  );
}

function HeroWorkflowTagline({ className }) {
  return (
    <p className={className}>
      Extract designs from garments, recover logos from images, or create a new logo from text, a photo, or a sketch. <strong>Refine your result</strong> and export an <span className="hero-format hero-format--svg">SVG</span> or <span className="hero-format hero-format--png">PNG</span>.
    </p>
  );
}

function SocialIcon({ name }) {
  const paths = {
    facebook: <path fill="currentColor" stroke="none" d="M13.5 21v-7h2.5l.5-3h-3V9.1c0-.9.3-1.6 1.7-1.6H16V4.8c-.4-.1-1.2-.2-2.2-.2-2.2 0-3.8 1.4-3.8 3.9V11H7.5v3H10v7h3.5Z" />,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
    tiktok: <path fill="currentColor" stroke="none" d="M14.5 4c.2 1.8 1.2 3.2 3 3.8v2.7c-1.1-.1-2.1-.5-3-1.2v5.7a4.6 4.6 0 1 1-4-4.6v2.8a1.8 1.8 0 1 0 1.2 1.7V4h2.8Z" />,
    youtube: <path fill="currentColor" stroke="none" d="M21.2 7.2a2.8 2.8 0 0 0-2-2C17.5 4.8 12 4.8 12 4.8s-5.5 0-7.2.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2.4 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.2.4 7.2.4s5.5 0 7.2-.4a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .4-4.8 29 29 0 0 0-.4-4.8ZM10 15.1V8.9l5.4 3.1-5.4 3.1Z" />,
    x: <path fill="currentColor" stroke="none" d="M5.2 4h3.5l3.9 5.2L17 4h1.8l-5.4 6.5L19.8 20h-3.5l-4.4-5.9L7 20H5.2l5.9-7.2L5.2 4Zm2.6 1.5 9.2 13h1L8.8 5.5h-1Z" />,
    discord: <path fill="currentColor" stroke="none" d="M18.9 5.3A16 16 0 0 0 15 4.1l-.5 1a14 14 0 0 0-5 0l-.6-1A16 16 0 0 0 5 5.3C2.5 9 1.8 12.7 2.1 16.4a16 16 0 0 0 4.8 2.4l1.2-1.6-1.8-.9.4-.3a11.5 11.5 0 0 0 10.6 0l.4.3-1.8.9 1.2 1.6a16 16 0 0 0 4.8-2.4c.4-4.3-.8-8-3-11.1ZM8.5 14.4c-1 0-1.8-1-1.8-2.2S7.5 10 8.5 10s1.8 1 1.8 2.2-.8 2.2-1.8 2.2Zm7 0c-1 0-1.8-1-1.8-2.2s.8-2.2 1.8-2.2 1.8 1 1.8 2.2-.8 2.2-1.8 2.2Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export default function StartScreen({ workspaceRoute = false, initialUser = null }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef(null);
  const extractionInputRef = useRef(null);
  const extractionCategoryRef = useRef(null);
  const upscaleInputRef = useRef(null);
  const bgRemoveInputRef = useRef(null);
  const containerRef = useRef(null);

  // ─── Data State ─────────────────────────────────────────────────────────────
  const [recentProjects, setRecentProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [user, setUser] = useState(initialUser);
  const isWorkspace = workspaceRoute && Boolean(user);
  const [isCheckingSession, setIsCheckingSession] = useState(!workspaceRoute);
  const [credits, setCredits] = useState(0);

  // ─── UI State ───────────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [openingTool, setOpeningTool] = useState(null);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [sidebarModalCategory, setSidebarModalCategory] = useState(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [selectedPricingPlan, setSelectedPricingPlan] = useState("pro");
  const [topUpInitialStep, setTopUpInitialStep] = useState(1);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginReturnTo, setLoginReturnTo] = useState("/workspace");
  useEffect(() => {
    if (!workspaceRoute && new URLSearchParams(window.location.search).get("signin") === "logo-studio") {
      setLoginReturnTo("/logo-studio");
      setShowLoginModal(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("signin");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, [workspaceRoute]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeLandingSection, setActiveLandingSection] = useState(null);
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

  useEffect(() => {
    if (!openingTool) return undefined;
    const timer = window.setTimeout(() => {
      if (openingTool === 'logo') router.push('/logo-studio');
      else setOpeningTool(null);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [openingTool, router]);

  // ─── Initialization ─────────────────────────────────────────────────────────

  useEffect(() => {
    const scrollContainer = containerRef.current;
    if (workspaceRoute || !scrollContainer) return undefined;

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
  }, [isCheckingSession, workspaceRoute]);

  useEffect(() => {
    let cancelled = false;
    const fetchSession = async () => {
      try {
        const signedInUser = workspaceRoute ? initialUser : (await supabase.auth.getUser()).data.user;
        if (!cancelled) setUser(signedInUser || null);
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    };
    fetchSession().catch(() => { if (!cancelled) setIsLoadingProjects(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setUser(session?.user || null);
      if (session?.user) setShowLoginModal(false);
      else if (workspaceRoute && event === "SIGNED_OUT") router.replace("/");
    });

    const handleGlobalDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes("Files")) {
        setIsDraggingGlobal(true);
      }
    };
    window.addEventListener("dragover", handleGlobalDragOver);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("dragover", handleGlobalDragOver);
    };
  }, [workspaceRoute, initialUser?.id]);

  useEffect(() => {
    if (!user?.id) {
      setRecentProjects([]);
      setIsLoadingProjects(false);
      setCredits(0);
      return;
    }
    if (workspaceRoute) {
      fetchCredits(user.id);
      fetchRecentProjects(user.id);
    } else setIsLoadingProjects(false);
  }, [user?.id, workspaceRoute]);

  useEffect(() => {
    if (!user) return;

    const pendingPlan = sessionStorage.getItem("syncraft_pending_pricing_plan");
    if (!pendingPlan) return;

    // Keep checkout in the member workspace, including after signing in.
    if (!workspaceRoute) {
      router.push("/workspace");
      return;
    }

    sessionStorage.removeItem("syncraft_pending_pricing_plan");
    setSelectedPricingPlan(pendingPlan);
    setTopUpInitialStep(2);
    setShowLoginModal(false);
    setShowTopUpModal(true);
  }, [user, workspaceRoute, router]);

  // Handle Return from Online Payments (PayMongo QR Ph / Dodo / Polar)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const topupStatus = params.get("topup");
    if (!topupStatus) return;

    if (["paymongo-return", "dodo-return", "polar-return"].includes(topupStatus)) {
      trackEvent("checkout_return", { payment_provider: topupStatus.split("-")[0] });
      toast.success("Payment completed! Your credits are being credited.");
      if (workspaceRoute && user?.id) fetchCredits(user.id);
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
      if (workspaceRoute && user?.id) fetchCredits(user.id);
    };
    window.addEventListener("syncraft:credits-updated", handleCreditsUpdate);
    return () => window.removeEventListener("syncraft:credits-updated", handleCreditsUpdate);
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
      if (workspaceRoute && isNew && !localStorage.getItem("onboarding_seen")) {
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
    if (workspaceRoute) router.replace("/");
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

      const data = await readApiResponse(response, "Project creation is temporarily unavailable. Please try again shortly.");
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

  const openExtractionWithFile = (file) => {
    const category = extractionCategoryRef.current;
    if (!category || !file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image.");
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_MB * 1024 * 1024) {
      toast.error(`File is too large! Maximum allowed size is ${MAX_SOURCE_IMAGE_MB}MB.`);
      return;
    }
    setSidebarModalCategory(category);
    setModalTraceType(category === "logo" ? "logo" : category === "universal" ? "universal_preserve" : "mockup_erase");
    openModalWithFile(file);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isCheckingSession) {
    return <div aria-label="Checking session" style={{ minHeight: "100dvh", background: "#171717" }} />;
  }

  return (
    <div ref={containerRef} className={`start-screen-container${isWorkspace ? " start-screen-container--workspace" : ""}${workspaceRoute ? " start-screen-container--without-header" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => setOpenMenuId(null)}>
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
      {!workspaceRoute && <header style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "64px", background: "rgba(17, 17, 17, 0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)", zIndex: 50, display: "flex", justifyContent: "center", padding: "0 20px" }}>

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

          <div className="syncraft-header-controls">
            {user ? (
              <Link href="/workspace" className="header-sign-in">Go to Workspace</Link>
            ) : (
              <button type="button" onClick={handleLogin} className="header-sign-in">Sign in</button>
            )}
          </div>
        </div>
      </header>}

      {isWorkspace && (
        <WorkspaceSidebar
          withoutHeader={workspaceRoute}
          disabled={isUploading}
          user={user}
          credits={credits}
          onOpenTopUp={() => {
            setSelectedPricingPlan("pro");
            setTopUpInitialStep(1);
            setShowTopUpModal(true);
          }}
          onSignOut={handleLogout}
          onOpenFeature={(action) => {
            if (action === "logo") router.push("/logo-studio");
            else if (action === "upscale") upscaleInputRef.current?.click();
            else if (action === "background") bgRemoveInputRef.current?.click();
            else {
              extractionCategoryRef.current = action === "logo-trace" ? "logo" : action;
              extractionInputRef.current?.click();
            }
          }}
        />
      )}

      {user && workspaceRoute && <WorkspaceRightPanel />}
      {isWorkspace && <div className="workspace-mobile-heading"><img src="/logo.svg" alt="Syncraft" width="112" height="20" /></div>}

      {/* FULL WIDTH HERO SECTION */}
      <div className="home-hero-backdrop" style={{ position: "relative", backgroundColor: "#1a1a1a", backgroundImage: isWorkspace ? "radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)" : "radial-gradient(ellipse at 50% 78%, rgba(255, 184, 45, 0.16) 0%, rgba(255, 184, 45, 0.075) 30%, transparent 64%), radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)", backgroundSize: isWorkspace ? "24px 24px" : "100% 100%, 24px 24px", backgroundPosition: isWorkspace ? "0 0" : "center, 0 0", backgroundRepeat: isWorkspace ? "repeat" : "no-repeat, repeat", paddingTop: isWorkspace ? "100px" : "22px", paddingBottom: isWorkspace ? "40px" : "48px", color: "#fff" }}>
        <div className={isWorkspace ? "workspace-announcement" : undefined}>
        <LogoStudioAnnouncement onTry={() => {
          if (user) router.push("/logo-studio");
          else { setLoginReturnTo("/logo-studio"); setShowLoginModal(true); }
        }} />
        </div>
        <div className="home-hero-content" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px", position: "relative", zIndex: 2 }}>

          <div className={`hero-section${isWorkspace ? "" : " guest-hero-section"}`} style={{ justifyContent: "flex-start", margin: 0 }}>
            {/* LOGO AND UPLOAD BOX (ALWAYS VISIBLE) */}
            <div className="hero-left" style={{ margin: "0" }}>
              {isWorkspace ? (
                <>
              <div className="user-hero-intro">
                {publicStats.totalUsers > 0 && (
                  <div className="guest-beta-badge user-beta-badge">
                    <div className="guest-beta-avatars" aria-hidden="true">
                      {publicStats.avatars.map((url, i) => (
                        <img key={url} src={url} alt="" referrerPolicy="no-referrer" decoding="async"
                          onError={(event) => { event.currentTarget.style.display = "none"; }}
                          style={{ zIndex: 10 - i }} />
                      ))}
                    </div>
                    <div className="guest-beta-copy">
                      <strong>{publicStats.totalUsers.toLocaleString()}+</strong>
                      <span>Creatives using the Beta</span>
                    </div>
                  </div>
                )}
                <AnimatedFeatureHeadline />
              </div>

              <div className="tool-launch-row">
                <button className={`start-btn tool-launch${openingTool === 'logo' ? ' tool-launch--opening' : ''}`} onClick={(e) => { e.stopPropagation(); if (openingTool === 'logo') return; if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) router.push('/logo-studio'); else setOpeningTool('logo'); }} disabled={isUploading}>
                  <LogoStudioIcon size={16} /> Logo Studio
                </button>
                <button className={`start-btn tool-launch${openingTool === 'upscale' ? ' tool-launch--opening' : ''}`} onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginModal(true); return; } if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setOpeningTool('upscale'); upscaleInputRef.current?.click(); }} disabled={isUploading}>
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} Image Upscale
                </button>
                <button className={`start-btn tool-launch${openingTool === 'background' ? ' tool-launch--opening' : ''}`} onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginModal(true); return; } if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setOpeningTool('background'); bgRemoveInputRef.current?.click(); }} disabled={isUploading}>
                  <Scissors size={13} /> BG Remover
                </button>
              </div>

              <div
                id="syncraft-upload"
                className="workspace-upload"
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isUploading && event.dataTransfer.files?.length > 0) openModalWithFile(event.dataTransfer.files[0]);
                }}
              >
                <button
                  type="button"
                  className="workspace-upload__drop"
                  disabled={isUploading}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!user) { setShowLoginModal(true); return; }
                    fileInputRef.current?.click();
                  }}
                >
                  <span className="workspace-upload__icon" aria-hidden="true">
                    {isUploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} strokeWidth={1.6} />}
                  </span>
                  <span className="workspace-upload__title">{isUploading ? "Preparing your image…" : "Upload your image"}</span>
                  <span className="workspace-upload__hint">{isUploading ? "Opening your workspace shortly" : <>Drag it here, or <span className="workspace-upload__browse">browse files <span aria-hidden="true">↗</span></span></>}</span>
                  {!isUploading && <span className="workspace-upload__formats">PNG · JPG · WEBP</span>}
                </button>
              </div>
                </>
              ) : (
                <div className="guest-hero-lead">
                  <SectionBadge className="guest-hero-eyebrow">AI DESIGN WORKSPACE</SectionBadge>
                  <AnimatedFeatureHeadline className="guest-feature-headline" />

                  <HeroWorkflowTagline className="guest-hero-tagline" />

                  <div className="guest-hero-cta">
                    <button type="button" className="guest-hero-cta__button" onClick={() => user ? router.push("/workspace") : handleLogin()}>
                      <span>Go to Workspace</span>
                      <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    <span className="guest-hero-cta__helper">{user ? "Your tools and projects are ready." : "Sign in to upload your image"}</span>
                  </div>
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
                            onError={(event) => { event.currentTarget.style.display = "none"; }}
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
                </div>
              )}
            </div>

            {/* Recent projects for members; transformation examples for visitors. */}
            {isWorkspace ? (
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
                  onNavigate={(proj) => router.push(proj.canvas_data?.tool === 'logo_studio' ? `/logo-studio/${proj.id}` : proj.trace_type === 'bg_remover' ? `/bg-remover/${proj.id}` : `/workspace/${proj.id}`)}
                  onStartEditing={(e, proj) => { e.stopPropagation(); setOpenMenuId(null); setEditingId(proj.id); setEditValue(proj.name); }}
                  onCancelEditing={(e) => { e.stopPropagation(); setEditingId(null); }}
                  onSaveRename={saveRename}
                  onConfirmDelete={(e, proj) => { e.stopPropagation(); setProjectToDelete(proj); }}
                />
              </div>
            ) : (
              <HeroShowcase />
            )}
          </div>
        </div>

      </div>

      {/* Main Content Wrapper (For the rest of the page) */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px", width: "100%" }}>

        {!workspaceRoute && <>
        <div id="creative-tools"><EduSection /></div>
        <WhySyncraft />
        <SamplesSection />
        <PricingSection
          isSignedIn={Boolean(user)}
          onSelectPlan={(planKey) => {
            sessionStorage.setItem("syncraft_pending_pricing_plan", planKey);
            if (user) {
              router.push("/workspace");
            } else {
              setShowLoginModal(true);
            }
          }}
        />
        <TestimonialSection publicStats={publicStats} />
        <FAQSection />
        <section className="site-final-cta" aria-labelledby="site-final-cta-title">
          <h2 id="site-final-cta-title">Bring your artwork<br /><span>to its next stage.</span></h2>
          <p>Extract garment designs, recover printed artwork, or create a new logo. Refine your result and export it for your next project.</p>
          <div className="site-final-cta-actions">
            <Link className="site-final-cta-primary" href="/workspace">Go to Workspace <span aria-hidden="true">↗</span></Link>
            <a className="site-final-cta-secondary" href="#pricing">See pricing</a>
          </div>
        </section>
        </>}
        {/* Hidden File Input — shows type-selector modal before uploading */}
        <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files[0]) openModalWithFile(e.target.files[0]); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />
        <input type="file" ref={extractionInputRef} onChange={(e) => { openExtractionWithFile(e.target.files[0]); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />
        <input type="file" ref={upscaleInputRef} onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0], false, "upscale"); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />
        <input type="file" ref={bgRemoveInputRef} onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0], true); e.target.value = ""; }} accept="image/*" style={{ display: "none" }} />

        {/* ─── Modals ────────────────────────────────────────────────────────── */}
        <NewProjectModal
          key={sidebarModalCategory || "default"}
          show={showModal}
          initialCategory={sidebarModalCategory}
          selectedImageName={pendingFile?.name}
          projectName={modalProjectName} setProjectName={setModalProjectName}
          traceType={modalTraceType} setTraceType={setModalTraceType}
          isUploading={isUploading}
          onClose={() => { setShowModal(false); setPendingFile(null); setSidebarModalCategory(null); }}
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
          onClose={() => { setShowLoginModal(false); setLoginReturnTo("/workspace"); }}
          supabase={supabase}
          returnTo={loginReturnTo}
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

        {!workspaceRoute && <footer className="site-footer">
          <div className="site-footer-main">
            <div className="site-footer-brand">
              <img className="site-footer-logo" src="/logo.svg" alt="Syncraft" width={765} height={137} />
              <p>AI-powered production tools for clean SVG tracing, background removal, upscaling, and print-ready artwork delivery.</p>
              <div className="site-footer-details">
                <div>
                  <h3 className="site-footer-social-title">Social Profiles</h3>
                  <div className="site-footer-socials" aria-label="Social media">
                    <button type="button" disabled aria-label="YouTube profile coming soon"><SocialIcon name="youtube" /></button>
                    <button type="button" disabled aria-label="X profile coming soon"><SocialIcon name="x" /></button>
                    <button type="button" disabled aria-label="Instagram profile coming soon"><SocialIcon name="instagram" /></button>
                    <a href="https://web.facebook.com/profile.php?id=61562539277199" target="_blank" rel="noreferrer" aria-label="Syncraft on Facebook"><SocialIcon name="facebook" /></a>
                    <a href="https://www.tiktok.com/@syncraftech1" target="_blank" rel="noreferrer" aria-label="Syncraft on TikTok"><SocialIcon name="tiktok" /></a>
                    <button type="button" disabled aria-label="Discord community coming soon"><SocialIcon name="discord" /></button>
                  </div>
                </div>
                <a className="site-footer-bir" href="/BIR.jpg" target="_blank" rel="noopener noreferrer" aria-label="View BIR registration image">
                  <Image src="/BIR.jpg" alt="BIR registration for 2026 with QR code" width={976} height={345} />
                </a>
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
                <Link href="/workspace">Workspace</Link>
                <a href="/store">Store</a>
                <a href="/image-upscaler">Image Upscaler</a>
                <a href="/image-to-vector">Image to Vector</a>
                <a href="/docs/api">API Documentation</a>
                <a href="https://m.me/105884602605306" target="_blank" rel="noreferrer">Customer Support</a>
              </div>
            </nav>
          </div>
          <div className="site-footer-bottom">© 2026 Syncraft. All rights reserved.</div>
          <div className="site-footer-wordmark" aria-hidden="true" />
        </footer>}

      </div>


      {!workspaceRoute && user && <FloatingPromoVideo src="/videos/workspace-tour-v3.mp4" label="Go to Workspace" />}
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
                  "text": `Syncraft is a prepaid credit service. Credit packages currently start at ${CREDIT_PLANS.tingi.price}, and each tool displays its credit cost before processing.`,
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
