"use client";

// ─── React & Routing ──────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

// ─── Data & Auth ──────────────────────────────────────────────────────────────
import { createClient } from "@/utils/supabase/client";

// ─── Icons ────────────────────────────────────────────────────────────────────
import { Home, Keyboard, Pencil, CheckCircle2 } from "lucide-react";

// ─── Hooks ────────────────────────────────────────────────────────────────────
import { useTraceExecution } from "./hooks/useTraceExecution";

// ─── Components ───────────────────────────────────────────────────────────────
import SplitViewCanvas from "./components/SplitViewCanvas";
import PropertiesPanel from "./components/PropertiesPanel";
import UpscalePropertiesPanel from "./components/UpscalePropertiesPanel";
import CropModal from "./components/CropModal";
import EraseModal from "./components/EraseModal";
import RemoveBgModal from "./components/RemoveBgModal";
import CompareModal from "./components/CompareModal";
import NoCreditsModal from "./components/NoCreditsModal";
import TopUpModal from "@/components/TopUpModal";
import ShortcutsModal from "./components/ShortcutsModal";

// ─── Constants ────────────────────────────────────────────────────────────────
import { CREDIT_COST } from "@/lib/pricing";
import { evaluateExtendIntent } from "@/lib/aspectRatio";

// ─── Supabase client — created ONCE at module level, not inside the component ─
const supabase = createClient();

const WORKSPACE_MODES = {
  mockup: {
    title: "GARMENT EXTRACT",
    eyebrow: "APPAREL RECONSTRUCTION",
    accent: "#d4ff59",
  },
  logo: {
    title: "LOGO EXTRACT",
    eyebrow: "PRECISION VECTOR TRACE",
    accent: "#b8a7ff",
  },
  universal: {
    title: "UNIVERSAL EXTRACT",
    eyebrow: "FORENSIC ARTWORK RECOVERY",
    accent: "#9effc8",
  },
  upscale: {
    title: "HD UPSCALE",
    eyebrow: "IMAGE ENHANCEMENT",
    accent: "#6fddff",
  },
};

function getWorkspaceMode(project) {
  if (!project) {
    return {
      title: "DESIGN WORKSPACE",
      eyebrow: "LOADING PROJECT",
      accent: "#d4ff59",
    };
  }

  return WORKSPACE_MODES[project.trace_type] || {
    title: "DESIGN WORKSPACE",
    eyebrow: "SYNCRAFT CREATIVE TOOL",
    accent: "#d4ff59",
  };
}


