import fs from "node:fs/promises";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const projectRoot = "../..";
const workbookPath = `${projectRoot}/outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/Syncraft_Fal_Reserve_Tracker.xlsx`;
const previewDir = `${projectRoot}/.codex-work/syncraft-finance-sheet`;
const now = new Date();

dotenv.config({ path: `${projectRoot}/.env.local` });
dotenv.config({ path: `${projectRoot}/.env`, override: false });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table, status) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").eq("status", status).order("created_at", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

const [manual, dodo] = await Promise.all([
  fetchAll("payment_requests", "approved"),
  fetchAll("dodo_payments", "paid"),
]);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const tracker = workbook.worksheets.getItem("Payment Tracker");
const state = workbook.worksheets.getItem("Sync State");
const assumptions = workbook.worksheets.getItem("Assumptions");

const stateValues = state.getUsedRange(true).values;
const seen = new Set(stateValues.slice(4).map((r) => String(r[1] || "")).filter(Boolean));
const candidates = [
  ...manual.filter((p) => !seen.has(String(p.id))).map((p) => ({ provider: "GCash", row: p })),
  ...dodo.filter((p) => !seen.has(String(p.id))).map((p) => ({ provider: "Dodo", row: p })),
];

if (!candidates.length) {
  console.log(JSON.stringify({ newValid: 0, needsReview: 0, saved: false }));
  process.exit(0);
}

const plans = {
  tingi: { label: "Tingi", php: 60, credits: 24 },
  basic: { label: "Basic", php: 149, credits: 60 },
  starter: { label: "Starter", php: 299, credits: 168 },
  pro: { label: "Pro", php: 499, credits: 288 },
  elite: { label: "Elite", php: 899, credits: 528 },
};
const fx = Number(assumptions.getRange("B7").values?.[0]?.[0] || 62);
const trackerRows = tracker.getRange("A5:N504").values;
let nextTrackerIndex = trackerRows.findIndex((r) => !r[0] && !r[1] && !r[3]);
if (nextTrackerIndex < 0) nextTrackerIndex = trackerRows.length;
let nextStateRow = stateValues.length + 1;
const valid = [];
const review = [];

function paymentDate(p) {
  const raw = p.paid_at || p.approved_at || p.updated_at || p.created_at;
  return raw ? new Date(raw) : now;
}

for (const item of candidates) {
  const p = item.row;
  const planKey = String(p.plan || "").toLowerCase();
  const plan = plans[planKey];
  let issue = "";
  let adjustment = 0;
  if (!plan) {
    issue = `Unknown plan: ${p.plan || "blank"}`;
  } else if (Number.isFinite(Number(p.credits)) && Number(p.credits) !== plan.credits) {
    issue = `Legacy plan terms: ${p.credits} credits (current ${plan.credits})`;
  } else if (item.provider === "GCash" && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0) {
    adjustment = Number(p.amount) / 100 - plan.php;
  } else if (item.provider === "Dodo") {
    const amountMinor = Number(p.amount);
    const currency = String(p.currency || "").toUpperCase();
    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || !currency) {
      issue = "Dodo amount/currency missing";
    } else if (currency === "USD") {
      adjustment = amountMinor / 100 * fx - plan.php;
    } else if (currency === "PHP") {
      adjustment = amountMinor / 100 - plan.php;
    } else {
      issue = `Unsupported Dodo currency: ${currency}`;
    }
  }

  const reference = item.provider === "GCash"
    ? (p.reference_number || p.id)
    : (p.dodo_payment_id || p.dodo_checkout_session_id || p.id);

  if (issue || nextTrackerIndex >= trackerRows.length) {
    const finalIssue = issue || "Payment Tracker is full";
    state.getRange(`A${nextStateRow}:E${nextStateRow}`).values = [[item.provider, p.id, reference, `Needs Review — ${finalIssue}`, now]];
    review.push({ paymentId: p.id, provider: item.provider, issue: finalIssue });
    nextStateRow += 1;
    continue;
  }

  const excelRow = 5 + nextTrackerIndex;
  const trackerReference = `\u200B${String(reference).replace(/^['\u200B\uFEFF]/, "")}`;
  tracker.getRange(`A${excelRow}:D${excelRow}`).values = [[paymentDate(p), trackerReference, item.provider, plan.label]];
  tracker.getRange(`F${excelRow}`).values = [[Math.round(adjustment * 100) / 100]];
  tracker.getRange(`M${excelRow}:N${excelRow}`).values = [["No", `Auto-synced ${now.toISOString()} | payment id ${p.id}`]];
  // Record the ID only after the tracker row has been written successfully in memory.
  state.getRange(`A${nextStateRow}:E${nextStateRow}`).values = [[item.provider, p.id, reference, "Tracked", now]];
  valid.push({ paymentId: p.id, provider: item.provider, trackerRow: excelRow });
  nextTrackerIndex += 1;
  nextStateRow += 1;
}

state.getRange(`A5:E${nextStateRow - 1}`).format.font.name = "Aptos";
state.getRange(`E5:E${nextStateRow - 1}`).format.numberFormat = "yyyy-mm-dd hh:mm:ss";

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "payment sync formula error scan",
});
if (!errors.ndjson.includes("matched 0 entries")) throw new Error(`Formula error after sync: ${errors.ndjson}`);

const firstAdded = valid.length ? Math.min(...valid.map((v) => v.trackerRow)) : 5;
const lastAdded = valid.length ? Math.max(...valid.map((v) => v.trackerRow)) : 5;
if (valid.length) {
  console.log((await workbook.inspect({
    kind: "table", range: `Payment Tracker!A${firstAdded}:N${lastAdded}`,
    include: "values,formulas", tableMaxRows: Math.max(valid.length, 1), tableMaxCols: 14, maxChars: 8000,
  })).ndjson);
}
console.log((await workbook.inspect({
  kind: "table", range: "Dashboard!A1:H7", include: "values,formulas", tableMaxRows: 7, tableMaxCols: 8, maxChars: 5000,
})).ndjson);

const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(workbookPath);

const savedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const savedTracker = savedWorkbook.worksheets.getItem("Payment Tracker");
let providerCostTotal = 0;
let directProfitTotal = 0;
for (const v of valid) {
  providerCostTotal += Number(savedTracker.getRange(`I${v.trackerRow}`).values?.[0]?.[0] || 0);
  directProfitTotal += Number(savedTracker.getRange(`J${v.trackerRow}`).values?.[0]?.[0] || 0);
}
const preview = await savedWorkbook.render({ sheetName: "Dashboard", range: "A1:H24", scale: 1.1, format: "png" });
await fs.writeFile(`${previewDir}/dashboard-latest-sync-preview.png`, new Uint8Array(await preview.arrayBuffer()));

console.log(JSON.stringify({
  newValid: valid.length,
  needsReview: review.length,
  providerCostTotal: Math.round(providerCostTotal * 100) / 100,
  directProfitTotal: Math.round(directProfitTotal * 100) / 100,
  review,
  saved: true,
}));
