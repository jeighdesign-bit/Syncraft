"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  Code2,
  Coins,
  ExternalLink,
  FileJson,
  KeyRound,
  LogOut,
  Menu,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import styles from "./api-docs.module.css";

const supabase = createClient();

const sections = [
  { href: "#overview", label: "Overview" },
  { href: "#pricing", label: "Credit pricing" },
  { href: "#services", label: "Service costs" },
  { href: "#authentication", label: "Authentication" },
  { href: "#parameters", label: "Parameters" },
  { href: "#examples", label: "Examples" },
];

const plans = [
  { name: "Starter", price: "₱116", credits: "200" },
  { name: "Pro", price: "₱290", credits: "500", featured: true },
  { name: "Studio", price: "₱580", credits: "1,000" },
];

const services = [
  { name: "Garment Trace & Vectorization", modes: "keep_artwork · extract_pattern", php: "₱23.20", credits: "40" },
  { name: "Logo & Emblems Trace", modes: "logo_trace", php: "₱23.20", credits: "40" },
  { name: "Background Remover", modes: "bg_remover", php: "₱2.90", credits: "5" },
];

const curlExample = `curl -X POST https://syncraftech.com/api/v1/generate \\
-H "Authorization: Bearer YOUR_API_KEY_HERE" \\
-H "Content-Type: application/json" \\
-d '{
  "image_url": "https://example.com/jersey.png",
  "mode": "extract_pattern"
}'`;

const responseExample = `{
  "success": true,
  "company": "Your Company Name",
  "mode": "extract_pattern",
  "credits_charged": 40,
  "image_url": "https://url-to-final-vector.svg",
  "type": "image/svg+xml"
}`;

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" onClick={copy} className={styles.copyButton} aria-label={`${label} to clipboard`}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Clipboard size={15} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ label, language, value }) {
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span><Code2 size={14} aria-hidden="true" /> {label}</span>
        <CopyButton value={value} />
      </div>
      <pre><code data-language={language}>{value}</code></pre>
    </div>
  );
}

