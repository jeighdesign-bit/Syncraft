import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = "C:/Users/This/.gemini/antigravity-ide/scratch/Syncraft";
const trackerPath = `${root}/outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/Syncraft_Fal_Reserve_Tracker.xlsx`;
const workDir = `${root}/.codex-work/payment-sync`;
const mode = process.argv[2] || "inspect";

async function loadWorkbook() {
  const input = await FileBlob.load(trackerPath);
  return SpreadsheetFile.importXlsx(input);
}

async function readEnv() {
  const values = {};
  for (const file of [".env", ".env.local"]) {
    let text = "";
    try { text = await fs.readFile(`${root}/${file}`, "utf8"); } catch { continue; }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  }
  return values;
}

async function fetchSupabaseRows(table, status) {
  const env = await readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase read credentials are unavailable");
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("status", `eq.${status}`);
  endpoint.searchParams.set("order", "created_at.asc");
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`${table} query failed (${response.status})`);
  return response.json();
}

async function fetchAllSupabaseColumns(table, columns) {
  const env = await readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase read credentials are unavailable");
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const endpoint = new URL(`${url}/rest/v1/${table}`);
    endpoint.searchParams.set("select", columns);
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", String(pageSize));
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`${table} paged query failed (${response.status})`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function inspectWorkbook() {
  const workbook = await loadWorkbook();
  const overview = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 12000,
    tableMaxRows: 8,
    tableMaxCols: 14,
    tableMaxCellChars: 100,
  });
  console.log(overview.ndjson);
  await fs.mkdir(`${workDir}/previews`, { recursive: true });
  for (const sheet of workbook.worksheets.items) {
    const used = sheet.getUsedRange();
    const range = used?.address?.split("!").pop();
    console.log(`SHEET ${sheet.name} USED ${range || "unknown"}`);
    const rendered = await workbook.render({
      sheetName: sheet.name,
      ...(range ? { range } : { autoCrop: "all" }),
      scale: 1,
      format: "png",
    });
    const safeName = sheet.name.replace(/[^a-z0-9_-]+/gi, "_");
    await fs.writeFile(path.join(workDir, "previews", `${safeName}.png`), new Uint8Array(await rendered.arrayBuffer()));
  }
}

async function inspectFalSetup() {
  const workbook = await loadWorkbook();
  for (const [label, range] of [
    ["DASHBOARD_DETAIL", "Dashboard!A1:H30"],
    ["ASSUMPTIONS_DETAIL", "Assumptions!A1:H23"],
    ["CHECKS_DETAIL", "Checks!A1:G16"],
  ]) {
    const result = await workbook.inspect({
      kind: "table",
      range,
      include: "values,formulas",
      tableMaxRows: 30,
      tableMaxCols: 8,
      maxChars: 12000,
    });
    console.log(label, result.ndjson);
  }
  for (const [sheetId, range] of [
    ["Dashboard", "A17:H23"],
    ["Assumptions", "A4:G15"],
    ["Checks", "A4:G11"],
  ]) {
    const result = await workbook.inspect({ kind: "computedStyle", sheetId, range, maxChars: 8000 });
    console.log(`STYLE_${sheetId.toUpperCase()}`, result.ndjson);
  }
}

async function inspectExpenseInputs() {
  const workbook = await loadWorkbook();
  for (const [label, range] of [
    ["SERVICE_MODEL", "Service Cost Model!A1:H35"],
    ["FAL_PURCHASES", "Fal Purchases!A1:G22"],
    ["SOURCES", "Sources!A1:F30"],
  ]) {
    const result = await workbook.inspect({
      kind: "table",
      range,
      include: "values,formulas",
      tableMaxRows: 40,
      tableMaxCols: 8,
      maxChars: 16000,
    });
    console.log(label, result.ndjson);
  }
}

async function auditPayments() {
  const workbook = await loadWorkbook();
  const paymentSheet = workbook.worksheets.getItem("Payment Tracker");
  const syncSheet = workbook.worksheets.getItem("Sync State");
  const paymentRows = paymentSheet.getRange("A1:N12");
  const syncTail = syncSheet.getRange("A180:E205");
  console.log("PAYMENT_VALUES", JSON.stringify(paymentRows.values));
  console.log("PAYMENT_FORMULAS", JSON.stringify(paymentRows.formulas));
  console.log("SYNC_TAIL", JSON.stringify(syncTail.values));

  const usedSync = syncSheet.getUsedRange();
  const syncValues = usedSync.values || [];
  const trackedIds = new Set(syncValues.slice(4).map((row) => String(row?.[1] || "").trim()).filter(Boolean));

  const [gcash, dodo] = await Promise.all([
    fetchSupabaseRows("payment_requests", "approved"),
    fetchSupabaseRows("dodo_payments", "paid"),
  ]);
  const all = [
    ...gcash.map((row) => ({ provider: "GCash", ...row })),
    ...dodo.map((row) => ({ provider: "Dodo", ...row })),
  ];
  const untracked = all.filter((row) => !trackedIds.has(String(row.id)));
  console.log("AUDIT_SUMMARY", JSON.stringify({ approvedGcash: gcash.length, paidDodo: dodo.length, trackedIds: trackedIds.size, untracked: untracked.length }));
  console.log("UNTRACKED", JSON.stringify(untracked.map((row) => ({
    provider: row.provider,
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    credited_at: row.credited_at,
    plan: row.plan,
    amount: row.amount,
    credits: row.credits,
    currency: row.currency,
    reference: row.reference_number || row.dodo_payment_id || row.dodo_checkout_session_id || "",
  }))));
}

const planMap = {
  tingi: { label: "Tingi", phpAmount: 6000, credits: 24 },
  basic: { label: "Basic", phpAmount: 14900, credits: 60 },
  starter: { label: "Starter", phpAmount: 29900, credits: 168 },
  pro: { label: "Pro", phpAmount: 49900, credits: 288 },
  elite: { label: "Elite", phpAmount: 89900, credits: 528 },
};

function classifyPayment(row) {
  const plan = planMap[String(row.plan || "").toLowerCase()];
  if (!plan) return { valid: false, issue: `Unknown plan: ${row.plan || "blank"}` };
  if (!Number.isInteger(Number(row.credits)) || Number(row.credits) !== plan.credits) {
    return { valid: false, issue: `Credits ${row.credits} do not match ${plan.label} (${plan.credits})` };
  }
  if (row.provider !== "GCash") {
    return { valid: false, issue: `Cannot safely convert ${row.currency || "unknown"} Dodo amount to PHP` };
  }
  const amount = Number(row.amount);
  if (!Number.isInteger(amount) || amount <= 0) return { valid: false, issue: "Missing or invalid payment amount" };
  const grossPhp = amount / 100;
  return {
    valid: true,
    plan,
    grossPhp,
    adjustment: grossPhp - plan.phpAmount / 100,
  };
}

