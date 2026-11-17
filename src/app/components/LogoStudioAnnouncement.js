"use client";

import { useState } from "react";
import { X } from "lucide-react";
import styles from "./LogoStudioAnnouncement.module.css";

export default function VelaAnnouncement() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <aside className={styles.banner} aria-label="Vela announcement">
    <p><strong>Vela is here.</strong><span> Our new extraction model. Available in the model picker.</span></p>
    <button type="button" aria-label="Dismiss Vela announcement" onClick={() => setDismissed(true)}><X size={14} aria-hidden="true" /></button>
  </aside>;
}
