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
              rasterUrl="/samples/esports-original.jpg"
              vectorUrl="/samples/esports-vector.png"
              objectFit="cover"
            />
          </div>
        </div>

        {/* Right Side: Editorial Text */}
        <div className={styles.textContent}>
          <h3 className={styles.subtitle}>Sample Extractions</h3>
          <h2 className={styles.title}>Pixel Perfect<br/>Vectorization</h2>
          <p className={styles.description}>
            Experience the power of our advanced AI. We instantly transform your low-resolution raster images (PNG, JPG) into infinitely scalable, ultra-clean SVG files—ready for printing, editing, or scaling to any size without losing a single drop of quality.
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
              rasterUrl="/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Reference.png"
              vectorUrl="/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Upscaled.png"
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
