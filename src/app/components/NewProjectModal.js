"use client";

import { memo, useState } from "react";
import { ArrowUpRight, PenTool, ScanLine, Scissors, Shirt, Sparkles, X } from "lucide-react";
import styles from "./NewProjectModal.module.css";

function CategoryCard({ icon: Icon, eyebrow, title, description, tags, credits, accent, featured = false, onClick }) {
  return (
    <button
      type="button"
      className={`${styles.categoryCard} ${featured ? styles.featuredCard : ""}`}
      style={{ "--feature-accent": accent }}
      onClick={onClick}
      aria-label={`${title}, ${credits} credits`}
    >
      <span className={styles.featureVisual} aria-hidden="true">
        <span className={styles.featureGrid} />
        <Icon size={25} strokeWidth={1.65} />
      </span>

      <span className={styles.featureCopy}>
        <span className={styles.featureTopline}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          {featured && <span className={styles.recommended}><Sparkles size={10} /> Most versatile</span>}
        </span>
        <span className={styles.featureTitle}>{title}</span>
        <span className={styles.featureDescription}>{description}</span>
        <span className={styles.featureMeta}>
          {tags.map(tag => <span key={tag}>{tag}</span>)}
        </span>
      </span>

      <span className={styles.featureAction}>
        <span className={styles.creditBadge}>{credits} credits</span>
        <ArrowUpRight size={17} strokeWidth={1.8} />
      </span>
    </button>
  );
}

function TraceOptionCard({ value, current, onChange, title, description }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`${styles.optionCard} ${active ? styles.optionCardActive : ""}`}
      aria-pressed={active}
    >
      <span className={styles.optionRadio} aria-hidden="true">{active && <span />}</span>
      <span className={styles.optionCopy}>
        <span className={styles.optionTitle}>{title}</span>
        <span className={styles.optionDescription}>{description}</span>
      </span>
    </button>
  );
}

const NewProjectModal = memo(function NewProjectModal({
  show,
  projectName,
  setProjectName,
  traceType,
  setTraceType,
  isUploading,
  onClose,
  onSelectImage,
  onSelectBgRemover,
}) {
  const [step, setStep] = useState("category");
  const [category, setCategory] = useState(null);

  if (!show) return null;

  const handleCategorySelect = (cat) => {
    setCategory(cat);
    if (cat === "bg_remover") {
      // Skip details step — trigger file upload immediately
      onSelectBgRemover?.();
      handleClose();
      return;
    }
    if (cat === "logo") {
      setTraceType("logo");
    } else if (cat === "universal") {
      // Preserve the reference by default. Background-only is destructive and
      // should require an explicit user choice.
      setTraceType("universal_preserve");
    } else {
      setTraceType("mockup_erase");
    }
    setStep("details");
  };

  const handleBack = () => {
    setStep("category");
    setCategory(null);
  };

  const handleClose = () => {
    setStep("category");
    setCategory(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className={`modal-content ${styles.projectModal} ${step === "category" ? styles.categoryModal : styles.detailsModal}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 610,
          position: "relative",
          width: "100%",
          "--detail-accent": category === "logo" ? "#b8a7ff" : category === "universal" ? "#9effc8" : "#d4ff59",
        }}
      >

        <button
          type="button"
          aria-label="Close new project dialog"
          className={styles.modalCloseButton}
          onClick={handleClose}
        >
          <X size={18} />
        </button>

        {step === "category" && (
          <>
            <div className={styles.featureList}>
              <CategoryCard
                icon={Shirt}
                eyebrow="Apparel reconstruction"
                title="Garment Pattern Extraction"
                description="Separate a jersey or shirt design from its mockup and rebuild it as clean production artwork."
                tags={["Pattern cleanup", "SVG ready"]}
                credits={12}
                accent="#d4ff59"
                onClick={() => handleCategorySelect("garment")}
              />
              <CategoryCard
                icon={ScanLine}
                eyebrow="Forensic AI recovery"
                title="Syncraft Extraction (Universal)"
                description="Unwarp and recover visible print from banners, labels, packaging, decals, and complex surfaces."
                tags={["Perspective fix", "Any surface"]}
                credits={24}
                accent="#9effc8"
                featured
                onClick={() => handleCategorySelect("universal")}
              />
              <CategoryCard
                icon={PenTool}
                eyebrow="Precision vector trace"
                title="Logo / Wordmark Tracing"
                description="Turn emblems, icons, and wordmarks into crisp mathematical paths with controlled colors."
                tags={["Sharp paths", "Color precise"]}
                credits={12}
                accent="#b8a7ff"
                onClick={() => handleCategorySelect("logo")}
              />
              <CategoryCard
                icon={Scissors}
                eyebrow="One-click cutout"
                title="Background Remover"
                description="Isolate products and portraits with a clean transparent edge, ready to download."
                tags={["Transparent PNG", "Fast AI"]}
                credits={12}
                accent="#6fddff"
                onClick={() => handleCategorySelect("bg_remover")}
              />
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <button type="button" className={styles.backButton} onClick={handleBack}>
              ← Back
            </button>

            <h2 className={styles.detailsTitle}>
              {category === "logo" ? "Logo / Wordmark Trace" : category === "universal" ? "Universal Extraction" : "Garment Trace"}
            </h2>

            <div className={styles.formGroup}>
              <label className={styles.fieldLabel}>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className={styles.projectInput}
                placeholder="e.g. Guardians Jersey 2025"
              />
            </div>

            {category === "garment" && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Extraction Mode</label>
                <div className={styles.optionList}>
                  <TraceOptionCard
                    value="mockup_erase"
                    current={traceType}
                    onChange={setTraceType}
                    title="Extract Pattern Only"
                    description="Removes names, numbers, and logos — outputs a clean background pattern ready for re-printing."
                  />
                  <TraceOptionCard
                    value="mockup_preserve"
                    current={traceType}
                    onChange={setTraceType}
                    title="Keep All Artwork"
                    description="Preserves logos, chest badges, and design art exactly as they appear in the reference."
                  />
                </div>
              </div>
            )}

            {category === "universal" && (
              <div className={styles.formGroup}>
                <label className={styles.fieldLabel}>Extraction Mode</label>
                <div className={styles.optionList}>
                  <TraceOptionCard
                    value="universal_preserve"
                    current={traceType}
                    onChange={setTraceType}
                    title="Keep All Artwork (Recommended)"
                    description="Preserves visible text, logos, graphics, textures, and patterns while preparing a clean flat result. Uses 24 credits per run."
                  />
                  <TraceOptionCard
                    value="universal_erase"
                    current={traceType}
                    onChange={setTraceType}
                    title="Extract Background / Pattern Only"
                    description="Intentionally removes all text and logos while preserving only the visible background or pattern. Uses 24 credits per run."
                  />
                </div>
              </div>
            )}

            {category === "logo" && (
              <div className={styles.infoPanel}>
                <p>
                  Works for <strong>icons, emblems, combined logos, and text-only wordmarks.</strong> All text and colors will be preserved exactly as in the reference.
                </p>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-cancel" onClick={handleClose}>Cancel</button>
              <button className="btn-primary" onClick={onSelectImage} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Select Image & Create →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default NewProjectModal;