export default function Workspace() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id;

  // ─── Core State ───────────────────────────────────────────────────────────
  const [project, setProject] = useState(null);
  const [user, setUser] = useState(null);
  const [userCredits, setUserCredits] = useState(null);
  const [activeTool, setActiveTool] = useState("pointer");
  // Lifted out of PropertiesPanel: Extend Design re-runs the vectorize stage from
  // here, so it needs the colour setting too.
  const [vectorColors, setVectorColors] = useState("auto");

  // ─── Modal State ──────────────────────────────────────────────────────────
  const [showCropModal, setShowCropModal] = useState(false);
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [showRemoveBgModal, setShowRemoveBgModal] = useState(false);

  // ─── Extend Design (in-canvas) State ──────────────────────────────────────
  const [extendMode, setExtendMode] = useState(false);
  const [extendPads, setExtendPads] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [extendSource, setExtendSource] = useState(null); // { width, height } of the flat extract
  const [extendProcessing, setExtendProcessing] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showNoCreditsModal, setShowNoCreditsModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSavingCrop, setIsSavingCrop] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [upscaleStatus, setUpscaleStatus] = useState("idle");
  const [upscaleError, setUpscaleError] = useState("");

  // ─── Hooks ────────────────────────────────────────────────────────────────
  const {

    traceState, nodeErrors, consoleRef,
    logToConsole, clearConsole, handleExecuteTrace, analyzeRecovery, handleResumeFromStep2, handleRetryVector,
  } = useTraceExecution({
    project,
    setProject,
    userCredits,
    setUserCredits,
    supabase,
    onNoCredits: () => setShowNoCreditsModal(true),
  });

  // ─── Data Fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setUser(session.user);

        const { data: projData, error: projError } = await supabase
          .from("projects").select("*").eq("id", projectId).single();

        if (projError || !projData) {
          router.push("/");
          return;
        }
        const recovery = projData.canvas_data?.universal_recovery;
        setProject(recovery ? {
          ...projData,
          recovery_analysis: recovery.analysis || null,
          recovery_status: recovery.status || null,
          recovery_validation: recovery.validation || null,
        } : projData);

        if (projData.trace_type === "upscale") {
          const isLegacyResult = !!projData.generated_image_url
            && !projData.generated_image_url.includes("/projects/")
            && !projData.generated_image_url.includes("/storage/v1/object/");
          setUpscaleStatus(isLegacyResult ? "legacy" : "idle");
        } else if (!projData.generated_image_url) {
          setShowCropModal(true);
        }

        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles").select("credits").eq("id", session.user.id).single();
          if (profile) setUserCredits(profile.credits);
        }
      } catch (err) {
        console.error("[Workspace] Data fetch error:", err);
      }
    };
    fetchData();
  }, [projectId, router]);

  useEffect(() => {
    const handleCreditsUpdate = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles").select("credits").eq("id", session.user.id).single();
        if (profile) setUserCredits(profile.credits);
      }
    };
    window.addEventListener("syncraft:credits-updated", handleCreditsUpdate);
    return () => window.removeEventListener("syncraft:credits-updated", handleCreditsUpdate);
  }, []);

  // Auto-switch away from loading state (if any was needed)
  useEffect(() => {
    if (!project) return;
    
    // Initialize console log so it doesn't look empty
    if (consoleRef.current && consoleRef.current.children.length === 0) {
      logToConsole(`[System] Workspace initialized for ${project.name}`);
      if (project.svg_url) {
        logToConsole(`[System] Previous vector data loaded`, "success");
      } else if (project.generated_image_url) {
        logToConsole(`[System] Processed image ready for vectorization`, "normal");
      } else {
        logToConsole(`[System] Ready for background extraction`, "normal");
      }
    }
  }, [project, logToConsole, consoleRef]);

  // ─── Download Handlers ────────────────────────────────────────────────────
  const forceDownload = useCallback(async (url, filename) => {
    const link = document.createElement("a");
    const downloadUrl = new URL(url, window.location.origin);
    downloadUrl.searchParams.set("download", filename);
    link.href = downloadUrl.toString();
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleDownloadSvg = useCallback(async () => {
    if (!project?.svg_url) return;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(project.svg_url)}`;
    await forceDownload(proxyUrl, `Syncraft_${project.name}_Vector.svg`);
  }, [project, forceDownload]);

  const handleDownloadRaster = useCallback(async () => {
    if (!project?.generated_image_url) return;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(project.generated_image_url)}`;
    await forceDownload(proxyUrl, `Syncraft_${project.name}_Raster.png`);
  }, [project, forceDownload]);

  // Dedicated 4K download — uses upscaled_image_url (Step 2 ESRGAN output), NOT generated_image_url
  const handleDownloadUpscaled = useCallback(async () => {
    if (!project?.upscaled_image_url) return;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(project.upscaled_image_url)}`;
    await forceDownload(proxyUrl, `Syncraft_${project.name}_4K.png`);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }, [project, forceDownload]);

  const handleDownloadUpscaleProject = useCallback(async () => {
    if (!project?.generated_image_url) return;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(project.generated_image_url)}`;
    await forceDownload(proxyUrl, `Syncraft_${project.name || "Upscale"}_4X.png`);
  }, [project, forceDownload]);

  const handleRunUpscale = useCallback(async () => {
    if (!project?.id || upscaleStatus === "processing") return;
    const wasLegacyRepair = upscaleStatus === "legacy";
    setUpscaleStatus("processing");
    setUpscaleError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your login session expired. Please log in again.");

      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "INSUFFICIENT_CREDITS") setShowTopUpModal(true);
        throw new Error(data.error === "UPSCALE_ALREADY_PROCESSING"
          ? "This upscale is already processing. Please refresh in a moment."
          : data.error || "Failed to upscale image");
      }

      setProject(prev => ({
        ...prev,
        generated_image_url: data.upscaledUrl,
        credit_deducted: true,
        refunded: false,
      }));
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", session.user.id)
        .single();
      if (profile) setUserCredits(profile.credits);
      setUpscaleStatus("idle");
      setShowCompare(true);
    } catch (error) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", session.user.id)
          .single();
        if (profile) setUserCredits(profile.credits);
      }
      setUpscaleError(error.message || "Failed to upscale image");
      setUpscaleStatus(wasLegacyRepair ? "legacy" : "idle");
    }
  }, [project, upscaleStatus]);

  const handleDownloadAll = useCallback(async () => {
    if (!project) return;
    logToConsole("[System] Preparing ZIP...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Unauthorized");

      const res = await fetch("/api/prepare-zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to prepare ZIP");

      await forceDownload(
        `/api/proxy?url=${encodeURIComponent(data.zipUrl)}`,
        data.fileName || `Syncraft_${project.name}_AllFiles.zip`
      );
      await new Promise(resolve => setTimeout(resolve, 1500));
      logToConsole(data.cached ? "[Success] Cached ZIP download started!" : "[Success] ZIP prepared and download started!", "success");
    } catch (err) {
      logToConsole(`[Error] Failed to zip: ${err.message}`, "error");
    }
  }, [project, logToConsole, forceDownload]);

  // ─── Trace Execution Wrapper ──────────────────────────────────────────────
  const onExecuteTrace = useCallback(async (vectorColors) => {
    if (project?.trace_type === "universal") {
      try {
        logToConsole("[Universal] Detecting the best flat layout strategy...");
        await analyzeRecovery();
      } catch (error) {
        logToConsole(`[Error] ${error.message || "Reference analysis failed."}`, "error");
        return;
      }
    }
    const result = await handleExecuteTrace(vectorColors);
    if (result?.success) {
      setShowCompare(true);
    }
  }, [project, analyzeRecovery, handleExecuteTrace, logToConsole]);

  // ─── Crop Handlers ────────────────────────────────────────────────────────
  const handleCropApplied = useCallback((publicUrl, errorMsg) => {
    if (errorMsg) {
      logToConsole(`[Error] Failed to save crop: ${errorMsg}`, "error");
    } else {
      setProject(prev => ({
        ...prev,
        original_image_url: publicUrl,
        generated_image_url: null,
        upscaled_image_url: null,
        svg_url: null,
        recovery_analysis: null,
        recovery_status: null,
        recovery_validation: null,
        canvas_data: prev.canvas_data ? { ...prev.canvas_data, universal_recovery: null } : prev.canvas_data,
      }));
      logToConsole("[Success] Crop applied and saved! You can now re-trace.", "success");
    }
    setIsSavingCrop(false);
  }, [logToConsole]);

  const handleEraseApplied = useCallback((publicUrl, errorMsg) => {
    if (errorMsg) {
      logToConsole(`[Error] Failed to save erased image: ${errorMsg}`, "error");
    } else {
      setProject(prev => ({
        ...prev,
        original_image_url: publicUrl,
        generated_image_url: null,
        upscaled_image_url: null,
        svg_url: null,
        recovery_analysis: null,
        recovery_status: null,
        recovery_validation: null,
      }));
      logToConsole("[Success] Erased noise saved! You can now re-trace.", "success");
    }
  }, [logToConsole]);

  const handleRemoveBgApplied = useCallback((publicUrl, errorMsg) => {
    if (errorMsg) {
      logToConsole(`[Error] Failed to remove background: ${errorMsg}`, "error");
    } else if (publicUrl) {
      setProject(prev => ({
        ...prev,
        original_image_url: publicUrl,
        generated_image_url: null,
        upscaled_image_url: null,
        svg_url: null,
        recovery_analysis: null,
        recovery_status: null,
        recovery_validation: null,
      }));
      // The server charges CREDIT_COST.removeBg — this used to decrement by 1,
      // so the header count disagreed with the actual balance until a reload.
      setUserCredits(prev => (prev !== null ? Math.max(0, prev - CREDIT_COST.removeBg) : prev));
      logToConsole("[Success] Background removed! You can now re-trace.", "success");
    }
  }, [logToConsole]);

  // Live validity of the current drag — drives the Proceed button's enabled
  // state. Same helper the canvas and the server use, so all three agree.
  const extendPlan = useMemo(() => (
    extendSource ? evaluateExtendIntent({ width: extendSource.width, height: extendSource.height, rawPads: extendPads }) : null
  ), [extendSource, extendPads]);

  const handleEnterExtend = useCallback(() => {
    if (!project?.generated_image_url || project.generated_image_url === "REFUNDED") return;
    setExtendPads({ top: 0, right: 0, bottom: 0, left: 0 });
    setExtendSource(null);
    setExtendMode(true);
  }, [project?.generated_image_url]);

  const handleCancelExtend = useCallback(() => {
    setExtendMode(false);
    setExtendProcessing(false);
  }, []);

  // Runs the actual generation from the current in-canvas crop. Extend replaces
  // the flat extract, invalidating only stages 2 and 3 (the original upload stays
  // put), then chains straight into re-running them since they are free.
  const handleProceedExtend = useCallback(async () => {
    if (!project?.id || !extendPlan?.ok || extendProcessing) return;
    setExtendProcessing(true);
    // Log the whole extend run so the activity log isn't silent during the ~30–60s
    // generation (the normal trace logs each step; extend should too).
    logToConsole("[Extend] Generating extended design (this can take 30–60s)...", "normal");
    try {
      const sendExtendRequest = (accessToken) => fetch("/api/extend-design", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ projectId: project.id, pads: extendPads }),
      });

      // Refresh before a paid, long-running action instead of trusting a
      // possibly stale token cached by getSession().
      let { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      let token = refreshData?.session?.access_token;
      if (refreshError || !token) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token;
      }
      if (!token) throw new Error("Your session expired. Please log in again.");

      let res = await sendExtendRequest(token);
      // Authentication is checked before credits are touched, so one refreshed
      // retry on 401 is safe and cannot double-charge the user.
      if (res.status === 401) {
        const { data: retryData, error: retryError } = await supabase.auth.refreshSession();
        const retryToken = retryData?.session?.access_token;
        if (!retryError && retryToken) {
          res = await sendExtendRequest(retryToken);
        }
      }
      const rawText = await res.text();
      let data = {};
      try { data = JSON.parse(rawText); } catch {
        throw new Error(!res.ok ? `Server error ${res.status}` : "Invalid response from server.");
      }
      if (!res.ok) throw new Error(data.message || data.error || "Failed to extend design.");

      setProject(prev => ({
        ...prev,
        generated_image_url: data.generated_image_url,
        upscaled_image_url: null,
        svg_url: null,
        zip_url: null,
        zip_signature: null,
        zip_generated_at: null,
      }));
      setUserCredits(prev => (prev !== null ? Math.max(0, prev - CREDIT_COST.extend) : prev));

      logToConsole(`[Extend] Canvas extended to ${data.final.width}×${data.final.height} (${data.aspect_ratio}).`, "success");
      logToConsole("[Extend] Re-running upscale and vectorize (no extra credits)...", "normal");

      // Stay in extend mode through the re-run so the canvas keeps showing the
      // simple extend overlay instead of reverting to the big trace spinner. Only
      // leave once everything is finished. Compare modal deliberately NOT opened —
      // extend is its own flow, kept simple.
      await handleResumeFromStep2(vectorColors);
      setExtendMode(false);
    } catch (err) {
      logToConsole(`[Error] Failed to extend design: ${err.message}`, "error");
      // Stay in extend mode on failure so the crop is preserved for a retry.
    } finally {
      setExtendProcessing(false);
    }
  }, [project?.id, extendPlan, extendProcessing, extendPads, supabase, logToConsole, handleResumeFromStep2, vectorColors]);

  const handleLogin = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  // Format "Saved X minutes ago" for the project bar
  const savedAgo = project?.updated_at
    ? (() => {
        const diff = Math.floor((Date.now() - new Date(project.updated_at)) / 60000);
        if (diff < 1) return "Saved just now";
        if (diff === 1) return "Saved 1 minute ago";
        if (diff < 60) return `Saved ${diff} minutes ago`;
        return "Saved recently";
      })()
    : null;
  const workspaceMode = getWorkspaceMode(project);

  return (
    <div className="app-container">

      {/* ── Top Menu Bar ─────────────────────────────────────────────── */}
      <header
        className="workspace-topbar"
        style={{ "--workspace-accent": workspaceMode.accent }}
      >
        <button
          type="button"
          onClick={() => router.push('/')}
          className="workspace-home-button"
          aria-label="Return to Syncraft home"
        >
          <img src="/logo.svg" alt="" className="workspace-home-button__logo" />
        </button>
        <div className="workspace-mode-title" aria-live="polite">
          <span className="workspace-mode-title__rail" aria-hidden="true" />
          <span className="workspace-mode-title__copy">
            <span className="workspace-mode-title__eyebrow">{workspaceMode.eyebrow}</span>
            <h1 className="workspace-mode-title__heading">{workspaceMode.title}</h1>
          </span>
          <span className="workspace-mode-title__rail workspace-mode-title__rail--end" aria-hidden="true" />
        </div>
        <div className="syncraft-header-controls">
          <button type="button" onClick={() => setShowShortcuts(true)} className="syncraft-header-control">
            <Keyboard size={14} aria-hidden="true" /> Shortcuts
          </button>
          <button
            type="button"
            onClick={() => setShowTopUpModal(true)}
            className="syncraft-header-control"
            aria-label={userCredits !== null && userCredits <= 0 ? "Buy credits. Open top up" : `${userCredits !== null ? userCredits : "Unknown"} credits. Open top up`}
          >
            {userCredits !== null && userCredits <= 0 ? (
              "BUY CREDITS"
            ) : (
              <>
                <span className="syncraft-header-control__value">{userCredits !== null ? userCredits : "-"}</span>
                <span className="syncraft-header-control__label">CREDITS</span>
              </>
            )}
          </button>
        </div>
      </header>




      <main className="main-workspace" style={{ padding: 0 }}>
        {/* Split View Workspace */}
        <div className="canvas-area" style={{ padding: 0 }}>
          {!project ? (
            <div className="empty-state">
              <h3>Loading Document...</h3>
            </div>
          ) : (
            <SplitViewCanvas
              project={project}
              traceState={project.trace_type === "upscale" ? (upscaleStatus === "processing" ? "processing" : "idle") : traceState}
              nodeErrors={project.trace_type === "upscale" ? null : nodeErrors}
              extendMode={project.trace_type === "upscale" ? false : extendMode}
              extendPads={extendPads}
              extendSource={extendSource}
              extendProcessing={extendProcessing}
              onExtendPadsChange={setExtendPads}
              onExtendSourceLoad={setExtendSource}
              onUpscaleOutputInvalid={() => {
                setUpscaleStatus("legacy");
                setUpscaleError("The saved upscale is blank. Restore it at no extra charge.");
              }}
              leftControls={
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {isEditingTitle ? (
                    <input
                      autoFocus
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={async () => {
                        setIsEditingTitle(false);
                        if (editTitleValue.trim() !== project.name) {
                          const { error } = await supabase.from('projects').update({ name: editTitleValue.trim() }).eq('id', project.id);
                          if (!error) setProject(prev => ({ ...prev, name: editTitleValue.trim() }));
                        }
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.target.blur();
                        }
                      }}
                      style={{
                        background: "#0a0a0a",
                        border: "1px solid #fff",
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: "500",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        outline: "none",
                        width: "200px",
                        letterSpacing: "0.5px"
                      }}
                    />
                  ) : (
                    <div 
                      onClick={() => {
                        setEditTitleValue(project.name || "Untitled Project");
                        setIsEditingTitle(true);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "4px 8px", borderRadius: "6px", transition: "all 0.2s" }}
                      onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#fff"; }}
                      onMouseOut={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#ccc"; }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: "500", color: "inherit", letterSpacing: "0.5px" }}>
                        {project.name || "Untitled Project"}
                      </span>
                      <Pencil size={11} color="inherit" />
                    </div>
                  )}
                  {savedAgo && (
                    <span style={{ fontSize: "10px", color: "#666", marginLeft: "4px" }}>{savedAgo}</span>
                  )}
                </div>
              }
            />
          )}
        </div>

        {/* Right Properties Panel */}
        {project?.trace_type === "upscale" ? (
          <UpscalePropertiesPanel
            project={project}
            status={upscaleStatus}
            error={upscaleError}
            userCredits={userCredits}
            onGenerate={handleRunUpscale}
            onDownload={handleDownloadUpscaleProject}
            onCompare={() => setShowCompare(true)}
            onOpenTopUp={() => setShowTopUpModal(true)}
          />
        ) : (
        <PropertiesPanel
          project={project}
          traceState={traceState}
          isSavingCrop={isSavingCrop}
          userCredits={userCredits}
          consoleRef={consoleRef}
          onExecuteTrace={onExecuteTrace}
          onRetryVector={handleRetryVector}
          onDownloadSvg={handleDownloadSvg}
          onDownloadRaster={handleDownloadUpscaled}
          onDownloadAll={handleDownloadAll}
          onOpenCompare={() => setShowCompare(true)}
          onOpenCrop={() => setShowCropModal(true)}
          onOpenRemoveBg={() => setShowRemoveBgModal(true)}
          onOpenErase={() => setShowEraseModal(true)}
          onOpenTopUp={() => setShowTopUpModal(true)}
          vectorColors={vectorColors}
          onVectorColorsChange={setVectorColors}
          extendMode={extendMode}
          extendProcessing={extendProcessing}
          extendCanProceed={!!extendPlan?.ok}
          onEnterExtend={handleEnterExtend}
          onProceedExtend={handleProceedExtend}
          onCancelExtend={handleCancelExtend}
        />
        )}
      </main>

      {/* ── Status Bar ───────────────────────────────────────────────── */}
      <div style={{ height: "28px", background: "#141414", borderTop: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {project?.trace_type === "upscale" && project.generated_image_url && upscaleStatus !== "legacy" ? (
            <>
              <CheckCircle2 size={12} color="#4ade80" />
              <span style={{ fontSize: "10px", color: "#4ade80", fontWeight: "600" }}>Upscale complete</span>
              <span style={{ fontSize: "10px", color: "#444", marginLeft: "4px" }}>Permanent project result ready to download.</span>
            </>
          ) : project?.svg_url ? (
            <>
              <CheckCircle2 size={12} color="#4ade80" />
              <span style={{ fontSize: "10px", color: "#4ade80", fontWeight: "600" }}>Vectorization complete</span>
              <span style={{ fontSize: "10px", color: "#444", marginLeft: "4px" }}>Clean shapes, optimized paths, and high quality output.</span>
            </>
          ) : project?.trace_type === "upscale" ? (
            <span style={{ fontSize: "10px", color: "#555" }}>
              {upscaleStatus === "processing" ? "Processing upscale…" : upscaleStatus === "legacy" ? "Legacy result needs restoration" : "Ready"}
            </span>
          ) : project ? (
            <span style={{ fontSize: "10px", color: "#555" }}>
              {traceState !== "idle" ? "Processing trace…" : "Ready"}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => setShowShortcuts(true)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "10px", transition: "color 0.2s" }} onMouseOver={e => e.currentTarget.style.color="#aaa"} onMouseOut={e => e.currentTarget.style.color="#444"}>
            Need help?
          </button>
          <span style={{ color: "#333" }}>·</span>
          <button style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px", transition: "color 0.2s" }} onMouseOver={e => e.currentTarget.style.color="#d4ff59"} onMouseOut={e => e.currentTarget.style.color="#555"}>
            &gt; View Guide
          </button>
        </div>
      </div>

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}
      <CropModal
        show={showCropModal}
        project={project}
        supabase={supabase}
        onClose={() => setShowCropModal(false)}
        onCropApplied={handleCropApplied}
        onLoginRequired={handleLogin}
      />

      <EraseModal
        show={showEraseModal}
        project={project}
        supabase={supabase}
        onClose={() => setShowEraseModal(false)}
        onEraseApplied={handleEraseApplied}
        onLoginRequired={handleLogin}
      />

      <RemoveBgModal
        show={showRemoveBgModal}
        project={project}
        supabase={supabase}
        onClose={() => setShowRemoveBgModal(false)}
        onRemoveBgApplied={handleRemoveBgApplied}
      />

      <CompareModal
        show={showCompare}
        project={project}
        onClose={() => setShowCompare(false)}
        onDownloadAll={handleDownloadAll}
        onDownloadSvg={handleDownloadSvg}
      />

      <NoCreditsModal
        show={showNoCreditsModal}
        onClose={() => setShowNoCreditsModal(false)}
        onTopUp={() => setShowTopUpModal(true)}
      />

      <TopUpModal
        show={showTopUpModal}
        user={user}
        supabase={supabase}
        onClose={() => setShowTopUpModal(false)}
      />

      <ShortcutsModal
        show={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}
