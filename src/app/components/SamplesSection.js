"use client";

import { memo } from "react";
import BeforeAfterSlider from "./BeforeAfterSlider";
import styles from "./SamplesSection.module.css";

const SamplesSection = memo(function SamplesSection() {
  return (
    <div id="samples-section" className={styles.showcaseWrapper}>
      <div className={styles.contentGrid}>
        
        {/* Left Side: The Glass Bezel Showcase */}
        <div className={styles.glassBezel}>
          <div className={styles.sliderInner}>
            <BeforeAfterSlider
              title="Custom Pattern (Flat Extracted)"
              rasterUrl="/samples/esports-original.webp"
              vectorUrl="/samples/esports-vector.webp"
              objectFit="cover"
            />
          </div>
        </div>

        {/* Right Side: Editorial Text */}
        <div className={styles.textContent}>
          <h3 className={styles.subtitle}>Sample Extractions</h3>
          <h2 className={styles.title}>High-Fidelity<br/>Vectorization</h2>
          <p className={styles.description}>
            Convert supported raster images into clean, scalable SVG files for editing and print preparation. AI results vary with source quality, so review paths, colors, text, and fine details before production.
          </p>
        </div>

      </div>

      <div className={`${styles.contentGrid} ${styles.universalGrid}`}>
        <div className={styles.textContent}>
          <h3 className={styles.subtitle}>Universal Extraction</h3>
          <h2 className={styles.title}>From Physical Print<br/>to Flat Artwork</h2>
          <p className={styles.description}>
            Recover visible artwork from banners, labels, packaging, decals, and other physical surfaces. Syncraft corrects photographed perspective, folds, and distortion while preserving supported logos, text, colors, and pattern detail.
          </p>
        </div>

        <div className={styles.glassBezel}>
          <div className={styles.sliderInner}>
            <BeforeAfterSlider
              title="Universal print recovery"
              rasterUrl="/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Reference.webp"
              vectorUrl="/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Upscaled.webp"
              originalLabel="Original Reference"
              resultLabel="Recovered Flat Art"
              objectFit="cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default SamplesSection;
