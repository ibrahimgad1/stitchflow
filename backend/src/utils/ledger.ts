import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export function getSupplierBalanceMinor(db: Database.Database, supplierId: string): number {
  const latest = db
    .prepare(`
      SELECT balance_after_minor AS balanceAfterMinor
      FROM supplier_ledger_entries
      WHERE supplier_id = ?
      ORDER BY entry_date DESC, created_at DESC, rowid DESC
      LIMIT 1
    `)
    .get(supplierId) as { balanceAfterMinor: number } | undefined;

  return latest?.balanceAfterMinor ?? 0;
}

export function getCustomerBalanceMinor(db: Database.Database, customerId: string): number {
  const latest = db
    .prepare(`
      SELECT balance_after_minor AS balanceAfterMinor
      FROM customer_ledger_entries
      WHERE customer_id = ?
      ORDER BY entry_date DESC, created_at DESC, rowid DESC
      LIMIT 1
    `)
    .get(customerId) as { balanceAfterMinor: number } | undefined;

  return latest?.balanceAfterMinor ?? 0;
}

function getMaxCustomerEntryDate(db: Database.Database, customerId: string): string | null {
  const row = db
    .prepare(`SELECT MAX(entry_date) as maxDate FROM customer_ledger_entries WHERE customer_id=?`)
    .get(customerId) as { maxDate: string | null } | undefined;
  return row?.maxDate ?? null;
}
function getMaxSupplierEntryDate(db: Database.Database, supplierId: string): string | null {
  const row = db
    .prepare(`SELECT MAX(entry_date) as maxDate FROM supplier_ledger_entries WHERE supplier_id=?`)
    .get(supplierId) as { maxDate: string | null } | undefined;
  return row?.maxDate ?? null;
}

