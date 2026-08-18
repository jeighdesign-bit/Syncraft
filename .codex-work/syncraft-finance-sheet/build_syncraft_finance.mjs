import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "../../outputs/019ffa4e-9f0f-70e1-bdc5-9f81cf5a8c7f";
const outputPath = `${outputDir}/Syncraft_Fal_Reserve_Tracker.xlsx`;

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const tracker = workbook.worksheets.add("Payment Tracker");
const assumptions = workbook.worksheets.add("Assumptions");
const checks = workbook.worksheets.add("Checks");
const sources = workbook.worksheets.add("Sources");

const COLORS = {
  ink: "#101828",
  navy: "#172B4D",
  green: "#9BE15D",
  greenDark: "#397A1F",
  paleGreen: "#EAF8DE",
  amber: "#FFF0C2",
  amberDark: "#A15C00",
  red: "#FDE2E2",
  redDark: "#B42318",
  blue: "#E8F1FF",
  inputBlue: "#0000FF",
  gray: "#667085",
  pale: "#F7F9FC",
  border: "#D0D5DD",
  white: "#FFFFFF",
};

const moneyFmt = '"₱"#,##0.00;[Red]("₱"#,##0.00);-';
const moneyWholeFmt = '"₱"#,##0;[Red]("₱"#,##0);-';
const usdFmt = '"$"#,##0.00;[Red]("$"#,##0.00);-';
const countFmt = '#,##0;[Red](#,##0);-';
const decimalFmt = '0.00';
const pctFmt = '0.0%';

