/**
 * Export tabular JSON array data into a downloadable CSV file.
 * Handles escaping of special characters, quotes, and commas.
 */
export function exportToCSV<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T; header: string }[]
): void {
  if (!rows || rows.length === 0) {
    console.warn("No data available to export.");
    return;
  }

  const keys = columns
    ? columns.map((col) => col.key)
    : (Object.keys(rows[0]) as (keyof T)[]);

  const headers = columns
    ? columns.map((col) => col.header)
    : (keys as string[]);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const csvRows: string[] = [];
  csvRows.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","));

  for (const row of rows) {
    const rowValues = keys.map((k) => formatValue(row[k]));
    csvRows.push(rowValues.join(","));
  }

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data array/object into a downloadable formatted JSON file.
 */
export function exportToJSON<T>(filename: string, data: T): void {
  if (!data) {
    console.warn("No data available to export.");
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".json") ? filename : `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}