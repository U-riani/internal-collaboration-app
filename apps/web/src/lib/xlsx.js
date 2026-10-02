const XLSX_VERSION = "0.18.5";
let xlsxLoader;

async function loadXlsx() {
  if (!xlsxLoader) {
    xlsxLoader = import(
      /* @vite-ignore */ `https://esm.sh/xlsx@${XLSX_VERSION}`
    ).then((module) =>
      module.default?.read && module.default?.write ? module.default : module,
    );
  }
  return xlsxLoader;
}

function baseName(filename = "Spreadsheet") {
  return filename.replace(/\.(xlsx|xlsm|xls)$/i, "") || "Spreadsheet";
}

function cleanSheetName(name, used) {
  const base = String(name || "Sheet")
    .replace(/[\\/?*\[\]:]/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
  let candidate = base;
  let number = 2;
  while (used.has(candidate.toLocaleLowerCase())) {
    const suffix = ` ${number}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    number += 1;
  }
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function guessCellType(value) {
  if (typeof value === "number") return "n";
  if (typeof value === "boolean") return "b";
  if (value instanceof Date) return "d";
  return "s";
}

function makeSheetId() {
  return crypto.randomUUID();
}

function numberFormatFromCell(cell) {
  return typeof cell?.z === "string" && cell.z ? { n: { pattern: cell.z } } : undefined;
}

export async function importExcelToUniverSnapshot(file, options = {}) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    cellDates: false,
  });

  const sheetOrder = [];
  const sheets = {};
  const usedNames = new Set();

  for (const originalName of workbook.SheetNames) {
    const source = workbook.Sheets[originalName];
    const sheetId = makeSheetId();
    const name = cleanSheetName(originalName, usedNames);
    const decoded = XLSX.utils.decode_range(source["!ref"] || "A1");
    const rowCount = Math.max(1000, decoded.e.r + 1);
    const columnCount = Math.max(20, decoded.e.c + 1);
    const cellData = {};

    for (const [address, cell] of Object.entries(source)) {
      if (address.startsWith("!")) continue;
      const position = XLSX.utils.decode_cell(address);
      const data = {};
      if (cell.v !== undefined) data.v = cell.v;
      if (cell.f) data.f = cell.f.startsWith("=") ? cell.f : `=${cell.f}`;
      const style = numberFormatFromCell(cell);
      if (style) data.s = style;
      cellData[position.r] ||= {};
      cellData[position.r][position.c] = data;
    }

    const mergeData = (source["!merges"] || []).map((range) => ({
      startRow: range.s.r,
      startColumn: range.s.c,
      endRow: range.e.r,
      endColumn: range.e.c,
    }));

    const rowData = {};
    for (const [index, row] of (source["!rows"] || []).entries()) {
      if (!row) continue;
      const data = {};
      if (Number.isFinite(row.hpx)) data.h = Math.max(1, Math.round(row.hpx));
      if (row.hidden) data.hd = 1;
      if (Object.keys(data).length) rowData[index] = data;
    }

    const columnData = {};
    for (const [index, column] of (source["!cols"] || []).entries()) {
      if (!column) continue;
      const data = {};
      if (Number.isFinite(column.wpx)) data.w = Math.max(1, Math.round(column.wpx));
      else if (Number.isFinite(column.wch)) data.w = Math.max(1, Math.round(column.wch * 8));
      if (column.hidden) data.hd = 1;
      if (Object.keys(data).length) columnData[index] = data;
    }

    sheetOrder.push(sheetId);
    sheets[sheetId] = {
      id: sheetId,
      name,
      tabColor: "",
      hidden: source["!hidden"] ? 1 : 0,
      rowCount,
      columnCount,
      zoomRatio: 1,
      freeze: { startRow: -1, startColumn: -1, ySplit: 0, xSplit: 0 },
      scrollTop: 0,
      scrollLeft: 0,
      defaultColumnWidth: 73,
      defaultRowHeight: 23,
      mergeData,
      cellData,
      rowData,
      columnData,
      showGridlines: 1,
      rowHeader: { width: 46, hidden: 0 },
      columnHeader: { height: 20, hidden: 0 },
      rightToLeft: 0,
    };
  }

  if (!sheetOrder.length) {
    const id = makeSheetId();
    sheetOrder.push(id);
    sheets[id] = {
      id,
      name: "Sheet1",
      rowCount: 1000,
      columnCount: 20,
      cellData: {},
      mergeData: [],
      rowData: {},
      columnData: {},
    };
  }

  return {
    id: crypto.randomUUID(),
    name: options.name || baseName(file.name),
    appVersion: "1.0.2",
    locale: "enUS",
    styles: {},
    sheetOrder,
    sheets,
  };
}

function resolveStyle(snapshot, cell) {
  if (!cell?.s) return null;
  if (typeof cell.s === "string") return snapshot.styles?.[cell.s] || null;
  return cell.s;
}

function collectExtent(sheet) {
  let maxRow = 0;
  let maxColumn = 0;
  let hasCell = false;
  for (const [rowKey, columns] of Object.entries(sheet.cellData || {})) {
    const row = Number(rowKey);
    for (const columnKey of Object.keys(columns || {})) {
      const column = Number(columnKey);
      if (!Number.isInteger(row) || !Number.isInteger(column)) continue;
      hasCell = true;
      maxRow = Math.max(maxRow, row);
      maxColumn = Math.max(maxColumn, column);
    }
  }
  for (const merge of sheet.mergeData || []) {
    maxRow = Math.max(maxRow, merge.endRow || 0);
    maxColumn = Math.max(maxColumn, merge.endColumn || 0);
  }
  return { maxRow, maxColumn, hasCell };
}

export async function exportUniverSnapshotToXlsx(snapshot, filename = "Spreadsheet") {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();

  for (const sheetId of snapshot.sheetOrder || []) {
    const source = snapshot.sheets?.[sheetId];
    if (!source) continue;
    const worksheet = {};
    const extent = collectExtent(source);

    for (const [rowKey, columns] of Object.entries(source.cellData || {})) {
      const row = Number(rowKey);
      for (const [columnKey, cell] of Object.entries(columns || {})) {
        const column = Number(columnKey);
        if (!Number.isInteger(row) || !Number.isInteger(column) || !cell) continue;
        const target = {};
        if (cell.v !== undefined && cell.v !== null) {
          target.v = cell.v;
          target.t = guessCellType(cell.v);
        }
        if (cell.f) {
          target.f = String(cell.f).replace(/^=/, "");
          if (!target.t) target.t = "n";
        }
        const style = resolveStyle(snapshot, cell);
        const pattern = style?.n?.pattern;
        if (pattern) target.z = pattern;
        worksheet[XLSX.utils.encode_cell({ r: row, c: column })] = target;
      }
    }

    worksheet["!merges"] = (source.mergeData || []).map((range) => ({
      s: { r: range.startRow, c: range.startColumn },
      e: { r: range.endRow, c: range.endColumn },
    }));

    const rowIndexes = Object.keys(source.rowData || {}).map(Number);
    if (rowIndexes.length) {
      const max = Math.max(...rowIndexes);
      worksheet["!rows"] = Array.from({ length: max + 1 }, (_, index) => {
        const row = source.rowData?.[index];
        if (!row) return undefined;
        return {
          ...(Number.isFinite(row.h) ? { hpx: row.h } : {}),
          ...(row.hd ? { hidden: true } : {}),
        };
      });
    }

    const columnIndexes = Object.keys(source.columnData || {}).map(Number);
    if (columnIndexes.length) {
      const max = Math.max(...columnIndexes);
      worksheet["!cols"] = Array.from({ length: max + 1 }, (_, index) => {
        const column = source.columnData?.[index];
        if (!column) return undefined;
        return {
          ...(Number.isFinite(column.w) ? { wpx: column.w } : {}),
          ...(column.hd ? { hidden: true } : {}),
        };
      });
    }

    worksheet["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: {
        r: extent.hasCell || (source.mergeData || []).length ? extent.maxRow : 0,
        c: extent.hasCell || (source.mergeData || []).length ? extent.maxColumn : 0,
      },
    });

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      cleanSheetName(source.name || "Sheet", usedNames),
    );
  }

  if (!workbook.SheetNames.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), "Sheet1");
  }

  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  });
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName(filename)}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
