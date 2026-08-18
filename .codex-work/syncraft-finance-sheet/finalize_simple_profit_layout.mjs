import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f";
const outputPath = `${outputDir}/Syncraft_Fal_Reserve_Tracker.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const dashboard = workbook.worksheets.getItem("Dashboard");
const tracker = workbook.worksheets.getItem("Payment Tracker");

dashboard.getRange("A18:H18").unmerge();
dashboard.getRange("A18:H18").values = [["Plan", "Price", "Credits", "Standard Jobs", "Provider Cost", "Direct Profit", "Margin", "Price / Job"]];
dashboard.getRange("A18:H18").format = {
  fill: "#E9EEF6",
  font: { bold: true, color: "#101828" },
  verticalAlignment: "center",
  wrapText: true,
  borders: { bottom: { style: "medium", color: "#172B4D" } },
};
dashboard.getRange("D:D").format.columnWidth = 32;
dashboard.getRange("H:H").format.columnWidth = 27;

// Force long payment references to display as identifiers, not scientific notation.
for (const row of [5, 6]) {
  const raw = tracker.getRange(`B${row}`).values?.[0]?.[0];
  if (raw !== null && raw !== undefined && raw !== "") {
    const clean = String(raw).replace(/^'/, "");
    tracker.getRange(`B${row}`).values = [[`'${clean}`]];
  }
}
tracker.getRange("B5:B504").format.numberFormat = "@";

const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);
console.log((await workbook.inspect({ kind: "table", range: "Dashboard!A17:H23", include: "values,formulas", tableMaxRows: 7, tableMaxCols: 8, maxChars: 5000 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "Payment Tracker!A4:N6", include: "values,formulas", tableMaxRows: 3, tableMaxCols: 14, maxChars: 6000 })).ndjson);

for (const [sheetName, range, fileName] of [
  ["Dashboard", "A1:H23", "dashboard-simple-profit-preview.png"],
  ["Payment Tracker", "A1:N8", "payment-tracker-simple-profit-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.15, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
