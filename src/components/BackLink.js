"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function BackLink({ children, fallback = "/", ...props }) {
  const router = useRouter();
  return <Link {...props} href={fallback} onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const source = window.history.state?.syncraftReturnTo;
    let hasLocalReferrer = false;
    try { hasLocalReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin; } catch {}
    if ((typeof source === "string" && source.startsWith("/") && !source.startsWith("//")) || hasLocalReferrer) {
      if (window.history.length > 1) {
        event.preventDefault();
        router.back();
      }
    }
  }}>{children}</Link>;
}
