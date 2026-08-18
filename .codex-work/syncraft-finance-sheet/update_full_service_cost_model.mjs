import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f";
const outputPath = `${outputDir}/Syncraft_Fal_Reserve_Tracker.xlsx`;
const input = await FileBlob.load(outputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

console.log((await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 })).ndjson);

const dashboard = workbook.worksheets.getItem("Dashboard");
const assumptions = workbook.worksheets.getItem("Assumptions");
const checks = workbook.worksheets.getItem("Checks");
const sources = workbook.worksheets.getItem("Sources");
const model = workbook.worksheets.add("Service Cost Model");

const C = {
  ink: "#101828", navy: "#172B4D", white: "#FFFFFF", gray: "#667085",
  green: "#EAF8DE", greenDark: "#397A1F", amber: "#FFF0C2", amberDark: "#A15C00",
  red: "#FDE2E2", redDark: "#B42318", blue: "#E9EEF6", pale: "#F7F9FC", border: "#D0D5DD",
};
const php = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
const usd = '"$"#,##0.0000;[Red]("$"#,##0.0000);-';
const pct = '0.0%';
const count = '#,##0;[Red](#,##0);-';

function titleBand(sheet, range, title, subtitle) {
  sheet.getRange(range).merge();
  const anchor = range.split(":")[0];
  sheet.getRange(anchor).values = [[title]];
  sheet.getRange(range).format = { fill: C.navy, font: { bold: true, color: C.white, size: 18 }, verticalAlignment: "center" };
  sheet.getRange(range).format.rowHeight = 32;
  const row = Number(anchor.match(/\d+/)[0]) + 1;
  const startCol = anchor.match(/[A-Z]+/)[0];
  const endCol = range.split(":")[1].match(/[A-Z]+/)[0];
  sheet.getRange(`${startCol}${row}:${endCol}${row}`).merge();
  sheet.getRange(`${startCol}${row}`).values = [[subtitle]];
  sheet.getRange(`${startCol}${row}:${endCol}${row}`).format = { fill: "#23395D", font: { color: "#DDE7F5", size: 10 }, wrapText: true, verticalAlignment: "center" };
  sheet.getRange(`${startCol}${row}:${endCol}${row}`).format.rowHeight = 28;
}
function section(sheet, range, label) {
  sheet.getRange(range).merge();
  sheet.getRange(range.split(":")[0]).values = [[label]];
  sheet.getRange(range).format = { fill: C.navy, font: { bold: true, color: C.white, size: 11 }, verticalAlignment: "center" };
  sheet.getRange(range).format.rowHeight = 22;
}
function header(range) {
  range.format = { fill: C.blue, font: { bold: true, color: C.ink }, wrapText: true, verticalAlignment: "center", borders: { bottom: { style: "medium", color: C.navy } } };
}

// Full provider/service model.
model.showGridLines = false;
titleBand(model, "A1:L1", "Syncraft — Full Service Cost Model", "All consumer services included. Fixed prices come from provider pricing; compute and megapixel inputs use successful Syncraft requests from the last 30 days.");
section(model, "A4:D4", "PROVIDER PRICE & BUFFER INPUTS");
model.getRange("A5:C11").values = [
  ["Input", "Value", "Basis"],
  ["USD / PHP working rate", 62, "Editable conservative rate"],
  ["Safety buffer", 0.20, "FX, mix and cost volatility"],
  ["Nano Banana Pro", 0.15, "USD / successful image"],
  ["ESRGAN", 0.00111, "USD / compute second"],
  ["Clarity Upscaler", 0.03, "USD / output megapixel"],
  ["BiRefNet", 0.0008, "USD / compute second"],
];
model.getRange("D5:F11").values = [
  ["Additional provider", "Value", "Basis"],
  ["Recraft vectorization", 0.01, "USD / request"],
  ["ESRGAN avg successful duration", 7.6622, "seconds; 1,171 successes"],
  ["Clarity avg successful output", 7.0214, "MP; 33 successes"],
  ["Clarity max observed output", 32.576, "MP; size-risk stress input"],
  ["BiRefNet avg successful duration", 0.9565, "seconds; 31 successes"],
  ["As-of", new Date("2026-08-13T18:18:07+08:00"), "Live audit timestamp"],
];
header(model.getRange("A5:C5")); header(model.getRange("D5:F5"));
model.getRange("B6:B11").format = { fill: "#FFFBEA", font: { color: "#0000FF" }, borders: { preset: "outside", style: "thin", color: "#E5C07B" } };
model.getRange("E6:E11").format = { fill: "#FFFBEA", font: { color: "#0000FF" }, borders: { preset: "outside", style: "thin", color: "#E5C07B" } };
model.getRange("B6").format.numberFormat = "0.00";
model.getRange("B7").format.numberFormat = pct;
model.getRange("B8:B11").format.numberFormat = usd;
model.getRange("E6").format.numberFormat = usd;
model.getRange("E7:E10").format.numberFormat = "0.0000";
model.getRange("E11").format.numberFormat = "yyyy-mm-dd hh:mm";

