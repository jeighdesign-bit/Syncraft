import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./SeoLandingPage.module.css";

export default function SeoLandingPage({ eyebrow, title, description, ctaHref = "/#syncraft-upload", ctaLabel = "Start with an Upload" }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Syncraft home">
          <img src="/logo.svg" alt="Syncraft" width="154" height="38" />
        </Link>
      </header>

      <section className={styles.hero} aria-labelledby="page-title">
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 id="page-title">{title}</h1>
        <p className={styles.description}>{description}</p>
        <Link href={ctaHref} className={styles.primaryCta}>
          {ctaLabel} <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerMainRow}>
          <div className={styles.footerBrand}>
            <img src="/logo.svg" alt="Syncraft" width="142" height="35" />
            <span>© 2024–2026</span>
          </div>
          <nav className={styles.footerLinks} aria-label="Footer navigation">
            <div className={styles.footerLinkRow}>
              <Link href="/image-upscaler">Image Upscaler</Link>
              <Link href="/logo-vectorizer">Logo Vectorizer</Link>
              <Link href="/image-to-vector">Image to Vector</Link>
              <Link href="/sublimation-design-extractor">Sublimation Extractor</Link>
              <a href="#feedback">Feedback</a>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
            </div>
            <div className={styles.footerLinkRow}>
              <a href="#cookie-settings">Cookie Policy</a>
              <a href="#faq">FAQ</a>
              <Link href="/refunds">Refund Policy</Link>
              <a href="https://m.me/105884602605306" target="_blank" rel="noreferrer">Contact</a>
              <Link href="/api-dashboard" className={styles.apiLink}>API</Link>
              <a href="https://m.me/105884602605306" target="_blank" rel="noreferrer" className={styles.supportLink}>Customer Support</a>
            </div>
          </nav>
        </div>
      </footer>
    </main>
  );
}
