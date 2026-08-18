"use client";

import { memo } from "react";
import styles from "./GreatForSection.module.css";

const GreatForSection = memo(function GreatForSection() {
  return (
    <div className={styles.sectionWrapper}>
      {/* Section Header */}
      <div className={styles.header}>
        <h2 className={styles.badge}>Great For</h2>
        <div className={styles.line} />
      </div>

      {/* Cards Grid */}
      <div className={styles.grid}>

        {/* Card 1 — Sublimation Print Shops */}
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          </div>
          <div>
            <h3 className={styles.title}>Sublimation Print Shops</h3>
            <p className={styles.description}>Extract flat sublimation-ready files from jersey mockups. Save hours of manual Photoshop work. Output clean, print-ready rectangles straight to your RIP software.</p>
          </div>
        </div>

        {/* Card 2 — Logos & Branding */}
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
          </div>
          <div>
            <h3 className={styles.title}>Logos & Branding</h3>
            <p className={styles.description}>Vectorize low-resolution logos into crisp, scalable SVGs. Enhance old or blurry brand marks into professional vector files ready for Illustrator, CorelDRAW, or embroidery.</p>
          </div>
        </div>

        {/* Card 3 — School & Sports Uniforms */}
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          <div>
            <h3 className={styles.title}>School & Sports Uniforms</h3>
            <p className={styles.description}>Reproduce barangay, basketball, volleyball, and school uniform designs from mockup photos. Get editable flat files for any sport — without touching the original artwork.</p>
          </div>
        </div>

        {/* Card 4 — Freelance Designers */}
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>
          </div>
          <div>
            <h3 className={styles.title}>Freelance Designers</h3>
            <p className={styles.description}>Remove backgrounds, upscale to 4K, and vectorize client artwork in minutes — not hours. Take on more orders and deliver faster without sacrificing quality.</p>
          </div>
        </div>

      </div>
    </div>
  );
});

export default GreatForSection;