section(model, "A13:L13", "SERVICE PIPELINES & UNIT ECONOMICS");
model.getRange("A14:L19").values = [
  ["Service", "Credits / job", "30-day jobs", "Nano images", "ESRGAN sec", "Clarity MP", "BiRefNet sec", "Recraft requests", "Provider USD / job", "Provider PHP / job", "PHP / Syncraft credit", "Normalized credit mix"],
  ["Logo Extract + Garment", 12, 1178, 1, 7.6622, 0, 0, 1, null, null, null, null],
  ["Universal (full pipeline)", 24, 50, 1, 7.6622, 0, 0, 1, null, null, null, null],
  ["Image Upscaler", 12, 48, 0, 0, 7.0214, 0, 0, null, null, null, null],
  ["Background Remover", 12, 30, 0, 0, 0, 0.9565, 0, null, null, null, null],
  ["Extend Design", 12, 20, 1, 0, 0, 0, 0, null, null, null, null],
];
header(model.getRange("A14:L14"));
model.getRange("I15").formulas = [["=D15*$B$8+E15*$B$9+F15*$B$10+G15*$B$11+H15*$E$6"]];
model.getRange("I15:I19").fillDown();
model.getRange("J15").formulas = [["=I15*$B$6"]]; model.getRange("J15:J19").fillDown();
model.getRange("K15").formulas = [["=IF(B15=0,0,J15/B15)"]]; model.getRange("K15:K19").fillDown();
model.getRange("L15").formulas = [["=IF($B$23=0,0,B15*C15/$B$23)"]]; model.getRange("L15:L19").fillDown();
model.getRange("B15:H19").format.numberFormat = "0.0000";
model.getRange("B15:C19").format.numberFormat = count;
model.getRange("I15:I19").format.numberFormat = usd;
model.getRange("J15:K19").format.numberFormat = php;
model.getRange("L15:L19").format.numberFormat = pct;

section(model, "A21:F21", "OVERALL RESERVE RESULTS");
model.getRange("A22:C29").values = [
  ["Metric", "Value", "Meaning"],
  ["Normalized recent credits", null, "30-day job mix restated at current service charges"],
  ["Weighted provider spend", null, "Estimated provider cost for that normalized mix"],
  ["Base blended cost / credit", null, "All five services, no safety buffer"],
  ["Recommended operating reserve / credit", null, "Blended cost plus 20% safety buffer"],
  ["Stress reserve / credit", null, "If every credit is used on average-size Upscaler"],
  ["Max-observed Upscaler reserve / credit", null, "Extreme size risk; requires MP cap or dynamic credits"],
  ["Reserve for current 8,916 credits", null, "Recommended operating reserve target"],
];
header(model.getRange("A22:C22"));
model.getRange("B23:B29").formulas = [
  ["=SUMPRODUCT(B15:B19,C15:C19)"],
  ["=SUMPRODUCT(C15:C19,I15:I19)"],
  ["=IF(B23=0,0,B24/B23*$B$6)"],
  ["=B25*(1+$B$7)"],
  ["=K17*(1+$B$7)"],
  ["=IF(B17=0,0,$E$9*$B$10*$B$6/B17*(1+$B$7))"],
  ["='Assumptions'!B13*B26"],
];
model.getRange("B23").format.numberFormat = count;
model.getRange("B24").format.numberFormat = usd;
model.getRange("B25:B29").format.numberFormat = php;
model.getRange("B26").format = { fill: C.green, font: { color: C.greenDark, bold: true }, numberFormat: php };
model.getRange("B27:B28").format = { fill: C.amber, font: { color: C.amberDark, bold: true }, numberFormat: php };

