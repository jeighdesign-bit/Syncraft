"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics.mjs";

const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-D9SM04EL1Q";

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
}

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const configured = useRef(false);
  const lastTrackedPage = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const updateConsent = (event) => {
      const accepted =
        event?.detail === "accepted" ||
        localStorage.getItem("cookie_consent") === "accepted";

      if (!accepted && window.gtag) {
        window.gtag("consent", "update", { analytics_storage: "denied" });
      }

      setEnabled(accepted);
    };

    updateConsent();
    window.addEventListener("syncraft:cookie-consent", updateConsent);

    return () => {
      window.removeEventListener("syncraft:cookie-consent", updateConsent);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    ensureGtag();
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });

    if (!configured.current) {
      window.gtag("js", new Date());
      window.gtag("config", MEASUREMENT_ID, {
        anonymize_ip: true,
        send_page_view: false,
      });
      configured.current = true;
    }

    const currentUrl = new URL(window.location.href);
    const authEvent = currentUrl.searchParams.get("auth_event");
    if (authEvent === "sign_up" || authEvent === "login") {
      trackEvent(authEvent, { method: "supabase" });
      currentUrl.searchParams.delete("auth_event");
      window.history.replaceState(
        {},
        document.title,
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    }

    const page = `${pathname}${currentUrl.search}`;
    if (lastTrackedPage.current === page) return;

    lastTrackedPage.current = page;
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: page,
      page_title: document.title,
    });
  }, [enabled, pathname]);

  if (!enabled) return null;

  return (
    <Script
      id="syncraft-google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      strategy="afterInteractive"
    />
  );
}
