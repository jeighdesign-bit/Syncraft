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
              rasterUrl="https://pub-494b7f1d63984c228ff2a8b23edda7c5.r2.dev/users/08bafd26-e228-4a97-9efa-84a930c90098/1784601880631_crop_1784601878596.jpg"
              vectorUrl="https://pub-494b7f1d63984c228ff2a8b23edda7c5.r2.dev/projects/6b65be66-7696-4cd1-9ef5-ddb220c200fa/vector_1784601963265.svg"
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
    </div>
  );
});

export default SamplesSection;
