"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { LOGO_EXAMPLES } from "@/lib/logoExamples.mjs";
import { LOGO_STYLES } from "@/lib/logoStudio.mjs";
import styles from "./WorkspaceRightPanel.module.css";
import ResponsivePanel from "@/components/ResponsivePanel";

const featuredIds = ["orbit-robot", "copper-colt", "wingwise", "aurora-unicorn", "north-bear", "pinehaven", "common-span", "southern-roost"];
const featuredLogos = [
  ...featuredIds.map(id => LOGO_EXAMPLES.find(example => example.id === id)).filter(Boolean),
  ...LOGO_EXAMPLES.filter(example => !featuredIds.includes(example.id)),
];

function DesignPreview({ title, children, onClose, wide = false }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className={`${styles.preview}${wide ? ` ${styles.widePreview}` : ""}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
      <header className={styles.previewHeader}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className={styles.toggle} aria-label="Close design preview" onClick={onClose} autoFocus><X size={18} /></button>
      </header>
      {children}
    </dialog>
  );
}

function LogoPreview({ example, onClose }) {
  const styleName = LOGO_STYLES.find(style => style.id === example.style)?.name;
  return (
    <DesignPreview title={example.title} onClose={onClose}>
      <img className={styles.previewImage} src={example.image} alt={example.title} width={400} height={400} draggable={false} />
      <div className={styles.previewDetails}>
        <span className={styles.styleLabel}>{styleName}</span>
        <p>{example.prompt}</p>
        <Link href={`/logo-studio?example=${encodeURIComponent(example.id)}`} className={styles.usePrompt}>Use prompt <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
    </DesignPreview>
  );
}

export default function WorkspaceRightPanel() {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState(null);
  const panelId = useId();

  return (
    <ResponsivePanel label="Featured" icon={PanelRightOpen} side="right">{({ compact }) => <aside className={`${styles.panel} ${expanded || compact ? styles.expanded : styles.collapsed}`} aria-label="Workspace side panel">
      <div className={styles.header}>
        {(expanded || compact) && <div className={styles.heading}><span className={styles.title}>Featured Designs</span><p className={styles.subtitle}>Sample designs made with Syncraft.</p></div>}
        {!compact && <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? "Minimize side panel" : "Maximize side panel"}
          aria-expanded={expanded}
          aria-controls={panelId}
        >
          {expanded ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>}
      </div>
      <div id={panelId} className={styles.content} hidden={!expanded && !compact} role="region" aria-labelledby={`${panelId}-logos-heading`} tabIndex={0}>
        <div className={styles.tabs}>
          <span id={`${panelId}-logos-heading`} className={styles.categoryLabel}>Logo Studio</span>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>A starting point for your next logo.</p>
          <div className={styles.logoGrid}>
            {featuredLogos.map(example => <button key={example.id} type="button" className={styles.logoCard} aria-label={`Preview ${example.title}`} onClick={() => setSelected(example)}>
              <img src={example.image} alt={example.title} width={200} height={200} loading="lazy" draggable={false} />
              <span className={styles.cardOverlay} aria-hidden="true">Preview</span>
            </button>)}
          </div>
        </div>
      </div>
      {selected && <LogoPreview example={selected} onClose={() => setSelected(null)} />}
    </aside>}</ResponsivePanel>
  );
}
