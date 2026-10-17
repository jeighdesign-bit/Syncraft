"use client";

import { useState, useEffect } from "react";
import { X, Cookie } from "lucide-react";
import styles from "./CookieConsent.module.css";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    const openSettings = () => {
      setLeaving(false);
      setVisible(true);
    };

    window.addEventListener("syncraft:open-cookie-settings", openSettings);
    if (!consent) {
      // Slight delay so it doesn't pop up on initial render flash
      const t = setTimeout(() => setVisible(true), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("syncraft:open-cookie-settings", openSettings);
      };
    }

    return () => window.removeEventListener("syncraft:open-cookie-settings", openSettings);
  }, []);

  const accept = () => {
    localStorage.setItem("cookie_consent", "accepted");
    localStorage.setItem("cookie_consent_updated_at", new Date().toISOString());
    window.dispatchEvent(
      new CustomEvent("syncraft:cookie-consent", { detail: "accepted" })
    );
    dismiss();
  };

  const decline = () => {
    localStorage.setItem("cookie_consent", "declined");
    localStorage.setItem("cookie_consent_updated_at", new Date().toISOString());
    window.dispatchEvent(
      new CustomEvent("syncraft:cookie-consent", { detail: "declined" })
    );
    dismiss();
  };

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => setVisible(false), 240);
  };

  if (!visible) return null;

  return (
    <aside
      className={`${styles.banner} ${leaving ? styles.leaving : ""}`}
      role="region"
      aria-label="Cookie preferences"
    >
      <div className={styles.iconBox} aria-hidden="true">
        <Cookie size={20} strokeWidth={1.8} />
      </div>

      <div className={styles.copy}>
        <h2>Cookie preferences</h2>
        <p>
          Essential storage keeps the app working. If you allow analytics, we&apos;ll also use Google Analytics to understand how Syncraft is used.
          {" "}
          <a href="/privacy">
            Learn more
          </a>
        </p>
      </div>

      <div className={styles.actions}>
        <button onClick={decline} className={styles.secondaryButton}>
          Essential Only
        </button>
        <button onClick={accept} className={styles.primaryButton}>
          Accept Analytics
        </button>
      </div>

      <button onClick={dismiss} className={styles.closeButton} aria-label="Dismiss cookie banner">
        <X size={18} />
      </button>
    </aside>
  );
}
