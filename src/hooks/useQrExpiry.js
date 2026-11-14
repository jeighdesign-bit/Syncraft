"use client";

import { useEffect, useState } from "react";
import { qrExpiryState, qrExpiryTimestamp } from "@/lib/qrExpiry.mjs";

export function useQrExpiry(expiresAt, active = true) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!active) return;
    const deadline = qrExpiryTimestamp(expiresAt);
    let timer;
    const update = () => {
      clearTimeout(timer);
      const currentTime = Date.now();
      setNow(currentTime);
      if (deadline != null && deadline > currentTime) {
        timer = setTimeout(update, Math.min(1000, deadline - currentTime));
      }
    };
    update();
    // Background tabs can throttle timers; recompute from the absolute expiry
    // as soon as the customer returns, rather than decrementing a counter.
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [expiresAt, active]);

  return qrExpiryState(expiresAt, Math.max(now, Date.now()));
}
