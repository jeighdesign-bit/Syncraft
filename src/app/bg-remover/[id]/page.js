"use client";

import GenerateButton from "@/components/GenerateButton";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import GenerationLoading from "@/components/GenerationLoading";
import TopUpModal from "@/components/TopUpModal";
import BeforeAfterSlider from "@/app/components/BeforeAfterSlider";
import styles from "./remover.module.css";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Scissors, Download, Loader2, ZoomIn, ZoomOut, Maximize, Monitor, Image as ImageIcon } from "lucide-react";
import { CREDIT_COST } from "@/lib/pricing";
import {
  trackEvent,
  trackExport,
  trackGenerationFailure,
  trackGenerationStart,
  trackGenerationSuccess,
} from "@/lib/analytics.mjs";

const supabase = createClient();

export default function BgRemoverPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id;

  const [project, setProject] = useState(null);
  const [user, setUser] = useState(null);
  const [userCredits, setUserCredits] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [zoom, setZoom] = useState(1);
  
  const [showTopUp, setShowTopUp] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [compare, setCompare] = useState(true);
  const [activity, setActivity] = useState([]);
  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;
    async function fetchData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setUser(session.user);

        const { data: projData, error: projError } = await supabase
          .from("projects").select("*").eq("id", projectId).single();

        if (projError || !projData || projData.trace_type !== "bg_remover") {
          router.push("/workspace");
          return;
        }
        
        if (isMounted) {
          setProject(projData);
          setActivity([{ text: projData.generated_image_url ? "Saved transparent result loaded." : "Image loaded. Ready for background removal.", type: "system" }]);
        }

        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles").select("credits").eq("id", session.user.id).single();
          if (profile && isMounted) setUserCredits(profile.credits);
        }
      } catch (err) {
        console.error("Data fetch error:", err);
      }
    }
    fetchData();

    return () => { isMounted = false; };
  }, [projectId, router]);

  const handleRemoveBg = async () => {
    // Fix #5: Guard against double-click / re-triggering while already processing
    if (!project?.id || isProcessing) return;
    trackGenerationStart({ tool: "bg_remover", credits: CREDIT_COST.removeBg });
    setIsProcessing(true);
    setErrorMsg("");
    setActivity(entries => [...entries, { text: "Removing background and refining subject edges…", type: "system" }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch("/api/remove-bg", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ projectId: project.id, keepOriginal: true })
      });

      const rawData = await res.text();
      let data = {};
      try { data = JSON.parse(rawData); } catch (e) {
        throw new Error(!res.ok ? `Server Error ${res.status}` : "Invalid response from server");
      }

      // Handle ALREADY_PROCESSED gracefully — no error, just reload
      if (res.status === 409 && data.error === "ALREADY_PROCESSED") {
        const { data: freshProj } = await supabase.from("projects").select("*").eq("id", project.id).single();
        if (freshProj) setProject(freshProj);
        setActivity(entries => [...entries, { text: "Previously completed result restored.", type: "success" }]);
        trackEvent("generation_already_complete", { tool: "bg_remover" });
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove background");
      }

      setProject(prev => ({ ...prev, generated_image_url: data.transparent_image_url }));
      setActivity(entries => [...entries, { text: "Background removed. Transparent PNG is ready.", type: "success" }]);
      
      // Update credits locally
      if (userCredits !== null) {
        setUserCredits(prev => prev - CREDIT_COST.removeBg);
      }
      trackGenerationSuccess({ tool: "bg_remover", credits: CREDIT_COST.removeBg });
      
    } catch (err) {
      trackGenerationFailure({ tool: "bg_remover", reason: err.message });
      console.error(err);
      setErrorMsg(err.message);
      setActivity(entries => [...entries, { text: err.message, type: "error" }]);

      // Fix #6: Re-fetch actual credit balance after failure
      // Server may have refunded the credit — sync the real value
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles").select("credits").eq("id", session.user.id).single();
          if (profile) setUserCredits(profile.credits);
        }
      } catch { /* non-fatal */ }
    } finally {
      setIsProcessing(false);
    }
  };

  const forceDownload = useCallback(async (url, filename) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fetch failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  }, []);

  const handleDownload = async () => {
    if (!project?.generated_image_url || isDownloading) return;
    setIsDownloading(true);
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(project.generated_image_url)}`;
      await forceDownload(proxyUrl, `Syncraft_${project.name}_Transparent.png`);
      trackExport({ tool: "bg_remover", format: "transparent_png" });
    } finally {
      setIsDownloading(false);
    }
  };

  const isCompleted = !!project?.generated_image_url;

  const noCredits = userCredits !== null && userCredits < CREDIT_COST.removeBg;
  const checkerboard = "repeating-conic-gradient(#252525 0% 25%, #1b1b1b 0% 50%) 0 0 / 18px 18px";

  if (!project) return <div className={styles.pageLoading}><GenerationLoading label="Loading your project" /></div>;

  return <div className="app-container">
    <WorkspaceHeader title="BACKGROUND REMOVER" eyebrow="ONE-CLICK CUTOUT" accent="#80c5ce" user={user} credits={userCredits} onOpenTopUp={() => setShowTopUp(true)} />
    <div className={styles.toolbar}>
      <strong title={project.name}>{project.name || "Untitled image"}</strong>
      <div className={styles.zoomControls} role="group" aria-label="Canvas zoom">
        <button type="button" aria-label="Zoom out" disabled={isProcessing || zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}><ZoomOut size={14} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={isProcessing || zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + .25))}><ZoomIn size={14} /></button>
        <button type="button" aria-label="Fit image" onClick={() => setZoom(1)}><Maximize size={14} /></button>
      </div>
    </div>
    <main className={styles.workspace}>
      <div className={styles.canvas} aria-busy={isProcessing}>
        <div className={styles.imageFrame} style={{ width: `min(90%, ${Math.min(760, 640 * aspectRatio)}px)` }}>
          <img className={styles.measureImage} src={project.original_image_url} alt="" aria-hidden="true" onLoad={event => setAspectRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight || 1)} />
          {isCompleted && compare ? <BeforeAfterSlider title={project.name} rasterUrl={project.original_image_url} vectorUrl={project.generated_image_url} height="auto" aspectRatio={aspectRatio} objectFit="contain" zoom={zoom} originalLabel="Original" resultLabel="Background removed" canvasBackground={checkerboard} resultBackground={checkerboard} minimal /> :
            <div className={styles.sourceFrame} style={{ aspectRatio, background: isCompleted ? checkerboard : undefined }}><img src={isCompleted ? project.generated_image_url : project.original_image_url} alt={isCompleted ? "Background removed" : "Original image"} draggable={false} style={{ transform: `scale(${zoom})` }} /></div>}
        </div>
        {isProcessing && <div className={styles.loadingOverlay}>
            <GenerationLoading label="Removing the background" />
            <div className={styles.loadingCopy}><strong>Removing the background</strong><span>Refining edges and preparing your transparent PNG.</span></div>
        </div>}
      </div>
      <aside className={styles.panel}>
        <section className={styles.panelSection}>
          <h2>Image properties</h2>
          <dl className={styles.properties}><div><dt>Name</dt><dd title={project.name}>{project.name}</dd></div><div><dt>Output</dt><dd>Transparent PNG</dd></div></dl>
        </section>
        <div className={styles.panelTip}>Fine edges can vary with image quality. Review your result before downloading.</div>
        <section className={`${styles.panelSection} ${styles.activitySection}`}>
          <h2>Activity log</h2>
          <div className={styles.activityLog} role="log" aria-live="polite">{activity.map((entry, index) => <div key={index} className={styles.logEntry} data-type={entry.type}><span>{entry.type}</span><p>{entry.text}</p></div>)}</div>
        </section>
        <section className={styles.panelSection}>
          <h2>Actions</h2>
          {errorMsg && <p className={styles.error} role="alert">{errorMsg}</p>}
          {!isCompleted ? <GenerateButton onClick={noCredits ? () => setShowTopUp(true) : handleRemoveBg} disabled={isProcessing} detail={!isProcessing && !noCredits ? `${CREDIT_COST.removeBg} credits` : undefined}>
            {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}{isProcessing ? "Processing…" : noCredits ? "Buy More Credits" : "Remove Background"}
          </GenerateButton> : <button type="button" className={styles.compareButton} aria-pressed={compare} onClick={() => setCompare(value => !value)}><Monitor size={14} />{compare ? "View transparent result" : "Before / After Compare"}</button>}
          <p className={styles.status}>{isProcessing ? "Processing your image…" : isCompleted ? (compare ? "Drag the divider to inspect the edges." : "Checkerboard areas are transparent.") : "Remove the background while keeping your subject."}</p>
        </section>
        <section className={styles.panelSection}>
          <h2>Exportation</h2>
          <div className={styles.exportActions}>
            <button type="button" className={styles.exportButton} disabled={!isCompleted || isProcessing || isDownloading} onClick={handleDownload}>{isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {isDownloading ? "Downloading…" : "Export Transparent PNG"}</button>
            <button type="button" className={styles.exportButton} disabled={isProcessing} onClick={() => forceDownload(`/api/proxy?url=${encodeURIComponent(project.original_image_url)}`, `Syncraft_${project.name}_Original`)}><ImageIcon size={14} /> Download Original</button>
          </div>
          <p className={styles.exportHint}>PNG preserves transparency. Your original image stays available.</p>
        </section>
      </aside>
    </main>
    <footer className={styles.footer}><span>{isProcessing ? "Processing image" : isCompleted ? "Ready to download" : "Ready to remove background"}</span><span>Transparent PNG output</span></footer>
    <TopUpModal show={showTopUp} user={user} supabase={supabase} onClose={() => setShowTopUp(false)} />
  </div>;
}
