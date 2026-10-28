"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Keep a return destination on each history entry, including across reloads.
// Preserve Next's own history state and never rewrite an entry reached by Back.
export default function NavigationHistory() {
  const pathname = usePathname();
  const previous = useRef(null);

  useEffect(() => {
    const onPop = () => {
      previous.current = window.location.pathname + window.location.search + window.location.hash;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (previous.current && previous.current !== current) {
      window.history.replaceState({ ...window.history.state, syncraftReturnTo: previous.current }, "");
    }
    previous.current = current;
  }, [pathname]);

  return null;
}
