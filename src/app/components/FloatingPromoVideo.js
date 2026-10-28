"use client";

import { useEffect, useRef } from "react";
import { Minimize2, X } from "lucide-react";
import styles from "./FloatingPromoVideo.module.css";

export default function FloatingPromoVideo({ src, inline = false, label }) {
  const videoRef = useRef(null);
  const expandedVideoRef = useRef(null);
  const dialogRef = useRef(null);
  const expandButtonRef = useRef(null);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videoRef.current?.play().catch(() => {});
    }
  }, [src]);

  const expand = () => {
    const preview = videoRef.current;
    const expanded = expandedVideoRef.current;
    if (preview && expanded) expanded.currentTime = preview.currentTime;
    preview?.pause();
    dialogRef.current?.showModal();
    expanded?.play().catch(() => {});
  };

  const restorePreview = () => {
    const expanded = expandedVideoRef.current;
    if (expanded && videoRef.current) videoRef.current.currentTime = expanded.currentTime;
    expanded?.pause();
    expandButtonRef.current?.focus();
  };

  if (!src) return null;
  return (
    <aside className={`${styles.player}${inline ? ` ${styles.inline}` : ""}`} aria-label="Syncraft featured video">
      {label && <p className={styles.label}>{label}</p>}
      <button ref={expandButtonRef} type="button" onClick={expand} className={styles.preview} title="Watch workspace tour" aria-label="Expand workspace tour video">
        <video ref={videoRef} className={styles.video} src={src} muted loop playsInline preload="metadata" aria-hidden="true" />
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={restorePreview} onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }} aria-labelledby="workspace-tour-title">
        <div className={styles.dialogHeader}>
          <span id="workspace-tour-title">Workspace tour</span>
          <div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Minimize video" title="Back to preview"><Minimize2 size={18} /></button>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close expanded video" title="Close"><X size={18} /></button>
          </div>
        </div>
        <video ref={expandedVideoRef} className={styles.expandedVideo} src={src} controls muted playsInline preload="metadata" aria-label="Syncraft workspace tour" />
      </dialog>
    </aside>
  );
}