export function insertCustomerLedgerDebit(
  db: Database.Database,
  input: {
    customerId: string;
    entryDate: string;
    sourceType: string;
    sourceId: string;
    description: string;
    debitMinor: number;
    createdBy?: string;
  }
): void {
  const maxDate = getMaxCustomerEntryDate(db, input.customerId);
  if (maxDate && input.entryDate < maxDate) {
    throw new Error("Backdated ledger entries are not allowed");
  }
  const previousBalance = getCustomerBalanceMinor(db, input.customerId);

  db.prepare(`
    INSERT INTO customer_ledger_entries (
      id, customer_id, entry_date, source_type, source_id, description,
      debit_minor, credit_minor, balance_after_minor, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    randomUUID(),
    input.customerId,
    input.entryDate,
    input.sourceType,
    input.sourceId,
    input.description,
    input.debitMinor,
    previousBalance + input.debitMinor,
    input.createdBy ?? null
  );
}

export function insertCustomerLedgerCredit(
  db: Database.Database,
  input: {
    customerId: string;
    entryDate: string;
    sourceType: string;
    sourceId: string;
    description: string;
    creditMinor: number;
    createdBy?: string;
  }
): void {
  const maxDate = getMaxCustomerEntryDate(db, input.customerId);
  if (maxDate && input.entryDate < maxDate) {
    throw new Error("Backdated ledger entries are not allowed");
  }
  const previousBalance = getCustomerBalanceMinor(db, input.customerId);

  db.prepare(`
    INSERT INTO customer_ledger_entries (
      id, customer_id, entry_date, source_type, source_id, description,
      debit_minor, credit_minor, balance_after_minor, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    randomUUID(),
    input.customerId,
    input.entryDate,
    input.sourceType,
    input.sourceId,
    input.description,
    input.creditMinor,
    previousBalance - input.creditMinor,
    input.createdBy ?? null
  );
}

export function insertSupplierLedgerCredit(
  db: Database.Database,
  input: {
    supplierId: string;
    entryDate: string;
    sourceType: string;
    sourceId: string;
    description: string;
    creditMinor: number;
    createdBy?: string;
  }
): void {
  const maxDate = getMaxSupplierEntryDate(db, input.supplierId);
  if (maxDate && input.entryDate < maxDate) {
    throw new Error("Backdated ledger entries are not allowed");
  }
  const previousBalance = getSupplierBalanceMinor(db, input.supplierId);

  db.prepare(`
    INSERT INTO supplier_ledger_entries (
      id, supplier_id, entry_date, source_type, source_id, description,
      debit_minor, credit_minor, balance_after_minor, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    randomUUID(),
    input.supplierId,
    input.entryDate,
    input.sourceType,
    input.sourceId,
    input.description,
    input.creditMinor,
    previousBalance + input.creditMinor,
    input.createdBy ?? null
  );
}

export function insertSupplierLedgerDebit(
  db: Database.Database,
  input: {
    supplierId: string;
    entryDate: string;
    sourceType: string;
    sourceId: string;
    description: string;
    debitMinor: number;
    createdBy?: string;
  }
): void {
  const maxDate = getMaxSupplierEntryDate(db, input.supplierId);
  if (maxDate && input.entryDate < maxDate) {
    throw new Error("Backdated ledger entries are not allowed");
  }
  const previousBalance = getSupplierBalanceMinor(db, input.supplierId);

  db.prepare(`
    INSERT INTO supplier_ledger_entries (
      id, supplier_id, entry_date, source_type, source_id, description,
      debit_minor, credit_minor, balance_after_minor, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    randomUUID(),
    input.supplierId,
    input.entryDate,
    input.sourceType,
    input.sourceId,
    input.description,
    input.debitMinor,
    previousBalance - input.debitMinor,
    input.createdBy ?? null
  );
}

export function getSafeBalanceMinor(db: Database.Database, safeId: string): number {
  const safe = db
    .prepare("SELECT current_balance_minor AS currentBalanceMinor FROM safes WHERE id = ?")
    .get(safeId) as { currentBalanceMinor: number } | undefined;

  if (!safe) {
    throw new Error("Safe not found");
  }

  return safe.currentBalanceMinor;
}

export function decreaseSafeBalance(
  db: Database.Database,
  input: {
    safeId: string;
    transactionDate: string;
    amountMinor: number;
    transactionType?: string;
    sourceType: string;
    sourceId: string;
    paymentMethodId?: string | null;
    description: string;
    createdBy?: string;
  }
): void {
  const currentBalance = getSafeBalanceMinor(db, input.safeId);

  if (currentBalance < input.amountMinor) {
    throw new Error("Insufficient safe balance");
  }

  const newBalance = currentBalance - input.amountMinor;

  db.prepare(`
    UPDATE safes
    SET current_balance_minor = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newBalance, input.safeId);

  db.prepare(`
    INSERT INTO safe_transactions (
      id, safe_id, transaction_date, transaction_type, source_type, source_id,
      direction, amount_minor, balance_after_minor, payment_method_id, description, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, 'out', ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.safeId,
    input.transactionDate,
    input.transactionType ?? "supplier_payment",
    input.sourceType,
    input.sourceId,
    input.amountMinor,
    newBalance,
    input.paymentMethodId ?? null,
    input.description,
    input.createdBy ?? null
  );
}

export function increaseSafeBalance(
  db: Database.Database,
  input: {
    safeId: string;
    transactionDate: string;
    amountMinor: number;
    transactionType?: string;
    sourceType: string;
    sourceId: string;
    paymentMethodId?: string | null;
    description: string;
    createdBy?: string;
  }
): void {
  const currentBalance = getSafeBalanceMinor(db, input.safeId);
  const newBalance = currentBalance + input.amountMinor;

  db.prepare(`
    UPDATE safes
    SET current_balance_minor = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newBalance, input.safeId);

  db.prepare(`
    INSERT INTO safe_transactions (
      id, safe_id, transaction_date, transaction_type, source_type, source_id,
      direction, amount_minor, balance_after_minor, payment_method_id, description, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, 'in', ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.safeId,
    input.transactionDate,
    input.transactionType ?? "customer_payment",
    input.sourceType,
    input.sourceId,
    input.amountMinor,
    newBalance,
    input.paymentMethodId ?? null,
    input.description,
    input.createdBy ?? null
  );
}
