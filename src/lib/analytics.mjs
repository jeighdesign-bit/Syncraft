const LAST_SUCCESS_KEY = "syncraft:last-successful-generation-at";

function safeText(value, maxLength = 100) {
  return String(value || "unknown").slice(0, maxLength);
}

export function trackEvent(eventName, parameters = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false;
  window.gtag("event", safeText(eventName, 40), parameters);
  return true;
}

export function trackGenerationStart({ tool, credits } = {}) {
  return trackEvent("generation_start", {
    tool: safeText(tool),
    ...(Number.isFinite(credits) ? { credits } : {}),
  });
}

export function trackGenerationSuccess({ tool, credits } = {}) {
  const normalizedTool = safeText(tool);
  const tracked = trackEvent("generation_success", {
    tool: normalizedTool,
    ...(Number.isFinite(credits) ? { credits } : {}),
  });

  if (Number.isFinite(credits) && credits > 0) {
    trackEvent("spend_virtual_currency", {
      value: credits,
      virtual_currency_name: "Syncraft credits",
      item_name: normalizedTool,
    });
  }

  try {
    const now = Date.now();
    const previous = Number(window.localStorage?.getItem(LAST_SUCCESS_KEY));
    if (Number.isFinite(previous) && previous > 0 && previous < now) {
      trackEvent("repeat_use", {
        tool: normalizedTool,
        hours_since_last_use: Math.max(0, Math.round((now - previous) / 3_600_000)),
      });
    }
    window.localStorage?.setItem(LAST_SUCCESS_KEY, String(now));
  } catch {
    // Analytics must never interrupt a successful production workflow.
  }

  return tracked;
}

export function trackGenerationFailure({ tool, reason } = {}) {
  return trackEvent("generation_failure", {
    tool: safeText(tool),
    reason: safeText(reason),
  });
}

export function trackExport({ tool, format } = {}) {
  return trackEvent("file_export", {
    tool: safeText(tool),
    file_format: safeText(format, 20),
  });
}