section(model, "A32:J32", "PLAN PROFIT BY SERVICE — BEFORE FEES / REFUNDS / OPERATIONS");
model.getRange("A33:J38").values = [
  ["Plan", "Plan Price", "Plan Credits", "Revenue / 12 cr", "Logo/Garment margin", "Upscaler avg margin", "BG Remover margin", "Extend margin", "Revenue / 24 cr", "Universal margin"],
  ["Tingi", null, null, null, null, null, null, null, null, null],
  ["Basic", null, null, null, null, null, null, null, null, null],
  ["Starter", null, null, null, null, null, null, null, null, null],
  ["Pro", null, null, null, null, null, null, null, null, null],
  ["Elite", null, null, null, null, null, null, null, null, null],
];
header(model.getRange("A33:J33"));
model.getRange("B34").formulas = [["='Assumptions'!C19"]]; model.getRange("B34:B38").fillDown();
model.getRange("C34").formulas = [["='Assumptions'!B19"]]; model.getRange("C34:C38").fillDown();
model.getRange("D34").formulas = [["=IF(C34=0,0,B34/C34*12)"]]; model.getRange("D34:D38").fillDown();
model.getRange("E34").formulas = [["=D34-$J$15"]]; model.getRange("E34:E38").fillDown();
model.getRange("F34").formulas = [["=D34-$J$17"]]; model.getRange("F34:F38").fillDown();
model.getRange("G34").formulas = [["=D34-$J$18"]]; model.getRange("G34:G38").fillDown();
model.getRange("H34").formulas = [["=D34-$J$19"]]; model.getRange("H34:H38").fillDown();
model.getRange("I34").formulas = [["=IF(C34=0,0,B34/C34*24)"]]; model.getRange("I34:I38").fillDown();
model.getRange("J34").formulas = [["=I34-$J$16"]]; model.getRange("J34:J38").fillDown();
model.getRange("B34:B38").format.numberFormat = php;
model.getRange("C34:C38").format.numberFormat = count;
model.getRange("D34:J38").format.numberFormat = php;
model.getRange("E34:J38").conditionalFormats.add("cellIs", { operator: "lessThan", formula: 0, format: { fill: C.red, font: { color: C.redDark, bold: true } } });

model.freezePanes.freezeRows(3);
model.getRange("A1:L38").format.font.name = "Aptos";
const widths = [29,16,15,14,14,14,14,17,19,19,20,19];
widths.forEach((w, i) => model.getRangeByIndexes(0, i, 38, 1).format.columnWidth = w);
model.getRange("C6:C11").format.wrapText = true;
model.getRange("F6:F11").format.wrapText = true;