function titleBand(sheet, range, title, subtitle = null) {
  sheet.getRange(range).merge();
  const anchor = range.split(":")[0];
  sheet.getRange(anchor).values = [[title]];
  sheet.getRange(range).format = {
    fill: COLORS.navy,
    font: { bold: true, color: COLORS.white, size: 18 },
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.rowHeight = 32;
  if (subtitle) {
    const row = Number(anchor.match(/\d+/)[0]) + 1;
    const startCol = anchor.match(/[A-Z]+/)[0];
    const endCol = range.split(":")[1].match(/[A-Z]+/)[0];
    const subRange = `${startCol}${row}:${endCol}${row}`;
    sheet.getRange(subRange).merge();
    sheet.getRange(`${startCol}${row}`).values = [[subtitle]];
    sheet.getRange(subRange).format = {
      fill: "#23395D",
      font: { color: "#DDE7F5", size: 10 },
      verticalAlignment: "center",
      wrapText: true,
    };
    sheet.getRange(subRange).format.rowHeight = 26;
  }
}

function sectionHeader(sheet, range, text) {
  sheet.getRange(range).merge();
  const anchor = range.split(":")[0];
  sheet.getRange(anchor).values = [[text]];
  sheet.getRange(range).format = {
    fill: COLORS.navy,
    font: { bold: true, color: COLORS.white, size: 11 },
    verticalAlignment: "center",
  };
  sheet.getRange(range).format.rowHeight = 22;
}

function styleInput(range) {
  range.format = {
    fill: "#FFFBEA",
    font: { color: COLORS.inputBlue },
    borders: { preset: "outside", style: "thin", color: "#E5C07B" },
  };
}

function styleHeader(range) {
  range.format = {
    fill: "#E9EEF6",
    font: { bold: true, color: COLORS.ink },
    verticalAlignment: "center",
    wrapText: true,
    borders: { bottom: { style: "medium", color: COLORS.navy } },
  };
}

// ---------------- Assumptions ----------------
assumptions.showGridLines = false;
titleBand(
  assumptions,
  "A1:F1",
  "Syncraft Fal Reserve — Assumptions",
  "Blue text / yellow cells are editable. Formula cells update the entire workbook automatically."
);

sectionHeader(assumptions, "A4:F4", "CORE COST & RESERVE INPUTS");
assumptions.getRange("A5:C14").values = [
  ["Input", "Value", "Notes"],
  ["As-of date", new Date("2026-08-13T00:00:00+08:00"), "Update whenever balances are refreshed"],
  ["USD / PHP working rate", 62, "Conservative working rate; editable"],
  ["Nano Banana Pro cost / successful image (USD)", 0.15, "Fal official price"],
  ["Credits charged per standard job", 12, "Syncraft billing unit"],
  ["Safety buffer", 0.2, "Exchange-rate and cost volatility"],
  ["Other provider / retry uplift", 0.13, "Allowance for ESRGAN, retries and other Fal endpoints"],
  ["Recommended reserve per credit (PHP)", null, "Calculated funding rate for every new credit sold"],
  ["Current unused user credits", 9608, "Live snapshot; update from Admin dashboard"],
  ["Current Fal wallet balance (USD)", 20, "Enter the actual Fal balance"],
];
assumptions.getRange("B12").formulas = [["=B7*B8/B9*(1+B10)*(1+B11)"]];
assumptions.getRange("D5:F14").values = [
  ["Calculated output", "Value", "Meaning"],
  ["Current Fal wallet (PHP)", null, "USD balance converted to PHP"],
  ["Required Fal reserve (PHP)", null, "Funds required for all unused credits"],
  ["Funding gap (PHP)", null, "Amount still needed in the locked reserve"],
  ["12-credit jobs outstanding", null, "Approximate future standard jobs owed"],
  ["Baseline Fal liability (USD)", null, "Nano Banana only, before buffers"],
  ["7-day logged Nano Banana operations", 377, "Refresh from Syncraft audit"],
  ["Estimated daily Nano Banana spend (USD)", null, "Lower-bound daily spend"],
  ["Estimated Fal wallet runway (days)", null, "Days before current wallet runs out"],
  ["Reorder alert threshold (USD)", null, "Seven days of lower-bound spend"],
];
assumptions.getRange("E6:E14").formulas = [
  ["=B14*B7"],
  ["=B13*B12"],
  ["=MAX(E7-E6,0)"],
  ["=B13/B9"],
  ["=E9*B8"],
  ["=377"],
  ["=E11/7*B8"],
  ["=IF(E12=0,0,B14/E12)"],
  ["=E12*7"],
];

styleHeader(assumptions.getRange("A5:C5"));
styleHeader(assumptions.getRange("D5:F5"));
styleInput(assumptions.getRange("B6:B11"));
styleInput(assumptions.getRange("B13:B14"));
styleInput(assumptions.getRange("E11"));
assumptions.getRange("B12").format = { fill: COLORS.paleGreen, font: { bold: true, color: COLORS.greenDark } };
assumptions.getRange("E6:E14").format.font = { color: "#008000" };
assumptions.getRange("B6").format.numberFormat = "yyyy-mm-dd";
assumptions.getRange("B7").format.numberFormat = decimalFmt;
assumptions.getRange("B8").format.numberFormat = usdFmt;
assumptions.getRange("B9").format.numberFormat = countFmt;
assumptions.getRange("B10:B11").format.numberFormat = pctFmt;
assumptions.getRange("B12").format.numberFormat = moneyFmt;
assumptions.getRange("B13").format.numberFormat = countFmt;
assumptions.getRange("B14").format.numberFormat = usdFmt;
assumptions.getRange("E6:E8").format.numberFormat = moneyFmt;
assumptions.getRange("E9").format.numberFormat = decimalFmt;
assumptions.getRange("E10:E14").format.numberFormat = usdFmt;
assumptions.getRange("E11").format.numberFormat = countFmt;
assumptions.getRange("E13").format.numberFormat = decimalFmt;

sectionHeader(assumptions, "A17:F17", "PLAN ALLOCATION MATRIX");
assumptions.getRange("A18:H23").values = [
  ["Plan", "Credits", "Selling Price", "Fal Reserve", "Fees / Refunds", "Operations", "Safe Profit", "Profit Margin"],
  ["Tingi", 24, 50, null, null, null, null, null],
  ["Basic", 48, 100, null, null, null, null, null],
  ["Starter", 156, 299, null, null, null, null, null],
  ["Pro", 300, 499, null, null, null, null, null],
  ["Elite", 540, 799, null, null, null, null, null],
];
assumptions.getRange("D19").formulas = [["=B19*$B$12"]];
assumptions.getRange("D19:D23").fillDown();
assumptions.getRange("E19").formulas = [["=C19*10%"]];
assumptions.getRange("E19:E23").fillDown();
assumptions.getRange("F19").formulas = [["=C19*5%"]];
assumptions.getRange("F19:F23").fillDown();
assumptions.getRange("G19").formulas = [["=C19-SUM(D19:F19)"]];
assumptions.getRange("G19:G23").fillDown();
assumptions.getRange("H19").formulas = [["=IF(C19=0,0,G19/C19)"]];
assumptions.getRange("H19:H23").fillDown();
styleHeader(assumptions.getRange("A18:H18"));
assumptions.getRange("A19:C23").format.font = { color: COLORS.inputBlue };
assumptions.getRange("B19:B23").format.numberFormat = countFmt;
assumptions.getRange("C19:G23").format.numberFormat = moneyFmt;
assumptions.getRange("H19:H23").format.numberFormat = pctFmt;
assumptions.getRange("G19:G23").conditionalFormats.add("cellIs", {
  operator: "lessThan",
  formula: 0,
  format: { fill: COLORS.red, font: { color: COLORS.redDark, bold: true } },
});
assumptions.freezePanes.freezeRows(4);
assumptions.getRange("A1:H23").format.font.name = "Aptos";
assumptions.getRange("A:A").format.columnWidth = 37;
assumptions.getRange("B:B").format.columnWidth = 16;
assumptions.getRange("C:C").format.columnWidth = 38;
assumptions.getRange("D:D").format.columnWidth = 39;
assumptions.getRange("E:E").format.columnWidth = 17;
assumptions.getRange("F:F").format.columnWidth = 40;
assumptions.getRange("G:H").format.columnWidth = 17;

// ---------------- Payment Tracker ----------------
tracker.showGridLines = false;
titleBand(
  tracker,
  "A1:N1",
  "Payment Tracker",
  "Enter only the blue columns. Every sale automatically reserves provider cost before calculating safe profit."
);
tracker.getRange("A4:N4").values = [[
  "Date", "Reference", "Channel", "Plan", "Standard Price", "Adjustment", "Gross Payment",
  "Credits Granted", "Fal Reserve", "Fees / Refunds", "Operations", "Safe Profit", "Profit Withdrawn?", "Notes"
]];
styleHeader(tracker.getRange("A4:N4"));

const trackerRows = 500;
const firstDataRow = 5;
const lastDataRow = firstDataRow + trackerRows - 1;
tracker.getRange(`A${firstDataRow}:N${lastDataRow}`).format = {
  borders: { insideHorizontal: { style: "thin", color: "#EAECF0" } },
  font: { size: 10 },
};
styleInput(tracker.getRange(`A${firstDataRow}:D${lastDataRow}`));
styleInput(tracker.getRange(`F${firstDataRow}:F${lastDataRow}`));
styleInput(tracker.getRange(`M${firstDataRow}:N${lastDataRow}`));

tracker.getRange(`E${firstDataRow}`).formulas = [[`=IFERROR(VLOOKUP(D${firstDataRow},'Assumptions'!$A$19:$C$23,3,FALSE),0)`]];
tracker.getRange(`E${firstDataRow}:E${lastDataRow}`).fillDown();
tracker.getRange(`G${firstDataRow}`).formulas = [[`=IF(D${firstDataRow}="",0,E${firstDataRow}+F${firstDataRow})`]];
tracker.getRange(`G${firstDataRow}:G${lastDataRow}`).fillDown();
tracker.getRange(`H${firstDataRow}`).formulas = [[`=IFERROR(VLOOKUP(D${firstDataRow},'Assumptions'!$A$19:$C$23,2,FALSE),0)`]];
tracker.getRange(`H${firstDataRow}:H${lastDataRow}`).fillDown();
tracker.getRange(`I${firstDataRow}`).formulas = [[`=IF(D${firstDataRow}="",0,H${firstDataRow}*'Assumptions'!$B$12)`]];
tracker.getRange(`I${firstDataRow}:I${lastDataRow}`).fillDown();
tracker.getRange(`J${firstDataRow}`).formulas = [[`=IF(D${firstDataRow}="",0,G${firstDataRow}*10%)`]];
tracker.getRange(`J${firstDataRow}:J${lastDataRow}`).fillDown();
tracker.getRange(`K${firstDataRow}`).formulas = [[`=IF(D${firstDataRow}="",0,G${firstDataRow}*5%)`]];
tracker.getRange(`K${firstDataRow}:K${lastDataRow}`).fillDown();
tracker.getRange(`L${firstDataRow}`).formulas = [[`=IF(D${firstDataRow}="",0,G${firstDataRow}-SUM(I${firstDataRow}:K${firstDataRow}))`]];
tracker.getRange(`L${firstDataRow}:L${lastDataRow}`).fillDown();

tracker.getRange(`A${firstDataRow}:A${lastDataRow}`).format.numberFormat = "yyyy-mm-dd";
tracker.getRange(`E${firstDataRow}:G${lastDataRow}`).format.numberFormat = moneyFmt;
tracker.getRange(`H${firstDataRow}:H${lastDataRow}`).format.numberFormat = countFmt;
tracker.getRange(`I${firstDataRow}:L${lastDataRow}`).format.numberFormat = moneyFmt;
tracker.getRange(`D${firstDataRow}:D${lastDataRow}`).dataValidation = {
  rule: { type: "list", values: ["Tingi", "Basic", "Starter", "Pro", "Elite"] },
};
tracker.getRange(`C${firstDataRow}:C${lastDataRow}`).dataValidation = {
  rule: { type: "list", values: ["GCash", "Dodo", "Bank", "Cash", "Other"] },
};
tracker.getRange(`M${firstDataRow}:M${lastDataRow}`).dataValidation = {
  rule: { type: "list", values: ["No", "Yes"] },
};
tracker.getRange(`L${firstDataRow}:L${lastDataRow}`).conditionalFormats.add("cellIs", {
  operator: "lessThan",
  formula: 0,
  format: { fill: COLORS.red, font: { color: COLORS.redDark, bold: true } },
});
tracker.getRange(`M${firstDataRow}:M${lastDataRow}`).conditionalFormats.add("containsText", {
  text: "Yes",
  format: { fill: COLORS.paleGreen, font: { color: COLORS.greenDark } },
});
tracker.tables.add(`A4:N${lastDataRow}`, true, "PaymentTrackerTable");
tracker.freezePanes.freezeRows(4);
tracker.getRange("A:N").format.font.name = "Aptos";
const trackerWidths = [13, 18, 13, 12, 16, 14, 16, 16, 16, 16, 14, 16, 18, 30];
trackerWidths.forEach((width, index) => tracker.getRangeByIndexes(0, index, lastDataRow, 1).format.columnWidth = width);

// ---------------- Dashboard ----------------
dashboard.showGridLines = false;
titleBand(
  dashboard,
  "A1:H1",
  "Syncraft Cash & Fal Reserve Dashboard",
  "Purpose: protect customer credits first, then show only the profit that is safe to withdraw."
);
dashboard.getRange("A4:B7").values = [
  ["Outstanding user credits", null],
  ["Required Fal reserve", null],
  ["Current Fal wallet", null],
  ["Funding gap", null],
];
dashboard.getRange("B4:B7").formulas = [
  ["='Assumptions'!B13"],
  ["='Assumptions'!E7"],
  ["='Assumptions'!E6"],
  ["='Assumptions'!E8"],
];
dashboard.getRange("D4:E7").values = [
  ["Recorded gross sales", null],
  ["Fal reserve generated", null],
  ["Safe profit generated", null],
  ["Safe profit not withdrawn", null],
];
dashboard.getRange("E4:E7").formulas = [
  [`=SUM('Payment Tracker'!$G$5:$G$${lastDataRow})`],
  [`=SUM('Payment Tracker'!$I$5:$I$${lastDataRow})`],
  [`=SUM('Payment Tracker'!$L$5:$L$${lastDataRow})`],
  [`=SUMIF('Payment Tracker'!$M$5:$M$${lastDataRow},"<>Yes",'Payment Tracker'!$L$5:$L$${lastDataRow})`],
];
dashboard.getRange("G4:H7").values = [
  ["Fal wallet runway", null],
  ["Reorder alert", null],
  ["Reserve status", null],
  ["Recommended action", null],
];
dashboard.getRange("H4:H7").formulas = [
  ["='Assumptions'!E13"],
  ["='Assumptions'!E14"],
  ["=IF(B7=0,\"FUNDED\",\"NEEDS FUNDING\")"],
  ["=IF(B7=0,\"Use normal per-sale split\",\"Send 80% of new sales to Fal reserve\")"],
];

for (const range of ["A4:B7", "D4:E7", "G4:H7"]) {
  dashboard.getRange(range).format = {
    fill: COLORS.pale,
    borders: { preset: "outside", style: "thin", color: COLORS.border },
    font: { size: 11 },
    verticalAlignment: "center",
  };
}
dashboard.getRange("A4:A7").format.font = { bold: true, color: COLORS.gray };
dashboard.getRange("D4:D7").format.font = { bold: true, color: COLORS.gray };
dashboard.getRange("G4:G7").format.font = { bold: true, color: COLORS.gray };
dashboard.getRange("B4:B7").format.font = { bold: true, color: COLORS.ink, size: 14 };
dashboard.getRange("E4:E7").format.font = { bold: true, color: COLORS.ink, size: 14 };
dashboard.getRange("H4:H7").format.font = { bold: true, color: COLORS.ink, size: 12 };
dashboard.getRange("B4").format.numberFormat = countFmt;
dashboard.getRange("B5:B7").format.numberFormat = moneyWholeFmt;
dashboard.getRange("E4:E7").format.numberFormat = moneyWholeFmt;
dashboard.getRange("H4").format.numberFormat = '0.0 "days"';
dashboard.getRange("H5").format.numberFormat = usdFmt;
dashboard.getRange("H6").conditionalFormats.add("containsText", {
  text: "FUNDED",
  format: { fill: COLORS.paleGreen, font: { color: COLORS.greenDark, bold: true } },
});
dashboard.getRange("H6").conditionalFormats.add("containsText", {
  text: "NEEDS FUNDING",
  format: { fill: COLORS.red, font: { color: COLORS.redDark, bold: true } },
});

sectionHeader(dashboard, "A10:H10", "HOW TO USE THIS EVERY DAY");
dashboard.getRange("A11:H15").merge(true);
dashboard.getRange("A11:A15").values = [
  ["1. Open Payment Tracker whenever a customer pays."],
  ["2. Enter Date, Reference, Channel, Plan and any price Adjustment."],
  ["3. Immediately move the Fal Reserve amount to a separate locked wallet/account."],
  ["4. Withdraw only the Safe Profit amount, preferably once per week."],
  ["5. Update current unused credits and Fal balance in Assumptions."],
];
dashboard.getRange("A11:H15").format = {
  fill: COLORS.white,
  font: { color: COLORS.ink, size: 11 },
  verticalAlignment: "center",
  borders: { bottom: { style: "thin", color: "#EAECF0" } },
};

sectionHeader(dashboard, "A18:H18", "SAFE ALLOCATION PER PLAN");
dashboard.getRange("A19:H24").values = [
  ["Plan", "Payment", null, "Fal Reserve", "Fees / Refunds", null, "Operations", "Safe Profit"],
  ["Tingi", null, null, null, null, null, null, null],
  ["Basic", null, null, null, null, null, null, null],
  ["Starter", null, null, null, null, null, null, null],
  ["Pro", null, null, null, null, null, null, null],
  ["Elite", null, null, null, null, null, null, null],
];
dashboard.getRange("B20:H20").formulas = [[
  "='Assumptions'!C19", null, "='Assumptions'!D19", "='Assumptions'!E19", null, "='Assumptions'!F19", "='Assumptions'!G19"
]];
dashboard.getRange("B20:H24").fillDown();
styleHeader(dashboard.getRange("A19:H19"));
dashboard.getRange("B20:H24").format.numberFormat = moneyFmt;
dashboard.getRange("H20:H24").format = { fill: COLORS.paleGreen, font: { bold: true, color: COLORS.greenDark }, numberFormat: moneyFmt };
dashboard.getRange("A1:H24").format.font.name = "Aptos";
dashboard.getRange("A:A").format.columnWidth = 27;
dashboard.getRange("B:B").format.columnWidth = 17;
dashboard.getRange("C:C").format.columnWidth = 3;
dashboard.getRange("D:D").format.columnWidth = 27;
dashboard.getRange("E:E").format.columnWidth = 17;
dashboard.getRange("F:F").format.columnWidth = 3;
dashboard.getRange("G:G").format.columnWidth = 25;
dashboard.getRange("H:H").format.columnWidth = 34;
dashboard.getRange("4:7").format.rowHeight = 27;
dashboard.freezePanes.freezeRows(3);

// ---------------- Checks ----------------
checks.showGridLines = false;
titleBand(checks, "A1:G1", "Workbook Checks", "PASS means the formulas and allocation logic tie. Funding status is shown separately.");
checks.getRange("A4:G4").values = [["Check", "Actual", "Expected", "Difference", "Tolerance", "Status", "Where to fix / Notes"]];
styleHeader(checks.getRange("A4:G4"));
checks.getRange("A5:A10").values = [
  ["Plan allocations equal selling price"],
  ["No plan has negative safe profit"],
  ["Reserve rate is positive"],
  ["Unused credits input is non-negative"],
  ["Current Fal reserve is fully funded"],
  ["Payment rows have no negative safe profit"],
];
checks.getRange("B5:B10").formulas = [
  ["=MAX(ABS('Assumptions'!C19-SUM('Assumptions'!D19:G19)),ABS('Assumptions'!C20-SUM('Assumptions'!D20:G20)),ABS('Assumptions'!C21-SUM('Assumptions'!D21:G21)),ABS('Assumptions'!C22-SUM('Assumptions'!D22:G22)),ABS('Assumptions'!C23-SUM('Assumptions'!D23:G23)))"],
  ["=MIN('Assumptions'!G19:G23)"],
  ["='Assumptions'!B12"],
  ["='Assumptions'!B13"],
  ["='Assumptions'!E6"],
  [`=MIN('Payment Tracker'!L5:L${lastDataRow})`],
];
checks.getRange("C5:C10").values = [[0], [0], [0], [0], [null], [0]];
checks.getRange("C9").formulas = [["='Assumptions'!E7"]];
checks.getRange("D5:D10").formulas = [
  ["=B5-C5"],
  ["=MIN(B6,0)"],
  ["=MIN(B7,0)"],
  ["=MIN(B8,0)"],
  ["=B9-C9"],
  ["=MIN(B10,0)"],
];
checks.getRange("E5:E10").values = [[0.01], [0], [0], [0], [0], [0]];
checks.getRange("F5:F10").formulas = [
  ["=IF(ABS(D5)<=E5,\"PASS\",\"FAIL\")"],
  ["=IF(B6>=0,\"PASS\",\"FAIL\")"],
  ["=IF(B7>0,\"PASS\",\"FAIL\")"],
  ["=IF(B8>=0,\"PASS\",\"FAIL\")"],
  ["=IF(B9>=C9,\"FUNDED\",\"ACTION NEEDED\")"],
  ["=IF(B10>=0,\"PASS\",\"FAIL\")"],
];
checks.getRange("G5:G10").values = [
  ["Assumptions plan matrix"],
  ["Pricing or reserve assumptions"],
  ["Assumptions B7:B11"],
  ["Assumptions B13"],
  ["Fund the gap shown on Dashboard"],
  ["Review payment price adjustments"],
];
checks.getRange("A12:B12").values = [["MODEL LOGIC STATUS", null]];
checks.getRange("B12").formulas = [["=IF(COUNTIF(F5:F10,\"FAIL\")=0,\"PASS\",\"FAIL\")"]];
checks.getRange("A12:B12").format = {
  fill: COLORS.navy,
  font: { bold: true, color: COLORS.white, size: 12 },
};
checks.getRange("B5:E10").format.numberFormat = decimalFmt;
checks.getRange("F5:F12").conditionalFormats.add("containsText", { text: "PASS", format: { fill: COLORS.paleGreen, font: { color: COLORS.greenDark, bold: true } } });
checks.getRange("F5:F12").conditionalFormats.add("containsText", { text: "FAIL", format: { fill: COLORS.red, font: { color: COLORS.redDark, bold: true } } });
checks.getRange("F5:F12").conditionalFormats.add("containsText", { text: "ACTION NEEDED", format: { fill: COLORS.amber, font: { color: COLORS.amberDark, bold: true } } });
checks.getRange("A1:G12").format.font.name = "Aptos";
checks.getRange("A:A").format.columnWidth = 39;
checks.getRange("B:E").format.columnWidth = 15;
checks.getRange("F:F").format.columnWidth = 18;
checks.getRange("G:G").format.columnWidth = 36;
checks.freezePanes.freezeRows(4);

// ---------------- Sources ----------------
sources.showGridLines = false;
titleBand(sources, "A1:F1", "Sources & Method Notes", "Inputs can change. Update assumptions when Fal pricing or exchange rates change.");
sources.getRange("A4:F4").values = [["Item", "Value", "Units", "As-of", "Source URL", "Notes"]];
styleHeader(sources.getRange("A4:F4"));
sources.getRange("A5:F9").values = [
  ["Nano Banana Pro price", 0.15, "USD / successful image", new Date("2026-08-13T00:00:00+08:00"), "https://fal.ai/nano-banana-pro", "1K/2K standard output; verify periodically"],
  ["Fal billing method", null, "Prepaid / usage based", new Date("2026-08-13T00:00:00+08:00"), "https://fal.ai/docs/documentation/model-apis/pricing", "Fal charges successful outputs; model prices may change"],
  ["USD/PHP reference", 62, "PHP per USD working assumption", new Date("2026-08-13T00:00:00+08:00"), "https://www.bsp.gov.ph/statistics/external/day99_data.aspx", "Conservative rounded working rate; update manually"],
  ["Unused active credits", 9608, "Syncraft credits", new Date("2026-08-13T00:00:00+08:00"), "Syncraft live profiles audit", "Dynamic; refresh from Admin dashboard"],
  ["Seven-day Nano Banana operations", 377, "Logged operations", new Date("2026-08-13T00:00:00+08:00"), "Syncraft credit_logs audit", "Lower-bound because retries and unlogged calls may exist"],
];
sources.getRange("B5:B9").format.numberFormat = decimalFmt;
sources.getRange("D5:D9").format.numberFormat = "yyyy-mm-dd";
sources.getRange("A1:F9").format.font.name = "Aptos";
sources.getRange("A:A").format.columnWidth = 31;
sources.getRange("B:B").format.columnWidth = 18;
sources.getRange("C:C").format.columnWidth = 26;
sources.getRange("D:D").format.columnWidth = 14;
sources.getRange("E:E").format.columnWidth = 58;
sources.getRange("F:F").format.columnWidth = 48;
sources.getRange("E5:F9").format.wrapText = true;

// Source comments on key model assumptions.
workbook.comments.setSelf({ displayName: "User" });
workbook.comments.addThread({ cell: assumptions.getRange("B8") }, "Source: https://fal.ai/nano-banana-pro | As-of: 2026-08-13 | Fal official standard output price.");
workbook.comments.addThread({ cell: assumptions.getRange("B7") }, "Source: https://www.bsp.gov.ph/statistics/external/day99_data.aspx | Conservative rounded working assumption; update periodically.");
workbook.comments.addThread({ cell: assumptions.getRange("B13") }, "Source: Syncraft profiles audit | Dynamic balance; replace with latest Admin dashboard total.");

await fs.mkdir(outputDir, { recursive: true });

// Compact verification before export.
const dashboardInspect = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A1:H24",
  include: "values,formulas",
  tableMaxRows: 24,
  tableMaxCols: 8,
});
console.log("DASHBOARD_INSPECT");
console.log(dashboardInspect.ndjson);

const checksInspect = await workbook.inspect({
  kind: "table",
  range: "Checks!A4:G12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 7,
});
console.log("CHECKS_INSPECT");
console.log(checksInspect.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("FORMULA_ERRORS");
console.log(formulaErrors.ndjson);

for (const [sheetName, range, fileName] of [
  ["Dashboard", "A1:H24", "dashboard-preview.png"],
  ["Assumptions", "A1:H23", "assumptions-preview.png"],
  ["Payment Tracker", "A1:N18", "tracker-preview.png"],
  ["Checks", "A1:G12", "checks-preview.png"],
  ["Sources", "A1:F9", "sources-preview.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
