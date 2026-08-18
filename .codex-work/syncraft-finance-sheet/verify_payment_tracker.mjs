import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";

const workbookPath = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/Syncraft_Fal_Reserve_Tracker.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
console.log((await workbook.inspect({
  kind: "table",
  range: "Payment Tracker!A1:N8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 14,
  maxChars: 10000,
})).ndjson);
console.log((await workbook.inspect({
  kind: "table",
  range: "Sync State!A180:E195",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 5,
  maxChars: 8000,
})).ndjson);
const preview = await workbook.render({ sheetName: "Payment Tracker", range: "A1:N8", scale: 1.25, format: "png" });
await fs.writeFile("../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f/payment-tracker-latest-preview.png", new Uint8Array(await preview.arrayBuffer()));