// Keep Payment Tracker compatibility by preserving Assumptions!B12 as the reserve-rate anchor.
assumptions.getRange("A6:C14").values = [
  ["As-of date", new Date("2026-08-13T18:18:07+08:00"), "Live balances and 30-day cost audit"],
  ["USD / PHP working rate", 62, "Linked working rate; editable here and in Service Cost Model"],
  ["Blended provider cost / credit (PHP)", null, "All consumer services before safety buffer"],
  ["Credits charged per standard job", 12, "Syncraft billing unit"],
  ["Safety buffer", 0.20, "FX, service mix and provider-cost volatility"],
  ["Extra contingency", 0, "Optional manual uplift; current model already includes all providers"],
  ["Recommended reserve per credit (PHP)", null, "Used by Payment Tracker and plan allocation"],
  ["Current unused user credits", 8916, "Live sum across 88 positive-balance profiles"],
  ["Current Fal wallet balance (USD)", 20, "Enter actual Fal balance when it changes"],
];
assumptions.getRange("B8").formulas = [["='Service Cost Model'!B25"]];
assumptions.getRange("B12").formulas = [["='Service Cost Model'!B26*(1+B11)"]];
assumptions.getRange("D5:F14").values = [
  ["Calculated output", "Value", "Meaning"],
  ["Current Fal wallet (PHP)", null, "Fal USD balance converted to PHP"],
  ["Required all-service reserve (PHP)", null, "Operating reserve for all unused credits"],
  ["Funding gap (PHP)", null, "Amount still needed in locked reserve"],
  ["12-credit equivalent jobs outstanding", null, "Credit liability expressed as standard jobs"],
  ["Blended baseline liability (USD)", null, "All five services, before safety buffer"],
  ["30-day successful Fal requests", 2640, "Nano + ESRGAN + Clarity + BiRefNet"],
  ["Estimated daily provider spend (USD)", null, "Includes Recraft and all consumer services"],
  ["Estimated Fal wallet runway (days)", null, "Days before current wallet runs out"],
  ["Reorder alert threshold (USD)", null, "Seven days of estimated provider spend"],
];
assumptions.getRange("E6:E14").formulas = [
  ["=B14*B7"],
  ["=B13*B12"],
  ["=MAX(E7-E6,0)"],
  ["=B13/B9"],
  ["=IF(B7=0,0,B13*B8/B7)"],
  ["=2640"],
  ["='Service Cost Model'!B24/30"],
  ["=IF(E12=0,0,B14/E12)"],
  ["=E12*7"],
];
assumptions.getRange("B6:B11").format = { fill: "#FFFBEA", font: { color: "#0000FF" }, borders: { preset: "outside", style: "thin", color: "#E5C07B" } };
assumptions.getRange("B8").format = { fill: C.pale, font: { color: C.greenDark, bold: true }, numberFormat: php };
assumptions.getRange("B12").format = { fill: C.green, font: { color: C.greenDark, bold: true }, numberFormat: php };
assumptions.getRange("B13:B14").format = { fill: "#FFFBEA", font: { color: "#0000FF" }, borders: { preset: "outside", style: "thin", color: "#E5C07B" } };
assumptions.getRange("B6").format.numberFormat = "yyyy-mm-dd hh:mm";
assumptions.getRange("B7").format.numberFormat = "0.00";
assumptions.getRange("B9").format.numberFormat = count;
assumptions.getRange("B10:B11").format.numberFormat = pct;
assumptions.getRange("B13").format.numberFormat = count;
assumptions.getRange("B14").format.numberFormat = '"$"#,##0.00';
assumptions.getRange("E6:E8").format.numberFormat = php;
assumptions.getRange("E9").format.numberFormat = "0.00";
assumptions.getRange("E10").format.numberFormat = usd;
assumptions.getRange("E11").format.numberFormat = count;
assumptions.getRange("E12:E14").format.numberFormat = usd;

dashboard.getRange("A2").values = [["All-service reserve: Logo/Garment, Universal, Upscaler, Background Remover, Extend, ESRGAN and Recraft."]];
dashboard.getRange("A18").values = [["SAFE ALLOCATION PER PLAN — BLENDED ALL-SERVICE RESERVE"]];
dashboard.getRange("H7").formulas = [["=IF(B7=0,\"Reserve funded; withdraw only Safe Profit\",\"Lock provider reserve first; review Upscaler MP risk\")"]];

// Add model-integrity checks without moving existing automation-sensitive cells.
checks.getRange("A14:G16").values = [
  ["Additional cost-model check", "Actual", "Expected", "Difference", "Tolerance", "Status", "Notes"],
  ["Assumptions reserve matches full service model", null, null, null, 0.0001, null, "Assumptions B12 must remain linked for automation"],
  ["Current active-credit snapshot matches model", null, 8916, null, 0, null, "Refresh after major credit changes"],
];
header(checks.getRange("A14:G14"));
checks.getRange("B15").formulas = [["='Assumptions'!B12"]];
checks.getRange("C15").formulas = [["='Service Cost Model'!B26*(1+'Assumptions'!B11)"]];
checks.getRange("D15").formulas = [["=B15-C15"]];
checks.getRange("F15").formulas = [["=IF(ABS(D15)<=E15,\"PASS\",\"FAIL\")"]];
checks.getRange("B16").formulas = [["='Assumptions'!B13"]];
checks.getRange("D16").formulas = [["=B16-C16"]];
checks.getRange("F16").formulas = [["=IF(ABS(D16)<=E16,\"PASS\",\"FAIL\")"]];
checks.getRange("B15:E16").format.numberFormat = "0.0000";
checks.getRange("F15:F16").conditionalFormats.add("containsText", { text: "PASS", format: { fill: C.green, font: { color: C.greenDark, bold: true } } });
checks.getRange("F15:F16").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: C.red, font: { color: C.redDark, bold: true } } });