export default function ApiDocsPage() {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className={styles.pageShell}>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Syncraft home">
            <img src="/logo.svg" alt="Syncraft" />
          </Link>
          <nav className={styles.headerActions} aria-label="API documentation navigation">
            <Link href="/api-dashboard" className={styles.dashboardLink}><ArrowLeft size={16} aria-hidden="true" /> Dashboard</Link>
            <button type="button" onClick={signOut} className={styles.signOutButton}><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button>
          </nav>
        </div>
      </header>

      <div className={styles.mobileNavBar}>
        <span>API documentation</span>
        <button type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-controls="docs-mobile-nav">
          {mobileNavOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          Sections
        </button>
      </div>

      <div className={styles.docsLayout}>
        <aside id="docs-mobile-nav" className={`${styles.sidebar} ${mobileNavOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sidebarInner}>
            <div className={styles.sidebarLabel}><Code2 size={15} aria-hidden="true" /> API reference</div>
            <nav aria-label="On this page">
              {sections.map((section, index) => (
                <a key={section.href} href={section.href} onClick={() => setMobileNavOpen(false)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>{section.label}
                </a>
              ))}
            </nav>
            <div className={styles.sidebarHelp}>
              <strong>Ready to build?</strong>
              <p>Create and manage production keys from your dashboard.</p>
              <Link href="/api-dashboard">Open dashboard <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
          </div>
        </aside>

        <main className={styles.content}>
          <section className={styles.hero} id="overview" aria-labelledby="docs-title">
            <div className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> Syncraft developer platform</div>
            <h1 id="docs-title">Build creative workflows with the <span>Syncraft API.</span></h1>
            <p>Integrate production-ready garment tracing, logo vectorization, and background removal directly into your applications.</p>
            <div className={styles.heroActions}>
              <a href="#examples" className={styles.primaryLink}>View request example <ArrowRight size={17} aria-hidden="true" /></a>
              <Link href="/api-dashboard" className={styles.secondaryLink}>Get an API key <KeyRound size={16} aria-hidden="true" /></Link>
            </div>
            <div className={styles.endpointStrip}>
              <span><i /> Live endpoint</span>
              <code>POST&nbsp;&nbsp;https://syncraftech.com/api/v1/generate</code>
              <CopyButton value="https://syncraftech.com/api/v1/generate" label="Copy URL" />
            </div>
          </section>

          <section className={styles.docSection} id="pricing">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><Coins size={19} aria-hidden="true" /></span>
              <div><span className={styles.sectionNumber}>01</span><h2>API credit pricing</h2><p>Prepaid credits never expire and are added automatically after a confirmed payment.</p></div>
            </div>
            <div className={styles.planGrid}>
              {plans.map((plan) => (
                <article key={plan.name} className={`${styles.planCard} ${plan.featured ? styles.featuredPlan : ""}`}>
                  <div className={styles.planTop}><strong>{plan.name}</strong>{plan.featured && <span>Most popular</span>}</div>
                  <div className={styles.planPrice}>{plan.price}<small>PHP</small></div>
                  <div className={styles.planCredits}><span>{plan.credits}</span> API credits</div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.docSection} id="services">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><Zap size={19} aria-hidden="true" /></span>
              <div><span className={styles.sectionNumber}>02</span><h2>Cost per generation</h2><p>Credits are deducted only after a successful generation.</p></div>
            </div>
            <div className={styles.serviceList}>
              <div className={styles.serviceHeader}><span>Service</span><span>PHP</span><span>Credits</span><span>Billing</span></div>
              {services.map((service) => (
                <article key={service.name} className={styles.serviceRow}>
                  <div><strong>{service.name}</strong><code>{service.modes}</code></div>
                  <span>{service.php}</span><span className={styles.creditValue}>{service.credits}</span><span>Per image</span>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.docSection} id="authentication">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><KeyRound size={19} aria-hidden="true" /></span>
              <div><span className={styles.sectionNumber}>03</span><h2>Authentication</h2><p>Send your private API key as a Bearer token with every request.</p></div>
            </div>
            <div className={styles.notice}><KeyRound size={18} aria-hidden="true" /><p><strong>Keep API keys server-side.</strong> Never expose a production key in browser code, public repositories, or mobile app bundles.</p></div>
            <CodeBlock label="Authorization header" language="http" value="Authorization: Bearer YOUR_API_KEY" />
          </section>

          <section className={styles.docSection} id="parameters">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><FileJson size={19} aria-hidden="true" /></span>
              <div><span className={styles.sectionNumber}>04</span><h2>Request parameters</h2><p>Send a JSON body containing a public image URL and the processing mode.</p></div>
            </div>
            <div className={styles.parameterList}>
              <article className={styles.parameterRow}>
                <div className={styles.parameterName}><code>image_url</code><span>Required</span></div>
                <code className={styles.typeBadge}>string</code>
                <p>A publicly accessible URL for the image you want to process.</p>
              </article>
              <article className={styles.parameterRow}>
                <div className={styles.parameterName}><code>mode</code><span className={styles.optional}>Optional</span></div>
                <code className={styles.typeBadge}>string</code>
                <div>
                  <p>Selects the AI processing pipeline. Defaults to <code>keep_artwork</code>.</p>
                  <div className={styles.modeGrid}>
                    <code>keep_artwork <span>40 credits</span></code>
                    <code>extract_pattern <span>40 credits</span></code>
                    <code>logo_trace <span>40 credits</span></code>
                    <code>bg_remover <span>5 credits</span></code>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className={styles.docSection} id="examples">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><Code2 size={19} aria-hidden="true" /></span>
              <div><span className={styles.sectionNumber}>05</span><h2>Request and response</h2><p>A complete example you can paste into your server-side workflow.</p></div>
            </div>
            <CodeBlock label="cURL request" language="bash" value={curlExample} />
            <CodeBlock label="200 · Successful response" language="json" value={responseExample} />
          </section>

          <footer className={styles.docsFooter}>
            <div><img src="/logo.svg" alt="" aria-hidden="true" /><p>Production-ready creative automation for your applications.</p></div>
            <a href="https://syncraftech.com" target="_blank" rel="noreferrer">syncraftech.com <ExternalLink size={14} aria-hidden="true" /></a>
          </footer>
        </main>
      </div>
    </div>
  );
}
