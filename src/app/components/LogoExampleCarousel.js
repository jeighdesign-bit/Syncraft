"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionBadge from "./SectionBadge";
import { LOGO_EXAMPLES } from "@/lib/logoExamples.mjs";
import styles from "./LogoExampleCarousel.module.css";

const examples = LOGO_EXAMPLES;
const slotClass = {
  "-3": styles.farLeft, "-2": styles.leftBack, "-1": styles.leftNear,
  0: styles.center, 1: styles.rightNear, 2: styles.rightBack, 3: styles.farRight,
};

function slotFor(index, active) {
  const forward = (index - active + examples.length) % examples.length;
  return forward <= Math.floor(examples.length / 2) ? forward : forward - examples.length;
}

export default function LogoExampleCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || hovered || focused || reducedMotion || examples.length < 2) return;
    const timer = window.setInterval(() => setActive(current => (current + 1) % examples.length), 3200);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, reducedMotion]);

  return (
    <section
      className={styles.showcase}
      aria-labelledby="logo-example-showcase-title"
      onDragStart={event => event.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <div className={styles.intro}>
        <SectionBadge className={styles.eyebrow}>LOGO STUDIO · TEXT TO LOGO</SectionBadge>
        <h2 id="logo-example-showcase-title">Small ideas.<br /><span>Distinct identities.</span></h2>
        <p>Made in Logo Studio. Explore a few directions, and find a starting point for your own.</p>
        <Link href="/logo-studio" className={styles.cta}>Create your logo <span aria-hidden="true">↗</span></Link>
      </div>

      <div className={styles.stage} aria-label="Logo Studio example prompts">
        {examples.map((example, index) => {
          const slot = slotFor(index, active);
          const visible = Math.abs(slot) <= 2;
          const positionClass = slotClass[Math.max(-3, Math.min(3, slot))];
          return (
            <button
              key={example.id}
              type="button"
              className={`${styles.card} ${positionClass}`}
              style={{ zIndex: 5 - Math.abs(slot) }}
              aria-label={`View ${example.title} example, ${example.style} style`}
              aria-hidden={!visible}
              tabIndex={visible ? 0 : -1}
              onClick={() => setActive(index)}
            >
              <img src={example.image} alt="" width="400" height="400" loading="lazy" draggable={false} />
              <span className={styles.cardInfo}>
                <span className={styles.promptLabel}>{example.title}</span>
                <span className={styles.prompt}>{example.prompt.split(".")[0]}.</span>
                <span className={styles.style}>{example.style.replace("-", " ")}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.controls}>
      <button type="button" className={styles.arrow} aria-label="Previous logo example" onClick={() => setActive(current => (current - 1 + examples.length) % examples.length)}>←</button>
      <span className={styles.count}>{String(active + 1).padStart(2, "0")} / {examples.length}</span>
      <button type="button" className={styles.arrow} aria-label="Next logo example" onClick={() => setActive(current => (current + 1) % examples.length)}>→</button>
      <button type="button" className={styles.pause} onClick={event => { setPaused(value => !value); event.currentTarget.blur(); }} aria-label={paused ? "Play logo examples" : "Pause logo examples"}>
        {paused ? "Play animation" : "Pause animation"}
      </button>
      </div>
    </section>
  );
}
