import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { recordAudit } from "../utils/audit.js";
import { nextDocumentNumber } from "../utils/documentSequence.js";
import {
  decreaseSafeBalance,
  increaseSafeBalance,
  insertCustomerLedgerCredit,
  insertCustomerLedgerDebit,
} from "../utils/ledger.js";
import { toMinorUnits } from "../utils/money.js";
import { calculateWeightedAverageMinor } from "../utils/weightedAverage.js";

export type SalesInvoiceItemInput = {
  modelVariantId: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type CustomerPaymentAllocationInput = {
  salesInvoiceId: string;
  allocatedAmount: number;
};

type PreparedSalesItem = {
  modelVariantId: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  notes: string | null;
};

function prepareSalesItems(
  db: Database.Database,
  items: SalesInvoiceItemInput[],
): PreparedSalesItem[] {
  if (items.length === 0) {
    throw new Error("At least one invoice item is required");
  }

  return items.map((item) => {
    const variant = db
      .prepare("SELECT id FROM model_variants WHERE id = ? AND is_active = 1")
      .get(item.modelVariantId);

    if (!variant) {
      throw new Error(`Model variant not found: ${item.modelVariantId}`);
    }

    if (item.quantity <= 0) {
      throw new Error("Item quantity must be greater than zero");
    }
    if (!Number.isInteger(item.quantity)) {
      throw new Error("Finished stock quantity must be an integer");
    }

    const unitPriceMinor = toMinorUnits(item.unitPrice);
    const totalMinor = Math.round(item.quantity * unitPriceMinor);

    return {
      modelVariantId: item.modelVariantId,
      quantity: item.quantity,
      unitPriceMinor,
      totalMinor,
      notes: item.notes ?? null,
    };
  });
}

export function createSalesInvoice(
  db: Database.Database,
  input: {
    customerId: string;
    invoiceDate: string;
    dueDate?: string | null;
    discountAmount?: number;
    notes?: string | null;
    items: SalesInvoiceItemInput[];
    createdBy?: string;
  },
): { id: string; invoiceNumber: string; totalMinor: number } {
  const customer = db
    .prepare("SELECT id FROM customers WHERE id = ? AND is_active = 1")
    .get(input.customerId);
  if (!customer) {
    throw new Error("Customer not found");
  }

  const preparedItems = prepareSalesItems(db, input.items);
  const subtotalMinor = preparedItems.reduce(
    (sum, item) => sum + item.totalMinor,
    0,
  );
  const discountMinor = input.discountAmount
    ? toMinorUnits(input.discountAmount)
    : 0;

  if (discountMinor > subtotalMinor) {
    throw new Error("Discount cannot exceed invoice subtotal");
  }

  const invoiceId = randomUUID();
  let invoiceNumber = "";
  const totalMinor = subtotalMinor - discountMinor;

  const runInvoice = db.transaction(() => {
    invoiceNumber = nextDocumentNumber(db, "sales_invoice");
    db.prepare(
      `
      INSERT INTO sales_invoices (
        id, invoice_number, customer_id, invoice_date, due_date, status,
        subtotal_minor, discount_minor, total_minor, paid_minor, remaining_minor,
        notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, ?, ?)
    `,
    ).run(
      invoiceId,
      invoiceNumber,
      input.customerId,
      input.invoiceDate,
      input.dueDate ?? null,
      subtotalMinor,
      discountMinor,
      totalMinor,
      totalMinor,
      input.notes ?? null,
      input.createdBy ?? null,
    );

    const insertItem = db.prepare(`
      INSERT INTO sales_invoice_items (
        id, sales_invoice_id, model_variant_id, quantity, unit_price_minor,
        total_minor, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of preparedItems) {
      insertItem.run(
        randomUUID(),
        invoiceId,
        item.modelVariantId,
        item.quantity,
        item.unitPriceMinor,
        item.totalMinor,
        item.notes,
      );
    }

    recordAudit(db, {
      userId: input.createdBy,
      action: "create_sales_invoice",
      entityType: "sales_invoice",
      entityId: invoiceId,
      after: { invoiceNumber, totalMinor, status: "draft" },
    });
  });

  runInvoice();
  return { id: invoiceId, invoiceNumber, totalMinor };
}

export function updateSalesInvoice(
  db: Database.Database,
  input: {
    salesInvoiceId: string;
    customerId: string;
    invoiceDate: string;
    dueDate?: string | null;
    discountAmount?: number;
    notes?: string | null;
    items: SalesInvoiceItemInput[];
  },
): { id: string; totalMinor: number } {
  const invoice = db
    .prepare("SELECT id, status FROM sales_invoices WHERE id = ?")
    .get(input.salesInvoiceId) as { id: string; status: string } | undefined;

  if (!invoice) {
    throw new Error("Sales invoice not found");
  }

  if (invoice.status !== "draft") {
    throw new Error("Only draft invoices can be updated");
  }

  const customer = db
    .prepare("SELECT id FROM customers WHERE id = ? AND is_active = 1")
    .get(input.customerId);
  if (!customer) {
    throw new Error("Customer not found");
  }

  const preparedItems = prepareSalesItems(db, input.items);
  const subtotalMinor = preparedItems.reduce(
    (sum, item) => sum + item.totalMinor,
    0,
  );
  const discountMinor = input.discountAmount
    ? toMinorUnits(input.discountAmount)
    : 0;

  if (discountMinor > subtotalMinor) {
    throw new Error("Discount cannot exceed invoice subtotal");
  }

  const totalMinor = subtotalMinor - discountMinor;

  const runUpdate = db.transaction(() => {
    db.prepare(
      `
      UPDATE sales_invoices
      SET customer_id = ?,
          invoice_date = ?,
          due_date = ?,
          subtotal_minor = ?,
          discount_minor = ?,
          total_minor = ?,
          remaining_minor = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(
      input.customerId,
      input.invoiceDate,
      input.dueDate ?? null,
      subtotalMinor,
      discountMinor,
      totalMinor,
      totalMinor,
      input.notes ?? null,
      input.salesInvoiceId,
    );

    db.prepare(
      "DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?",
    ).run(input.salesInvoiceId);

    const insertItem = db.prepare(`
      INSERT INTO sales_invoice_items (
        id, sales_invoice_id, model_variant_id, quantity, unit_price_minor,
        total_minor, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of preparedItems) {
      insertItem.run(
        randomUUID(),
        input.salesInvoiceId,
        item.modelVariantId,
        item.quantity,
        item.unitPriceMinor,
        item.totalMinor,
        item.notes,
      );
    }

    db.prepare(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, after_json) VALUES (?, 'update_sales_invoice', 'sales_invoice', ?, ?)`,
    ).run(
      randomUUID(),
      input.salesInvoiceId,
      JSON.stringify({ totalMinor, customerId: input.customerId }),
    );
  });

  runUpdate();
  return { id: input.salesInvoiceId, totalMinor };
}

export function confirmSalesInvoice(
  db: Database.Database,
  input: {
    salesInvoiceId: string;
    confirmedBy?: string;
  },
): {
  id: string;
  status: string;
  costOfGoodsMinor: number;
  grossProfitMinor: number;
} {
  const invoice = db
    .prepare(
      `
      SELECT id, invoice_number AS invoiceNumber, customer_id AS customerId,
             invoice_date AS invoiceDate, status, total_minor AS totalMinor
      FROM sales_invoices
      WHERE id = ?
    `,
    )
    .get(input.salesInvoiceId) as
    | {
        id: string;
        invoiceNumber: string;
        customerId: string;
        invoiceDate: string;
        status: string;
        totalMinor: number;
      }
    | undefined;

  if (!invoice) {
    throw new Error("Sales invoice not found");
  }

  if (invoice.status !== "draft") {
    throw new Error("Only draft invoices can be confirmed");
  }

  const items = db
    .prepare(
      `
      SELECT id, model_variant_id AS modelVariantId, quantity
      FROM sales_invoice_items
      WHERE sales_invoice_id = ?
    `,
    )
    .all(input.salesInvoiceId) as Array<{
    id: string;
    modelVariantId: string;
    quantity: number;
  }>;

  if (items.length === 0) {
    throw new Error("At least one invoice item is required");
  }

  const runConfirm = db.transaction(() => {
    let costOfGoodsMinor = 0;

    for (const item of items) {
      const variant = db
        .prepare(
          `
          SELECT current_quantity AS currentQuantity,
                 current_average_cost_minor AS currentAverageCostMinor
          FROM model_variants
          WHERE id = ?
        `,
        )
        .get(item.modelVariantId) as
        | { currentQuantity: number; currentAverageCostMinor: number }
        | undefined;

      if (!variant) {
        throw new Error("Model variant not found");
      }

      if (variant.currentQuantity < item.quantity) {
        throw new Error(
          `Insufficient finished stock for variant ${item.modelVariantId}`,
        );
      }

      const unitCostMinor = variant.currentAverageCostMinor;
      const totalCostMinor = Math.round(item.quantity * unitCostMinor);
      const newQuantity = variant.currentQuantity - item.quantity;
      costOfGoodsMinor += totalCostMinor;

      db.prepare(
        `
        UPDATE model_variants
        SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(newQuantity, item.modelVariantId);

      db.prepare(
        `
        UPDATE sales_invoice_items
        SET unit_cost_minor = ?, total_cost_minor = ?
        WHERE id = ?
      `,
      ).run(unitCostMinor, totalCostMinor, item.id);

      db.prepare(
        `
        INSERT INTO finished_stock_movements (
          id, model_variant_id, movement_date, movement_type, source_type, source_id,
          quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
          description, created_by
        )
        VALUES (?, ?, ?, 'sale', 'sales_invoice', ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        randomUUID(),
        item.modelVariantId,
        invoice.invoiceDate,
        invoice.id,
        -item.quantity,
        unitCostMinor,
        totalCostMinor,
        newQuantity,
        `Sales invoice ${invoice.invoiceNumber}`,
        input.confirmedBy ?? null,
      );
    }

    const grossProfitMinor = invoice.totalMinor - costOfGoodsMinor;

    db.prepare(
      `
      UPDATE sales_invoices
      SET status = 'confirmed',
          cost_of_goods_minor = ?,
          gross_profit_minor = ?,
          confirmed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(costOfGoodsMinor, grossProfitMinor, invoice.id);

    insertCustomerLedgerDebit(db, {
      customerId: invoice.customerId,
      entryDate: invoice.invoiceDate,
      sourceType: "sales_invoice",
      sourceId: invoice.id,
      description: `Sales invoice ${invoice.invoiceNumber}`,
      debitMinor: invoice.totalMinor,
      createdBy: input.confirmedBy,
    });

    recordAudit(db, {
      userId: input.confirmedBy,
      action: "confirm_sales_invoice",
      entityType: "sales_invoice",
      entityId: invoice.id,
      before: { status: "draft" },
      after: { status: "confirmed", costOfGoodsMinor, grossProfitMinor },
    });

    return { costOfGoodsMinor, grossProfitMinor };
  });

  const result = runConfirm();
  return { id: invoice.id, status: "confirmed", ...result };
}

export function cancelSalesInvoice(
  db: Database.Database,
  input: {
    salesInvoiceId: string;
    cancelledBy?: string;
  },
): { id: string; status: string } {
  const invoice = db
    .prepare(
      `
      SELECT id, invoice_number AS invoiceNumber, customer_id AS customerId,
             invoice_date AS invoiceDate, status, total_minor AS totalMinor,
             paid_minor AS paidMinor
      FROM sales_invoices
      WHERE id = ?
    `,
    )
    .get(input.salesInvoiceId) as
    | {
        id: string;
        invoiceNumber: string;
        customerId: string;
        invoiceDate: string;
        status: string;
        totalMinor: number;
        paidMinor: number;
      }
    | undefined;

  if (!invoice) {
    throw new Error("Sales invoice not found");
  }

  if (invoice.status === "cancelled") {
    throw new Error("Invoice is already cancelled");
  }

  if (invoice.paidMinor > 0) {
    throw new Error(
      "Paid invoices cannot be cancelled before reversing payments",
    );
  }

  const items = db
    .prepare(
      `
      SELECT id, model_variant_id AS modelVariantId, quantity,
             unit_cost_minor AS unitCostMinor, total_cost_minor AS totalCostMinor
      FROM sales_invoice_items
      WHERE sales_invoice_id = ?
    `,
    )
    .all(input.salesInvoiceId) as Array<{
    id: string;
    modelVariantId: string;
    quantity: number;
    unitCostMinor: number;
    totalCostMinor: number;
  }>;

  const runCancel = db.transaction(() => {
    if (invoice.status === "confirmed") {
      for (const item of items) {
        const variant = db
          .prepare(
            `
            SELECT current_quantity AS currentQuantity,
                   current_average_cost_minor AS currentAverageCostMinor
            FROM model_variants
            WHERE id = ?
          `,
          )
          .get(item.modelVariantId) as
          | { currentQuantity: number; currentAverageCostMinor: number }
          | undefined;

        if (!variant) {
          throw new Error("Model variant not found");
        }

        const newQuantity = variant.currentQuantity + item.quantity;
        const newAverageCostMinor = calculateWeightedAverageMinor(
          variant.currentQuantity,
          variant.currentAverageCostMinor,
          item.quantity,
          item.unitCostMinor,
        );

        db.prepare(
          `
          UPDATE model_variants
          SET current_quantity = ?,
              current_average_cost_minor = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(newQuantity, newAverageCostMinor, item.modelVariantId);

        db.prepare(
          `
          INSERT INTO finished_stock_movements (
            id, model_variant_id, movement_date, movement_type, source_type, source_id,
            quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
            description, created_by
          )
          VALUES (?, ?, ?, 'reversal', 'sales_invoice_cancel', ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          randomUUID(),
          item.modelVariantId,
          invoice.invoiceDate,
          invoice.id,
          item.quantity,
          item.unitCostMinor,
          item.totalCostMinor,
          newQuantity,
          `Cancel sales invoice ${invoice.invoiceNumber}`,
          input.cancelledBy ?? null,
        );
      }

      insertCustomerLedgerCredit(db, {
        customerId: invoice.customerId,
        entryDate: invoice.invoiceDate,
        sourceType: "sales_invoice_cancel",
        sourceId: invoice.id,
        description: `Cancel sales invoice ${invoice.invoiceNumber}`,
        creditMinor: invoice.totalMinor,
        createdBy: input.cancelledBy,
      });
    }

    db.prepare(
      `
      UPDATE sales_invoices
      SET status = 'cancelled',
          remaining_minor = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(invoice.id);

    recordAudit(db, {
      userId: input.cancelledBy,
      action: "cancel_sales_invoice",
      entityType: "sales_invoice",
      entityId: invoice.id,
      before: { status: invoice.status, paidMinor: invoice.paidMinor },
      after: { status: "cancelled" },
    });
  });

  runCancel();
  return { id: invoice.id, status: "cancelled" };
}

export function createCustomerPaymentInternal(
  db: Database.Database,
  input: {
    customerId: string;
    paymentDate: string;
    amountMinor: number;
    paymentMethodId?: string | null;
    safeId: string;
    notes?: string | null;
    createdBy?: string;
    allocations?: Array<{
      salesInvoiceId: string;
      allocatedAmountMinor: number;
    }>;
  },
): { id: string; paymentNumber: string } {
  const customer = db
    .prepare("SELECT id FROM customers WHERE id = ?")
    .get(input.customerId);
  if (!customer) {
    throw new Error("Customer not found");
  }

  const safe = db
    .prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1")
    .get(input.safeId);
  if (!safe) {
    throw new Error("Safe not found");
  }

  if (input.paymentMethodId) {
    const method = db
      .prepare("SELECT id FROM payment_methods WHERE id = ? AND is_active = 1")
      .get(input.paymentMethodId);
    if (!method) {
      throw new Error("Payment method not found");
    }
  }

  const allocations = input.allocations ?? [];
  const allocatedTotal = allocations.reduce(
    (sum, row) => sum + row.allocatedAmountMinor,
    0,
  );

  if (allocatedTotal > input.amountMinor) {
    throw new Error("Allocated amount exceeds payment amount");
  }

  for (const allocation of allocations) {
    const invoice = db
      .prepare(
        `
        SELECT id, customer_id AS customerId, status, remaining_minor AS remainingMinor
        FROM sales_invoices
        WHERE id = ?
      `,
      )
      .get(allocation.salesInvoiceId) as
      | {
          id: string;
          customerId: string;
          status: string;
          remainingMinor: number;
        }
      | undefined;

    if (!invoice) {
      throw new Error("Sales invoice not found for allocation");
    }

    if (invoice.customerId !== input.customerId) {
      throw new Error("Allocation invoice belongs to another customer");
    }

    if (invoice.status !== "confirmed") {
      throw new Error("Only confirmed invoices can receive payments");
    }

    if (allocation.allocatedAmountMinor > invoice.remainingMinor) {
      throw new Error("Allocation exceeds invoice remaining balance");
    }
  }

  const paymentId = randomUUID();
  const paymentNumber = nextDocumentNumber(db, "customer_payment");
  const unallocatedAmountMinor = input.amountMinor - allocatedTotal;

  increaseSafeBalance(db, {
    safeId: input.safeId,
    transactionDate: input.paymentDate,
    amountMinor: input.amountMinor,
    sourceType: "customer_payment",
    sourceId: paymentId,
    paymentMethodId: input.paymentMethodId,
    description: `Customer payment ${paymentNumber}`,
    createdBy: input.createdBy,
  });

  db.prepare(
    `
    INSERT INTO customer_payments (
      id, payment_number, customer_id, payment_date, amount_minor,
      payment_method_id, safe_id, unallocated_amount_minor, notes, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    paymentId,
    paymentNumber,
    input.customerId,
    input.paymentDate,
    input.amountMinor,
    input.paymentMethodId ?? null,
    input.safeId,
    unallocatedAmountMinor,
    input.notes ?? null,
    input.createdBy ?? null,
  );

  for (const allocation of allocations) {
    db.prepare(
      `
      INSERT INTO customer_payment_allocations (
        id, payment_id, sales_invoice_id, allocated_amount_minor
      )
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      randomUUID(),
      paymentId,
      allocation.salesInvoiceId,
      allocation.allocatedAmountMinor,
    );

    db.prepare(
      `
      UPDATE sales_invoices
      SET paid_minor = paid_minor + ?,
          remaining_minor = remaining_minor - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(
      allocation.allocatedAmountMinor,
      allocation.allocatedAmountMinor,
      allocation.salesInvoiceId,
    );
  }

  insertCustomerLedgerCredit(db, {
    customerId: input.customerId,
    entryDate: input.paymentDate,
    sourceType: "customer_payment",
    sourceId: paymentId,
    description: `Customer payment ${paymentNumber}`,
    creditMinor: input.amountMinor,
    createdBy: input.createdBy,
  });

  recordAudit(db, {
    userId: input.createdBy,
    action: "create_customer_payment",
    entityType: "customer_payment",
    entityId: paymentId,
    after: {
      paymentNumber,
      amountMinor: input.amountMinor,
      customerId: input.customerId,
    },
  });

  return { id: paymentId, paymentNumber };
}

export function createCustomerPayment(
  db: Database.Database,
  input: {
    customerId: string;
    paymentDate: string;
    amount: number;
    paymentMethodId?: string | null;
    safeId: string;
    notes?: string | null;
    createdBy?: string;
    allocations?: CustomerPaymentAllocationInput[];
  },
): { id: string; paymentNumber: string } {
  const amountMinor = toMinorUnits(input.amount);
  const allocations = (input.allocations ?? []).map((row) => ({
    salesInvoiceId: row.salesInvoiceId,
    allocatedAmountMinor: toMinorUnits(row.allocatedAmount),
  }));

  const runPayment = db.transaction(() =>
    createCustomerPaymentInternal(db, {
      customerId: input.customerId,
      paymentDate: input.paymentDate,
      amountMinor,
      paymentMethodId: input.paymentMethodId,
      safeId: input.safeId,
      notes: input.notes,
      createdBy: input.createdBy,
      allocations,
    }),
  );

  return runPayment();
}

export function reverseCustomerPayment(
  db: Database.Database,
  input: {
    customerPaymentId: string;
    reversalDate: string;
    notes?: string | null;
    createdBy?: string;
  },
): { id: string; status: string } {
  const payment = db
    .prepare(
      `
      SELECT id, payment_number AS paymentNumber, customer_id AS customerId,
             payment_date AS paymentDate, amount_minor AS amountMinor,
             payment_method_id AS paymentMethodId, safe_id AS safeId,
             status
      FROM customer_payments
      WHERE id = ?
    `,
    )
    .get(input.customerPaymentId) as
    | {
        id: string;
        paymentNumber: string;
        customerId: string;
        paymentDate: string;
        amountMinor: number;
        paymentMethodId: string | null;
        safeId: string;
        status: string;
      }
    | undefined;

  if (!payment) {
    throw new Error("Customer payment not found");
  }

  if (payment.status === "reversed") {
    throw new Error("Customer payment is already reversed");
  }

  const allocations = db
    .prepare(
      `
      SELECT sales_invoice_id AS salesInvoiceId,
             allocated_amount_minor AS allocatedAmountMinor
      FROM customer_payment_allocations
      WHERE payment_id = ?
    `,
    )
    .all(payment.id) as Array<{
    salesInvoiceId: string;
    allocatedAmountMinor: number;
  }>;

  const runReversal = db.transaction(() => {
    decreaseSafeBalance(db, {
      safeId: payment.safeId,
      transactionDate: input.reversalDate,
      amountMinor: payment.amountMinor,
      transactionType: "adjustment",
      sourceType: "customer_payment_reversal",
      sourceId: payment.id,
      paymentMethodId: payment.paymentMethodId,
      description: `Reverse customer payment ${payment.paymentNumber}`,
      createdBy: input.createdBy,
    });

    for (const allocation of allocations) {
      db.prepare(
        `
        UPDATE sales_invoices
        SET paid_minor = paid_minor - ?,
            remaining_minor = remaining_minor + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(
        allocation.allocatedAmountMinor,
        allocation.allocatedAmountMinor,
        allocation.salesInvoiceId,
      );
    }

    db.prepare(
      `
      UPDATE customer_payments
      SET status = 'reversed',
          reversed_at = CURRENT_TIMESTAMP,
          reversal_notes = ?
      WHERE id = ?
    `,
    ).run(input.notes ?? null, payment.id);

    insertCustomerLedgerDebit(db, {
      customerId: payment.customerId,
      entryDate: input.reversalDate,
      sourceType: "customer_payment_reversal",
      sourceId: payment.id,
      description: `Reverse customer payment ${payment.paymentNumber}`,
      debitMinor: payment.amountMinor,
      createdBy: input.createdBy,
    });

    recordAudit(db, {
      userId: input.createdBy,
      action: "reverse_customer_payment",
      entityType: "customer_payment",
      entityId: payment.id,
      before: { status: payment.status, amountMinor: payment.amountMinor },
      after: { status: "reversed", reversalDate: input.reversalDate },
    });
  });

  runReversal();
  return { id: payment.id, status: "reversed" };
}
