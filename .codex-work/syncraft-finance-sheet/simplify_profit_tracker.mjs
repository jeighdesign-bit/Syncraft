import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f";
const outputPath = `${outputDir}/Syncraft_Fal_Reserve_Tracker.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const dashboard = workbook.worksheets.getItem("Dashboard");
const tracker = workbook.worksheets.getItem("Payment Tracker");
const assumptions = workbook.worksheets.getItem("Assumptions");
const checks = workbook.worksheets.getItem("Checks");

const C = {
  ink: "#101828", navy: "#172B4D", navy2: "#23395D", white: "#FFFFFF",
  gray: "#667085", pale: "#F7F9FC", blue: "#E9EEF6", border: "#D0D5DD",
  green: "#EAF8DE", greenDark: "#397A1F", yellow: "#FFFBEA", inputBlue: "#0000FF",
  red: "#FDE2E2", redDark: "#B42318",
};
const php = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
const phpWhole = '"₱"#,##0;[Red]("₱"#,##0);-';
const usd = '"$"#,##0.00;[Red]("$"#,##0.00);-';
const pct = '0.0%';
const count = '#,##0;[Red](#,##0);-';

function title(sheet, range, text, subtitle) {
  sheet.getRange(range).format = { fill: C.navy, font: { bold: true, color: C.white, size: 18 }, verticalAlignment: "center" };
  sheet.getRange(range).format.rowHeight = 32;
  sheet.getRange(range.split(":")[0]).values = [[text]];
  const start = range.split(":")[0];
  const end = range.split(":")[1];
  const row = Number(start.match(/\d+/)[0]) + 1;
  const startCol = start.match(/[A-Z]+/)[0];
  const endCol = end.match(/[A-Z]+/)[0];
  sheet.getRange(`${startCol}${row}:${endCol}${row}`).format = { fill: C.navy2, font: { color: "#DDE7F5", size: 10 }, verticalAlignment: "center", wrapText: true };
  sheet.getRange(`${startCol}${row}`).values = [[subtitle]];
  sheet.getRange(`${startCol}${row}:${endCol}${row}`).format.rowHeight = 26;
}
function section(sheet, range, text) {
  sheet.getRange(range).format = { fill: C.navy, font: { bold: true, color: C.white, size: 11 }, verticalAlignment: "center" };
  sheet.getRange(range.split(":")[0]).values = [[text]];
  sheet.getRange(range).format.rowHeight = 22;
}
function header(range) {
  range.format = { fill: C.blue, font: { bold: true, color: C.ink }, verticalAlignment: "center", wrapText: true, borders: { bottom: { style: "medium", color: C.navy } } };
}
function input(range) {
  range.format = { fill: C.yellow, font: { color: C.inputBlue }, borders: { preset: "outside", style: "thin", color: "#E5C07B" } };
}

// ---------------- Simple Assumptions ----------------
assumptions.getRange("A1:H23").clear({ applyTo: "all" });
assumptions.getRange("A1:F1").merge();
assumptions.getRange("A2:F2").merge();
assumptions.getRange("A4:F4").merge();
assumptions.getRange("A17:F17").unmerge();
assumptions.getRange("A17:G17").merge();
assumptions.showGridLines = false;
title(assumptions, "A1:F1", "Syncraft — Simple Profit Settings", "Main basis: Garment Extraction costs about ₱10.45 per successful 12-credit job. Blue/yellow cells are editable.");
section(assumptions, "A4:F4", "ONLY THE IMPORTANT INPUTS");
assumptions.getRange("A5:C15").values = [
  ["Input", "Value", "Plain meaning"],
  ["As-of date", new Date("2026-08-13T20:05:37+08:00"), "Last workbook update"],
  ["USD / PHP rate", 62, "Used to convert provider prices"],
  ["Garment provider cost / standard job", null, "Nano + ESRGAN + Recraft; linked from detailed audit"],
  ["Credits per standard job", 12, "One normal Garment/Logo operation"],
  ["Provider cost per credit", null, "Garment cost divided by 12 credits"],
  ["Optional extra buffer", 0, "Not deducted unless you choose a percentage"],
  ["Outstanding user credits", 8916, "Current unused customer credits"],
  ["Fal wallet balance (USD)", 20, "Update when the wallet changes"],
  ["Recraft balance (USD)", 0, "Update if you have prepaid Recraft units"],
  ["Provider wallets in PHP", null, "Fal + Recraft converted to pesos"],
];
assumptions.getRange("B8").formulas = [["='Service Cost Model'!J15"]];
assumptions.getRange("B10").formulas = [["=B8/B9"]];
assumptions.getRange("B15").formulas = [["=(B13+B14)*B7"]];
header(assumptions.getRange("A5:C5"));
input(assumptions.getRange("B6:B7"));
input(assumptions.getRange("B9:B9"));
input(assumptions.getRange("B11:B14"));
assumptions.getRange("B8:B10").format = { fill: C.pale, font: { bold: true, color: C.greenDark } };
assumptions.getRange("B15").format = { fill: C.green, font: { bold: true, color: C.greenDark } };
assumptions.getRange("B6").format.numberFormat = "yyyy-mm-dd hh:mm";
assumptions.getRange("B7").format.numberFormat = "0.00";
assumptions.getRange("B8").format.numberFormat = php;
assumptions.getRange("B9").format.numberFormat = count;
assumptions.getRange("B10").format.numberFormat = php;
assumptions.getRange("B11").format.numberFormat = pct;
assumptions.getRange("B12").format.numberFormat = count;
assumptions.getRange("B13:B14").format.numberFormat = usd;
assumptions.getRange("B15").format.numberFormat = php;

assumptions.getRange("D5:F12").values = [
  ["Simple output", "Value", "What it tells you"],
  ["Future provider cost owed", null, "Estimated cost if outstanding credits are used mostly on Garment"],
  ["Provider funding gap", null, "Future provider cost minus current provider wallets"],
  ["Standard jobs still owed", null, "Outstanding credits divided by 12"],
  ["Recorded sales", null, "Payments added to Payment Tracker"],
  ["Estimated provider cost", null, "Cost attached to those sold credits"],
  ["Direct profit", null, "Recorded sales minus provider cost"],
  ["Direct profit margin", null, "Direct profit divided by recorded sales"],
];
assumptions.getRange("E6:E12").formulas = [
  ["=B12*B10"],
  ["=MAX(E6-B15,0)"],
  ["=B12/B9"],
  ["=SUM('Payment Tracker'!$G$5:$G$504)"],
  ["=SUM('Payment Tracker'!$I$5:$I$504)"],
  ["=SUM('Payment Tracker'!$J$5:$J$504)"],
  ["=IF(E9=0,0,E11/E9)"],
];
header(assumptions.getRange("D5:F5"));
assumptions.getRange("E6:E7").format.numberFormat = php;
assumptions.getRange("E8").format.numberFormat = "#,##0.0";
assumptions.getRange("E9:E11").format.numberFormat = php;
assumptions.getRange("E12").format.numberFormat = pct;
assumptions.getRange("E6:E12").format.font = { color: C.greenDark, bold: true };

section(assumptions, "A17:G17", "CURRENT LIVE PLAN — DIRECT PROFIT");
assumptions.getRange("A18:G23").values = [
  ["Plan", "Credits", "Selling Price", "Standard Jobs", "Provider Cost", "Direct Profit", "Profit Margin"],
  ["Tingi", 24, 50, null, null, null, null],
  ["Basic", 48, 100, null, null, null, null],
  ["Starter", 156, 299, null, null, null, null],
  ["Pro", 300, 499, null, null, null, null],
  ["Elite", 540, 799, null, null, null, null],
];
assumptions.getRange("D19").formulas = [["=B19/$B$9"]]; assumptions.getRange("D19:D23").fillDown();
assumptions.getRange("E19").formulas = [["=B19*$B$10"]]; assumptions.getRange("E19:E23").fillDown();
assumptions.getRange("F19").formulas = [["=C19-E19"]]; assumptions.getRange("F19:F23").fillDown();
assumptions.getRange("G19").formulas = [["=IF(C19=0,0,F19/C19)"]]; assumptions.getRange("G19:G23").fillDown();
header(assumptions.getRange("A18:G18"));
assumptions.getRange("A19:C23").format.font = { color: C.inputBlue };
assumptions.getRange("B19:B23").format.numberFormat = count;
assumptions.getRange("C19:C23").format.numberFormat = php;
assumptions.getRange("D19:D23").format.numberFormat = "0.0";
assumptions.getRange("E19:F23").format.numberFormat = php;
assumptions.getRange("F19:F23").format = { fill: C.green, font: { bold: true, color: C.greenDark }, numberFormat: php };
assumptions.getRange("G19:G23").format.numberFormat = pct;
assumptions.freezePanes.freezeRows(4);
assumptions.getRange("A1:G23").format.font.name = "Aptos";
assumptions.getRange("A:A").format.columnWidth = 36;
assumptions.getRange("B:B").format.columnWidth = 17;
assumptions.getRange("C:C").format.columnWidth = 45;
assumptions.getRange("D:D").format.columnWidth = 29;
assumptions.getRange("E:E").format.columnWidth = 18;
assumptions.getRange("F:F").format.columnWidth = 45;
assumptions.getRange("G:G").format.columnWidth = 17;

// ---------------- Payment Tracker: direct profit first ----------------
tracker.getRange("A2").values = [["Blue columns are payment inputs. Direct Profit = Gross Payment − estimated Garment-heavy Provider Cost."]];
tracker.getRange("A4:N4").values = [[
  "Date", "Reference", "Channel", "Plan", "Standard Price", "Adjustment", "Gross Payment",
  "Credits Granted", "Provider Cost", "Direct Profit", "Profit Margin", "Profit After Optional Buffer", "Profit Withdrawn?", "Notes"
]];
header(tracker.getRange("A4:N4"));
tracker.getRange("I5").formulas = [["=IF(D5=\"\",0,H5*'Assumptions'!$B$10)"]]; tracker.getRange("I5:I504").fillDown();
tracker.getRange("J5").formulas = [["=IF(D5=\"\",0,G5-I5)"]]; tracker.getRange("J5:J504").fillDown();
tracker.getRange("K5").formulas = [["=IF(G5=0,0,J5/G5)"]]; tracker.getRange("K5:K504").fillDown();
tracker.getRange("L5").formulas = [["=IF(D5=\"\",0,J5-I5*'Assumptions'!$B$11)"]]; tracker.getRange("L5:L504").fillDown();
tracker.getRange("A5:A504").format.numberFormat = "yyyy-mm-dd hh:mm";
tracker.getRange("B5:B504").format.numberFormat = "@";
tracker.getRange("E5:G504").format.numberFormat = php;
tracker.getRange("H5:H504").format.numberFormat = count;
tracker.getRange("I5:J504").format.numberFormat = php;
tracker.getRange("K5:K504").format.numberFormat = pct;
tracker.getRange("L5:L504").format.numberFormat = php;
tracker.getRange("J5:J504").format = { fill: C.green, font: { bold: true, color: C.greenDark }, numberFormat: php };
tracker.getRange("L5:L504").format = { fill: C.pale, font: { color: C.gray }, numberFormat: php };
tracker.getRange("J5:J504").conditionalFormats.deleteAll();
tracker.getRange("J5:J504").conditionalFormats.add("cellIs", { operator: "lessThan", formula: 0, format: { fill: C.red, font: { color: C.redDark, bold: true } } });
const widths = [17,18,13,12,16,14,16,16,17,17,15,24,18,38];
widths.forEach((w, i) => tracker.getRangeByIndexes(0, i, 504, 1).format.columnWidth = w);

// ---------------- Simple Dashboard ----------------
dashboard.getRange("A1:H24").clear({ applyTo: "all" });
dashboard.showGridLines = false;
title(dashboard, "A1:H1", "Syncraft Simple Profit Dashboard", "Main number: Direct Profit. Based on Garment Extraction at about ₱10.45 per 12-credit standard job.");
dashboard.getRange("A4:B7").values = [
  ["Outstanding user credits", null],
  ["Future provider cost owed", null],
  ["Current provider wallets", null],
  ["Provider funding gap", null],
];
dashboard.getRange("B4:B7").formulas = [
  ["='Assumptions'!B12"], ["='Assumptions'!E6"], ["='Assumptions'!B15"], ["='Assumptions'!E7"],
];
dashboard.getRange("D4:E7").values = [
  ["Recorded sales", null], ["Estimated provider cost", null], ["DIRECT PROFIT", null], ["Direct profit not withdrawn", null],
];
dashboard.getRange("E4:E7").formulas = [
  ["=SUM('Payment Tracker'!$G$5:$G$504)"],
  ["=SUM('Payment Tracker'!$I$5:$I$504)"],
  ["=SUM('Payment Tracker'!$J$5:$J$504)"],
  ["=SUMIF('Payment Tracker'!$M$5:$M$504,\"<>Yes\",'Payment Tracker'!$J$5:$J$504)"],
];
dashboard.getRange("G4:H7").values = [
  ["Garment cost / job", null], ["Credits / standard job", null], ["Cost / credit", null], ["Profit formula", "Sales − Provider Cost"],
];
dashboard.getRange("H4:H6").formulas = [["='Assumptions'!B8"], ["='Assumptions'!B9"], ["='Assumptions'!B10"]];
for (const range of ["A4:B7", "D4:E7", "G4:H7"]) {
  dashboard.getRange(range).format = { fill: C.pale, borders: { preset: "outside", style: "thin", color: C.border }, font: { size: 11 }, verticalAlignment: "center" };
}
dashboard.getRange("A4:A7").format.font = { bold: true, color: C.gray };
dashboard.getRange("D4:D7").format.font = { bold: true, color: C.gray };
dashboard.getRange("G4:G7").format.font = { bold: true, color: C.gray };
dashboard.getRange("B4:B7").format.font = { bold: true, color: C.ink, size: 14 };
dashboard.getRange("E4:E7").format.font = { bold: true, color: C.ink, size: 14 };
dashboard.getRange("E6").format = { fill: C.green, font: { bold: true, color: C.greenDark, size: 16 }, numberFormat: phpWhole };
dashboard.getRange("H4:H7").format.font = { bold: true, color: C.ink, size: 12 };
dashboard.getRange("B4").format.numberFormat = count;
dashboard.getRange("B5:B7").format.numberFormat = phpWhole;
dashboard.getRange("E4:E7").format.numberFormat = phpWhole;
dashboard.getRange("H4").format.numberFormat = php;
dashboard.getRange("H5").format.numberFormat = count;
dashboard.getRange("H6").format.numberFormat = php;

section(dashboard, "A10:H10", "SIMPLE GUIDE");
dashboard.getRange("A11:H14").merge(true);
dashboard.getRange("A11:A14").values = [
  ["1. Payment approved → it appears in Payment Tracker."],
  ["2. Provider Cost = estimated future cost of the credits sold, using Garment Extraction as the main basis."],
  ["3. Direct Profit = customer payment minus Provider Cost. Refunds and operations are not automatically deducted."],
  ["4. Optional Buffer is 0% by default. Change it only if you personally want extra protection."],
];
dashboard.getRange("A11:H14").format = { fill: C.white, font: { color: C.ink, size: 11 }, verticalAlignment: "center", borders: { bottom: { style: "thin", color: "#EAECF0" } } };

section(dashboard, "A17:H17", "CURRENT LIVE PLAN — DIRECT PROFIT");
dashboard.getRange("A18:H23").values = [
  ["Plan", "Price", "Credits", "Standard Jobs", "Provider Cost", "Direct Profit", "Margin", "Price / Job"],
  ["Tingi", null, null, null, null, null, null, null],
  ["Basic", null, null, null, null, null, null, null],
  ["Starter", null, null, null, null, null, null, null],
  ["Pro", null, null, null, null, null, null, null],
  ["Elite", null, null, null, null, null, null, null],
];
dashboard.getRange("B19").formulas = [["='Assumptions'!C19"]]; dashboard.getRange("B19:B23").fillDown();
dashboard.getRange("C19").formulas = [["='Assumptions'!B19"]]; dashboard.getRange("C19:C23").fillDown();
dashboard.getRange("D19").formulas = [["='Assumptions'!D19"]]; dashboard.getRange("D19:D23").fillDown();
dashboard.getRange("E19").formulas = [["='Assumptions'!E19"]]; dashboard.getRange("E19:E23").fillDown();
dashboard.getRange("F19").formulas = [["='Assumptions'!F19"]]; dashboard.getRange("F19:F23").fillDown();
dashboard.getRange("G19").formulas = [["='Assumptions'!G19"]]; dashboard.getRange("G19:G23").fillDown();
dashboard.getRange("H19").formulas = [["=IF(D19=0,0,B19/D19)"]]; dashboard.getRange("H19:H23").fillDown();
header(dashboard.getRange("A18:H18"));
dashboard.getRange("B19:B23").format.numberFormat = php;
dashboard.getRange("C19:C23").format.numberFormat = count;
dashboard.getRange("D19:D23").format.numberFormat = "0.0";
dashboard.getRange("E19:F23").format.numberFormat = php;
dashboard.getRange("F19:F23").format = { fill: C.green, font: { bold: true, color: C.greenDark }, numberFormat: php };
dashboard.getRange("G19:G23").format.numberFormat = pct;
dashboard.getRange("H19:H23").format.numberFormat = php;
dashboard.getRange("A1:H23").format.font.name = "Aptos";
const dashWidths = [28,17,13,18,18,18,14,25];
dashWidths.forEach((w, i) => dashboard.getRangeByIndexes(0, i, 23, 1).format.columnWidth = w);
dashboard.getRange("4:7").format.rowHeight = 28;
dashboard.freezePanes.freezeRows(3);

// ---------------- Checks: simple and relevant ----------------
checks.getRange("A1:G16").clear({ applyTo: "all" });
checks.showGridLines = false;
checks.getRange("A1:G1").merge();
checks.getRange("A2:G2").merge();
title(checks, "A1:G1", "Workbook Checks", "PASS confirms that Direct Profit equals Payment minus Provider Cost and that plan totals tie.");
checks.getRange("A4:G4").values = [["Check", "Actual", "Expected", "Difference", "Tolerance", "Status", "Where to fix"]];
header(checks.getRange("A4:G4"));
checks.getRange("A5:A9").values = [
  ["Payment rows: Sales = Provider Cost + Direct Profit"],
  ["Plan rows: Price = Provider Cost + Direct Profit"],
  ["Garment provider cost per credit is positive"],
  ["Outstanding credits are non-negative"],
  ["Optional buffer is non-negative"],
];
checks.getRange("B5:B9").formulas = [
  ["=MAX(ABS('Payment Tracker'!G5-'Payment Tracker'!I5-'Payment Tracker'!J5),ABS('Payment Tracker'!G6-'Payment Tracker'!I6-'Payment Tracker'!J6))"],
  ["=MAX(ABS('Assumptions'!C19-'Assumptions'!E19-'Assumptions'!F19),ABS('Assumptions'!C20-'Assumptions'!E20-'Assumptions'!F20),ABS('Assumptions'!C21-'Assumptions'!E21-'Assumptions'!F21),ABS('Assumptions'!C22-'Assumptions'!E22-'Assumptions'!F22),ABS('Assumptions'!C23-'Assumptions'!E23-'Assumptions'!F23))"],
  ["='Assumptions'!B10"], ["='Assumptions'!B12"], ["='Assumptions'!B11"],
];
checks.getRange("C5:C9").values = [[0],[0],[0],[0],[0]];
checks.getRange("D5:D9").formulas = [["=B5-C5"],["=B6-C6"],["=MIN(B7,0)"],["=MIN(B8,0)"],["=MIN(B9,0)"]];
checks.getRange("E5:E9").values = [[0.01],[0.01],[0],[0],[0]];
checks.getRange("F5:F9").formulas = [["=IF(ABS(D5)<=E5,\"PASS\",\"FAIL\")"],["=IF(ABS(D6)<=E6,\"PASS\",\"FAIL\")"],["=IF(B7>0,\"PASS\",\"FAIL\")"],["=IF(B8>=0,\"PASS\",\"FAIL\")"],["=IF(B9>=0,\"PASS\",\"FAIL\")"]];
checks.getRange("G5:G9").values = [["Payment Tracker I:J"],["Assumptions plan table"],["Assumptions B10"],["Assumptions B12"],["Assumptions B11"]];
checks.getRange("A11:B11").values = [["MODEL STATUS", null]];
checks.getRange("B11").formulas = [["=IF(COUNTIF(F5:F9,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
checks.getRange("A11:B11").format = { fill: C.navy, font: { bold: true, color: C.white, size: 12 } };
checks.getRange("F5:F11").conditionalFormats.add("containsText", { text: "PASS", format: { fill: C.green, font: { color: C.greenDark, bold: true } } });
checks.getRange("F5:F11").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: C.red, font: { color: C.redDark, bold: true } } });
checks.getRange("A1:G11").format.font.name = "Aptos";
checks.getRange("A:A").format.columnWidth = 48;
checks.getRange("B:E").format.columnWidth = 15;
checks.getRange("F:F").format.columnWidth = 16;
checks.getRange("G:G").format.columnWidth = 28;
checks.freezePanes.freezeRows(4);

workbook.comments.setSelf({ displayName: "User" });
workbook.comments.addThread({ cell: assumptions.getRange("B8") }, "Garment Extraction provider cost per successful job. Linked to the detailed Nano + ESRGAN + Recraft audit in Service Cost Model.");
workbook.comments.addThread({ cell: assumptions.getRange("B11") }, "Optional only. Keep at 0% if you want Direct Profit without an extra safety deduction.");

console.log((await workbook.inspect({ kind: "table", range: "Dashboard!A1:H23", include: "values,formulas", tableMaxRows: 23, tableMaxCols: 8, maxChars: 10000 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "Payment Tracker!A4:N7", include: "values,formulas", tableMaxRows: 4, tableMaxCols: 14, maxChars: 8000 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "Checks!A4:G11", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 7, maxChars: 5000 })).ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);

for (const [sheetName, range, fileName] of [
  ["Dashboard", "A1:H23", "dashboard-simple-profit-preview.png"],
  ["Payment Tracker", "A1:N8", "payment-tracker-simple-profit-preview.png"],
  ["Assumptions", "A1:G23", "assumptions-simple-profit-preview.png"],
  ["Checks", "A1:G11", "checks-simple-profit-preview.png"],
  ["Service Cost Model", "A1:L29", "service-cost-model-final-preview.png"],
  ["Sources", "A1:F12", "sources-final-preview.png"],
  ["Sync State", "A1:E15", "sync-state-final-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.15, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
