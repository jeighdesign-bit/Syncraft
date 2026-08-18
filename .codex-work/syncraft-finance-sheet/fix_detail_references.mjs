import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f";
const outputPath = `${outputDir}/Syncraft_Fal_Reserve_Tracker.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const tracker = workbook.worksheets.getItem("Payment Tracker");
const model = workbook.worksheets.getItem("Service Cost Model");

for (const row of [5, 6]) {
  const raw = tracker.getRange(`B${row}`).values?.[0]?.[0];
  if (raw !== null && raw !== undefined && raw !== "") {
    const clean = String(raw).replace(/^['\u200B\uFEFF]/, "");
    tracker.getRange(`B${row}`).values = [[`\u200B${clean}`]];
  }
}
tracker.getRange("B5:B504").format.numberFormat = "@";

// Outstanding credits moved from old Assumptions B13 to simplified Assumptions B12.
model.getRange("B29").formulas = [["='Assumptions'!B12*B26"]];
model.getRange("A29").values = [["Reserve for current outstanding credits"]];

const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);
console.log((await workbook.inspect({ kind: "table", range: "Service Cost Model!A25:C29", include: "values,formulas", tableMaxRows: 5, tableMaxCols: 3, maxChars: 3000 })).ndjson);

for (const [sheetName, range, fileName] of [
  ["Payment Tracker", "A1:N8", "payment-tracker-simple-profit-preview.png"],
  ["Service Cost Model", "A21:C29", "service-cost-model-final-check-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.15, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}
const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
