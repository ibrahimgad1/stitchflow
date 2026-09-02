import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { recordAudit } from "../utils/audit.js";
import { nextDocumentNumber } from "../utils/documentSequence.js";
import { decreaseSafeBalance, increaseSafeBalance } from "../utils/ledger.js";
import { toMinorUnits } from "../utils/money.js";

export function createExpense(
  db: Database.Database,
  input: {
    expenseDate: string;
    categoryId?: string | null;
    description: string;
    amount: number;
    paymentStatus: "paid" | "unpaid";
    paymentMethodId?: string | null;
    safeId?: string | null;
    overheadPeriodId?: string | null;
    notes?: string | null;
    createdBy?: string;
  },
): {
  id: string;
  expenseNumber: string;
  amountMinor: number;
  paymentStatus: string;
} {
  if (!input.description.trim()) {
    throw new Error("Expense description is required");
  }

  const amountMinor = toMinorUnits(input.amount);
  if (amountMinor <= 0) {
    throw new Error("Expense amount must be greater than zero");
  }

  if (input.paymentStatus === "paid" && !input.safeId) {
    throw new Error("Safe is required for paid expenses");
  }

  if (input.categoryId) {
    const category = db
      .prepare(
        "SELECT id, is_overhead AS isOverhead FROM expense_categories WHERE id = ? AND is_active = 1",
      )
      .get(input.categoryId) as { id: string; isOverhead: number } | undefined;
    if (!category) {
      throw new Error("Expense category not found");
    }
    if (input.overheadPeriodId && category.isOverhead !== 1) {
      throw new Error(
        "Only overhead categories can be linked to an overhead period",
      );
    }
  } else if (input.overheadPeriodId) {
    throw new Error("Overhead period requires an overhead category");
  }

  if (input.paymentMethodId) {
    const method = db
      .prepare("SELECT id FROM payment_methods WHERE id = ? AND is_active = 1")
      .get(input.paymentMethodId);
    if (!method) {
      throw new Error("Payment method not found");
    }
  }

  if (input.safeId) {
    const safe = db
      .prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1")
      .get(input.safeId);
    if (!safe) {
      throw new Error("Safe not found");
    }
  }

  if (input.overheadPeriodId) {
    const period = db
      .prepare("SELECT id, status FROM overhead_periods WHERE id = ?")
      .get(input.overheadPeriodId) as
      | { id: string; status: string }
      | undefined;
    if (!period) {
      throw new Error("Overhead period not found");
    }
    if (period.status === "closed") {
      throw new Error("Cannot add expense to a closed overhead period");
    }
  }

  const expenseId = randomUUID();
  let expenseNumber = "";

  const runExpense = db.transaction(() => {
    expenseNumber = nextDocumentNumber(db, "expense");
    db.prepare(
      `
      INSERT INTO expenses (
        id, expense_number, expense_date, category_id, description,
        amount_minor, payment_status, payment_method_id, safe_id,
        overhead_period_id, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      expenseId,
      expenseNumber,
      input.expenseDate,
      input.categoryId ?? null,
      input.description.trim(),
      amountMinor,
      input.paymentStatus,
      input.paymentMethodId ?? null,
      input.safeId ?? null,
      input.overheadPeriodId ?? null,
      input.notes ?? null,
      input.createdBy ?? null,
    );

    if (input.paymentStatus === "paid" && input.safeId) {
      decreaseSafeBalance(db, {
        safeId: input.safeId,
        transactionDate: input.expenseDate,
        amountMinor,
        transactionType: "expense_payment",
        sourceType: "expense",
        sourceId: expenseId,
        paymentMethodId: input.paymentMethodId,
        description: `Expense ${expenseNumber}`,
        createdBy: input.createdBy,
      });
    }

    if (input.overheadPeriodId) {
      db.prepare(
        `
        INSERT INTO overhead_entries (
          id, overhead_period_id, category_id, amount_minor, paid_from_safe_id,
          expense_id, entry_date, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        randomUUID(),
        input.overheadPeriodId,
        input.categoryId ?? null,
        amountMinor,
        input.paymentStatus === "paid" ? (input.safeId ?? null) : null,
        expenseId,
        input.expenseDate,
        input.notes ?? null,
      );
    }

    recordAudit(db, {
      userId: input.createdBy,
      action: "create_expense",
      entityType: "expense",
      entityId: expenseId,
      after: {
        expenseNumber,
        amountMinor,
        paymentStatus: input.paymentStatus,
        safeId: input.safeId ?? null,
      },
    });
  });

  runExpense();
  return {
    id: expenseId,
    expenseNumber,
    amountMinor,
    paymentStatus: input.paymentStatus,
  };
}

