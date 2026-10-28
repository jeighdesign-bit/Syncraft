"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowUpRight } from "lucide-react";
import styles from "./LogoStudioAnnouncement.module.css";

export default function LogoStudioAnnouncement({ onTry }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <aside className={styles.banner} aria-label="Logo Studio announcement">
    <p><strong>Logo Studio is here.</strong><span> Create from text, a photo, or a sketch.</span> <Link href="/logo-studio" onNavigate={event => { if (onTry) { event.preventDefault(); onTry(); } }}>Try it <ArrowUpRight size={12} aria-hidden="true" /></Link></p>
    <button type="button" aria-label="Dismiss Logo Studio announcement" onClick={() => setDismissed(true)}><X size={14} aria-hidden="true" /></button>
  </aside>;
}
