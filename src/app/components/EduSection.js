"use client";

import { memo, useEffect, useRef, useState } from "react";
import styles from "./EduSection.module.css";

const EduSection = memo(function EduSection() {
  const videoContainerRef = useRef(null);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);

  useEffect(() => {
    const element = videoContainerRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setShouldLoadVideo(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadVideo(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* HOW TO USE / DEMO VIDEO SECTION */}
      <div id="how-it-works" className={styles.howToWrapper}>
        <div className={styles.howToGrid}>
          
          {/* Left: Video Showcase */}
          <div ref={videoContainerRef} className={styles.videoContainer}>
            <div className={styles.videoInner}>
              <video 
                src={shouldLoadVideo ? "/syncraft%20video/syncraft%20video.mp4" : undefined}
                poster="/Banner.webp"
                preload="none"
                autoPlay={shouldLoadVideo}
                muted 
                loop
                playsInline
                aria-label="Syncraft vectorization workflow tutorial"
              />
            </div>
          </div>

          {/* Right: Text & Steps */}
          <div className={styles.textContainer}>
            <p className={styles.sectionSubtitle}>How it works</p>
            <h2 className={styles.sectionTitle}>Convert images in seconds.</h2>
            <p className={styles.sectionDescription}>
              Our advanced AI handles the complex tracing process for you. No manual pen tool required.
            </p>
            
            <ol className={styles.stepsList}>
              <li className={styles.stepItem}>
                <span className={styles.stepNumber} aria-hidden="true">01</span>
                <div className={styles.stepContent}>
                  <h3>Upload your image</h3>
                  <p>Add any PNG or JPEG logo, sketch, or photo.</p>
                </div>
              </li>
              
              <li className={styles.stepItem}>
                <span className={styles.stepNumber} aria-hidden="true">02</span>
                <div className={styles.stepContent}>
                  <h3>Let Syncraft trace it</h3>
                  <p>AI cleans the image and creates editable vector paths.</p>
                </div>
              </li>
              
              <li className={styles.stepItem}>
                <span className={styles.stepNumber} aria-hidden="true">03</span>
                <div className={styles.stepContent}>
                  <h3>Download your vector</h3>
                  <p>Export a crisp, scalable SVG ready for editing.</p>
                </div>
              </li>
            </ol>
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
