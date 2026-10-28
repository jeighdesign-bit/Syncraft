"use client";

import { memo, useState } from "react";
import Image from "next/image";
import { Pause, Play, PenTool } from "lucide-react";
import SectionBadge from "./SectionBadge";
import styles from "./EduSection.module.css";

const EduSection = memo(function EduSection() {
  const [examplesPaused, setExamplesPaused] = useState(false);
  return (
    <section id="how-it-works" className={styles.section} aria-labelledby="creative-start-title">
      <div className={styles.intro}>
        <div>
          <SectionBadge className={styles.eyebrow}>HOW IT WORKS</SectionBadge>
          <h2 id="creative-start-title">Recover the artwork.<br /><span>Create something new.</span></h2>
        </div>
        <p>A garment photo, printed graphics, or a fresh idea. Choose your starting point, refine the result, and make it ready for your next project.</p>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={`${styles.media} ${styles.videoPreview}`}>
            <video controls playsInline muted preload="none" poster="/videos/garment-extraction-demo-poster.webp" aria-label="Garment Extraction walkthrough">
              <source src="/videos/garment-extraction-demo.mp4" type="video/mp4" />
              Your browser does not support this video. <a href="/videos/garment-extraction-demo.mp4">Watch the Garment Extraction demo.</a>
            </video>
          </div>
          <div className={styles.copy}>
            <div className={styles.meta}>GARMENT EXTRACTION</div>
            <h3>Keep the design.<br />Leave the mockup.</h3>
            <p>Recover patterns, lettering, and emblems from a garment photo as flat artwork you can work with.</p>
          </div>
        </article>

        <article className={styles.card}>
          <div className={`${styles.media} ${styles.vectorPreview}`}>
            <div className={styles.vectorArtwork}>
              <img src="/samples/logo-studio/airplane-penguin-vector.svg" alt="Vectorized airplane logo" width="1024" height="1024" loading="lazy" />
              <div className={styles.vectorSelection} aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
              </div>
            </div>
            <span className={styles.vectorBadge}><PenTool size={12} aria-hidden="true" /> SVG</span>
          </div>
          <div className={styles.copy}>
            <div className={styles.meta}>LOGO &amp; UNIVERSAL EXTRACTION</div>
            <h3>Sharp at every size.<br />Ready to edit.</h3>
            <p>Turn your artwork into scalable SVG paths. Resize without pixelation and refine shapes and colors in your vector editor.</p>
          </div>
        </article>

        <article className={styles.card}>
          <div className={`${styles.media} ${styles.logoExample}`} aria-label="A rough phone sketch transformed into a mascot logo">
            <figure className={styles.exampleFrame}>
              <Image src="/samples/logo-studio/phone-mascot-sketch.webp" alt="Original hand-drawn phone character with raised arms" fill sizes="(max-width: 700px) 42vw, 180px" />
              <figcaption>Sketch</figcaption>
            </figure>
            <figure className={`${styles.exampleFrame} ${styles.animatedResults}`} data-paused={examplesPaused} aria-label="Four generated phone mascot variations">
              {[1, 2, 3, 4].map((version, index) => (
                <Image key={version} className={styles.resultVariation} style={{ animationDelay: `${index * 5 - 20}s` }} src={`/samples/logo-studio/phone-mascot-v${version}.webp`} alt="" fill sizes="(max-width: 700px) 42vw, 180px" />
              ))}
              <figcaption>Mascot</figcaption>
              <button className={styles.pauseExamples} type="button" aria-label={examplesPaused ? "Play mascot variations" : "Pause mascot variations"} onClick={() => setExamplesPaused(paused => !paused)}>
                {examplesPaused ? <Play size={12} /> : <Pause size={12} />}
              </button>
            </figure>
          </div>
          <div className={styles.copy}>
            <div className={styles.meta}>LOGO STUDIO</div>
            <h3>A new mark,<br />built around your idea.</h3>
            <p>Start with text, a sketch, or an image. Explore styles and refine the logo that feels like you.</p>
          </div>
        </article>
      </div>

    </section>
  );
});

export default EduSection;
