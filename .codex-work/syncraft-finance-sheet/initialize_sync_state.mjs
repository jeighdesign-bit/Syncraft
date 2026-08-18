import fs from "node:fs/promises";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const projectRoot = "../..";
const workbookPath = `${projectRoot}/outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/Syncraft_Fal_Reserve_Tracker.xlsx`;
const previewDir = `${projectRoot}/outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f`;
const baselineAt = "2026-08-13T18:01:09+08:00";

dotenv.config({ path: `${projectRoot}/.env.local` });
dotenv.config({ path: `${projectRoot}/.env` });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function fetchAll(table, select, filters = []) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = db.from(table).select(select).range(from, from + pageSize - 1);
    for (const [method, column, value] of filters) query = query[method](column, value);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

const [manual, dodo] = await Promise.all([
  fetchAll("payment_requests", "id,reference_number,status", [["eq", "status", "approved"]]),
  fetchAll("dodo_payments", "id,dodo_payment_id,dodo_checkout_session_id,status", [["eq", "status", "paid"]]),
]);

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

console.log((await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 4500,
  tableMaxRows: 5,
  tableMaxCols: 8,
})).ndjson);

let syncState;
try {
  syncState = workbook.worksheets.getItem("Sync State");
  throw new Error("Sync State already exists; refusing to overwrite the automation ledger.");
} catch (error) {
  if (String(error.message).includes("already exists")) throw error;
  syncState = workbook.worksheets.add("Sync State");
}

syncState.showGridLines = false;
syncState.getRange("A1:E1").merge();
syncState.getRange("A1").values = [["AUTOMATION SYNC STATE — DO NOT EDIT"]];
syncState.getRange("A1:E1").format = {
  fill: "#172B4D",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  verticalAlignment: "center",
};
syncState.getRange("A2:E2").merge();
syncState.getRange("A2").values = [[
  `Baseline created ${baselineAt}. Existing approved payments below are intentionally not added to Payment Tracker. New IDs will be appended automatically.`,
]];
syncState.getRange("A2:E2").format = {
  fill: "#FFF0C2",
  font: { color: "#7A4B00", size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
syncState.getRange("A2:E2").format.rowHeight = 35;
syncState.getRange("A4:E4").values = [["Provider", "Payment ID", "Reference", "Tracking Status", "Recorded At"]];
syncState.getRange("A4:E4").format = {
  fill: "#E9EEF6",
  font: { bold: true, color: "#101828" },
  borders: { bottom: { style: "medium", color: "#172B4D" } },
};

const baselineRows = [
  ...manual.map((payment) => ["GCash", payment.id, payment.reference_number || "", "Baseline — already approved", baselineAt]),
  ...dodo.map((payment) => ["Dodo", payment.id, payment.dodo_payment_id || payment.dodo_checkout_session_id || "", "Baseline — already paid", baselineAt]),
];

if (baselineRows.length) {
  syncState.getRangeByIndexes(4, 0, baselineRows.length, 5).values = baselineRows;
  syncState.getRangeByIndexes(4, 0, baselineRows.length, 5).format = {
    borders: { insideHorizontal: { style: "thin", color: "#EAECF0" } },
    font: { size: 9, color: "#475467" },
  };
}

syncState.getRange("A:A").format.columnWidth = 12;
syncState.getRange("B:B").format.columnWidth = 39;
syncState.getRange("C:C").format.columnWidth = 28;
syncState.getRange("D:D").format.columnWidth = 29;
syncState.getRange("E:E").format.columnWidth = 28;
syncState.freezePanes.freezeRows(4);

const stateInspect = await workbook.inspect({
  kind: "table",
  range: `Sync State!A1:E${Math.min(baselineRows.length + 4, 15)}`,
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 5,
});
console.log("SYNC_STATE_INSPECT");
console.log(stateInspect.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "post-baseline formula error scan",
});
console.log("FORMULA_ERRORS");
console.log(formulaErrors.ndjson);

for (const [sheetName, range, fileName] of [
  ["Dashboard", "A1:H24", "dashboard-automation-preview.png"],
  ["Payment Tracker", "A1:N18", "tracker-automation-preview.png"],
  ["Assumptions", "A1:H23", "assumptions-automation-preview.png"],
  ["Checks", "A1:G12", "checks-automation-preview.png"],
  ["Sources", "A1:F9", "sources-automation-preview.png"],
  ["Sync State", `A1:E${Math.min(baselineRows.length + 4, 18)}`, "sync-state-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.1, format: "png" });
  await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);
console.log(JSON.stringify({ workbookPath, baselineManual: manual.length, baselineDodo: dodo.length }));
