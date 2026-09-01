export type ExportColumn<T> = {
  header: string;
  accessor: (item: T) => string | number | null | undefined;
};

/**
 * Exports tabular data to a CSV file encoded with UTF-8 BOM (\uFEFF)
 * to ensure that Arabic characters display correctly in Microsoft Excel on Windows.
 */
export function exportToCsv<T>(
  filename: string,
  columns: ExportColumn<T>[],
  data: T[]
): void {
  if (!data || data.length === 0) {
    alert("لا توجد بيانات متاحة للتصدير حالياً.");
    return;
  }

  const escapeCsvCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerRow = columns.map((col) => escapeCsvCell(col.header)).join(",");
  const dataRows = data.map((item) =>
    columns.map((col) => escapeCsvCell(col.accessor(item))).join(",")
  );

  const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanFilename = filename.endsWith(".csv")
    ? filename
    : `${filename}-${dateStr}.csv`;

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", cleanFilename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
