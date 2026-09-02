/**
 * CSV Import/Export utilities for bulk operations
 */

export interface CSVParseResult<T> {
  valid: T[];
  errors: Array<{ row: number; error: string }>;
}

export interface ThresholdImportRow {
  id?: string;
  name?: string;
  safetyThreshold?: number;
}

export interface ThresholdUpdate {
  id: string;
  safetyThreshold: number;
  name?: string;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell.trim());
  return cells;
}

/**
 * Parse CSV content and extract threshold updates
 * Expected CSV columns: material_id, name (optional), safety_threshold
 */
export function parseThresholdCSV(
  csvContent: string,
): CSVParseResult<ThresholdUpdate> {
  const lines = csvContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      valid: [],
      errors: [
        { row: 1, error: "CSV must have header and at least one data row" },
      ],
    };
  }

  const valid: ThresholdUpdate[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  // Parse header
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());

  const idIndex = headers.findIndex((h) => h === "material_id" || h === "id");
  const nameIndex = headers.findIndex((h) => h === "name");
  const thresholdIndex = headers.findIndex(
    (h) => h === "safety_threshold" || h === "threshold",
  );

  if (idIndex === -1 || thresholdIndex === -1) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          error:
            "CSV must contain 'material_id' (or 'id') and 'safety_threshold' (or 'threshold') columns",
        },
      ],
    };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = i + 1;
    const cells = parseCsvLine(lines[i]);

    if (cells.length === 1 && cells[0] === "") continue; // Skip empty lines

    const id = cells[idIndex]?.trim();
    const name = nameIndex >= 0 ? cells[nameIndex]?.trim() : undefined;
    const thresholdStr = cells[thresholdIndex]?.trim();

    // Validate
    if (!id) {
      errors.push({ row, error: "material_id is required" });
      continue;
    }

    if (!thresholdStr) {
      errors.push({ row, error: "safety_threshold is required" });
      continue;
    }

    const threshold = Number(thresholdStr);
    if (isNaN(threshold) || threshold < 0) {
      errors.push({
        row,
        error: `safety_threshold must be a non-negative number, got "${thresholdStr}"`,
      });
      continue;
    }

    valid.push({
      id,
      safetyThreshold: threshold,
      name,
    });
  }

  return { valid, errors };
}

/**
 * Generate sample CSV content for threshold import
 */
export function generateSampleThresholdCSV(
  materials: Array<{ id: string; name: string; safetyThreshold?: number }>,
): string {
  const headers = ["material_id", "name", "safety_threshold"];
  const rows = [headers.join(",")];

  for (const material of materials) {
    const threshold = material.safetyThreshold ?? 0;
    rows.push(
      [material.id, material.name, threshold].map((v) => `"${v}"`).join(","),
    );
  }

  return rows.join("\n");
}
