"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "./FloatingPromoVideo.module.css";

export default function FloatingPromoVideo({
  src,
  dismissalKey = "syncraft-floating-promo-video-v1",
}) {
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldAutoplay, setShouldAutoplay] = useState(false);

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem(dismissalKey) === "1";
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setShouldAutoplay(!prefersReducedMotion);
    setIsVisible(!wasDismissed);
  }, [dismissalKey]);

  useEffect(() => {
    if (!isVisible || !shouldAutoplay) return;

    const playPromise = videoRef.current?.play();
    playPromise?.catch(() => {
      // Browser autoplay policies may still pause playback; native controls remain available.
    });
  }, [isVisible, shouldAutoplay]);

  const dismiss = () => {
    sessionStorage.setItem(dismissalKey, "1");
    videoRef.current?.pause();
    setIsVisible(false);
  };

  if (!src || !isVisible) return null;

  return (
    <aside className={styles.player} aria-label="Syncraft featured video">
      <button
        type="button"
        className={styles.closeButton}
        onClick={dismiss}
        aria-label="Close featured video"
        title="Close video"
      >
        <X size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>

      <video
        ref={videoRef}
        className={styles.video}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        aria-label="Syncraft product video"
      >
        <source src={src} type="video/mp4" />
        Your browser does not support embedded videos.
      </video>
    </aside>
  );
}
