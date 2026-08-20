"use client";

import { useState, useCallback, useRef } from "react";
import { CREDIT_COST } from "@/lib/pricing";

// Universal Background-only can include flattening, dual foreground detection,
// masked inpainting, and validation. Keep the browser just below the route's
// 300-second ceiling so it does not abort a healthy server run prematurely.
const REQUEST_TIMEOUT_MS = 290_000;

/**
 * useTraceExecution — Manages the full 3-step AI pipeline execution.
 *
 * KEY DESIGN DECISIONS:
 * 1. `consoleRef` is a DOM ref passed to PropertiesPanel. logToConsole() writes
 *    directly to the DOM — zero React re-renders per log line during AI runs.
 * 2. `nodeErrors` provides per-node error isolation: if Step 2 fails, only
 *    Node 3 shows an error badge. The pipeline does not crash.
 * 3. Stages 2 and 3 are extracted into `runStep2And3` so they can be re-run on
 *    their own — `handleResumeFromStep2` does exactly that after Extend Design
 *    replaces the flat extract. Neither of those endpoints charges credits, so
 *    the resume path must never charge or refund.
 */
export function useTraceExecution({ project, setProject, userCredits, setUserCredits, supabase, onNoCredits }) {
  const [traceState, setTraceState] = useState("idle"); // idle | step1 | step2 | step3
  const [nodeErrors, setNodeErrors] = useState({ step1: null, step2: null, step3: null });
  const consoleRef = useRef(null); // DOM ref for the console <div>

  // DOM-direct log write — zero React re-renders
  const logToConsole = useCallback((text, type = "normal") => {
    const container = consoleRef.current;
    if (!container) return;

    const el = document.createElement("div");
    el.className = `console-msg${type === "success" ? " success" : type === "error" ? " error" : ""}`;

    // Parse [Prefix] Message pattern
    const match = text.match(/^\[(.*?)\] (.*)$/);
    if (match) {
      const badge = document.createElement("span");
      badge.className = "console-badge";
      badge.textContent = match[1];
      el.appendChild(badge);

      const msgText = document.createElement("span");
      msgText.className = "console-text";
      msgText.textContent = match[2];
      el.appendChild(msgText);
    } else {
      const msgText = document.createElement("span");
      msgText.className = "console-text";
      msgText.textContent = text;
      el.appendChild(msgText);
    }

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }, []);

  const clearConsole = useCallback((initialMsg) => {
    const container = consoleRef.current;
    if (!container) return;
    container.innerHTML = "";
    if (initialMsg) {
      logToConsole(initialMsg);
    }
  }, [logToConsole]);

  const getAuthToken = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }, [supabase]);

  /**
   * The house fetch shape: read as text, then JSON.parse in a try/catch so an
   * HTML error page or a gateway timeout still yields a usable message.
   * Throws an Error carrying `.code` (the raw server error string) so callers can
   * branch on things like INSUFFICIENT_CREDITS without matching on prose.
   */
  const postJson = useCallback(async (url, body, token, label) => {
    let activeToken = token || await getAuthToken();

    if (!activeToken) {
      const authError = new Error("Your login session expired. Please log in again.");
      authError.code = "AUTH_SESSION_EXPIRED";
      authError.label = label;
      throw authError;
    }

    const sendRequest = async (accessToken) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          const timeoutError = new Error("Request timed out. Please try again with a simpler crop.");
          timeoutError.code = "REQUEST_TIMEOUT";
          timeoutError.status = 504;
          timeoutError.label = label;
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let res = await sendRequest(activeToken);
    if (res.status === 401) {
      const { data, error } = await supabase.auth.refreshSession();
      const refreshedToken = data?.session?.access_token;
      if (error || !refreshedToken) {
        const authError = new Error("Your login session expired. Please log in again.");
        authError.code = "AUTH_SESSION_EXPIRED";
        authError.label = label;
        throw authError;
      }
      activeToken = refreshedToken;
      res = await sendRequest(activeToken);
    }

    if (res.status === 401) {
      const authError = new Error("Your login session expired. Please log in again.");
      authError.code = "AUTH_SESSION_EXPIRED";
      authError.label = label;
      throw authError;
    }

    const rawText = await res.text();
    let data = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { error: res.status === 504 ? "504 Timeout" : `Server Error ${res.status}` };
    }

    if (!res.ok || data.success === false) {
      const err = new Error(data.error || `Error ${res.status}`);
      err.code = data.code || data.error;
      err.status = res.status;
      err.label = label;
      err.refunded = data.refunded === true;
      err.validation = data.validation;
      throw err;
    }
    return data;
  }, [getAuthToken, supabase]);

  const analyzeRecovery = useCallback(async () => {
    if (!project?.id || project.trace_type !== "universal") return null;
    const authToken = await getAuthToken();
    if (!authToken) throw new Error("You must be logged in.");
    setTraceState("step1");
    try {
      const data = await postJson("/api/recovery/analyze", { projectId: project.id }, authToken, "recovery-analysis");
      setProject(prev => ({ ...prev, recovery_analysis: data.analysis, recovery_status: "analyzed" }));
      return data.analysis;
    } catch (error) {
      setTraceState("idle");
      throw error;
    }
  }, [project?.id, project?.trace_type, getAuthToken, postJson, setProject]);

  /**
   * Stages 2 and 3 against whatever `generated_image_url` currently holds.
   * Both endpoints are free, so this never touches credits.
   *
   * @param {string}  authToken
   * @param {string}  vectorColors  "auto" | "2" | "4" | "8" | "16"
   * @param {boolean} skipRefund    true when re-running an already-paid project.
   *   Without it the server's catch blocks would overwrite generated_image_url
   *   with the 'REFUNDED' sentinel and hand out credits this run never charged.
   * @throws on failure, having already recorded the per-node error
   */
  const runStep2And3 = useCallback(async ({ authToken, vectorColors, skipRefund = false }) => {
    const projectId = project.id;

    // ─── Step 2: Upscale ─────────────────────────────────────────────
    setTraceState("step2");
    logToConsole("[Step 2] Upscaling with ClawScale™ Matrix...", "normal");

    let data2;
    try {
      data2 = await postJson("/api/trace",
        { projectId, step: 2, ...(skipRefund ? { skipRefund: true } : {}) },
        authToken, "step2");
    } catch (e) {
      setNodeErrors(prev => ({ ...prev, step2: e.message }));
      throw e;
    }

    logToConsole("[Step 2.5] Saving upscaled image...", "normal");
    const saveData2 = data2.alreadySaved
      ? { url: data2.fileUrl }
      : await postJson("/api/save-asset",
        { projectId, step: 2, fileUrl: data2.fileUrl, mimeType: data2.mimeType },
        authToken, "save2");

    setProject(prev => ({ ...prev, upscaled_image_url: saveData2.url }));
    logToConsole("[Success] Upscale Complete!", "success");

    // ─── Step 3: Vectorize ───────────────────────────────────────────
    setTraceState("step3");
    logToConsole("[Step 3] Vectorizing with TrueVector™ Core...", "normal");

    let data3;
    try {
      data3 = await postJson("/api/trace-step3",
        { projectId, colors: vectorColors, ...(skipRefund ? { skipRefund: true } : {}) },
        authToken, "step3");
    } catch (e) {
      setNodeErrors(prev => ({ ...prev, step3: e.message }));
      throw e;
    }

    setProject(prev => ({ ...prev, svg_url: data3.svg_url }));
    logToConsole("[Success] Vectorization Complete!", "success");
  }, [project?.id, setProject, logToConsole, postJson]);

  const handleExecuteTrace = useCallback(async (vectorColors = "auto") => {
    if (!project || traceState !== "idle") return;

    const executionCost = project.trace_type === "universal"
      ? CREDIT_COST.universal
      : CREDIT_COST.trace;

    if (userCredits !== null && userCredits < executionCost) {
      onNoCredits?.();
      return;
    }

    // Reset per-node errors
    setNodeErrors({ step1: null, step2: null, step3: null });

    // Universal recovery owns billing inside /api/recovery/generate. Update the
    // visible balance only after that endpoint confirms success, so a rejected
    // duplicate/stale request never appears to consume credits.
    if (project.trace_type !== "universal" && userCredits >= CREDIT_COST.trace) {
      setUserCredits(prev => prev - CREDIT_COST.trace);
    }

    // Fetch auth token once — used for all secure API calls in this pipeline
    const authToken = await getAuthToken();

    if (!authToken) {
      setTraceState("idle");
      setNodeErrors(prev => ({ ...prev, step1: "You must be logged in to trace." }));
      return;
    }

    try {
      // ─── Step 1: Extract ──────────────────────────────────────────────
      setTraceState("step1");
      clearConsole("[Step 1] Analyzing Image with SyncraftVision™...");

      let data1;
      try {
        data1 = project.trace_type === "universal"
          ? await postJson("/api/recovery/generate", { projectId: project.id }, authToken, "step1")
          : await postJson("/api/trace", { projectId: project.id, step: 1 }, authToken, "step1");
      } catch (e) {
        if (e.code === "INSUFFICIENT_CREDITS") {
          setUserCredits(0);
          onNoCredits?.();
          setTraceState("idle");
          return;
        }
        setNodeErrors(prev => ({ ...prev, step1: e.message }));
        throw e;
      }

      if (project.trace_type === "universal" && userCredits >= executionCost) {
        setUserCredits(prev => prev - executionCost);
      }

      logToConsole("[Step 1.5] Saving extracted image...", "normal");
      const saveData1 = await postJson("/api/save-asset",
        { projectId: project.id, step: 1, base64: data1.base64, mimeType: data1.mimeType },
        authToken, "save1");

      setProject(prev => ({
        ...prev,
        generated_image_url: saveData1.url,
        ...(project.trace_type === "universal" ? {
          recovery_status: data1.recoveryStatus === "partial" ? "partial" : "validated",
          recovery_validation: data1.validation,
          recovery_analysis: data1.analysis || prev.recovery_analysis,
        } : {}),
      }));
      if (project.trace_type === "universal" && data1.validation?.source_fallback) {
        logToConsole(`[Safe fallback] ${data1.validation.correction || "The generated flatten could not safely replace the source artwork."}`, "success");
      } else if (project.trace_type === "universal" && data1.recoveryStatus === "partial") {
        logToConsole("[Success] Best-effort visible artwork recovered and arranged.", "success");
      } else {
        logToConsole("[Success] Image Extracted by SyncraftVision™!", "success");
      }

      // ─── Steps 2 & 3 ─────────────────────────────────────────────────
      await runStep2And3({ authToken, vectorColors, skipRefund: false });

      setTraceState("idle");
      return { success: true }; // Signal to page to open compare modal

    } catch (error) {
      setTraceState("idle");

      const isTimeout = !["FOREGROUND_DETECTION_UNAVAILABLE", "RECOVERY_NETWORK_FAILED"].includes(error.code) && (
        error.code === "REQUEST_TIMEOUT"
        || error.status === 504
        || error.message?.includes("504")
        || error.message?.includes("Failed to fetch")
        || /timed?\s*out|timeout|aborted due to timeout/i.test(error.message || "")
      );

      // Step 1 can now return an already-verified refund. Later pipeline stages
      // use the refund endpoint, which only accepts a server-recorded failure
      // tied to this project's exact charge transaction.
      if (project.trace_type !== "universal" && error.refunded) {
        logToConsole(`[System] Generation failed. ${CREDIT_COST.trace} Credits have been refunded.`, "success");
        if (userCredits !== null) setUserCredits(prev => prev + CREDIT_COST.trace);
      } else if (project.trace_type !== "universal") try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const refundRes = await fetch("/api/refund", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ projectId: project.id }),
          });
          const refundData = await refundRes.json();
          if (refundData.success) {
            logToConsole(`[System] Generation failed. ${CREDIT_COST.trace} Credits have been refunded.`, "success");
            if (userCredits !== null) setUserCredits(prev => prev + CREDIT_COST.trace);
          }
        }
      } catch {
        // Keep the server balance authoritative if verification cannot complete.
      }

      const displayMsg = isTimeout
        ? "Request timed out. Please crop the image to make it simpler and try again."
        : error.message;

      const isExpectedRecoveryOutcome = error.code === "RECOVERY_ALREADY_RUNNING"
        || error.code === "BACKGROUND_ONLY_VALIDATION_FAILED"
        || error.code === "FAL_RECOVERY_FAILED"
        || error.code === "FOREGROUND_MASK_NOT_FOUND"
        || error.code === "FOREGROUND_DETECTION_UNAVAILABLE"
        || error.code === "RECOVERY_NETWORK_FAILED";
      if (!isTimeout && !isExpectedRecoveryOutcome) {
        // Only surface unexpected errors to the dev overlay, not timeout noise
        console.error("[Trace Error]", error);
      }

      logToConsole(`[${error.refunded ? "Refunded" : "Error"}] ${displayMsg}`, "error");
      setTraceState("idle");
      return { success: false };
    }
  }, [project, traceState, userCredits, setUserCredits, setProject, supabase, onNoCredits, logToConsole, clearConsole, getAuthToken, postJson, runStep2And3]);

  /**
   * Re-run stages 2 and 3 against the current flat extract, without re-running
   * stage 1. Used after Extend Design replaces `generated_image_url`.
   *
   * Charges nothing and never calls /api/refund — that endpoint overwrites
   * generated_image_url with the 'REFUNDED' sentinel, which would destroy the
   * extension the user just paid for.
   */
  const handleResumeFromStep2 = useCallback(async (vectorColors = "auto") => {
    if (!project || traceState !== "idle") return { success: false };

    if (!project.generated_image_url || project.generated_image_url === "REFUNDED") {
      logToConsole("[Error] No flat extract to process.", "error");
      return { success: false };
    }

    // Step 1 did not re-run, so leave its badge alone.
    setNodeErrors(prev => ({ ...prev, step2: null, step3: null }));

    const authToken = await getAuthToken();
    if (!authToken) {
      setNodeErrors(prev => ({ ...prev, step2: "You must be logged in." }));
      return { success: false };
    }

    try {
      await runStep2And3({ authToken, vectorColors, skipRefund: true });
      setTraceState("idle");
      return { success: true };
    } catch (error) {
      setTraceState("idle");
      const isTimeout = error.message?.includes("504") || error.message?.includes("Failed to fetch");
      logToConsole(`[Error] ${isTimeout
        ? "Request Timed Out. Your extended design is safe — retry the vectorize."
        : error.message}`, "error");
      return { success: false };
    }
  }, [project, traceState, getAuthToken, runStep2And3, logToConsole]);

  /**
   * Retry only the free vectorization stage when upscale already succeeded.
   * This avoids charging again or needlessly re-running the expensive upscale.
   */
  const handleRetryVector = useCallback(async (vectorColors = "auto") => {
    if (!project?.upscaled_image_url || traceState !== "idle") return { success: false };

    const authToken = await getAuthToken();
    if (!authToken) {
      setNodeErrors(prev => ({ ...prev, step3: "You must be logged in." }));
      return { success: false };
    }

    setNodeErrors(prev => ({ ...prev, step3: null }));
    setTraceState("step3");
    logToConsole("[Step 3] Retrying vectorization with TrueVector™ Core...", "normal");

    try {
      const data = await postJson(
        "/api/trace-step3",
        { projectId: project.id, colors: vectorColors, skipRefund: true },
        authToken,
        "step3",
      );
      setProject(prev => ({ ...prev, svg_url: data.svg_url }));
      logToConsole("[Success] Vectorization Complete!", "success");
      return { success: true };
    } catch (error) {
      setNodeErrors(prev => ({ ...prev, step3: error.message }));
      const timedOut = error.status === 504 || error.code === "VECTORIZE_TIMEOUT";
      logToConsole(
        `[Error] ${timedOut
          ? "Vectorization timed out. Your upscale is safe—retry Vector SVG for free."
          : error.message}`,
        "error",
      );
      return { success: false };
    } finally {
      setTraceState("idle");
    }
  }, [project?.id, project?.upscaled_image_url, traceState, getAuthToken, postJson, setProject, logToConsole]);

  return {
    traceState,
    nodeErrors,
    consoleRef,
    logToConsole,
    clearConsole,
    handleExecuteTrace,
    analyzeRecovery,
    handleResumeFromStep2,
    handleRetryVector,
  };
}
