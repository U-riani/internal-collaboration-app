import { describe, expect, it } from "vitest";
import { mergeSpreadsheetSnapshots } from "./spreadsheet-collaboration.js";

function workbook() {
  return {
    sheets: {
      sheet1: {
        rowCount: 1000,
        columnCount: 20,
        cellData: {
          0: {
            0: { v: 10 },
            1: { v: 20 },
          },
        },
      },
    },
  };
}

describe("mergeSpreadsheetSnapshots", () => {
  it("merges changes made to different cells", () => {
    const base = workbook();
    const remote = structuredClone(base);
    const local = structuredClone(base);
    remote.sheets.sheet1.cellData[0][0].v = 100;
    local.sheets.sheet1.cellData[0][1].v = 200;

    const result = mergeSpreadsheetSnapshots(base, remote, local);

    expect(result.conflicts).toHaveLength(0);
    expect(result.snapshot.sheets.sheet1.cellData[0][0].v).toBe(100);
    expect(result.snapshot.sheets.sheet1.cellData[0][1].v).toBe(200);
  });

  it("detects a real conflict when the same cell changes differently", () => {
    const base = workbook();
    const remote = structuredClone(base);
    const local = structuredClone(base);
    remote.sheets.sheet1.cellData[0][0].v = 100;
    local.sheets.sheet1.cellData[0][0].v = 500;

    const result = mergeSpreadsheetSnapshots(base, remote, local);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].label).toBe("A1");
    expect(result.snapshot.sheets.sheet1.cellData[0][0].v).toBe(500);
  });

  it("merges sibling cells added to the same previously empty row", () => {
    const base = { sheets: { sheet1: { cellData: {} } } };
    const remote = structuredClone(base);
    const local = structuredClone(base);
    remote.sheets.sheet1.cellData[2] = { 0: { v: "A" } };
    local.sheets.sheet1.cellData[2] = { 1: { v: "B" } };

    const result = mergeSpreadsheetSnapshots(base, remote, local);

    expect(result.conflicts).toHaveLength(0);
    expect(result.snapshot.sheets.sheet1.cellData[2][0].v).toBe("A");
    expect(result.snapshot.sheets.sheet1.cellData[2][1].v).toBe("B");
  });
});
