import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { recordAudit } from "../utils/audit.js";
import { nextDocumentNumber } from "../utils/documentSequence.js";
import {
  decreaseSafeBalance,
  insertSupplierLedgerCredit,
  insertSupplierLedgerDebit
} from "../utils/ledger.js";
import { toMinorUnits } from "../utils/money.js";
import { calculateWeightedAverageMinor } from "../utils/weightedAverage.js";

export type ReceivingItemInput = {
  materialId: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type AllocationInput = {
  materialReceivingId: string;
  allocatedAmount: number;
};

export function createMaterialReceiving(
  db: Database.Database,
  input: {
    supplierId: string;
    receivingDate: string;
    dueDate?: string | null;
    documentReference?: string | null;
    notes?: string | null;
    items: ReceivingItemInput[];
    paidAmount?: number;
    safeId?: string | null;
    paymentMethodId?: string | null;
    createdBy?: string;
  }
): {
  id: string;
  receivingNumber: string;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
} {
  if (input.items.length === 0) {
    throw new Error("At least one receiving item is required");
  }

  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(input.supplierId);
  if (!supplier) {
    throw new Error("Supplier not found");
  }

  const paidMinor = input.paidAmount ? toMinorUnits(input.paidAmount) : 0;

  if (paidMinor > 0 && !input.safeId) {
    throw new Error("Safe is required when paid amount is provided");
  }

  if (input.safeId) {
    const safe = db.prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1").get(input.safeId);
    if (!safe) {
      throw new Error("Safe not found");
    }
  }

  if (input.paymentMethodId) {
    const method = db
      .prepare("SELECT id FROM payment_methods WHERE id = ? AND is_active = 1")
      .get(input.paymentMethodId);
    if (!method) {
      throw new Error("Payment method not found");
    }
  }

  const seenMaterials = new Set<string>();
  const preparedItems = input.items.map((item) => {
    if (seenMaterials.has(item.materialId)) {
      throw new Error(`Duplicate material in receiving: ${item.materialId}`);
    }
    seenMaterials.add(item.materialId);
    const material = db
      .prepare(`
        SELECT id, current_quantity AS currentQuantity,
               weighted_average_cost_minor AS weightedAverageCostMinor
        FROM materials
        WHERE id = ? AND is_active = 1
      `)
      .get(item.materialId) as
      | { id: string; currentQuantity: number; weightedAverageCostMinor: number }
      | undefined;

    if (!material) {
      throw new Error(`Material not found: ${item.materialId}`);
    }

    const unitPriceMinor = toMinorUnits(item.unitPrice);
    const totalMinor = Math.round(item.quantity * unitPriceMinor);

    return {
      materialId: item.materialId,
      quantity: item.quantity,
      unitPriceMinor,
      totalMinor,
      notes: item.notes ?? null,
      currentQuantity: material.currentQuantity,
      weightedAverageCostMinor: material.weightedAverageCostMinor
    };
  });

  const totalMinor = preparedItems.reduce((sum, item) => sum + item.totalMinor, 0);

  if (paidMinor > totalMinor) {
    throw new Error("Paid amount cannot exceed receiving total");
  }

  const receivingId = randomUUID();
  const remainingMinor = totalMinor - paidMinor;

  let receivingNumber = "";
  const runReceiving = db.transaction(() => {
    receivingNumber = nextDocumentNumber(db, "material_receiving");
    db.prepare(`
      INSERT INTO material_receivings (
        id, receiving_number, supplier_id, receiving_date, due_date,
        document_reference, total_minor, paid_minor, remaining_minor,
        status, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
    `).run(
      receivingId,
      receivingNumber,
      input.supplierId,
      input.receivingDate,
      input.dueDate ?? null,
      input.documentReference ?? null,
      totalMinor,
      paidMinor,
      remainingMinor,
      input.notes ?? null,
      input.createdBy ?? null
    );

    for (const item of preparedItems) {
      const itemId = randomUUID();
      const newQuantity = item.currentQuantity + item.quantity;
      const newAverageMinor = calculateWeightedAverageMinor(
        item.currentQuantity,
        item.weightedAverageCostMinor,
        item.quantity,
        item.unitPriceMinor
      );

      db.prepare(`
        INSERT INTO material_receiving_items (
          id, receiving_id, material_id, quantity, unit_price_minor, total_minor, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        itemId,
        receivingId,
        item.materialId,
        item.quantity,
        item.unitPriceMinor,
        item.totalMinor,
        item.notes
      );

      db.prepare(`
        UPDATE materials
        SET current_quantity = ?, weighted_average_cost_minor = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newQuantity, newAverageMinor, item.materialId);

      db.prepare(`
        INSERT INTO material_stock_movements (
          id, material_id, movement_date, movement_type, source_type, source_id,
          quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
          description, created_by
        )
        VALUES (?, ?, ?, 'receiving', 'material_receiving', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        item.materialId,
        input.receivingDate,
        receivingId,
        item.quantity,
        item.unitPriceMinor,
        item.totalMinor,
        newQuantity,
        `Receiving ${receivingNumber}`,
        input.createdBy ?? null
      );
    }

    insertSupplierLedgerCredit(db, {
      supplierId: input.supplierId,
      entryDate: input.receivingDate,
      sourceType: "material_receiving",
      sourceId: receivingId,
      description: `Material receiving ${receivingNumber}`,
      creditMinor: totalMinor,
      createdBy: input.createdBy
    });

    if (paidMinor > 0 && input.safeId) {
      createSupplierPaymentInternal(db, {
        supplierId: input.supplierId,
        paymentDate: input.receivingDate,
        amountMinor: paidMinor,
        paymentMethodId: input.paymentMethodId ?? null,
        safeId: input.safeId,
        notes: `Payment with receiving ${receivingNumber}`,
        createdBy: input.createdBy,
        allocations: [{ materialReceivingId: receivingId, allocatedAmountMinor: paidMinor }]
      });
    }

    recordAudit(db, {
      userId: input.createdBy,
      action: "create_material_receiving",
      entityType: "material_receiving",
      entityId: receivingId,
      after: {
        receivingNumber,
        supplierId: input.supplierId,
        totalMinor,
        paidMinor,
        remainingMinor,
      },
    });
  });

  runReceiving();

  return {
    id: receivingId,
    receivingNumber,
    totalMinor,
    paidMinor,
    remainingMinor
  };
}

export function createSupplierPaymentInternal(
  db: Database.Database,
  input: {
    supplierId: string;
    paymentDate: string;
    amountMinor: number;
    paymentMethodId?: string | null;
    safeId: string;
    notes?: string | null;
    createdBy?: string;
    allocations?: Array<{ materialReceivingId: string; allocatedAmountMinor: number }>;
  }
): { id: string; paymentNumber: string } {
  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(input.supplierId);
  if (!supplier) {
    throw new Error("Supplier not found");
  }

  const safe = db.prepare("SELECT id FROM safes WHERE id = ? AND is_active = 1").get(input.safeId);
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
  const allocatedTotal = allocations.reduce((sum, row) => sum + row.allocatedAmountMinor, 0);

  if (allocatedTotal > input.amountMinor) {
    throw new Error("Allocated amount exceeds payment amount");
  }

  for (const allocation of allocations) {
    const receiving = db
      .prepare(`
        SELECT id, supplier_id AS supplierId, remaining_minor AS remainingMinor
        FROM material_receivings
        WHERE id = ?
      `)
      .get(allocation.materialReceivingId) as
      | { id: string; supplierId: string; remainingMinor: number }
      | undefined;

    if (!receiving) {
      throw new Error("Receiving not found for allocation");
    }

    if (receiving.supplierId !== input.supplierId) {
      throw new Error("Allocation receiving belongs to another supplier");
    }

    if (allocation.allocatedAmountMinor > receiving.remainingMinor) {
      throw new Error("Allocation exceeds receiving remaining balance");
    }
  }

  const paymentId = randomUUID();
  const paymentNumber = nextDocumentNumber(db, "supplier_payment");
  const unallocatedAmountMinor = input.amountMinor - allocatedTotal;

  decreaseSafeBalance(db, {
    safeId: input.safeId,
    transactionDate: input.paymentDate,
    amountMinor: input.amountMinor,
    sourceType: "supplier_payment",
    sourceId: paymentId,
    paymentMethodId: input.paymentMethodId,
    description: `Supplier payment ${paymentNumber}`,
    createdBy: input.createdBy
  });

  db.prepare(`
    INSERT INTO supplier_payments (
      id, payment_number, supplier_id, payment_date, amount_minor,
      payment_method_id, safe_id, unallocated_amount_minor, notes, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    paymentId,
    paymentNumber,
    input.supplierId,
    input.paymentDate,
    input.amountMinor,
    input.paymentMethodId ?? null,
    input.safeId,
    unallocatedAmountMinor,
    input.notes ?? null,
    input.createdBy ?? null
  );

  for (const allocation of allocations) {
    db.prepare(`
      INSERT INTO supplier_payment_allocations (
        id, payment_id, material_receiving_id, allocated_amount_minor
      )
      VALUES (?, ?, ?, ?)
    `).run(
      randomUUID(),
      paymentId,
      allocation.materialReceivingId,
      allocation.allocatedAmountMinor
    );

    db.prepare(`
      UPDATE material_receivings
      SET paid_minor = paid_minor + ?,
          remaining_minor = remaining_minor - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      allocation.allocatedAmountMinor,
      allocation.allocatedAmountMinor,
      allocation.materialReceivingId
    );
  }

  insertSupplierLedgerDebit(db, {
    supplierId: input.supplierId,
    entryDate: input.paymentDate,
    sourceType: "supplier_payment",
    sourceId: paymentId,
    description: `Supplier payment ${paymentNumber}`,
    debitMinor: input.amountMinor,
    createdBy: input.createdBy
  });

  recordAudit(db, {
    userId: input.createdBy,
    action: "create_supplier_payment",
    entityType: "supplier_payment",
    entityId: paymentId,
    after: {
      paymentNumber,
      supplierId: input.supplierId,
      amountMinor: input.amountMinor,
      safeId: input.safeId,
    },
  });

  return { id: paymentId, paymentNumber };
}

export function createSupplierPayment(
  db: Database.Database,
  input: {
    supplierId: string;
    paymentDate: string;
    amount: number;
    paymentMethodId?: string | null;
    safeId: string;
    notes?: string | null;
    createdBy?: string;
    allocations?: AllocationInput[];
  }
): { id: string; paymentNumber: string } {
  const amountMinor = toMinorUnits(input.amount);
  const allocations = (input.allocations ?? []).map((row) => ({
    materialReceivingId: row.materialReceivingId,
    allocatedAmountMinor: toMinorUnits(row.allocatedAmount)
  }));

  const runPayment = db.transaction(() =>
    createSupplierPaymentInternal(db, {
      supplierId: input.supplierId,
      paymentDate: input.paymentDate,
      amountMinor,
      paymentMethodId: input.paymentMethodId,
      safeId: input.safeId,
      notes: input.notes,
      createdBy: input.createdBy,
      allocations
    })
  );

  return runPayment();
}

export function adjustMaterialStock(
  db: Database.Database,
  input: {
    materialId: string;
    newQuantity: number;
    reason: string;
    adjustmentDate: string;
    createdBy?: string;
  }
): { previousQuantity: number; newQuantity: number } {
  if (input.newQuantity < 0) {
    throw new Error("Quantity cannot be negative");
  }

  if (!input.reason.trim()) {
    throw new Error("Adjustment reason is required");
  }

  const material = db
    .prepare(`
      SELECT id, current_quantity AS currentQuantity,
             weighted_average_cost_minor AS weightedAverageCostMinor
      FROM materials
      WHERE id = ?
    `)
    .get(input.materialId) as
    | { id: string; currentQuantity: number; weightedAverageCostMinor: number }
    | undefined;

  if (!material) {
    throw new Error("Material not found");
  }

  const quantityDelta = input.newQuantity - material.currentQuantity;

  if (quantityDelta === 0) {
    throw new Error("New quantity matches current quantity");
  }

  const runAdjustment = db.transaction(() => {
    db.prepare(`
      UPDATE materials
      SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.newQuantity, input.materialId);

    db.prepare(`
      INSERT INTO material_stock_movements (
        id, material_id, movement_date, movement_type, source_type, source_id,
        quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
        description, created_by
      )
      VALUES (?, ?, ?, 'adjustment', 'material_adjustment', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.materialId,
      input.adjustmentDate,
      input.materialId,
      quantityDelta,
      material.weightedAverageCostMinor,
      Math.round(Math.abs(quantityDelta) * material.weightedAverageCostMinor),
      input.newQuantity,
      input.reason.trim(),
      input.createdBy ?? null
    );

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'adjust_stock', 'material', ?, ?, ?)
    `).run(
      randomUUID(),
      input.createdBy ?? null,
      input.materialId,
      JSON.stringify({ quantity: material.currentQuantity }),
      JSON.stringify({ quantity: input.newQuantity, reason: input.reason.trim() })
    );
  });

  runAdjustment();

  return {
    previousQuantity: material.currentQuantity,
    newQuantity: input.newQuantity
  };
}
