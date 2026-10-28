"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsLeftRight, Pause, Play } from "lucide-react";
import { GARMENT_EXAMPLES } from "@/lib/garmentExamples.mjs";
import styles from "./HeroShowcase.module.css";

const garment = GARMENT_EXAMPLES[0];
const examples = [
  {
    id: "garment", group: "Extraction", heading: "Garment Extraction", label: "Garment → Flat art",
    source: garment.original, result: garment.result, title: garment.title,
    sourceLabel: "Original garment", resultLabel: "Flat artwork", crop: true, focus: garment.focus,
  },
  {
    id: "print", group: "Extraction", heading: "Universal Extraction", label: "Print → Artwork",
    source: "/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Reference.webp",
    result: "/samples/samples%20sa%20universal/Syncraft_Untitled_Design_Upscaled.webp",
    title: "Green Hornets print recovery", sourceLabel: "Original print", resultLabel: "Recovered artwork", crop: true,
  },
  {
    id: "sketch", group: "Sketch", heading: "Sketch to Logo", label: "Sketch → Mascot",
    source: "/samples/logo-studio/green-monster-sketch.png", result: "/samples/logo-studio/green-monster-vector.svg",
    title: "Green monster", sourceLabel: "Your sketch", resultLabel: "Mascot · SVG",
  },
  ...["howrah-hawks", "ashok-royals"].map(id => {
    const example = GARMENT_EXAMPLES.find(item => item.id === id);
    return {
      id, group: "Extraction", heading: "Garment Extraction", label: `${example.title} → Flat art`,
      source: example.original, result: example.result, title: example.title,
      sourceLabel: "Original garment", resultLabel: "Flat artwork",
      crop: true, focus: example.focus,
    };
  }),
];

const CYCLE_MS = 7200;
const SOURCE_HOLD_MS = 1100;
const REVEAL_MS = 2600;

// Match the actual exported image, which can differ from the requested palette.
function matchLogoBackground(event) {
  const image = event.currentTarget;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return;
  try {
    context.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    if (alpha === 255) image.parentElement.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  } catch {
    // Keep the configured canvas color for images that cannot be sampled.
  }
}

// Keep the source and result at the same size; only the clipping edge moves.
function paint(root, range, split, progress) {
  if (!root) return;
  root.style.setProperty("--split", `${split}%`);
  root.style.setProperty("--progress", `${progress}%`);
  root.style.setProperty("--source-opacity", split > 12 ? "1" : "0");
  root.style.setProperty("--result-opacity", split < 88 ? "1" : "0");
  root.style.setProperty("--handle-opacity", split > 1 && split < 99 ? "1" : "0");
  if (range) {
    range.value = String(Math.round(split));
    range.setAttribute("aria-valuetext", `${Math.round(split)}% original, ${Math.round(100 - split)}% result`);
  }
}

export default function HeroShowcase() {
  const root = useRef(null);
  const range = useRef(null);
  const elapsed = useRef(0);
  const [active, setActive] = useState(0);
  const [restart, setRestart] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const example = examples[active];

  useEffect(() => {
    // Warm just the next comparison so the wipe never waits on a new image.
    const next = examples[(active + 1) % examples.length];
    for (const url of [next.source, next.result].filter(Boolean)) {
      const image = new window.Image();
      image.src = url;
    }
  }, [active]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 });
    observer.observe(root.current);
    return () => { preference.removeEventListener("change", update); observer.disconnect(); };
  }, []);

  useEffect(() => {
    elapsed.current = 0;
    paint(root.current, range.current, reducedMotion ? 50 : 100, 0);
  }, [active, restart, reducedMotion]);

  useEffect(() => {
    if (paused || focused || !visible || reducedMotion) return undefined;
    let frame;
    let previous;
    const tick = now => {
      // A background tab must not skip through the entire collection.
      if (previous !== undefined && !document.hidden) elapsed.current += Math.min(now - previous, 100);
      previous = now;
      const t = Math.max(0, Math.min(1, (elapsed.current - SOURCE_HOLD_MS) / REVEAL_MS));
      const eased = t * t * (3 - 2 * t);
      paint(root.current, range.current, 100 * (1 - eased), 100 * elapsed.current / CYCLE_MS);
      if (elapsed.current >= CYCLE_MS) {
        setActive(current => (current + 1) % examples.length);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, restart, paused, focused, visible, reducedMotion]);

  function select(index) {
    setActive(index);
    setRestart(current => current + 1);
  }

  return (
    <section ref={root} className={styles.shell} aria-label="Syncraft transformation examples" aria-roledescription="carousel">
      <div className={styles.bar}>
        <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
        <span className={styles.heading}>{example.heading}</span>
        <button className={styles.playback} type="button"
          aria-label={paused || reducedMotion ? "Play examples" : "Pause examples"}
          onClick={() => {
            if (paused || reducedMotion) { setReducedMotion(false); setRestart(current => current + 1); setPaused(false); }
            else setPaused(true);
          }}>
          {paused || reducedMotion ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>

      <div key={example.id} className={`${styles.stage} ${example.crop ? styles.cropped : ""}`}
        style={{ "--canvas": example.background || "#fff", "--focus": example.focus || "50% 50%" }}>
        <div className={styles.result}>
          <img src={example.result} alt={`${example.title} finished result`} width="1200" height="800" decoding="async" draggable={false}
            onLoad={example.prompt ? matchLogoBackground : undefined} />
        </div>
        <div className={styles.source}>
          {example.prompt ? (
            <div className={styles.prompt}><span>THE IDEA</span><p>“{example.prompt}”</p></div>
          ) : (
            <img src={example.source} alt={`${example.title} original reference`} width="1200" height="800" decoding="async" draggable={false} />
          )}
        </div>
        <span className={`${styles.tag} ${styles.sourceTag}`}>{example.sourceLabel}</span>
        <span className={`${styles.tag} ${styles.resultTag}`}>{example.resultLabel}</span>
        <div className={styles.divider} aria-hidden="true"><span><ChevronsLeftRight size={18} /></span></div>
        <input ref={range} className={styles.range} type="range" min="0" max="100" defaultValue="100"
          aria-label={`Compare ${example.title} original and result`}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={event => {
            setPaused(true);
            paint(root.current, range.current, Number(event.target.value), 0);
          }} />
      </div>

      <div className={styles.navigation} role="group" aria-label="Choose an example">
        {examples.map((item, index) => (
          <div key={item.id} className={`${styles.navItem} ${index > 0 && item.group !== examples[index - 1].group ? styles.groupStart : ""}`}>
            <button type="button" className={`${styles.step} ${index === active ? styles.active : ""}`}
              aria-label={`${item.heading}: ${item.title}`} aria-pressed={index === active}
              onClick={() => select(index)}>
              {index === active ? <><span className={styles.progress} /><span className={styles.stepLabel}>{item.label}</span></> : <span className={styles.dot} />}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