sources.getRange("A4:F12").values = [
  ["Item", "Value", "Units", "As-of", "Source URL", "Notes"],
  ["Nano Banana Pro", 0.15, "USD / successful image", new Date("2026-08-13T00:00:00+08:00"), "https://fal.ai/models/fal-ai/nano-banana-pro/edit", "Logo/Garment, full Universal, Extend"],
  ["ESRGAN", 0.00111, "USD / compute second", new Date("2026-08-13T00:00:00+08:00"), "https://fal.ai/models/fal-ai/esrgan", "Observed average successful duration: 7.6622 sec"],
  ["Clarity Upscaler", 0.03, "USD / output megapixel", new Date("2026-08-13T00:00:00+08:00"), "https://fal.ai/models/fal-ai/clarity-upscaler", "Observed avg 7.0214 MP; max 32.576 MP"],
  ["BiRefNet", 0.0008, "USD / compute second", new Date("2026-08-13T00:00:00+08:00"), "https://fal.ai/models/fal-ai/birefnet", "Observed average successful duration: 0.9565 sec"],
  ["Recraft vectorization", 0.01, "USD / request", new Date("2026-08-13T00:00:00+08:00"), "https://www.recraft.ai/docs/api-reference/pricing", "Used after Logo/Garment and full Universal"],
  ["Active user credits", 8916, "Syncraft credits", new Date("2026-08-13T18:18:07+08:00"), "Syncraft live profiles audit", "88 profiles with positive balances; 2,416 profiles checked"],
  ["Recent service mix", 1326, "jobs / 30 days", new Date("2026-08-13T18:18:07+08:00"), "Syncraft credit_logs audit", "1,178 trace; 50 universal; 48 upscale; 30 BG; 20 extend"],
  ["Fal request audit", 2640, "successful requests / 30 days", new Date("2026-08-13T18:18:07+08:00"), "Fal requests API", "1,405 Nano; 1,171 ESRGAN; 33 Clarity; 31 BiRefNet"],
];
header(sources.getRange("A4:F4"));
sources.getRange("B5:B12").format.numberFormat = "0.0000";
sources.getRange("D5:D12").format.numberFormat = "yyyy-mm-dd hh:mm";
sources.getRange("E5:F12").format.wrapText = true;

workbook.comments.setSelf({ displayName: "Codex" });
workbook.comments.addThread({ cell: model.getRange("B26") }, "Recommended operating reserve uses the normalized 30-day service mix plus a 20% safety buffer. It is not a guarantee against unlimited image size.");
workbook.comments.addThread({ cell: model.getRange("B28") }, "The observed 32.576 MP Clarity output shows why the Upscaler needs a megapixel cap or dynamic credit charge.");

const modelInspect = await workbook.inspect({ kind: "table", range: "Service Cost Model!A14:L29", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 12, maxChars: 10000 });
console.log("MODEL_INSPECT\n" + modelInspect.ndjson);
const assumptionInspect = await workbook.inspect({ kind: "table", range: "Assumptions!A5:F14", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 6, maxChars: 6000 });
console.log("ASSUMPTIONS_INSPECT\n" + assumptionInspect.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "formula error scan" });
console.log("ERROR_SCAN\n" + errors.ndjson);

for (const [sheetName, range, fileName] of [
  ["Dashboard", "A1:H24", "dashboard-full-service-preview.png"],
  ["Assumptions", "A1:H23", "assumptions-full-service-preview.png"],
  ["Service Cost Model", "A1:L29", "service-cost-model-preview.png"],
  ["Service Cost Model", "A32:J38", "plan-service-margin-preview.png"],
  ["Checks", "A1:G16", "checks-full-service-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
