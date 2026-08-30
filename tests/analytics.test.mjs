import test from "node:test";
import assert from "node:assert/strict";
import {
  trackEvent,
  trackGenerationSuccess,
} from "../src/lib/analytics.mjs";

test("trackEvent is a no-op when analytics consent has not initialized gtag", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.equal(trackEvent("upload_start", { tool: "trace" }), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("successful generations emit conversion, credit, and repeat-use events", () => {
  const calls = [];
  const values = new Map([["syncraft:last-successful-generation-at", String(Date.now() - 7_200_000)]]);
  const previousWindow = globalThis.window;
  globalThis.window = {
    gtag: (...args) => calls.push(args),
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  try {
    assert.equal(trackGenerationSuccess({ tool: "logo_trace", credits: 12 }), true);
    assert.deepEqual(calls.map((call) => call[1]), [
      "generation_success",
      "spend_virtual_currency",
      "repeat_use",
    ]);
    assert.equal(calls[2][2].hours_since_last_use, 2);
  } finally {
    globalThis.window = previousWindow;
  }
});
