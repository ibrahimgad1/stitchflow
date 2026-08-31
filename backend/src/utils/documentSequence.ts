import type Database from "better-sqlite3";

export function nextDocumentNumber(db: Database.Database, documentType: string): string {
  const row = db
    .prepare(`
      SELECT prefix, next_number AS nextNumber, padding
      FROM document_sequences
      WHERE document_type = ?
    `)
    .get(documentType) as { prefix: string; nextNumber: number; padding: number } | undefined;

  if (!row) {
    throw new Error(`Document sequence not found: ${documentType}`);
  }

  const formatted = `${row.prefix}${String(row.nextNumber).padStart(row.padding, "0")}`;

  db.prepare(`
    UPDATE document_sequences
    SET next_number = next_number + 1, updated_at = CURRENT_TIMESTAMP
    WHERE document_type = ?
  `).run(documentType);

  return formatted;
}
