"use client";

import Link from "next/link";
import { FileText, FolderOpen, Image, LayoutDashboard, Menu, PenTool, ScanLine, Scissors, Send, Shirt, ShoppingBag } from "lucide-react";
import ResponsivePanel from "@/components/ResponsivePanel";
import AccountCreditMenu from "@/components/AccountCreditMenu";
import FloatingPromoVideo from "./FloatingPromoVideo";
import styles from "./WorkspaceSidebar.module.css";

const features = [
  { label: "Garment Extraction", icon: Shirt, action: "garment" },
  { label: "Logo Extraction", icon: PenTool, action: "logo-trace" },
  { label: "Universal Extraction", icon: ScanLine, action: "universal" },
  { label: "Logo Studio", icon: PenTool, action: "logo" },
  { label: "Image Upscaling", icon: Image, action: "upscale" },
  { label: "Background Removal", icon: Scissors, action: "background" },
];

export default function WorkspaceSidebar({ onOpenFeature, user, credits, onOpenTopUp, onSignOut, disabled = false, withoutHeader = false }) {
  return (
    <ResponsivePanel label="Tools" icon={Menu}>{({ close }) => <aside className={`${styles.sidebar}${withoutHeader ? ` ${styles.withoutHeader}` : ""}`} aria-label="Workspace sidebar">
      {withoutHeader && <Link href="/workspace" className={styles.brand} aria-label="Syncraft workspace dashboard"><img src="/logo.svg" alt="Syncraft" width={112} height={20} /></Link>}
      <nav className={styles.navigation} aria-label="Workspace features">
        <Link href="/workspace" className={styles.dashboardLink} aria-current="page">
          <LayoutDashboard size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Dashboard</span>
        </Link>
        <div className={styles.sectionButton}>
          <FolderOpen size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Workspace</span>
        </div>
        <div className={styles.featureList}>
          {features.map(({ label, icon: Icon, action }) => (
            <button
              type="button"
              key={label}
              className={styles.featureButton}
              onClick={() => { close(); onOpenFeature(action); }}
              disabled={disabled}
            >
              <Icon size={17} strokeWidth={1.65} aria-hidden="true" />
              <span>{label}</span>
              {action === "logo" && <span className={styles.newBadge}>NEW</span>}
            </button>
          ))}
        </div>
        <div className={styles.accountLinks} aria-label="More workspace links">
          <Link href="/store" className={styles.accountLink}><ShoppingBag size={17} aria-hidden="true" />Store</Link>
          <Link href="/terms" className={styles.accountLink}><FileText size={17} aria-hidden="true" />Legal &amp; policies</Link>
          <Link href="/feedback" className={styles.accountLink}><Send size={17} aria-hidden="true" />Request a feature</Link>
        </div>
        <div className={styles.promoVideo}>
          <p className={styles.promoTitle}>WORKSPACE GUIDE</p>
          <FloatingPromoVideo
            inline
            src="/videos/workspace-tour-v4.mp4"
          />
        </div>
      </nav>
      <div className={styles.accountArea}>
        {withoutHeader && <div className={styles.creditBalance}><div className="syncraft-header-control" aria-label={`${credits ?? "—"} credits`}><span className="syncraft-header-control__value">{credits ?? "—"}</span><span className="syncraft-header-control__label">CREDITS</span></div></div>}
        <button type="button" className={styles.topUpButton} onClick={() => { close(); onOpenTopUp(); }}>
          Buy More Credits
        </button>
        <AccountCreditMenu
          placement="sidebar"
          user={user}
          credits={credits}
          onOpenTopUp={onOpenTopUp}
          onSignOut={onSignOut}
        />
      </div>
    </aside>}</ResponsivePanel>
  );
}