export function createSafeTransfer(
  db: Database.Database,
  input: {
    transferDate: string;
    fromSafeId: string;
    toSafeId: string;
    amount: number;
    notes?: string | null;
    createdBy?: string;
  },
): { id: string; transferNumber: string; amountMinor: number } {
  if (input.fromSafeId === input.toSafeId) {
    throw new Error("Transfer safes must be different");
  }

  const amountMinor = toMinorUnits(input.amount);
  if (amountMinor <= 0) {
    throw new Error("Transfer amount must be greater than zero");
  }

  const fromSafe = db
    .prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1")
    .get(input.fromSafeId);
  if (!fromSafe) {
    throw new Error("Source safe not found");
  }

  const toSafe = db
    .prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1")
    .get(input.toSafeId);
  if (!toSafe) {
    throw new Error("Destination safe not found");
  }

  const transferId = randomUUID();
  let transferNumber = "";

  const runTransfer = db.transaction(() => {
    transferNumber = nextDocumentNumber(db, "safe_transfer");
    db.prepare(
      `
      INSERT INTO safe_transfers (
        id, transfer_number, transfer_date, from_safe_id, to_safe_id,
        amount_minor, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      transferId,
      transferNumber,
      input.transferDate,
      input.fromSafeId,
      input.toSafeId,
      amountMinor,
      input.notes ?? null,
      input.createdBy ?? null,
    );

    decreaseSafeBalance(db, {
      safeId: input.fromSafeId,
      transactionDate: input.transferDate,
      amountMinor,
      transactionType: "transfer_out",
      sourceType: "safe_transfer",
      sourceId: transferId,
      description: `Safe transfer ${transferNumber}`,
      createdBy: input.createdBy,
    });

    increaseSafeBalance(db, {
      safeId: input.toSafeId,
      transactionDate: input.transferDate,
      amountMinor,
      transactionType: "transfer_in",
      sourceType: "safe_transfer",
      sourceId: transferId,
      description: `Safe transfer ${transferNumber}`,
      createdBy: input.createdBy,
    });

    recordAudit(db, {
      userId: input.createdBy,
      action: "create_safe_transfer",
      entityType: "safe_transfer",
      entityId: transferId,
      after: {
        transferNumber,
        fromSafeId: input.fromSafeId,
        toSafeId: input.toSafeId,
        amountMinor,
      },
    });
  });

  runTransfer();
  return { id: transferId, transferNumber, amountMinor };
}

export function adjustSafeBalance(
  db: Database.Database,
  input: {
    safeId: string;
    adjustmentDate: string;
    newBalance: number;
    reason: string;
    createdBy?: string;
  },
): { previousBalanceMinor: number; newBalanceMinor: number } {
  if (!input.reason.trim()) {
    throw new Error("Adjustment reason is required");
  }

  const newBalanceMinor = toMinorUnits(input.newBalance);
  if (newBalanceMinor < 0) {
    throw new Error("Safe balance cannot be negative");
  }

  const safe = db
    .prepare(
      "SELECT current_balance_minor AS currentBalanceMinor FROM safes WHERE id = ?",
    )
    .get(input.safeId) as { currentBalanceMinor: number } | undefined;

  if (!safe) {
    throw new Error("Safe not found");
  }

  const deltaMinor = newBalanceMinor - safe.currentBalanceMinor;
  if (deltaMinor === 0) {
    throw new Error("New balance matches current balance");
  }

  const runAdjustment = db.transaction(() => {
    db.prepare(
      `
      UPDATE safes
      SET current_balance_minor = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(newBalanceMinor, input.safeId);

    db.prepare(
      `
      INSERT INTO safe_transactions (
        id, safe_id, transaction_date, transaction_type, source_type, source_id,
        direction, amount_minor, balance_after_minor, description, created_by
      )
      VALUES (?, ?, ?, 'adjustment', 'safe_adjustment', ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      randomUUID(),
      input.safeId,
      input.adjustmentDate,
      input.safeId,
      deltaMinor > 0 ? "in" : "out",
      Math.abs(deltaMinor),
      newBalanceMinor,
      input.reason.trim(),
      input.createdBy ?? null,
    );

    db.prepare(
      `
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'adjust_safe_balance', 'safe', ?, ?, ?)
    `,
    ).run(
      randomUUID(),
      input.createdBy ?? null,
      input.safeId,
      JSON.stringify({ balanceMinor: safe.currentBalanceMinor }),
      JSON.stringify({
        balanceMinor: newBalanceMinor,
        reason: input.reason.trim(),
      }),
    );
  });

  runAdjustment();
  return { previousBalanceMinor: safe.currentBalanceMinor, newBalanceMinor };
}

export function createCapitalTransaction(
  db: Database.Database,
  input: {
    transactionDate: string;
    transactionType: "capital_injection" | "owner_withdrawal";
    ownerId?: string | null;
    safeId: string;
    amount: number;
    notes?: string | null;
    createdBy?: string;
  },
): { id: string; amountMinor: number; transactionType: string } {
  const amountMinor = toMinorUnits(input.amount);
  if (amountMinor <= 0) {
    throw new Error("Capital transaction amount must be greater than zero");
  }

  if (input.ownerId) {
    const owner = db
      .prepare("SELECT id FROM owners WHERE id = ? AND is_active = 1")
      .get(input.ownerId);
    if (!owner) {
      throw new Error("Owner not found");
    }
  }

  const safe = db
    .prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1")
    .get(input.safeId);
  if (!safe) {
    throw new Error("Safe not found");
  }

  const transactionId = randomUUID();
  const description =
    input.transactionType === "capital_injection"
      ? "Capital injection"
      : "Owner withdrawal";

  const runTransaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO capital_transactions (
        id, transaction_date, transaction_type, owner_id, safe_id,
        amount_minor, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      transactionId,
      input.transactionDate,
      input.transactionType,
      input.ownerId ?? null,
      input.safeId,
      amountMinor,
      input.notes ?? null,
      input.createdBy ?? null,
    );

    if (input.transactionType === "capital_injection") {
      increaseSafeBalance(db, {
        safeId: input.safeId,
        transactionDate: input.transactionDate,
        amountMinor,
        transactionType: "capital_injection",
        sourceType: "capital_transaction",
        sourceId: transactionId,
        description,
        createdBy: input.createdBy,
      });
    } else {
      decreaseSafeBalance(db, {
        safeId: input.safeId,
        transactionDate: input.transactionDate,
        amountMinor,
        transactionType: "owner_withdrawal",
        sourceType: "capital_transaction",
        sourceId: transactionId,
        description,
        createdBy: input.createdBy,
      });
    }

    recordAudit(db, {
      userId: input.createdBy,
      action:
        input.transactionType === "capital_injection"
          ? "create_capital_injection"
          : "create_owner_withdrawal",
      entityType: "capital_transaction",
      entityId: transactionId,
      after: {
        transactionType: input.transactionType,
        ownerId: input.ownerId ?? null,
        safeId: input.safeId,
        amountMinor,
      },
    });
  });

  runTransaction();
  return {
    id: transactionId,
    amountMinor,
    transactionType: input.transactionType,
  };
}
