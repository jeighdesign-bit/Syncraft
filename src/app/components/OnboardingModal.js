"use client";

import { memo, useEffect, useRef } from "react";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import styles from "./OnboardingModal.module.css";

const steps = [
  {
    title: "Upload your image",
    description: "Start with a photo, sketch, or raster logo.",
  },
  {
    title: "Let Syncraft process it",
    description: "Your design is cleaned and converted into vector paths.",
  },
  {
    title: "Export your result",
    description: "Download a scalable SVG for editing and production.",
  },
];

const OnboardingModal = memo(function OnboardingModal({ show, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!show) return undefined;
    const previousFocus = document.activeElement;
    dialogRef.current?.focus({ preventScroll: true });
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
      >
        <header className={styles.header}>
          <span className={styles.eyebrow}>WELCOME ABOARD</span>
          <h2 id="onboarding-title" className={styles.title}>
            Create with <span>Syncraft</span>
          </h2>
          <p id="onboarding-description" className={styles.intro}>
            Turn your image into a clean, scalable vector in three simple steps.
          </p>
        </header>

        <ol className={styles.steps}>
          {steps.map(({ title, description }, index) => (
            <li key={title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepDescription}>{description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className={styles.creditNote}>
          <div>
            <p className={styles.creditTitle}>12 credits</p>
            <p className={styles.creditDescription}>for one AI generation</p>
          </div>
          <p className={styles.creditPrice}>Plans from <strong>{CREDIT_PLANS.tingi.price}</strong></p>
        </div>

        <button type="button" className={styles.startButton} onClick={onClose}>
          START CREATING NOW
        </button>
      </div>
    </div>
  );
});

export default OnboardingModal;
