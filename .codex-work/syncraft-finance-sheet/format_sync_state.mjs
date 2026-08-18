import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/Syncraft_Fal_Reserve_Tracker.xlsx";
const previewPath = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/sync-state-preview.png";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Sync State");
const used = sheet.getUsedRange();
const rowCount = used.values.length;

sheet.getRange(`B5:C${rowCount}`).format.numberFormat = "@";
sheet.getRange(`E5:E${rowCount}`).format.numberFormat = "yyyy-mm-dd hh:mm";

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Sync State",
  range: `A1:E${Math.min(rowCount, 18)}`,
  scale: 1.1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);
console.log(JSON.stringify({ workbookPath, rowCount }));
