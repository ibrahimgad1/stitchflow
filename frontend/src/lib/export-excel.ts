import { utils, writeFile } from "xlsx";

type ExcelCell = string | number | boolean | null | undefined;

export function exportRowsToExcel(
  fileName: string,
  sheetName: string,
  rows: Record<string, ExcelCell>[]
): void {
  const worksheet = utils.json_to_sheet(rows);

  // Column widths: based on header length + content length, min 12, max 40
  if (rows.length > 0 && rows[0]) {
    const keys = Object.keys(rows[0]);
    const cols = keys.map((k) => {
      const headerLen = k.length;
      let maxLen = headerLen;
      for (const row of rows) {
        const val = String(row[k] ?? "");
        if (val.length > maxLen) maxLen = val.length;
      }
      const wch = Math.min(Math.max(maxLen + 5, 12), 40);
      // Ensure at least header width + 5
      const minWch = Math.max(k.length + 5, 12);
      return { wch: Math.max(wch, minWch) };
    });
    (worksheet as unknown as Record<string, unknown>)["!cols"] = cols;
  } else if (rows.length === 0) {
    (worksheet as unknown as Record<string, unknown>)["!cols"] = [];
  }

  const workbook = utils.book_new();

  // RTL handling: if lang is ar / dir rtl, set workbook view RTL so Excel opens right-to-left
  try {
    const isRtl =
      typeof document !== "undefined" &&
      (document.documentElement.dir === "rtl" ||
        (typeof localStorage !== "undefined" && localStorage.getItem("app.language") === "ar"));
    if (isRtl) {
      const wb = workbook as unknown as Record<string, unknown>;
      if (!wb["Workbook"]) wb["Workbook"] = {};
      const workbookMeta = wb["Workbook"] as Record<string, unknown>;
      workbookMeta["Views"] = [{ RTL: true }];
      // Also set legacy Views for compatibility
      (wb as Record<string, unknown>)["Views"] = [{ RTL: true }];
    }
  } catch {
    // ignore storage access errors
  }

  utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export function moneyMinorToMajor(minor: number | null | undefined): number {
  return (minor ?? 0) / 100;
}
