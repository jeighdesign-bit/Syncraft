import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f";
const outputPath = `${outputDir}/Syncraft_Fal_Reserve_Tracker.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const dashboard = workbook.worksheets.getItem("Dashboard");
const assumptions = workbook.worksheets.getItem("Assumptions");
const model = workbook.worksheets.getItem("Service Cost Model");

const inputStyle = { fill: "#FFFBEA", font: { color: "#0000FF" }, borders: { preset: "outside", style: "thin", color: "#E5C07B" } };
const php = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
const usd = '"$"#,##0.00;[Red]("$"#,##0.00);-';

assumptions.getRange("A15:C15").values = [["Current Recraft prepaid balance (USD)", 0, "Enter Recraft API-unit balance; zero is conservative"]];
assumptions.getRange("B15").format = { ...inputStyle, numberFormat: usd };
assumptions.getRange("E6").formulas = [["=(B14+B15)*B7"]];
assumptions.getRange("D6").values = [["Current provider wallets (PHP)"]];
assumptions.getRange("F6").values = [["Fal plus Recraft prepaid balances converted to PHP"]];
assumptions.getRange("E13").format.numberFormat = '0.0 "days"';
assumptions.getRange("E12").format.numberFormat = usd;
assumptions.getRange("E14").format.numberFormat = usd;
assumptions.getRange("C:C").format.columnWidth = 46;
assumptions.getRange("F:F").format.columnWidth = 48;

dashboard.getRange("A6").values = [["Current provider wallets"]];
dashboard.getRange("G4").values = [["Provider wallet runway"]];
dashboard.getRange("H:H").format.columnWidth = 50;
dashboard.getRange("H7").format.wrapText = true;

model.getRange("A:A").format.columnWidth = 33;
model.getRange("C:C").format.columnWidth = 22;
model.getRange("D:D").format.columnWidth = 29;
model.getRange("F:F").format.columnWidth = 27;
model.getRange("D6:F11").format.wrapText = true;
model.getRange("A23:C29").format.wrapText = true;
model.getRange("A26:A28").format.rowHeight = 28;

const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);
console.log((await workbook.inspect({ kind: "table", range: "Assumptions!A5:F15", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 6, maxChars: 6000 })).ndjson);

for (const [sheetName, range, fileName] of [
  ["Dashboard", "A1:H24", "dashboard-full-service-preview.png"],
  ["Assumptions", "A1:H23", "assumptions-full-service-preview.png"],
  ["Service Cost Model", "A1:L29", "service-cost-model-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
