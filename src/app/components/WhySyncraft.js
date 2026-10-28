"use client";

import { useEffect, useRef, useState } from "react";
import SectionBadge from "./SectionBadge";
import styles from "./WhySyncraft.module.css";

const statement = [
  { text: "Syncraft brings trained AI models together for artwork. Compared with using other AI models alone, Syncraft lets you extract designs, recover artwork, create logos, and export" },
  { text: "clean, editable vectors", highlight: true },
  { text: "in one workspace—with" },
  { text: "SVG, layered PSD, PNG, JPG, and ZIP", highlight: true },
  { text: "exports in supported workflows." },
];

export default function WhySyncraft() {
  const section = useRef(null);
  const heading = useRef(null);

  const [litWords, setLitWords] = useState(0);
  const wordCount = statement.reduce((total, part) => total + part.text.split(" ").length, 0);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scrollContainer = section.current.closest(".start-screen-container");
    let frame = null;

    const paint = () => {
      frame = null;
      const rect = heading.current.getBoundingClientRect();
      const viewport = scrollContainer?.clientHeight || window.innerHeight;
      const viewportTop = scrollContainer?.getBoundingClientRect().top || 0;
      const distance = viewport * .42 + rect.height * .45;
      const progress = preference.matches ? 1 : Math.max(0, Math.min(1, (viewportTop + viewport * .88 - rect.top) / distance));
      setLitWords(Math.ceil(progress * wordCount));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };
    const observer = new IntersectionObserver(schedule, { root: scrollContainer });
    observer.observe(heading.current);
    scrollContainer?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    preference.addEventListener("change", schedule);
    paint();
    return () => {
      observer.disconnect();
      scrollContainer?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      preference.removeEventListener("change", schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [wordCount]);

  let offset = 0;

  return (
    <section ref={section} className={styles.section} aria-labelledby="why-syncraft-title">
      <div className={styles.badgeRow}><SectionBadge>Syncraft Model</SectionBadge></div>
      <h2 ref={heading} id="why-syncraft-title" className={styles.statement}>
        {statement.map(part => {
          const words = part.text.split(" ");
          const start = offset;
          offset += words.length;
          const highlight = 100 * Math.max(0, Math.min(words.length, litWords - start)) / words.length;
          return (
            <span key={part.text} data-mark={part.highlight ? "" : undefined}
              className={part.highlight ? styles.mark : undefined}
              style={part.highlight ? { "--mark-width": `${highlight}%` } : undefined}>
              {words.map((word, wordIndex) => (
                <span key={`${word}-${wordIndex}`}><span data-word="" data-lit={start + wordIndex < litWords} className={styles.word}>{word}</span>{" "}</span>
              ))}
            </span>
          );
        })}      </h2>
      <p className={styles.intro}>Export SVG for scalable vector artwork, layered PSD for Photoshop, or PNG, JPG, and ZIP files in supported workflows. Need an AI file? Open your exported SVG in Adobe Illustrator and save it as AI.</p>
    </section>
  );
}