async function syncPayments() {
  const workbook = await loadWorkbook();
  const paymentSheet = workbook.worksheets.getItem("Payment Tracker");
  const syncSheet = workbook.worksheets.getItem("Sync State");
  const assumptionsSheet = workbook.worksheets.getItem("Assumptions");
  const sourcesSheet = workbook.worksheets.getItem("Sources");
  const syncValues = syncSheet.getUsedRange().values || [];
  const trackedIds = new Set(syncValues.slice(4).map((row) => String(row?.[1] || "").trim()).filter(Boolean));
  const [gcash, dodo, profiles] = await Promise.all([
    fetchSupabaseRows("payment_requests", "approved"),
    fetchSupabaseRows("dodo_payments", "paid"),
    fetchAllSupabaseColumns("profiles", "credits"),
  ]);
  const activeProfiles = profiles.filter((profile) => Number(profile.credits) > 0);
  const activeCredits = activeProfiles.reduce((sum, profile) => sum + Number(profile.credits || 0), 0);
  const previousActiveCredits = Number(assumptionsSheet.getRange("B12").values?.[0]?.[0] || 0);
  const untracked = [
    ...gcash.map((row) => ({ provider: "GCash", ...row })),
    ...dodo.map((row) => ({ provider: "Dodo", ...row })),
  ].filter((row) => !trackedIds.has(String(row.id)));

  const paymentValues = paymentSheet.getRange("A1:N504").values || [];
  let paymentRow = paymentValues.findIndex((row, index) => index >= 4 && !row?.[3]) + 1;
  if (paymentRow < 5) throw new Error("No available Payment Tracker row");
  let syncRow = syncValues.length + 1;
  const syncTimestamp = new Date();
  const added = [];
  const needsReview = [];

  for (const row of untracked) {
    const classification = classifyPayment(row);
    const reference = String(row.reference_number || row.dodo_payment_id || row.dodo_checkout_session_id || "");
    if (!classification.valid) {
      const sourceStyle = syncSheet.getRange(`A${Math.max(5, syncRow - 1)}:E${Math.max(5, syncRow - 1)}`);
      const destination = syncSheet.getRange(`A${syncRow}:E${syncRow}`);
      const safeSyncReference = /^\d+$/.test(reference) ? `\u200B${reference}` : reference;
      destination.copyFrom(sourceStyle, "all");
      destination.values = [[row.provider, String(row.id), safeSyncReference, `Needs Review — ${classification.issue}`, syncTimestamp]];
      syncSheet.getRange(`E${syncRow}`).setNumberFormat("yyyy-mm-dd hh:mm:ss");
      needsReview.push({ id: String(row.id), issue: classification.issue });
      syncRow += 1;
      continue;
    }

    const sourceDate = new Date(row.credited_at || row.updated_at || row.created_at || syncTimestamp);
    const safeReference = /^\d+$/.test(reference) ? `\u200B${reference}` : reference;
    paymentSheet.getRange(`A${paymentRow}:D${paymentRow}`).values = [[
      sourceDate,
      safeReference,
      row.provider,
      classification.plan.label,
    ]];
    paymentSheet.getRange(`F${paymentRow}`).values = [[classification.adjustment]];
    paymentSheet.getRange(`M${paymentRow}:N${paymentRow}`).values = [[
      "No",
      `Auto-synced ${syncTimestamp.toISOString()} | payment id ${row.id}`,
    ]];

    const sourceStyle = syncSheet.getRange(`A${Math.max(5, syncRow - 1)}:E${Math.max(5, syncRow - 1)}`);
    const destination = syncSheet.getRange(`A${syncRow}:E${syncRow}`);
    destination.copyFrom(sourceStyle, "all");
    destination.values = [[row.provider, String(row.id), safeReference, "Tracked", syncTimestamp]];
    syncSheet.getRange(`E${syncRow}`).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    added.push({ id: String(row.id), row: paymentRow, plan: classification.plan.label, grossPhp: classification.grossPhp });
    paymentRow += 1;
    syncRow += 1;
  }

  assumptionsSheet.getRange("B12").values = [[activeCredits]];
  assumptionsSheet.getRange("C12").values = [[`Read-only live profiles refresh: ${activeProfiles.length} profiles with positive balances; ${profiles.length} profiles checked`]];
  sourcesSheet.getRange("B10").values = [[activeCredits]];
  sourcesSheet.getRange("D10").values = [[syncTimestamp]];
  sourcesSheet.getRange("F10").values = [[`${activeProfiles.length} profiles with positive balances; ${profiles.length} profiles checked`]];
  if (untracked.length > 0 || activeCredits !== previousActiveCredits) assumptionsSheet.getRange("B6").values = [[syncTimestamp]];

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
  });
  const dashboard = await workbook.inspect({
    kind: "table",
    range: "Dashboard!A1:H29",
    include: "values,formulas",
    tableMaxRows: 29,
    tableMaxCols: 8,
    maxChars: 12000,
  });
  const checks = await workbook.inspect({
    kind: "table",
    range: "Checks!A1:G16",
    include: "values,formulas",
    tableMaxRows: 16,
    tableMaxCols: 7,
    maxChars: 6000,
  });
  console.log("FORMULA_ERRORS", errors.ndjson);
  console.log("DASHBOARD", dashboard.ndjson);
  console.log("CHECKS", checks.ndjson);
  const falSummary = await workbook.inspect({
    kind: "table",
    range: "Fal Purchases!A1:G12",
    include: "values,formulas",
    tableMaxRows: 12,
    tableMaxCols: 7,
    maxChars: 6000,
  });
  console.log("FAL_SUMMARY", falSummary.ndjson);

  if (untracked.length > 0 || activeCredits !== previousActiveCredits) {
    const output = await SpreadsheetFile.exportXlsx(workbook);
    await output.save(trackerPath);
  }

  await fs.mkdir(`${workDir}/post-sync`, { recursive: true });
  for (const [sheetName, range, fileName] of [
    ["Dashboard", "A1:H29", "Dashboard.png"],
    ["Payment Tracker", "A1:N20", "Payment_Tracker.png"],
    ["Sync State", `A${Math.max(180, syncRow - 12)}:E${syncRow + 2}`, "Sync_State.png"],
    ["Fal Purchases", "A1:G20", "Fal_Purchases.png"],
    ["Owner Recovery", "A1:D22", "Owner_Recovery.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.5, format: "png" });
    await fs.writeFile(`${workDir}/post-sync/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }

  const falValues = workbook.worksheets.getItem("Fal Purchases").getRange("A1:G12").values;
  const recoveryValues = workbook.worksheets.getItem("Owner Recovery").getRange("A1:D16").values;
  console.log("SYNC_RESULT", JSON.stringify({
    added,
    needsReview,
    recordedSales: assumptionsSheet.getRange("E9").values?.[0]?.[0],
    providerCost: assumptionsSheet.getRange("E10").values?.[0]?.[0],
    directProfit: assumptionsSheet.getRange("E11").values?.[0]?.[0],
    falTopupsPhp: falValues?.[4]?.[6],
    cashAfterFalTopups: falValues?.[6]?.[6],
    activeCreditFundingGap: falValues?.[7]?.[4],
    currentSyncraftCash: recoveryValues?.[4]?.[1],
    providerReserveStillNeeded: recoveryValues?.[5]?.[1],
    cashFreeToWithdraw: recoveryValues?.[7]?.[1],
    investmentStillToRecover: recoveryValues?.[13]?.[1],
    realProfitAvailable: recoveryValues?.[14]?.[1],
    activeCredits,
    activeProfiles: activeProfiles.length,
    modelStatus: workbook.worksheets.getItem("Checks").getRange("B11").values?.[0]?.[0],
  }));
}

async function repairSyncRow(paymentId) {
  const workbook = await loadWorkbook();
  const syncSheet = workbook.worksheets.getItem("Sync State");
  const values = syncSheet.getUsedRange().values || [];
  const rowIndex = values.findIndex((row) => String(row?.[1] || "") === paymentId);
  if (rowIndex < 0) throw new Error(`Sync row not found for ${paymentId}`);
  const rowNumber = rowIndex + 1;
  const reference = String(values[rowIndex]?.[2] || "").replace(/^\u200B/, "");
  if (reference.startsWith("0")) syncSheet.getRange(`C${rowNumber}`).values = [[`\u200B${reference}`]];
  syncSheet.getRange(`E${rowNumber}`).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  const rendered = await workbook.render({
    sheetName: "Sync State",
    range: `A${Math.max(180, rowNumber - 10)}:E${rowNumber + 2}`,
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(`${workDir}/post-sync/Sync_State.png`, new Uint8Array(await rendered.arrayBuffer()));
  console.log("REPAIRED_SYNC_ROW", JSON.stringify({ paymentId, rowNumber }));
}

async function repairNumericPaymentReferences() {
  const workbook = await loadWorkbook();
  const paymentSheet = workbook.worksheets.getItem("Payment Tracker");
  const syncSheet = workbook.worksheets.getItem("Sync State");
  let repairedPaymentRefs = 0;
  let repairedSyncRefs = 0;

  const paymentValues = paymentSheet.getRange("A5:N504").values || [];
  for (let index = 0; index < paymentValues.length; index += 1) {
    const raw = String(paymentValues[index]?.[1] ?? "");
    if (/^\d+$/.test(raw)) {
      paymentSheet.getRange(`B${index + 5}`).values = [[`\u200B${raw}`]];
      repairedPaymentRefs += 1;
    }
  }
  paymentSheet.getRange("B5:B504").setNumberFormat("@");

  const syncValues = syncSheet.getUsedRange().values || [];
  for (let index = 4; index < syncValues.length; index += 1) {
    const raw = String(syncValues[index]?.[2] ?? "");
    if (/^\d+$/.test(raw)) {
      syncSheet.getRange(`C${index + 1}`).values = [[`\u200B${raw}`]];
      repairedSyncRefs += 1;
    }
  }
  syncSheet.getRange(`C5:C${Math.max(5, syncValues.length)}`).setNumberFormat("@");

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 300 },
    summary: "Payment reference repair formula scan",
  });
  const paymentCheck = await workbook.inspect({
    kind: "table",
    range: "Payment Tracker!A4:N15",
    include: "values,formulas",
    tableMaxRows: 15,
    tableMaxCols: 14,
    maxChars: 12000,
  });
  const checks = await workbook.inspect({
    kind: "table",
    range: "Checks!A4:G16",
    include: "values,formulas",
    tableMaxRows: 16,
    tableMaxCols: 7,
    maxChars: 7000,
  });
  console.log("REFERENCE_REPAIR_ERRORS", errors.ndjson);
  console.log("REFERENCE_REPAIR_PAYMENTS", paymentCheck.ndjson);
  console.log("REFERENCE_REPAIR_CHECKS", checks.ndjson);

  const previewDir = `${workDir}/post-sync`;
  await fs.mkdir(previewDir, { recursive: true });
  const rendered = await workbook.render({ sheetName: "Payment Tracker", range: "A1:N20", scale: 1.5, format: "png" });
  await fs.writeFile(`${previewDir}/Payment_Tracker.png`, new Uint8Array(await rendered.arrayBuffer()));
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("REFERENCE_REPAIR_RESULT", JSON.stringify({ repairedPaymentRefs, repairedSyncRefs }));
}

async function setupFalTracker() {
  const workbook = await loadWorkbook();
  if (workbook.worksheets.items.some((sheet) => sheet.name === "Fal Purchases")) {
    throw new Error("Fal Purchases already exists; refusing to overwrite existing entries");
  }

  const dashboard = workbook.worksheets.getItem("Dashboard");
  const assumptions = workbook.worksheets.getItem("Assumptions");
  const checks = workbook.worksheets.getItem("Checks");
  const openingWallet = Number(assumptions.getRange("B13").values?.[0]?.[0] || 0);
  const fal = workbook.worksheets.add("Fal Purchases");

  const navy = "#172B4D";
  const navy2 = "#29456F";
  const paleHeader = "#E9EEF6";
  const inputFill = "#FFFBEA";
  const inputBorder = "#E5C07B";
  const blue = "#0000FF";
  const green = "#008000";
  const dark = "#101828";
  const successFill = "#EAF8DE";
  const successText = "#397A1F";
  const dangerFill = "#FDECEC";
  const dangerText = "#B42318";
  const phpFormat = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
  const usdFormat = '"$"#,##0.00;[Red]("$"#,##0.00);-';

  fal.showGridLines = false;
  fal.getRange("A1:G1").merge();
  fal.getRange("A1").values = [["Fal Purchase Tracker"]];
  fal.getRange("A1:G1").format = {
    fill: navy,
    font: { bold: true, color: "#FFFFFF", fontSize: 16 },
    verticalAlignment: "center",
  };
  fal.getRange("A1:G1").format.rowHeight = 30;

  fal.getRange("A2:G2").merge();
  fal.getRange("A2").values = [["Every time you buy Fal credits, enter the actual USD credits received and the actual pesos charged. The summaries update automatically."]];
  fal.getRange("A2:G2").format = {
    fill: navy2,
    font: { color: "#FFFFFF", fontSize: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  fal.getRange("A2:G2").format.rowHeight = 34;

  fal.getRange("A4:B4").merge();
  fal.getRange("A4").values = [["TRACKING SETTINGS"]];
  fal.getRange("D4:G4").merge();
  fal.getRange("D4").values = [["FAL CASH SUMMARY"]];
  for (const range of ["A4:B4", "D4:G4"]) {
    fal.getRange(range).format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  }

  fal.getRange("A5:B8").values = [
    ["Tracking start", new Date("2026-08-14T00:00:00+08:00")],
    ["Opening Fal wallet (USD)", openingWallet],
    ["Current Fal wallet (USD)", null],
    ["Usual top-up (USD)", 20],
  ];
  fal.getRange("B7").formulas = [["='Assumptions'!B13"]];
  fal.getRange("A9:B9").merge();
  fal.getRange("A9").values = [["Opening wallet is the starting balance only. Log only new top-ups made after this tracker was added."]];
  fal.getRange("A9:B9").format = { fill: "#F3F4F6", font: { color: "#475467", italic: true, fontSize: 9 }, wrapText: true };
  fal.getRange("A9:B9").format.rowHeight = 34;
  fal.getRange("A5:A8").format.font = { bold: true, color: dark };
  fal.getRange("B5:B6").format = { fill: inputFill, font: { color: blue }, borders: { preset: "outside", style: "thin", color: inputBorder } };
  fal.getRange("B8").format = { fill: inputFill, font: { color: blue }, borders: { preset: "outside", style: "thin", color: inputBorder } };
  fal.getRange("B7").format.font = { color: green };
  fal.getRange("B5").setNumberFormat("yyyy-mm-dd");
  fal.getRange("B6:B8").setNumberFormat(usdFormat);

  fal.getRange("D5:G8").values = [
    ["Fal credits bought", null, "Actual PHP paid", null],
    ["Estimated Fal used", null, "Average PHP / USD", null],
    ["Next top-up reserve", null, "Cash after Fal top-ups", null],
    ["Active-credit funding gap", null, "Unallocated tracked cash", null],
  ];
  fal.getRange("E5:E8").formulas = [
    ["=SUM(B13:B212)"],
    ["=MAX(0,B6+E5-B7)"],
    ["=B8*'Assumptions'!B7"],
    ["='Assumptions'!E7"],
  ];
  fal.getRange("G5:G8").formulas = [
    ["=SUM(D13:D212)"],
    ["=IF(E5=0,'Assumptions'!B7,G5/E5)"],
    ["='Assumptions'!E9-G5"],
    ["=MAX(0,G7-E8)"],
  ];
  fal.getRange("D5:D8").format.font = { bold: true, color: dark };
  fal.getRange("F5:F8").format.font = { bold: true, color: dark };
  fal.getRange("E5:E8").format = { fill: successFill, font: { bold: true, color: green } };
  fal.getRange("G5:G8").format = { fill: successFill, font: { bold: true, color: green } };
  fal.getRange("E5:E6").setNumberFormat(usdFormat);
  fal.getRange("E7:E8").setNumberFormat(phpFormat);
  fal.getRange("G5").setNumberFormat(phpFormat);
  fal.getRange("G6").setNumberFormat("₱0.00");
  fal.getRange("G7:G8").setNumberFormat(phpFormat);

  fal.getRange("A11:G11").merge();
  fal.getRange("A11").values = [["TOP-UP HISTORY — YOU ONLY FILL THE BLUE/YELLOW CELLS"]];
  fal.getRange("A11:G11").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  fal.getRange("A12:G12").values = [["Date", "Fal Credits Bought (USD)", "PHP / USD", "Actual PHP Paid", "Payment Method", "Reference", "Notes"]];
  fal.getRange("A12:G12").format = {
    fill: paleHeader,
    font: { bold: true, color: dark },
    borders: { bottom: { style: "medium", color: navy } },
    wrapText: true,
    verticalAlignment: "center",
  };
  fal.getRange("A12:G12").format.rowHeight = 34;
  const table = fal.tables.add("A12:G212", true, "FalPurchaseLog");
  table.style = "TableStyleMedium2";
  fal.getRange("C13").formulas = [["=IF(OR(B13=\"\",D13=\"\"),\"\",D13/B13)"]];
  fal.getRange("C13:C212").fillDown();
  fal.getRange("A13:B212").format = { fill: inputFill, font: { color: blue } };
  fal.getRange("D13:G212").format = { fill: inputFill, font: { color: blue } };
  fal.getRange("C13:C212").format.font = { color: "#000000" };
  fal.getRange("A13:A212").setNumberFormat("yyyy-mm-dd");
  fal.getRange("B13:B212").setNumberFormat(usdFormat);
  fal.getRange("C13:C212").setNumberFormat("₱0.00");
  fal.getRange("D13:D212").setNumberFormat(phpFormat);
  fal.getRange("E13:E212").dataValidation = { rule: { type: "list", values: ["Card", "GCash", "PayPal", "Other"] } };
  fal.getRange("B13:B212").dataValidation = { rule: { type: "decimal", operator: "between", formula1: 0, formula2: 1000000 } };
  fal.getRange("D13:D212").dataValidation = { rule: { type: "decimal", operator: "between", formula1: 0, formula2: 100000000 } };
  fal.freezePanes.freezeRows(12);
  fal.getRange("A1:G212").format.font.typeface = "Aptos";
  fal.getRange("A:A").format.columnWidth = 13;
  fal.getRange("B:B").format.columnWidth = 22;
  fal.getRange("C:C").format.columnWidth = 13;
  fal.getRange("D:D").format.columnWidth = 19;
  fal.getRange("E:E").format.columnWidth = 17;
  fal.getRange("F:F").format.columnWidth = 20;
  fal.getRange("G:G").format.columnWidth = 38;

  dashboard.getRange("A25:H25").merge();
  dashboard.getRange("A25").values = [["FAL CASH CONTROL"]];
  dashboard.getRange("A25:H25").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  dashboard.getRange("A26:H27").values = [
    ["Fal top-ups logged", null, null, "Current Fal wallet", null, null, "Next top-up reserve", null],
    ["Cash after Fal top-ups", null, null, "Active-credit funding gap", null, null, "Unallocated tracked cash", null],
  ];
  dashboard.getRange("B26").formulas = [["='Fal Purchases'!G5"]];
  dashboard.getRange("E26").formulas = [["='Fal Purchases'!B7"]];
  dashboard.getRange("H26").formulas = [["='Fal Purchases'!E7"]];
  dashboard.getRange("B27").formulas = [["='Fal Purchases'!G7"]];
  dashboard.getRange("E27").formulas = [["='Fal Purchases'!E8"]];
  dashboard.getRange("H27").formulas = [["='Fal Purchases'!G8"]];
  dashboard.getRange("A26:H27").format.wrapText = true;
  dashboard.getRange("A26:A27").format.font = { bold: true, color: dark };
  dashboard.getRange("D26:D27").format.font = { bold: true, color: dark };
  dashboard.getRange("G26:G27").format.font = { bold: true, color: dark };
  for (const range of ["B26:B27", "E26:E27", "H26:H27"]) {
    dashboard.getRange(range).format = { fill: successFill, font: { bold: true, color: successText } };
  }
  dashboard.getRange("B26:B27").setNumberFormat(phpFormat);
  dashboard.getRange("E26").setNumberFormat(usdFormat);
  dashboard.getRange("E27").setNumberFormat(phpFormat);
  dashboard.getRange("H26:H27").setNumberFormat(phpFormat);
  dashboard.getRange("A29:H29").merge();
  dashboard.getRange("A29").values = [["How to update: log each new purchase in Fal Purchases, then update Current Fal wallet in Assumptions B13."]];
  dashboard.getRange("A29:H29").format = { fill: "#F3F4F6", font: { italic: true, color: "#475467", fontSize: 9 }, wrapText: true };
  dashboard.getRange("A29:H29").format.rowHeight = 28;

  assumptions.getRange("C13").values = [["Update after each Fal top-up or wallet check; linked to Fal Purchases"]];

  for (const row of [12, 13]) checks.getRange(`A9:G9`).copyTo(checks.getRange(`A${row}:G${row}`), "all");
  checks.getRange("A12:G13").values = [
    ["Fal purchase amounts are non-negative", null, 0, null, 0, null, "Fal Purchases B:D"],
    ["Current Fal wallet is non-negative", null, 0, null, 0, null, "Fal Purchases B7"],
  ];
  checks.getRange("B12").formulas = [["=MIN('Fal Purchases'!B13:B212,'Fal Purchases'!D13:D212)"]];
  checks.getRange("D12").formulas = [["=B12-C12"]];
  checks.getRange("F12").formulas = [["=IF(B12>=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("B13").formulas = [["='Fal Purchases'!B7"]];
  checks.getRange("D13").formulas = [["=B13-C13"]];
  checks.getRange("F13").formulas = [["=IF(B13>=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("B11").formulas = [["=IF(COUNTIF(F5:F13,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("F12:F13").conditionalFormats.add("containsText", { text: "PASS", format: { fill: successFill, font: { color: successText } } });
  checks.getRange("F12:F13").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: dangerFill, font: { color: dangerText, bold: true } } });
  checks.getRange("B11").conditionalFormats.add("containsText", { text: "PASS", format: { fill: successFill, font: { color: successText, bold: true } } });
  checks.getRange("B11").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: dangerFill, font: { color: dangerText, bold: true } } });

  const formulaErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Fal tracker formula error scan",
  });
  const falCheck = await workbook.inspect({ kind: "table", range: "Fal Purchases!A1:G18", include: "values,formulas", tableMaxRows: 18, tableMaxCols: 7, maxChars: 12000 });
  const dashboardCheck = await workbook.inspect({ kind: "table", range: "Dashboard!A25:H29", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 8, maxChars: 6000 });
  const checksCheck = await workbook.inspect({ kind: "table", range: "Checks!A4:G13", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 7, maxChars: 8000 });
  console.log("FAL_FORMULA_ERRORS", formulaErrors.ndjson);
  console.log("FAL_TRACKER_CHECK", falCheck.ndjson);
  console.log("FAL_DASHBOARD_CHECK", dashboardCheck.ndjson);
  console.log("FAL_CHECKS_CHECK", checksCheck.ndjson);

  const previewDir = `${workDir}/fal-setup-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  for (const sheet of workbook.worksheets.items) {
    const used = sheet.getUsedRange();
    const range = used?.address?.split("!").pop();
    const rendered = await workbook.render({ sheetName: sheet.name, ...(range ? { range } : { autoCrop: "all" }), scale: 1, format: "png" });
    await fs.writeFile(path.join(previewDir, `${sheet.name.replace(/[^a-z0-9_-]+/gi, "_")}.png`), new Uint8Array(await rendered.arrayBuffer()));
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("FAL_SETUP_RESULT", JSON.stringify({ openingWallet, currentWallet: fal.getRange("B7").values?.[0]?.[0], totalTopupsPhp: fal.getRange("G5").values?.[0]?.[0], cashAfterTopups: fal.getRange("G7").values?.[0]?.[0], fundingGap: fal.getRange("E8").values?.[0]?.[0], unallocatedCash: fal.getRange("G8").values?.[0]?.[0], modelStatus: checks.getRange("B11").values?.[0]?.[0] }));
}

async function repairFalTrackerLayout() {
  const workbook = await loadWorkbook();
  const fal = workbook.worksheets.getItem("Fal Purchases");
  const dashboard = workbook.worksheets.getItem("Dashboard");
  fal.getRange("A:A").format.columnWidth = 27;
  fal.getRange("B:B").format.columnWidth = 19;
  fal.getRange("A9").values = [["Starting wallet only. Enter top-ups made after this tracker was added."]];
  fal.getRange("A9:B9").format.rowHeight = 34;
  fal.getRange("C13:C212").format.fill = "#F3F4F6";
  dashboard.getRange("G26").values = [["Next $20 reserve"]];
  dashboard.getRange("G27").values = [["Cash after full coverage"]];
  dashboard.getRange("A26:H27").format.rowHeight = 30;

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "post-repair formula error scan",
  });
  console.log("POST_REPAIR_ERRORS", errors.ndjson);
  for (const [sheetName, range, fileName] of [
    ["Fal Purchases", "A1:G35", "Fal_Purchases.png"],
    ["Dashboard", "A1:H29", "Dashboard.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
    await fs.writeFile(`${workDir}/fal-setup-preview/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
}

async function setupAllExpenses() {
  const workbook = await loadWorkbook();
  if (workbook.worksheets.items.some((sheet) => sheet.name === "All Expenses")) {
    throw new Error("All Expenses already exists; refusing to overwrite it");
  }

  const navy = "#172B4D";
  const navy2 = "#29456F";
  const paleHeader = "#E9EEF6";
  const inputFill = "#FFFBEA";
  const inputBorder = "#E5C07B";
  const blue = "#0000FF";
  const green = "#008000";
  const dark = "#101828";
  const successFill = "#EAF8DE";
  const successText = "#397A1F";
  const estimateFill = "#FFF4E5";
  const estimateText = "#9A6700";
  const dangerFill = "#FDECEC";
  const dangerText = "#B42318";
  const phpFormat = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
  const usdFormat = '"$"#,##0.00;[Red]("$"#,##0.00);-';

  const assumptions = workbook.worksheets.getItem("Assumptions");
  const dashboard = workbook.worksheets.getItem("Dashboard");
  const fal = workbook.worksheets.getItem("Fal Purchases");
  const checks = workbook.worksheets.getItem("Checks");
  const sources = workbook.worksheets.getItem("Sources");
  const expenses = workbook.worksheets.add("All Expenses");

  // Exact signed-in account balances as of this audit.
  assumptions.getRange("B13").values = [[19.15]];
  assumptions.getRange("C13").values = [["Fal balance checked from the signed-in Fal dashboard on 2026-08-14"]];

  // Backfill the complete Fal receipt history shown in the account.
  fal.getRange("A2").values = [["Fal receipt amounts in USD are exact. Peso amounts below are estimates using the workbook USD/PHP rate; replace them only if you have the exact bank charge."]];
  fal.getRange("B5").values = [[new Date("2026-07-28T00:00:00+08:00")]];
  fal.getRange("B6").values = [[0]];
  fal.getRange("A9").values = [["All Fal receipts currently visible in the account are already listed below."]];
  fal.getRange("F5").values = [["PHP spent estimate"]];
  fal.getRange("A12:G12").values = [["Date", "Fal Credits Bought (USD)", "PHP / USD", "PHP Paid / Estimate", "Payment Method", "Reference", "Notes"]];
  const falRows = [
    [new Date("2026-08-14T09:14:37+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-08-13T01:19:03+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-08-11T06:36:00+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-08-09T00:18:14+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-08-06T05:07:49+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-08-05T06:28:14+08:00"), 10, null, 620, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-08-02T00:28:46+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-07-30T07:42:11+08:00"), 20, null, 1240, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-07-29T03:28:09+08:00"), 10, null, 620, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
    [new Date("2026-07-28T06:09:53+08:00"), 10, null, 620, "Card", "Fal receipt history", "Confirmed USD; PHP estimated at ₱62/USD"],
  ];
  fal.getRange("A13:G22").values = falRows;
  fal.getRange("C13").formulas = [["=IF(OR(B13=\"\",D13=\"\"),\"\",D13/B13)"]];
  fal.getRange("C13:C212").fillDown();
  fal.getRange("A13:A22").setNumberFormat("yyyy-mm-dd hh:mm");

  // Simplify the Fal summary to the few figures the owner needs.
  fal.getRange("D5:G8").values = [
    ["Fal credits bought", null, "PHP spent estimate", null],
    ["Fal credits used", null, "Current Fal wallet", null],
    ["Current wallet in PHP", null, "Active-credit Fal cost", null],
    ["Extra Fal cash needed", null, "PHP / USD rate", null],
  ];
  fal.getRange("E5:E8").formulas = [
    ["=SUM(B13:B212)"],
    ["=MAX(0,B6+E5-B7)"],
    ["=B7*'Assumptions'!B7"],
    ["=MAX(0,G7-E7)"],
  ];
  fal.getRange("G5:G8").formulas = [
    ["=SUM(D13:D212)"],
    ["=B7"],
    ["='All Expenses'!D6"],
    ["='Assumptions'!B7"],
  ];
  fal.getRange("E5:E6").setNumberFormat(usdFormat);
  fal.getRange("E7:E8").setNumberFormat(phpFormat);
  fal.getRange("G5").setNumberFormat(phpFormat);
  fal.getRange("G6").setNumberFormat(usdFormat);
  fal.getRange("G7").setNumberFormat(phpFormat);
  fal.getRange("G8").setNumberFormat("₱0.00");

  expenses.showGridLines = false;
  expenses.getRange("A1:F1").merge();
  expenses.getRange("A1").values = [["Syncraft — All Expenses"]];
  expenses.getRange("A1:F1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", fontSize: 16 }, verticalAlignment: "center" };
  expenses.getRange("A1:F1").format.rowHeight = 30;
  expenses.getRange("A2:F2").merge();
  expenses.getRange("A2").values = [["Simple view of provider credits and tech subscriptions already paid. Active-credit Fal cost uses the recent real service mix and Fal models only."]];
  expenses.getRange("A2:F2").format = { fill: navy2, font: { color: "#FFFFFF", fontSize: 10 }, wrapText: true, verticalAlignment: "center" };
  expenses.getRange("A2:F2").format.rowHeight = 34;

  expenses.getRange("A4:F4").merge();
  expenses.getRange("A4").values = [["SIMPLE TOTALS"]];
  expenses.getRange("A4:F4").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  expenses.getRange("A5:F8").values = [
    ["Confirmed expenses paid", null, "Including 1 Supabase estimate", null, "Current Syncraft cash", null],
    ["Active user credits", null, "Fal cost of active credits", null, "Cash after future Fal funding", null],
    ["Current Fal wallet", null, "Extra Fal cash needed", null, null, null],
    ["Fal credits already used", null, "Current OpenRouter wallet", 0.28, null, null],
  ];
  expenses.getRange("B5:B8").formulas = [
    ["=SUMIF(F13:F40,\"Confirmed\",E13:E40)"],
    ["='Assumptions'!B12"],
    ["='Assumptions'!B13*'Assumptions'!B7"],
    ["='Fal Purchases'!E6"],
  ];
  expenses.getRange("D5:D7").formulas = [
    ["=SUM(E13:E40)"],
    ["=(('Service Cost Model'!B24-('Service Cost Model'!E6*SUMPRODUCT('Service Cost Model'!C15:C19,'Service Cost Model'!H15:H19)))*'Service Cost Model'!B6/'Service Cost Model'!B23)*B6"],
    ["=MAX(0,D6-B7)"],
  ];
  expenses.getRange("F6").formulas = [["=IF(F5=\"\",\"\",F5-D7)"]];
  expenses.getRange("E7:F8").merge();
  expenses.getRange("E7").values = [["Enter only the Syncraft money you still have now. Past expenses are already paid, so the cash result subtracts only the additional Fal funding still needed."]];
  expenses.getRange("E7:F8").format = { fill: "#F3F4F6", font: { color: "#475467", italic: true, fontSize: 9 }, wrapText: true, verticalAlignment: "center" };
  expenses.getRange("A5:A8").format.font = { bold: true, color: dark };
  expenses.getRange("C5:C8").format.font = { bold: true, color: dark };
  expenses.getRange("E5:E6").format.font = { bold: true, color: dark };
  for (const range of ["B5:B8", "D5:D8", "F6"]) expenses.getRange(range).format = { fill: successFill, font: { bold: true, color: successText } };
  expenses.getRange("F5").format = { fill: inputFill, font: { color: blue, bold: true }, borders: { preset: "outside", style: "thin", color: inputBorder } };
  expenses.getRange("B5").setNumberFormat(phpFormat);
  expenses.getRange("B6").setNumberFormat("#,##0");
  expenses.getRange("B7").setNumberFormat(phpFormat);
  expenses.getRange("B8").setNumberFormat(usdFormat);
  expenses.getRange("D5:D7").setNumberFormat(phpFormat);
  expenses.getRange("D8").setNumberFormat(usdFormat);
  expenses.getRange("F5:F6").setNumberFormat(phpFormat);

  expenses.getRange("A10:F10").merge();
  expenses.getRange("A10").values = [["EXPENSES PAID / ESTIMATED"]];
  expenses.getRange("A10:F10").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  expenses.getRange("A12:F12").values = [["Date / Period", "Service", "Type", "USD", "PHP Amount", "Status / Note"]];
  expenses.getRange("A12:F12").format = { fill: paleHeader, font: { bold: true, color: dark }, borders: { bottom: { style: "medium", color: navy } }, wrapText: true, verticalAlignment: "center" };
  expenses.getRange("A12:F12").format.rowHeight = 30;
  expenses.tables.add("A12:F40", true, "ExpenseLog").style = "TableStyleMedium2";
  expenses.getRange("A13:F17").values = [
    ["2026-07-28 to 2026-08-14", "Fal", "Provider credits", 170, null, "Confirmed"],
    ["2026-06-25 to 2026-07-11", "OpenRouter", "AI credits", 190, null, "Confirmed"],
    ["2026-07-26", "Vercel Pro", "Hosting", 20, null, "Confirmed"],
    ["2026-07-31", "ChatGPT Plus / Codex", "Development tool", null, 1100, "Confirmed"],
    ["Month to confirm", "Supabase Pro", "Database", 25, null, "Estimate — confirm actual charge/months"],
  ];
  expenses.getRange("E13:E15").formulas = [["=D13*'Assumptions'!B7"], ["=D14*'Assumptions'!B7"], ["=D15*'Assumptions'!B7"]];
  expenses.getRange("E17").formulas = [["=D17*'Assumptions'!B7"]];
  expenses.getRange("D13:D40").setNumberFormat(usdFormat);
  expenses.getRange("E13:E40").setNumberFormat(phpFormat);
  expenses.getRange("A13:F40").format.wrapText = true;
  expenses.getRange("D18:E40").format = { fill: inputFill, font: { color: blue } };
  expenses.getRange("A18:C40").format = { fill: inputFill, font: { color: blue } };
  expenses.getRange("F18:F40").format = { fill: inputFill, font: { color: blue } };
  expenses.getRange("F13:F16").format = { fill: successFill, font: { color: successText, bold: true } };
  expenses.getRange("F17").format = { fill: estimateFill, font: { color: estimateText, bold: true } };
  expenses.freezePanes.freezeRows(12);
  expenses.getRange("A1:F40").format.font.typeface = "Aptos";
  expenses.getRange("A:A").format.columnWidth = 25;
  expenses.getRange("B:B").format.columnWidth = 24;
  expenses.getRange("C:C").format.columnWidth = 20;
  expenses.getRange("D:D").format.columnWidth = 14;
  expenses.getRange("E:E").format.columnWidth = 18;
  expenses.getRange("F:F").format.columnWidth = 36;

  // Keep the existing dashboard compact while linking it to the new simple figures.
  dashboard.getRange("A26:H27").values = [
    ["Fal spent estimate", null, null, "Current Fal wallet", null, null, "Active-credit Fal cost", null],
    ["Fal credits used", null, null, "Extra Fal cash needed", null, null, "Confirmed expenses", null],
  ];
  dashboard.getRange("B26").formulas = [["='Fal Purchases'!G5"]];
  dashboard.getRange("E26").formulas = [["='Fal Purchases'!G6"]];
  dashboard.getRange("H26").formulas = [["='All Expenses'!D6"]];
  dashboard.getRange("B27").formulas = [["='Fal Purchases'!E6"]];
  dashboard.getRange("E27").formulas = [["='All Expenses'!D7"]];
  dashboard.getRange("H27").formulas = [["='All Expenses'!B5"]];
  dashboard.getRange("B26").setNumberFormat(phpFormat);
  dashboard.getRange("E26").setNumberFormat(usdFormat);
  dashboard.getRange("H26").setNumberFormat(phpFormat);
  dashboard.getRange("B27").setNumberFormat(usdFormat);
  dashboard.getRange("E27:H27").setNumberFormat(phpFormat);
  dashboard.getRange("A29").values = [["Open All Expenses for the simple total. Enter your current Syncraft cash there when you are ready."]];

  sources.getRange("A13:F17").values = [
    ["Fal receipt history", 170, "USD purchased", new Date("2026-08-14T00:00:00+08:00"), "https://fal.ai/dashboard/usage-billing/invoices", "10 receipts; current balance $19.15"],
    ["OpenRouter credit history", 190, "USD purchased", new Date("2026-08-14T00:00:00+08:00"), "https://openrouter.ai/settings/credits", "26 transactions; current balance $0.28"],
    ["Vercel Pro invoice", 20, "USD paid", new Date("2026-07-26T00:00:00+08:00"), "https://vercel.com/jeighdesign-bits-projects/~/settings/invoices", "One paid Pro invoice; upcoming invoice excluded"],
    ["ChatGPT Plus / Codex", 1100, "PHP paid", new Date("2026-07-31T00:00:00+08:00"), "https://chatgpt.com/#settings/Subscription", "One paid transaction"],
    ["Supabase Pro public price", 25, "USD / month estimate", new Date("2026-08-14T00:00:00+08:00"), "https://supabase.com/pricing", "Different Gmail; exact charge and number of months still need owner confirmation"],
  ];
  sources.getRange("D13:D17").setNumberFormat("yyyy-mm-dd");
  sources.getRange("A13:F17").format.wrapText = true;

  checks.getRange("A14:G14").copyFrom(checks.getRange("A12:G12"), "all");
  checks.getRange("A15:G15").copyFrom(checks.getRange("A12:G12"), "all");
  checks.getRange("A14:G15").values = [
    ["Confirmed expense summary ties to confirmed rows", null, null, null, 0.01, null, "All Expenses B5 / expense table"],
    ["Extra Fal cash needed is non-negative", null, 0, null, 0, null, "All Expenses D7"],
  ];
  checks.getRange("B14").formulas = [["='All Expenses'!B5"]];
  checks.getRange("C14").formulas = [["=SUMIF('All Expenses'!F13:F40,\"Confirmed\",'All Expenses'!E13:E40)"]];
  checks.getRange("D14").formulas = [["=B14-C14"]];
  checks.getRange("F14").formulas = [["=IF(ABS(D14)<=E14,\"PASS\",\"FAIL\")"]];
  checks.getRange("B15").formulas = [["='All Expenses'!D7"]];
  checks.getRange("D15").formulas = [["=B15-C15"]];
  checks.getRange("F15").formulas = [["=IF(B15>=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("B11").formulas = [["=IF(COUNTIF(F5:F15,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("F14:F15").conditionalFormats.add("containsText", { text: "PASS", format: { fill: successFill, font: { color: successText } } });
  checks.getRange("F14:F15").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: dangerFill, font: { color: dangerText, bold: true } } });

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "all-expenses formula error scan",
  });
  const expenseCheck = await workbook.inspect({ kind: "table", range: "All Expenses!A1:F20", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 6, maxChars: 14000 });
  const falCheck = await workbook.inspect({ kind: "table", range: "Fal Purchases!A1:G24", include: "values,formulas", tableMaxRows: 24, tableMaxCols: 7, maxChars: 12000 });
  const dashboardCheck = await workbook.inspect({ kind: "table", range: "Dashboard!A1:H29", include: "values,formulas", tableMaxRows: 29, tableMaxCols: 8, maxChars: 12000 });
  const checksCheck = await workbook.inspect({ kind: "table", range: "Checks!A4:G15", include: "values,formulas", tableMaxRows: 15, tableMaxCols: 7, maxChars: 8000 });
  console.log("EXPENSE_FORMULA_ERRORS", errors.ndjson);
  console.log("ALL_EXPENSES_CHECK", expenseCheck.ndjson);
  console.log("FAL_EXPENSE_CHECK", falCheck.ndjson);
  console.log("EXPENSE_DASHBOARD_CHECK", dashboardCheck.ndjson);
  console.log("EXPENSE_CHECKS", checksCheck.ndjson);

  const previewDir = `${workDir}/expense-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  for (const [sheetName, range, fileName] of [
    ["All Expenses", "A1:F24", "All_Expenses.png"],
    ["Fal Purchases", "A1:G26", "Fal_Purchases.png"],
    ["Dashboard", "A1:H29", "Dashboard.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
    await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("ALL_EXPENSES_RESULT", JSON.stringify({
    confirmedExpensesPhp: expenses.getRange("B5").values?.[0]?.[0],
    includingSupabaseEstimatePhp: expenses.getRange("D5").values?.[0]?.[0],
    activeCredits: expenses.getRange("B6").values?.[0]?.[0],
    activeCreditFalCostPhp: expenses.getRange("D6").values?.[0]?.[0],
    currentFalWalletPhp: expenses.getRange("B7").values?.[0]?.[0],
    extraFalCashNeededPhp: expenses.getRange("D7").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function repairActiveCreditFalCost() {
  const workbook = await loadWorkbook();
  const expenses = workbook.worksheets.getItem("All Expenses");
  const checks = workbook.worksheets.getItem("Checks");
  const fal = workbook.worksheets.getItem("Fal Purchases");
  expenses.getRange("D6").formulas = [["=(('Service Cost Model'!B24-('Service Cost Model'!E6*SUMPRODUCT('Service Cost Model'!C15:C19,'Service Cost Model'!H15:H19)))*'Service Cost Model'!B6/'Service Cost Model'!B23)*B6"]];
  expenses.getRange("C:C").format.columnWidth = 30;
  expenses.getRange("D:D").format.columnWidth = 18;
  expenses.getRange("E:E").format.columnWidth = 28;
  expenses.getRange("F:F").format.columnWidth = 42;
  expenses.getRange("A7:F8").format.rowHeight = 34;

  // Excel stores date-times without a timezone; use the visible Philippines wall time.
  fal.getRange("B5").values = [[new Date("2026-07-28T00:00:00Z")]];
  fal.getRange("A13:A22").values = [
    [new Date("2026-08-14T09:14:37Z")],
    [new Date("2026-08-13T01:19:03Z")],
    [new Date("2026-08-11T06:36:00Z")],
    [new Date("2026-08-09T00:18:14Z")],
    [new Date("2026-08-06T05:07:49Z")],
    [new Date("2026-08-05T06:28:14Z")],
    [new Date("2026-08-02T00:28:46Z")],
    [new Date("2026-07-30T07:42:11Z")],
    [new Date("2026-07-29T03:28:09Z")],
    [new Date("2026-07-28T06:09:53Z")],
  ];
  fal.getRange("A13:A22").setNumberFormat("yyyy-mm-dd hh:mm");

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "repaired expense formula scan",
  });
  const expenseCheck = await workbook.inspect({ kind: "table", range: "All Expenses!A4:F17", include: "values,formulas", tableMaxRows: 16, tableMaxCols: 6, maxChars: 10000 });
  console.log("REPAIRED_EXPENSE_ERRORS", errors.ndjson);
  console.log("REPAIRED_EXPENSE_CHECK", expenseCheck.ndjson);

  const previewDir = `${workDir}/expense-preview`;
  for (const [sheetName, range, fileName] of [
    ["All Expenses", "A1:F24", "All_Expenses.png"],
    ["Fal Purchases", "A1:G26", "Fal_Purchases.png"],
    ["Dashboard", "A1:H29", "Dashboard.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
    await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("REPAIRED_EXPENSE_RESULT", JSON.stringify({
    activeCreditFalCostPhp: expenses.getRange("D6").values?.[0]?.[0],
    extraFalCashNeededPhp: expenses.getRange("D7").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function addRecraftExpenses() {
  const workbook = await loadWorkbook();
  if (workbook.worksheets.items.some((sheet) => sheet.name === "Recraft Purchases")) {
    throw new Error("Recraft Purchases already exists; refusing to overwrite it");
  }

  const navy = "#172B4D";
  const navy2 = "#29456F";
  const paleHeader = "#E9EEF6";
  const inputFill = "#FFFBEA";
  const blue = "#0000FF";
  const green = "#008000";
  const dark = "#101828";
  const successFill = "#EAF8DE";
  const successText = "#397A1F";
  const estimateFill = "#FFF4E5";
  const estimateText = "#9A6700";
  const dangerFill = "#FDECEC";
  const dangerText = "#B42318";
  const phpFormat = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
  const usdFormat = '"$"#,##0.000;[Red]("$"#,##0.000);-';

  const receiptRows = [
    [new Date("2026-08-11T00:00:00Z"), 5, 318.00, null, "2996-2830", "API Unit Pack 5"],
    [new Date("2026-08-09T00:00:00Z"), 1, 63.28, null, "2952-7213", "API Unit Pack 1"],
    [new Date("2026-08-02T00:00:00Z"), 3, 191.08, null, "2643-3402", "API Unit Pack 3"],
    [new Date("2026-07-30T00:00:00Z"), 1, 64.02, null, "2233-3977", "API Unit Pack 1"],
    [new Date("2026-07-23T00:00:00Z"), 3, 192.72, null, "2142-5005", "API Unit Pack 3"],
    [new Date("2026-07-17T00:00:00Z"), 1, 64.09, null, "2357-7797", "API Unit Pack 1"],
    [new Date("2026-07-21T00:00:00Z"), 1, 64.19, null, "2206-4451", "API Unit Pack 1"],
    [new Date("2026-07-09T00:00:00Z"), 2, 128.13, null, "2786-8177", "API Unit Pack 2"],
    [new Date("2026-07-09T00:00:00Z"), 2, 128.08, null, "2977-4699", "API Unit Pack 2"],
    [new Date("2026-07-10T00:00:00Z"), 2, 128.04, null, "2724-1754", "API Unit Pack 2"],
    [new Date("2026-07-08T00:00:00Z"), 2, 128.08, null, "2065-9217", "API Unit Pack 2"],
    [new Date("2026-07-08T00:00:00Z"), 3, 192.03, null, "2711-6410", "API Unit Pack 3"],
    [new Date("2026-07-08T00:00:00Z"), 1, 63.95, null, "2204-8325", "API Unit Pack 1"],
    [new Date("2026-07-07T00:00:00Z"), 1, 63.91, null, "2570-5148", "API Unit Pack 1"],
    [new Date("2026-07-08T00:00:00Z"), 3, 192.08, null, "2320-5962", "API Unit Pack 3"],
    [new Date("2026-07-06T00:00:00Z"), 2, 127.90, null, "2579-4323", "API Unit Pack 2"],
    [new Date("2026-07-08T00:00:00Z"), 2, 127.76, null, "2905-5287", "API Unit Pack 2"],
    [new Date("2026-07-07T00:00:00Z"), 2, 127.74, null, "2665-6799", "API Unit Pack 2"],
    [new Date("2026-07-06T00:00:00Z"), 3, 191.96, null, "2609-5839", "API Unit Pack 3"],
    [new Date("2026-07-06T00:00:00Z"), 3, 191.97, null, "2196-0007", "API Unit Pack 3"],
    [new Date("2026-07-06T00:00:00Z"), 2, 128.02, null, "2498-0775", "API Unit Pack 2"],
    [new Date("2026-07-05T00:00:00Z"), 3, 191.59, null, "2234-4450", "API Unit Pack 3"],
    [new Date("2026-07-02T00:00:00Z"), 1, 64.08, null, "2765-1535", "API Unit Pack 1"],
    [new Date("2026-07-01T00:00:00Z"), 1, 64.07, null, "2531-5258", "API Unit Pack 1"],
    [new Date("2026-07-03T00:00:00Z"), 1, 63.88, null, "2938-9479", "API Unit Pack 1"],
    [new Date("2026-06-29T00:00:00Z"), 2, 127.25, null, "2453-2923", "API Unit Pack 2"],
    [new Date("2026-06-25T00:00:00Z"), 1, 63.81, null, "2457-0289", "API Unit Pack 1"],
    [new Date("2026-05-30T00:00:00Z"), 5, 320.05, null, "2400-7493", "API Unit Pack 5"],
    [new Date("2026-06-01T00:00:00Z"), 1, 64.22, null, "2275-2646", "API Unit Pack 1"],
    [new Date("2026-05-31T00:00:00Z"), 1, 64.01, null, "2743-1647", "API Unit Pack 1"],
    [new Date("2026-05-31T00:00:00Z"), 3, 192.03, null, "2455-8309", "API Unit Pack 3"],
    [new Date("2026-06-17T00:00:00Z"), 2, 125.62, null, "2773-8978", "API Unit Pack 2"],
    [new Date("2026-05-29T00:00:00Z"), 1, 63.91, null, "2143-0033", "API Unit Pack 1"],
  ];

  const assumptions = workbook.worksheets.getItem("Assumptions");
  const expenses = workbook.worksheets.getItem("All Expenses");
  const dashboard = workbook.worksheets.getItem("Dashboard");
  const fal = workbook.worksheets.getItem("Fal Purchases");
  const checks = workbook.worksheets.getItem("Checks");
  const sources = workbook.worksheets.getItem("Sources");
  const recraft = workbook.worksheets.add("Recraft Purchases");

  assumptions.getRange("B14").values = [[2.802]];
  assumptions.getRange("C14").values = [["2,802 API units remaining; 1,000 API units = $1"]];

  recraft.showGridLines = false;
  recraft.getRange("A1:F1").merge();
  recraft.getRange("A1").values = [["Recraft API Purchase Tracker"]];
  recraft.getRange("A1:F1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", fontSize: 16 }, verticalAlignment: "center" };
  recraft.getRange("A1:F1").format.rowHeight = 30;
  recraft.getRange("A2:F2").merge();
  recraft.getRange("A2").values = [["All 33 Recraft receipts found in Gmail are listed below. The account is currently on the Free Studio plan; these payments were API Unit Packs used by the vectorizer."]];
  recraft.getRange("A2:F2").format = { fill: navy2, font: { color: "#FFFFFF", fontSize: 10 }, wrapText: true, verticalAlignment: "center" };
  recraft.getRange("A2:F2").format.rowHeight = 38;

  recraft.getRange("A4:B4").merge();
  recraft.getRange("A4").values = [["CURRENT RECRAFT"]];
  recraft.getRange("D4:F4").merge();
  recraft.getRange("D4").values = [["PURCHASE SUMMARY"]];
  for (const range of ["A4:B4", "D4:F4"]) recraft.getRange(range).format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  recraft.getRange("A5:B8").values = [
    ["Current API units", 2802],
    ["Current API value (USD)", null],
    ["Receipt count", null],
    ["Current Studio plan", "Free"],
  ];
  recraft.getRange("B6").formulas = [["=B5/1000"]];
  recraft.getRange("B7").formulas = [["=COUNTA(E12:E111)"]];
  recraft.getRange("D5:E8").values = [
    ["USD purchased", null],
    ["Exact PHP paid", null],
    ["Estimated USD used", null],
    ["Average PHP / USD", null],
  ];
  recraft.getRange("E5:E8").formulas = [
    ["=SUM(B12:B111)"],
    ["=SUM(C12:C111)"],
    ["=MAX(0,E5-B6)"],
    ["=IF(E5=0,0,E6/E5)"],
  ];
  recraft.getRange("A5:A8").format.font = { bold: true, color: dark };
  recraft.getRange("D5:D8").format.font = { bold: true, color: dark };
  recraft.getRange("B5:B8").format = { fill: successFill, font: { bold: true, color: green } };
  recraft.getRange("E5:E8").format = { fill: successFill, font: { bold: true, color: green } };
  recraft.getRange("B5").setNumberFormat("#,##0");
  recraft.getRange("B6").setNumberFormat(usdFormat);
  recraft.getRange("B7").setNumberFormat("#,##0");
  recraft.getRange("E5").setNumberFormat(usdFormat);
  recraft.getRange("E6").setNumberFormat(phpFormat);
  recraft.getRange("E7").setNumberFormat(usdFormat);
  recraft.getRange("E8").setNumberFormat("₱0.00");

  recraft.getRange("A10:F10").merge();
  recraft.getRange("A10").values = [["RECRAFT RECEIPT HISTORY"]];
  recraft.getRange("A10:F10").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  recraft.getRange("A11:F11").values = [["Date", "USD Bought", "Exact PHP Paid", "PHP / USD", "Receipt #", "Item"]];
  recraft.getRange("A11:F11").format = { fill: paleHeader, font: { bold: true, color: dark }, borders: { bottom: { style: "medium", color: navy } }, wrapText: true, verticalAlignment: "center" };
  recraft.tables.add("A11:F111", true, "RecraftPurchaseLog").style = "TableStyleMedium2";
  recraft.getRange("A12:F44").values = receiptRows;
  recraft.getRange("D12").formulas = [["=IF(OR(B12=\"\",C12=\"\"),\"\",C12/B12)"]];
  recraft.getRange("D12:D111").fillDown();
  recraft.getRange("A12:A44").setNumberFormat("yyyy-mm-dd");
  recraft.getRange("B12:B111").setNumberFormat(usdFormat);
  recraft.getRange("C12:C111").setNumberFormat(phpFormat);
  recraft.getRange("D12:D111").setNumberFormat("₱0.00");
  recraft.getRange("A45:C111").format = { fill: inputFill, font: { color: blue } };
  recraft.getRange("E45:F111").format = { fill: inputFill, font: { color: blue } };
  recraft.getRange("D45:D111").format.fill = "#F3F4F6";
  recraft.freezePanes.freezeRows(11);
  recraft.getRange("A1:F111").format.font.typeface = "Aptos";
  recraft.getRange("A:A").format.columnWidth = 14;
  recraft.getRange("B:B").format.columnWidth = 16;
  recraft.getRange("C:C").format.columnWidth = 18;
  recraft.getRange("D:D").format.columnWidth = 14;
  recraft.getRange("E:E").format.columnWidth = 18;
  recraft.getRange("F:F").format.columnWidth = 24;

  // Add Recraft to the simple business expense summary.
  expenses.getRange("A2").values = [["Simple view of provider credits and tech subscriptions already paid. Active-credit provider cost uses the recent real service mix, including Fal and Recraft vectorization."]];
  expenses.getRange("A6:D9").values = [
    ["Active user credits", null, "Fal + Recraft cost of active credits", null],
    ["Current provider wallets", null, "Extra provider cash needed", null],
    ["Fal credits already used", null, "Recraft API units left", 2802],
    ["Current OpenRouter wallet", 0.28, "Recraft receipts", 33],
  ];
  expenses.getRange("E6").values = [["Cash after future provider funding"]];
  expenses.getRange("B6:B9").formulas = [
    ["='Assumptions'!B12"],
    ["=('Assumptions'!B13+'Assumptions'!B14)*'Assumptions'!B7"],
    ["='Fal Purchases'!E6"],
    ["=0.28"],
  ];
  expenses.getRange("D6:D9").formulas = [
    ["='Service Cost Model'!B25*B6"],
    ["=MAX(0,D6-B7)"],
    ["='Recraft Purchases'!B5"],
    ["='Recraft Purchases'!B7"],
  ];
  expenses.getRange("F6").formulas = [["=IF(F5=\"\",\"\",F5-D7)"]];
  expenses.getRange("B6").setNumberFormat("#,##0");
  expenses.getRange("B7").setNumberFormat(phpFormat);
  expenses.getRange("B8:B9").setNumberFormat(usdFormat);
  expenses.getRange("D6:D7").setNumberFormat(phpFormat);
  expenses.getRange("D8:D9").setNumberFormat("#,##0");
  expenses.getRange("A17:F18").values = [
    ["2026-05-29 to 2026-08-11", "Recraft API", "Vectorizer API units", 67, 4281.55, "Confirmed"],
    ["Month to confirm", "Supabase Pro", "Database", 25, null, "Estimate — confirm actual charge/months"],
  ];
  expenses.getRange("E18").formulas = [["=D18*'Assumptions'!B7"]];
  expenses.getRange("F17").format = { fill: successFill, font: { color: successText, bold: true } };
  expenses.getRange("F18").format = { fill: estimateFill, font: { color: estimateText, bold: true } };
  expenses.getRange("D17:D18").setNumberFormat(usdFormat);
  expenses.getRange("E17:E18").setNumberFormat(phpFormat);

  // Keep the Fal-only tracker Fal-only now that All Expenses includes Recraft.
  fal.getRange("G7").formulas = [["=(('Service Cost Model'!B24-('Service Cost Model'!E6*SUMPRODUCT('Service Cost Model'!C15:C19,'Service Cost Model'!H15:H19)))*'Service Cost Model'!B6/'Service Cost Model'!B23)*'Assumptions'!B12"]];

  dashboard.getRange("A25").values = [["FAL + RECRAFT CASH CONTROL"]];
  dashboard.getRange("A26:H27").values = [
    ["Fal paid estimate", null, null, "Current provider wallets", null, null, "Active-credit provider cost", null],
    ["Recraft paid exact", null, null, "Extra provider cash needed", null, null, "Confirmed expenses", null],
  ];
  dashboard.getRange("B26").formulas = [["='Fal Purchases'!G5"]];
  dashboard.getRange("E26").formulas = [["='All Expenses'!B7"]];
  dashboard.getRange("H26").formulas = [["='All Expenses'!D6"]];
  dashboard.getRange("B27").formulas = [["='Recraft Purchases'!E6"]];
  dashboard.getRange("E27").formulas = [["='All Expenses'!D7"]];
  dashboard.getRange("H27").formulas = [["='All Expenses'!B5"]];
  for (const range of ["B26", "E26", "H26", "B27", "E27", "H27"]) dashboard.getRange(range).setNumberFormat(phpFormat);
  dashboard.getRange("A29").values = [["Open All Expenses for the simple total. Fal Purchases and Recraft Purchases contain the detailed provider receipts."]];

  sources.getRange("A18:F18").values = [["Recraft API receipt history", 67, "USD purchased / ₱4,281.55 exact paid", new Date("2026-08-14T00:00:00Z"), "https://mail.google.com/mail/u/0/#search/recraft", "33 receipts from 2026-05-29 to 2026-08-11; current balance 2,802 API units; Studio plan is Free"]];
  sources.getRange("D18").setNumberFormat("yyyy-mm-dd");
  sources.getRange("A18:F18").format.wrapText = true;

  checks.getRange("A15").values = [["Extra provider cash needed is non-negative"]];
  checks.getRange("G15").values = [["All Expenses D7"]];
  checks.getRange("A16:G16").copyFrom(checks.getRange("A14:G14"), "all");
  checks.getRange("A16:G16").values = [["Recraft receipts tie to expense summary", null, null, null, 0.01, null, "Recraft Purchases E6 / All Expenses E17"]];
  checks.getRange("B16").formulas = [["='Recraft Purchases'!E6"]];
  checks.getRange("C16").formulas = [["='All Expenses'!E17"]];
  checks.getRange("D16").formulas = [["=B16-C16"]];
  checks.getRange("F16").formulas = [["=IF(ABS(D16)<=E16,\"PASS\",\"FAIL\")"]];
  checks.getRange("B11").formulas = [["=IF(COUNTIF(F5:F16,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("F16").conditionalFormats.add("containsText", { text: "PASS", format: { fill: successFill, font: { color: successText } } });
  checks.getRange("F16").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: dangerFill, font: { color: dangerText, bold: true } } });

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Recraft expense formula scan",
  });
  const recraftCheck = await workbook.inspect({ kind: "table", range: "Recraft Purchases!A1:F46", include: "values,formulas", tableMaxRows: 46, tableMaxCols: 6, maxChars: 16000 });
  const expenseCheck = await workbook.inspect({ kind: "table", range: "All Expenses!A1:F20", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 6, maxChars: 12000 });
  const dashboardCheck = await workbook.inspect({ kind: "table", range: "Dashboard!A1:H29", include: "values,formulas", tableMaxRows: 29, tableMaxCols: 8, maxChars: 10000 });
  console.log("RECRAFT_FORMULA_ERRORS", errors.ndjson);
  console.log("RECRAFT_PURCHASE_CHECK", recraftCheck.ndjson);
  console.log("RECRAFT_ALL_EXPENSES_CHECK", expenseCheck.ndjson);
  console.log("RECRAFT_DASHBOARD_CHECK", dashboardCheck.ndjson);

  const previewDir = `${workDir}/recraft-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  for (const [sheetName, range, fileName] of [
    ["All Expenses", "A1:F24", "All_Expenses.png"],
    ["Recraft Purchases", "A1:F46", "Recraft_Purchases.png"],
    ["Dashboard", "A1:H29", "Dashboard.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
    await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("RECRAFT_EXPENSE_RESULT", JSON.stringify({
    recraftReceiptCount: recraft.getRange("B7").values?.[0]?.[0],
    recraftUsdPurchased: recraft.getRange("E5").values?.[0]?.[0],
    recraftPhpPaid: recraft.getRange("E6").values?.[0]?.[0],
    currentRecraftUnits: recraft.getRange("B5").values?.[0]?.[0],
    confirmedExpensesPhp: expenses.getRange("B5").values?.[0]?.[0],
    activeCreditProviderCostPhp: expenses.getRange("D6").values?.[0]?.[0],
    extraProviderCashNeededPhp: expenses.getRange("D7").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function repairRecraftExpenseLayout() {
  const workbook = await loadWorkbook();
  const recraft = workbook.worksheets.getItem("Recraft Purchases");
  const expenses = workbook.worksheets.getItem("All Expenses");
  const checks = workbook.worksheets.getItem("Checks");

  recraft.getRange("A:A").format.columnWidth = 24;
  recraft.getRange("B:B").format.columnWidth = 18;
  recraft.getRange("C:C").format.columnWidth = 20;
  recraft.getRange("D:D").format.columnWidth = 24;
  recraft.getRange("E:E").format.columnWidth = 20;
  recraft.getRange("F:F").format.columnWidth = 24;
  recraft.getRange("B12:B111").setNumberFormat('"$"#,##0.00');
  recraft.getRange("D12:D111").setNumberFormat("0.00");
  recraft.getRange("E5").setNumberFormat('"$"#,##0.00');
  recraft.getRange("E8").setNumberFormat('"₱"0.00');
  recraft.getRange("A5:E8").format.rowHeight = 25;

  expenses.getRange("E7").values = [["Enter only the Syncraft money you still have now. Past expenses are already paid, so the cash result subtracts only the additional Fal + Recraft funding still needed."]];
  expenses.getRange("B8:B9").setNumberFormat('"$"#,##0.00');
  expenses.getRange("D17:D18").setNumberFormat('"$"#,##0.00');

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Recraft layout repair formula scan",
  });
  const recraftCheck = await workbook.inspect({ kind: "table", range: "Recraft Purchases!A1:F46", include: "values,formulas", tableMaxRows: 46, tableMaxCols: 6, maxChars: 12000 });
  const expenseCheck = await workbook.inspect({ kind: "table", range: "All Expenses!A4:F18", include: "values,formulas", tableMaxRows: 18, tableMaxCols: 6, maxChars: 9000 });
  console.log("RECRAFT_REPAIR_ERRORS", errors.ndjson);
  console.log("RECRAFT_REPAIR_CHECK", recraftCheck.ndjson);
  console.log("RECRAFT_EXPENSE_REPAIR_CHECK", expenseCheck.ndjson);

  const previewDir = `${workDir}/recraft-preview`;
  for (const [sheetName, range, fileName] of [
    ["All Expenses", "A1:F24", "All_Expenses.png"],
    ["Recraft Purchases", "A1:F46", "Recraft_Purchases.png"],
    ["Dashboard", "A1:H29", "Dashboard.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
    await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("RECRAFT_REPAIR_RESULT", JSON.stringify({
    confirmedExpensesPhp: expenses.getRange("B5").values?.[0]?.[0],
    activeCreditProviderCostPhp: expenses.getRange("D6").values?.[0]?.[0],
    extraProviderCashNeededPhp: expenses.getRange("D7").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function setCurrentCash(amount) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid current cash amount: ${amount}`);
  }

  const workbook = await loadWorkbook();
  const expenses = workbook.worksheets.getItem("All Expenses");
  const checks = workbook.worksheets.getItem("Checks");

  expenses.getRange("F5").values = [[amount]];
  expenses.getRange("F5:F6").setNumberFormat('"₱"#,##0.00;[Red]("₱"#,##0.00);-');
  expenses.getRange("F6").format = {
    fill: "#FDECEC",
    font: { bold: true, color: "#B42318" },
  };

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "Current cash update formula scan",
  });
  const expenseCheck = await workbook.inspect({
    kind: "table",
    range: "All Expenses!A4:F9",
    include: "values,formulas",
    tableMaxRows: 9,
    tableMaxCols: 6,
    maxChars: 6000,
  });
  const modelCheck = await workbook.inspect({
    kind: "table",
    range: "Checks!A4:G16",
    include: "values,formulas",
    tableMaxRows: 16,
    tableMaxCols: 7,
    maxChars: 7000,
  });
  console.log("CASH_BALANCE_ERRORS", errors.ndjson);
  console.log("CASH_BALANCE_EXPENSE_CHECK", expenseCheck.ndjson);
  console.log("CASH_BALANCE_MODEL_CHECK", modelCheck.ndjson);

  const previewDir = `${workDir}/cash-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  const rendered = await workbook.render({
    sheetName: "All Expenses",
    range: "A1:F24",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(`${previewDir}/All_Expenses.png`, new Uint8Array(await rendered.arrayBuffer()));

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("CASH_BALANCE_RESULT", JSON.stringify({
    currentCashPhp: expenses.getRange("F5").values?.[0]?.[0],
    cashAfterProviderFundingPhp: expenses.getRange("F6").values?.[0]?.[0],
    extraProviderCashNeededPhp: expenses.getRange("D7").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function setupOwnerRecovery() {
  const workbook = await loadWorkbook();
  const existing = workbook.worksheets.items.some((sheet) => sheet.name === "Owner Recovery");
  const recovery = existing
    ? workbook.worksheets.getItem("Owner Recovery")
    : workbook.worksheets.add("Owner Recovery");
  const checks = workbook.worksheets.getItem("Checks");

  const navy = "#172B4D";
  const navy2 = "#29456F";
  const pale = "#E9EEF6";
  const greenFill = "#EAF8DE";
  const greenText = "#397A1F";
  const warningFill = "#FFF4E5";
  const warningText = "#9A6700";
  const dangerFill = "#FDECEC";
  const dangerText = "#B42318";
  const inputFill = "#FFFBEA";
  const phpFormat = '"₱"#,##0.00;[Red]("₱"#,##0.00);"₱"0.00';

  recovery.showGridLines = false;
  recovery.getRange("A1:D22").clear({ applyTo: "all" });
  recovery.getRange("A1:D1").merge();
  recovery.getRange("A1").values = [["Syncraft — Owner Recovery"]];
  recovery.getRange("A1:D1").format = {
    fill: navy,
    font: { bold: true, color: "#FFFFFF", fontSize: 16 },
    verticalAlignment: "center",
  };
  recovery.getRange("A1:D1").format.rowHeight = 32;

  recovery.getRange("A2:D2").merge();
  recovery.getRange("A2").values = [["Simple rule: protect the provider cost of active credits first. Cash above that reserve can be used to recover your previous Syncraft spending."]];
  recovery.getRange("A2:D2").format = {
    fill: navy2,
    font: { color: "#FFFFFF", fontSize: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  recovery.getRange("A2:D2").format.rowHeight = 38;

  recovery.getRange("A4:D4").merge();
  recovery.getRange("A4").values = [["MONEY POSITION RIGHT NOW"]];
  recovery.getRange("A4:D4").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  recovery.getRange("A5:B8").values = [
    ["Current Syncraft cash", null],
    ["Provider reserve still needed", null],
    ["Additional cash needed before withdrawal", null],
    ["Cash free to withdraw now", null],
  ];
  recovery.getRange("B5:B8").formulas = [
    ["='All Expenses'!F5"],
    ["='All Expenses'!D7"],
    ["=MAX(0,B6-B5)"],
    ["=MAX(0,B5-B6)"],
  ];
  recovery.getRange("A5:A8").format.font = { bold: true, color: "#101828" };
  recovery.getRange("B5:B8").setNumberFormat(phpFormat);
  recovery.getRange("B5:B6").format = { fill: pale, font: { bold: true, color: "#172B4D" } };
  recovery.getRange("B7").format = { fill: dangerFill, font: { bold: true, color: dangerText } };
  recovery.getRange("B8").format = { fill: greenFill, font: { bold: true, color: greenText } };

  recovery.getRange("A10:D10").merge();
  recovery.getRange("A10").values = [["OWNER INVESTMENT RECOVERY"]];
  recovery.getRange("A10:D10").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  recovery.getRange("A11:B16").values = [
    ["Confirmed Syncraft spending", null],
    ["Previous amount already withdrawn", 0],
    ["Can be recovered safely now", null],
    ["Investment still to recover", null],
    ["Real profit available now", null],
    ["Recovery progress", null],
  ];
  recovery.getRange("B11").formulas = [["='All Expenses'!B5"]];
  recovery.getRange("B13:B16").formulas = [
    ["=MIN(B8,MAX(0,B11-B12))"],
    ["=MAX(0,B11-B12-B13)"],
    ["=MAX(0,B8-MAX(0,B11-B12))"],
    ["=IF(B11=0,0,MIN(1,(B12+B13)/B11))"],
  ];
  recovery.getRange("A11:A16").format.font = { bold: true, color: "#101828" };
  recovery.getRange("B11:B15").setNumberFormat(phpFormat);
  recovery.getRange("B16").setNumberFormat("0.0%");
  recovery.getRange("B12").format = {
    fill: inputFill,
    font: { bold: true, color: "#0000FF" },
    borders: { preset: "outside", style: "thin", color: "#E5C07B" },
  };
  recovery.getRange("B13:B16").format = { fill: greenFill, font: { bold: true, color: greenText } };

  recovery.getRange("A18:D18").merge();
  recovery.getRange("A18").values = [["HOW TO USE"]];
  recovery.getRange("A18:D18").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  recovery.getRange("A19:D22").merge(true);
  recovery.getRange("A19:A22").values = [
    ["1. Update Current Syncraft cash in All Expenses whenever your cash changes."],
    ["2. Do not withdraw while Additional cash needed before withdrawal is above ₱0."],
    ["3. Once Cash free to withdraw now becomes positive, it can first recover your confirmed spending."],
    ["4. Enter every amount you actually take back in Previous amount already withdrawn. Only excess after full recovery is real profit."],
  ];
  recovery.getRange("A19:D22").format = {
    fill: "#F3F4F6",
    font: { color: "#475467", fontSize: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  recovery.getRange("A19:D22").format.rowHeight = 28;

  recovery.getRange("A1:D22").format.font.typeface = "Aptos";
  recovery.getRange("A:A").format.columnWidth = 38;
  recovery.getRange("B:B").format.columnWidth = 22;
  recovery.getRange("C:D").format.columnWidth = 18;
  recovery.freezePanes.freezeRows(4);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 300 },
    summary: "Owner recovery formula scan",
  });
  const recoveryCheck = await workbook.inspect({
    kind: "table",
    range: "Owner Recovery!A4:D22",
    include: "values,formulas",
    tableMaxRows: 22,
    tableMaxCols: 4,
    maxChars: 9000,
  });
  const modelCheck = await workbook.inspect({
    kind: "table",
    range: "Checks!A4:G16",
    include: "values,formulas",
    tableMaxRows: 16,
    tableMaxCols: 7,
    maxChars: 7000,
  });
  console.log("OWNER_RECOVERY_ERRORS", errors.ndjson);
  console.log("OWNER_RECOVERY_CHECK", recoveryCheck.ndjson);
  console.log("OWNER_RECOVERY_MODEL_CHECK", modelCheck.ndjson);

  const previewDir = `${workDir}/owner-recovery-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  const rendered = await workbook.render({ sheetName: "Owner Recovery", range: "A1:D22", scale: 1.4, format: "png" });
  await fs.writeFile(`${previewDir}/Owner_Recovery.png`, new Uint8Array(await rendered.arrayBuffer()));

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("OWNER_RECOVERY_RESULT", JSON.stringify({
    currentCashPhp: recovery.getRange("B5").values?.[0]?.[0],
    providerReserveNeededPhp: recovery.getRange("B6").values?.[0]?.[0],
    providerGapPhp: recovery.getRange("B7").values?.[0]?.[0],
    safeCashNowPhp: recovery.getRange("B8").values?.[0]?.[0],
    confirmedSpendingPhp: recovery.getRange("B11").values?.[0]?.[0],
    stillToRecoverPhp: recovery.getRange("B14").values?.[0]?.[0],
    profitAvailableNowPhp: recovery.getRange("B15").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function connectCashTracking() {
  const workbook = await loadWorkbook();
  const recovery = workbook.worksheets.getItem("Owner Recovery");
  const expenses = workbook.worksheets.getItem("All Expenses");
  const paymentSheet = workbook.worksheets.getItem("Payment Tracker");
  const checks = workbook.worksheets.getItem("Checks");

  const openingCash = Number(expenses.getRange("F5").values?.[0]?.[0] || 0);
  const paymentValues = paymentSheet.getRange("A1:N504").values || [];
  const firstFutureRow = paymentValues.findIndex((row, index) => index >= 4 && !row?.[3]) + 1;
  if (firstFutureRow < 5) throw new Error("No available Payment Tracker row for cash automation baseline");
  const trackingStarted = new Date();
  const phpFormat = '"₱"#,##0.00;[Red]("₱"#,##0.00);"₱"0.00';

  recovery.getRange("C5:D9").values = [
    ["Opening cash baseline", openingCash],
    ["New synced payments", null],
    ["Business cash spent after setup", 0],
    ["First auto-counted tracker row", firstFutureRow],
    ["Tracking started", trackingStarted],
  ];
  recovery.getRange("D6").formulas = [[`=SUM('Payment Tracker'!G${firstFutureRow}:G504)`]];
  recovery.getRange("B5").formulas = [["=MAX(0,D5+D6-D7-B12)"]];
  recovery.getRange("B12").values = [[0]];
  recovery.getRange("A12").values = [["Owner withdrawals after setup"]];

  recovery.getRange("C5:C9").format = {
    fill: "#E9EEF6",
    font: { bold: true, color: "#172B4D" },
    wrapText: true,
  };
  recovery.getRange("D5:D7").setNumberFormat(phpFormat);
  recovery.getRange("D5:D6").format = { fill: "#EAF8DE", font: { bold: true, color: "#397A1F" } };
  recovery.getRange("D7").format = {
    fill: "#FFFBEA",
    font: { bold: true, color: "#0000FF" },
    borders: { preset: "outside", style: "thin", color: "#E5C07B" },
  };
  recovery.getRange("D8").setNumberFormat("0");
  recovery.getRange("D8:D9").format = { fill: "#F3F4F6", font: { color: "#475467" } };
  recovery.getRange("D9").setNumberFormat("yyyy-mm-dd hh:mm");
  recovery.getRange("C:C").format.columnWidth = 31;
  recovery.getRange("D:D").format.columnWidth = 22;

  recovery.getRange("A19:A22").values = [
    ["1. Every new valid payment added by Sync Payment is automatically included in Current Syncraft cash."],
    ["2. Enter Fal top-ups, subscriptions, refunds, or other business cash paid after setup in Business cash spent after setup."],
    ["3. Enter money you personally take from Syncraft in Owner withdrawals after setup."],
    ["4. Only Cash free to withdraw now can recover your investment; after full recovery, the excess becomes real profit."],
  ];

  expenses.getRange("F5").formulas = [["='Owner Recovery'!B5"]];
  expenses.getRange("F5").setNumberFormat(phpFormat);
  expenses.getRange("F5").format = { fill: "#E9EEF6", font: { color: "#172B4D", bold: true } };
  expenses.getRange("E7").values = [["Current cash is now linked to Owner Recovery: opening ₱4,490 + future synced payments − business cash spent − owner withdrawals. Past expenses are not subtracted again."]];

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 300 },
    summary: "Connected cash tracking formula scan",
  });
  const recoveryCheck = await workbook.inspect({
    kind: "table",
    range: "Owner Recovery!A4:D22",
    include: "values,formulas",
    tableMaxRows: 22,
    tableMaxCols: 4,
    maxChars: 10000,
  });
  const expenseCheck = await workbook.inspect({
    kind: "table",
    range: "All Expenses!A4:F9",
    include: "values,formulas",
    tableMaxRows: 9,
    tableMaxCols: 6,
    maxChars: 6000,
  });
  const modelCheck = await workbook.inspect({
    kind: "table",
    range: "Checks!A4:G16",
    include: "values,formulas",
    tableMaxRows: 16,
    tableMaxCols: 7,
    maxChars: 7000,
  });
  console.log("CASH_CONNECT_ERRORS", errors.ndjson);
  console.log("CASH_CONNECT_RECOVERY", recoveryCheck.ndjson);
  console.log("CASH_CONNECT_EXPENSE", expenseCheck.ndjson);
  console.log("CASH_CONNECT_MODEL", modelCheck.ndjson);

  const previewDir = `${workDir}/cash-connect-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  for (const [sheetName, range, fileName] of [
    ["Owner Recovery", "A1:D22", "Owner_Recovery.png"],
    ["All Expenses", "A1:F24", "All_Expenses.png"],
  ]) {
    const rendered = await workbook.render({ sheetName, range, scale: 1.3, format: "png" });
    await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await rendered.arrayBuffer()));
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
  console.log("CASH_CONNECT_RESULT", JSON.stringify({
    openingCashPhp: recovery.getRange("D5").values?.[0]?.[0],
    firstFuturePaymentRow: recovery.getRange("D8").values?.[0]?.[0],
    autoAddedPaymentsPhp: recovery.getRange("D6").values?.[0]?.[0],
    currentCashPhp: recovery.getRange("B5").values?.[0]?.[0],
    providerGapPhp: recovery.getRange("B7").values?.[0]?.[0],
    safeCashNowPhp: recovery.getRange("B8").values?.[0]?.[0],
    modelStatus: checks.getRange("B11").values?.[0]?.[0],
  }));
}

async function simplifyDashboard() {
  const workbook = await loadWorkbook();
  const dashboard = workbook.worksheets.getItem("Dashboard");
  const checks = workbook.worksheets.getItem("Checks");
  const navy = "#172B4D";
  const navy2 = "#29456F";
  const pale = "#E9EEF6";
  const dark = "#101828";
  const greenFill = "#EAF8DE";
  const greenText = "#397A1F";
  const dangerFill = "#FDECEC";
  const dangerText = "#B42318";
  const phpFormat = '"₱"#,##0.00;[Red]("₱"#,##0.00);"₱"0.00';

  dashboard.getRange("A1:H29").unmerge();
  dashboard.getRange("A1:H29").clear({ applyTo: "all" });
  dashboard.showGridLines = false;

  dashboard.getRange("A1:H1").merge();
  dashboard.getRange("A1").values = [["Syncraft — Owner Cash Dashboard"]];
  dashboard.getRange("A1:H1").format = {
    fill: navy,
    font: { bold: true, color: "#FFFFFF", fontSize: 17 },
    verticalAlignment: "center",
  };
  dashboard.getRange("A1:H1").format.rowHeight = 34;

  dashboard.getRange("A2:H2").merge();
  dashboard.getRange("A2").values = [["Start here: check SAFE TO WITHDRAW. Sync Payment automatically adds new valid payments and refreshes active user credits."]];
  dashboard.getRange("A2:H2").format = {
    fill: navy2,
    font: { color: "#FFFFFF", fontSize: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  dashboard.getRange("A2:H2").format.rowHeight = 34;

  dashboard.getRange("A4:H4").merge();
  dashboard.getRange("A4").values = [["MONEY YOU NEED TO KNOW"]];
  dashboard.getRange("A4:H4").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };

  dashboard.getRange("A5:H6").values = [
    ["CURRENT CASH", null, "KEEP FOR ACTIVE CREDITS", null, "STILL NEEDED", null, "SAFE TO WITHDRAW", null],
    ["CONFIRMED SPENDING", null, "INVESTMENT STILL TO RECOVER", null, "REAL PROFIT NOW", null, "ACTIVE USER CREDITS", null],
  ];
  dashboard.getRange("B5").formulas = [["='Owner Recovery'!B5"]];
  dashboard.getRange("D5").formulas = [["='Owner Recovery'!B6"]];
  dashboard.getRange("F5").formulas = [["='Owner Recovery'!B7"]];
  dashboard.getRange("H5").formulas = [["='Owner Recovery'!B8"]];
  dashboard.getRange("B6").formulas = [["='Owner Recovery'!B11"]];
  dashboard.getRange("D6").formulas = [["='Owner Recovery'!B14"]];
  dashboard.getRange("F6").formulas = [["='Owner Recovery'!B15"]];
  dashboard.getRange("H6").formulas = [["='Assumptions'!B12"]];
  dashboard.getRange("A5:H6").format.rowHeight = 32;
  for (const range of ["A5", "C5", "E5", "G5", "A6", "C6", "E6", "G6"]) {
    dashboard.getRange(range).format = { fill: pale, font: { bold: true, color: "#667085", fontSize: 9 }, wrapText: true };
  }
  for (const range of ["B5", "D5", "B6", "D6"]) {
    dashboard.getRange(range).format = { fill: pale, font: { bold: true, color: navy, fontSize: 13 } };
    dashboard.getRange(range).setNumberFormat(phpFormat);
  }
  dashboard.getRange("F5").format = { fill: dangerFill, font: { bold: true, color: dangerText, fontSize: 13 } };
  dashboard.getRange("F5").setNumberFormat(phpFormat);
  for (const range of ["H5", "F6"]) {
    dashboard.getRange(range).format = { fill: greenFill, font: { bold: true, color: greenText, fontSize: 13 } };
    dashboard.getRange(range).setNumberFormat(phpFormat);
  }
  dashboard.getRange("H6").format = { fill: pale, font: { bold: true, color: navy, fontSize: 13 } };
  dashboard.getRange("H6").setNumberFormat("#,##0");

  dashboard.getRange("A8:H8").merge();
  dashboard.getRange("A8").values = [["Right now: do not withdraw while STILL NEEDED is above ₱0. When SAFE TO WITHDRAW becomes positive, that amount can first repay your investment."]];
  dashboard.getRange("A8:H8").format = {
    fill: "#F3F4F6",
    font: { color: "#475467", italic: true, fontSize: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  dashboard.getRange("A8:H8").format.rowHeight = 32;

  dashboard.getRange("A10:H10").merge();
  dashboard.getRange("A10").values = [["WHERE TO UPDATE"]];
  dashboard.getRange("A10:H10").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  dashboard.getRange("A11:H11").merge();
  dashboard.getRange("A11").values = [["Open Owner Recovery only when you spend business cash or withdraw money. New approved payments are added automatically when you say Sync Payment."]];
  dashboard.getRange("A11:H11").format = { fill: "#FFFBEA", font: { color: dark, fontSize: 10 }, wrapText: true, verticalAlignment: "center" };
  dashboard.getRange("A11:H11").format.rowHeight = 32;

  dashboard.getRange("A13:H13").merge();
  dashboard.getRange("A13").values = [["PLAN PROFIT — SIMPLE VIEW"]];
  dashboard.getRange("A13:H13").format = { fill: navy, font: { bold: true, color: "#FFFFFF" } };
  dashboard.getRange("A14:F14").values = [["Plan", "Price", "Credits", "Standard Generations", "Direct Profit", "Margin"]];
  dashboard.getRange("A14:F14").format = {
    fill: pale,
    font: { bold: true, color: dark },
    borders: { bottom: { style: "medium", color: navy } },
    wrapText: true,
    verticalAlignment: "center",
  };
  dashboard.getRange("A14:F14").format.font = { bold: true, color: dark };
  dashboard.getRange("A14:F14").format.rowHeight = 30;
  for (let row = 15; row <= 19; row += 1) {
    const sourceRow = row + 4;
    dashboard.getRange(`A${row}:F${row}`).formulas = [[
      `='Assumptions'!A${sourceRow}`,
      `='Assumptions'!C${sourceRow}`,
      `='Assumptions'!B${sourceRow}`,
      `='Assumptions'!D${sourceRow}`,
      `='Assumptions'!F${sourceRow}`,
      `='Assumptions'!G${sourceRow}`,
    ]];
  }
  dashboard.getRange("B15:B19").setNumberFormat(phpFormat);
  dashboard.getRange("C15:C19").setNumberFormat("#,##0");
  dashboard.getRange("D15:D19").setNumberFormat("0.0");
  dashboard.getRange("E15:E19").setNumberFormat(phpFormat);
  dashboard.getRange("F15:F19").setNumberFormat("0.0%");
  dashboard.getRange("A15:F19").format.font = { color: dark };
  dashboard.getRange("E15:E19").format = { fill: greenFill, font: { bold: true, color: greenText } };

  dashboard.getRange("A21:H21").merge();
  dashboard.getRange("A21").values = [["Detailed receipts and cost calculations remain available in Owner Recovery, All Expenses, Fal Purchases, and Recraft Purchases."]];
  dashboard.getRange("A21:H21").format = {
    fill: "#F3F4F6",
    font: { color: "#475467", italic: true, fontSize: 9 },
    wrapText: true,
    verticalAlignment: "center",
  };
  dashboard.getRange("A21:H21").format.rowHeight = 28;

  dashboard.getRange("A1:H21").format.font.typeface = "Aptos";
  dashboard.getRange("A:A").format.columnWidth = 23;
  dashboard.getRange("B:B").format.columnWidth = 17;
  dashboard.getRange("C:C").format.columnWidth = 25;
  dashboard.getRange("D:D").format.columnWidth = 19;
  dashboard.getRange("E:E").format.columnWidth = 20;
  dashboard.getRange("F:F").format.columnWidth = 17;
  dashboard.getRange("G:G").format.columnWidth = 22;
  dashboard.getRange("H:H").format.columnWidth = 17;
  dashboard.freezePanes.freezeRows(4);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
    options: { useRegex: true, maxResults: 300 },
    summary: "Simplified dashboard formula scan",
  });
  const dashboardCheck = await workbook.inspect({
    kind: "table",
    range: "Dashboard!A1:H21",
    include: "values,formulas",
    tableMaxRows: 21,
    tableMaxCols: 8,
    maxChars: 12000,
  });
  const modelCheck = await workbook.inspect({
    kind: "table",
    range: "Checks!A4:G16",
    include: "values,formulas",
    tableMaxRows: 16,
    tableMaxCols: 7,
    maxChars: 7000,
  });
  console.log("SIMPLE_DASHBOARD_ERRORS", errors.ndjson);
  console.log("SIMPLE_DASHBOARD_CHECK", dashboardCheck.ndjson);
  console.log("SIMPLE_DASHBOARD_MODEL", modelCheck.ndjson);

  const previewDir = `${workDir}/simple-dashboard-preview`;
  await fs.mkdir(previewDir, { recursive: true });
  const rendered = await workbook.render({ sheetName: "Dashboard", range: "A1:H21", scale: 1.3, format: "png" });
  await fs.writeFile(`${previewDir}/Dashboard.png`, new Uint8Array(await rendered.arrayBuffer()));
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(trackerPath);
}

if (mode === "inspect") await inspectWorkbook();
else if (mode === "fal-inspect") await inspectFalSetup();
else if (mode === "expense-inspect") await inspectExpenseInputs();
else if (mode === "audit") await auditPayments();
else if (mode === "sync") await syncPayments();
else if (mode === "repair") await repairSyncRow(process.argv[3]);
else if (mode === "repair-references") await repairNumericPaymentReferences();
else if (mode === "fal-setup") await setupFalTracker();
else if (mode === "fal-repair") await repairFalTrackerLayout();
else if (mode === "expense-setup") await setupAllExpenses();
else if (mode === "expense-repair") await repairActiveCreditFalCost();
else if (mode === "recraft-expenses") await addRecraftExpenses();
else if (mode === "recraft-repair") await repairRecraftExpenseLayout();
else if (mode === "cash-balance") await setCurrentCash(Number(process.argv[3]));
else if (mode === "owner-recovery") await setupOwnerRecovery();
else if (mode === "connect-cash") await connectCashTracking();
else if (mode === "simplify-dashboard") await simplifyDashboard();
else throw new Error(`Unsupported mode: ${mode}`);
