"use client";

import { memo } from "react";
import LogoExampleCarousel from "./LogoExampleCarousel";
import styles from "./SamplesSection.module.css";

const SamplesSection = memo(function SamplesSection() {
  return (
    <div id="samples-section" className={styles.showcaseWrapper}>
      <LogoExampleCarousel />
    </div>
  );
});

export default SamplesSection;
