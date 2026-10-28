"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Minus, PanelRightClose, PanelRightOpen, Plus, X } from "lucide-react";
import { LOGO_EXAMPLES } from "@/lib/logoExamples.mjs";
import { LOGO_STYLES } from "@/lib/logoStudio.mjs";
import { GARMENT_EXAMPLES } from "@/lib/garmentExamples.mjs";
import BeforeAfterSlider from "./BeforeAfterSlider";
import styles from "./WorkspaceRightPanel.module.css";
import ResponsivePanel from "@/components/ResponsivePanel";

const featuredIds = ["orbit-robot", "copper-colt", "wingwise", "aurora-unicorn", "north-bear", "pinehaven", "common-span", "southern-roost"];
const featuredLogos = [
  ...featuredIds.map(id => LOGO_EXAMPLES.find(example => example.id === id)).filter(Boolean),
  ...LOGO_EXAMPLES.filter(example => !featuredIds.includes(example.id)),
];
const tabStorageKey = "syncraft-featured-designs-tab";

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

function GarmentPreview({ example, onClose }) {
  return <DesignPreview title={example.title} onClose={onClose} wide>
    <div className={styles.garmentPreviewSlider}>
      <GarmentComparison example={example} />
    </div>
    <div className={styles.previewDetails}><p>{example.description}</p></div>
  </DesignPreview>;
}

function GarmentComparison({ example }) {
  const [zoomStep, setZoomStep] = useState(0);
  const zoom = 1 + zoomStep * 0.15;

  return <div className={styles.comparisonViewer}>
    <BeforeAfterSlider title={example.title} rasterUrl={example.original} vectorUrl={example.result} originalLabel="Original" resultLabel="Extracted" height="auto" aspectRatio="4 / 3" objectFit="cover" objectPosition={example.focus || "50% 50%"} zoom={zoom} canvasBackground="#eeece6" resultBackground="#eeece6" minimal />
    <div className={styles.comparisonToolbar}>
      <span>Drag to compare</span>
      <div className={styles.zoomControls} role="group" aria-label="Comparison zoom">
        <button type="button" aria-label="Zoom out comparison" disabled={zoomStep === 0} onClick={() => setZoomStep(step => Math.max(0, step - 1))}><Minus size={12} aria-hidden="true" /></button>
        <button type="button" className={styles.zoomValue} aria-label="Reset comparison zoom" onClick={() => setZoomStep(0)}><output aria-live="polite">{Math.round(zoom * 100)}%</output></button>
        <button type="button" aria-label="Zoom in comparison" disabled={zoomStep === 4} onClick={() => setZoomStep(step => Math.min(4, step + 1))}><Plus size={12} aria-hidden="true" /></button>
      </div>
    </div>
  </div>;
}

export default function WorkspaceRightPanel() {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState("logos");
  const [selected, setSelected] = useState(null);
  const [selectedGarment, setSelectedGarment] = useState(null);
  const panelId = useId();
  const tabs = useRef([]);

  useEffect(() => {
    try { if (sessionStorage.getItem(tabStorageKey) === "garment") setTab("garment"); } catch {}
  }, []);

  function changeTab(next) {
    setTab(next);
    try { sessionStorage.setItem(tabStorageKey, next); } catch {}
  }

  function navigateTabs(event) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === "logos" ? 1 : 0;
    changeTab(nextIndex === 0 ? "logos" : "garment");
    tabs.current[nextIndex]?.focus();
  }

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
      <div id={panelId} className={styles.content} hidden={!expanded && !compact}>
        <div className={styles.tabs} role="tablist" aria-label="Featured design categories" onKeyDown={navigateTabs}>
          {[{ id: "logos", label: "Logo Studio" }, { id: "garment", label: "Garment" }].map((item, index) => (
            <button key={item.id} ref={element => { tabs.current[index] = element; }} id={`${panelId}-${item.id}-tab`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${panelId}-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => changeTab(item.id)}>{item.label}</button>
          ))}
        </div>
        <div id={`${panelId}-logos`} className={styles.body} role="tabpanel" aria-labelledby={`${panelId}-logos-tab`} hidden={tab !== "logos"} tabIndex={0}>
          <p className={styles.hint}>A starting point for your next logo.</p>
          <div className={styles.logoGrid}>
            {featuredLogos.map(example => <button key={example.id} type="button" className={styles.logoCard} aria-label={`Preview ${example.title}`} onClick={() => setSelected(example)}>
              <img src={example.image} alt={example.title} width={200} height={200} loading="lazy" draggable={false} />
              <span className={styles.cardOverlay} aria-hidden="true">Preview</span>
            </button>)}
          </div>
        </div>
        <div id={`${panelId}-garment`} className={styles.body} role="tabpanel" aria-labelledby={`${panelId}-garment-tab`} hidden={tab !== "garment"} tabIndex={0}>
          <p className={styles.hint}>From garment to flat artwork.</p>
          <div className={styles.garmentList}>
            {GARMENT_EXAMPLES.map(example => <article key={example.id} className={styles.garmentCard}>
              <div className={styles.garmentSlider}><GarmentComparison example={example} /></div>
              <button type="button" className={styles.garmentCaption} aria-label={`Preview ${example.title} garment extraction`} onClick={() => setSelectedGarment(example)}><span className={styles.garmentEyebrow}>Garment extraction</span><strong>{example.title}</strong><span>Explore the detail <ArrowUpRight size={12} aria-hidden="true" /></span></button>
            </article>)}
          </div>
        </div>
      </div>
      {selected && <LogoPreview example={selected} onClose={() => setSelected(null)} />}
      {selectedGarment && <GarmentPreview example={selectedGarment} onClose={() => setSelectedGarment(null)} />}
    </aside>}</ResponsivePanel>
  );
}
