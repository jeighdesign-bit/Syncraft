"use client";

import { memo } from "react";
import styles from "./EduSection.module.css";

const EduSection = memo(function EduSection() {
  return (
    <>
      {/* HOW TO USE / DEMO VIDEO SECTION */}
      <div className={styles.howToWrapper}>
        <div className={styles.howToGrid}>
          
          {/* Left: Video Showcase */}
          <div className={styles.videoContainer}>
            <div className={styles.videoInner}>
              <video 
                src="/TUTORIAL.mp4" 
                autoPlay 
                muted 
                loop 
                playsInline 
              />
            </div>
          </div>

          {/* Right: Text & Steps */}
          <div className={styles.textContainer}>
            <h3 className={styles.sectionSubtitle}>How to Use Syncraft</h3>
            <h2 className={styles.sectionTitle}>Convert images in seconds.</h2>
            <p className={styles.sectionDescription}>
              Our advanced AI handles the complex tracing process for you. No manual pen tool required.
            </p>
            
            <div className={styles.stepsList}>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepText}>Upload any PNG or JPEG logo, sketch, or photo.</div>
              </div>
              
              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepText}>Our neural engine cleans noise and traces perfect vector paths.</div>
              </div>
              
              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepText}>Download your crisp, infinitely scalable SVG instantly.</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* EDUCATIONAL SECTION */}
      <div className="edu-section" style={{ marginTop: "80px", width: "100%", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "60px", paddingBottom: "60px" }}>
        <div style={{ width: "100%", maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}>
          <div className={styles.grid}>
            
            {/* Col 1 */}
            <div className={styles.card}>
              <h3 className={styles.title}>How does it work</h3>
              <p className={styles.description}>
                Vectorization of raster images is done by converting pixel color information into simple geometric objects. The most common variant is looking over edge detection areas of the same or similar brightness or color, which are then expressed as graphic primitives like lines, circles, and curves.
              </p>
            </div>

            {/* Col 2 */}
            <div className={styles.card}>
              <h3 className={styles.title}>Raster Graphics</h3>
              <p className={styles.description}>
                A Raster graphics image is a rectangular grid of pixels, in which each pixel (or point) has an associated color value. Changing the size of the raster image mostly results in loss of apparent quality.
                <br/>
                <span className={styles.example}>examples: photos</span>
              </p>
            </div>

            {/* Col 3 */}
            <div className={styles.card}>
              <h3 className={styles.title}>Vector Graphics</h3>
              <p className={styles.description}>
                Vector graphics are not based on pixels but on primitives such as points, lines, curves which are represented by mathematical expressions. Without a loss in quality, vector graphics are easily scalable and rotatable.
                <br/>
                <span className={styles.example}>examples: cliparts, logos, tattoos, decals, stickers, t-shirt designs</span>
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
});

export default EduSection;
