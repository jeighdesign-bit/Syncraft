import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = process.cwd();
const outputDir = path.join(root, "outputs", "019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f");
const workbookPath = path.join(outputDir, "Syncraft_Fal_Reserve_Tracker.xlsx");
const previewDir = path.join(root, ".codex-work", "syncraft-finance-sheet", "final-pricing-previews");

await fs.mkdir(previewDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const assumptions = workbook.worksheets.getItem("Assumptions");

const before = await workbook.render({
  sheetName: "Assumptions",
  range: "A1:G23",
  scale: 1.15,
  format: "png",
});
await fs.writeFile(path.join(previewDir, "assumptions-before.png"), new Uint8Array(await before.arrayBuffer()));

// Keep the existing formulas/styles and update only the finalized plan inputs.
assumptions.getRange("A19:C23").values = [
  ["Tingi", 24, 60],
  ["Basic", 60, 149],
  ["Starter", 168, 299],
  ["Pro", 288, 499],
  ["Elite", 528, 899],
];

const planInspect = await workbook.inspect({
  kind: "table",
  range: "Assumptions!A18:G23",
  include: "values,formulas",
  tableMaxRows: 6,
  tableMaxCols: 7,
  maxChars: 6000,
});
console.log(planInspect.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

for (const sheet of workbook.worksheets) {
  const fileName = `${sheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-after.png`;
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1.05, format: "png" });
  await fs.writeFile(path.join(previewDir, fileName), new Uint8Array(await preview.arrayBuffer()));
}

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(workbookPath);
console.log(`Saved ${workbookPath}`);
