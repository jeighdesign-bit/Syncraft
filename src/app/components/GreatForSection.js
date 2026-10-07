"use client";

import { memo } from "react";
import styles from "./GreatForSection.module.css";

const workflowFeatures = [
  {
    app: "Ps",
    logo: "https://www.adobe.com/cc-shared/assets/img/product-icons/svg/photoshop.svg",
    title: "Adobe Photoshop",
    benefit: "Edit every layer.",
    description: "Open organized raster layers for faster color adjustments, compositing, and production edits.",
  },
  {
    app: "Ai",
    logo: "https://www.adobe.com/cc-shared/assets/img/product-icons/svg/illustrator.svg",
    title: "Adobe Illustrator",
    benefit: "Scale without limits.",
    description: "Continue working with clean, scalable vector paths without sacrificing output quality.",
  },
  {
    app: "CDR",
    logo: "https://www.coreldraw.com/static/cdgs/product_content/cdgs/2026/icon-coreldraw.png",
    title: "CorelDRAW",
    benefit: "Refine for production.",
    description: "Import your exported SVG for layout refinement, artwork cleanup, and print preparation.",
  },
  {
    app: "PNG",
    title: "Production Delivery",
    benefit: "Deliver every file.",
    description: "Export a ready-to-share PNG or download the complete project files in one ZIP package.",
  },
];

const GreatForSection = memo(function GreatForSection() {
  return (
    <section className={styles.sectionWrapper} aria-labelledby="workflow-formats-title">
      <div className={styles.header}>
        <span className={styles.eyebrow}>Export &amp; Edit</span>
        <h2 id="workflow-formats-title" className={styles.heading}>Built for your creative workflow.</h2>
        <p className={styles.intro}>Move your Syncraft output into the tools and formats your production process already uses.</p>
      </div>

      <div className={styles.grid}>
        {workflowFeatures.map((feature) => (
          <article className={styles.card} key={feature.title}>
            <div className={styles.cardTopline}>
              {feature.logo ? (
                <img className={styles.brandIcon} src={feature.logo} alt="" width="44" height="44" />
              ) : (
                <span className={styles.appBadge} aria-hidden="true">{feature.app}</span>
              )}
              <p className={styles.productName}>{feature.title}</p>
            </div>
            <div className={styles.cardContent}>
              <h3 className={styles.benefit}>{feature.benefit}</h3>
              <p className={styles.description}>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
});

export default GreatForSection;
