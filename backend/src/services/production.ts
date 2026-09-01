import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { nextDocumentNumber } from "../utils/documentSequence.js";
import { calculateWeightedAverageMinor } from "../utils/weightedAverage.js";
import { toMinorUnits } from "../utils/money.js";

export type ConsumptionInput = {
  materialId: string;
  quantity: number;
  notes?: string | null;
};

export type OutputInput = {
  modelVariantId: string;
  goodQuantity: number;
};

export type CostComponentInput = {
  componentName: string;
  amount: number;
  notes?: string | null;
};

export const PRODUCTION_STAGES = [
  "draft",
  "cutting",
  "sewing",
  "finishing",
  "completed"
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

const STAGE_INDEX: Record<ProductionStage, number> = {
  draft: 0,
  cutting: 1,
  sewing: 2,
  finishing: 3,
  completed: 4
};

type BatchRow = {
  id: string;
  batchNumber: string;
  modelId: string;
  status: string;
  stage: ProductionStage;
  plannedQuantity: number;
  goodQuantity: number;
  damagedQuantity: number;
  wastedQuantity: number;
  startDate: string | null;
  completedDate: string | null;
  directCostMinor: number;
  overheadCostMinor: number;
  totalCostMinor: number;
  costPerGoodPieceMinor: number;
  notes: string | null;
};

function getBatch(db: Database.Database, batchId: string): BatchRow | undefined {
  return db
    .prepare(`
      SELECT id, batch_number AS batchNumber, model_id AS modelId, status,
             planned_quantity AS plannedQuantity, good_quantity AS goodQuantity,
             damaged_quantity AS damagedQuantity, wasted_quantity AS wastedQuantity,
             start_date AS startDate, completed_date AS completedDate,
             direct_cost_minor AS directCostMinor, overhead_cost_minor AS overheadCostMinor,
             total_cost_minor AS totalCostMinor, cost_per_good_piece_minor AS costPerGoodPieceMinor,
             notes
      FROM production_batches
      WHERE id = ?
    `)
    .get(batchId) as BatchRow | undefined;
}

function replaceConsumptions(
  db: Database.Database,
  batchId: string,
  consumptions: ConsumptionInput[],
  consumptionDate: string
): void {
  db.prepare("DELETE FROM production_material_consumptions WHERE batch_id = ?").run(batchId);

  const insert = db.prepare(`
    INSERT INTO production_material_consumptions (
      id, batch_id, material_id, quantity, unit_cost_minor, total_cost_minor,
      consumption_date, notes
    )
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `);

  for (const row of consumptions) {
    insert.run(
      randomUUID(),
      batchId,
      row.materialId,
      row.quantity,
      consumptionDate,
      row.notes ?? null
    );
  }
}

function replaceOutputs(db: Database.Database, batchId: string, outputs: OutputInput[]): void {
  db.prepare("DELETE FROM production_batch_outputs WHERE batch_id = ?").run(batchId);

  const insert = db.prepare(`
    INSERT INTO production_batch_outputs (
      id, batch_id, model_variant_id, good_quantity, unit_cost_minor, total_cost_minor
    )
    VALUES (?, ?, ?, ?, 0, 0)
  `);

  for (const row of outputs) {
    insert.run(randomUUID(), batchId, row.modelVariantId, row.goodQuantity);
  }
}

function replaceCostComponents(
  db: Database.Database,
  batchId: string,
  components: CostComponentInput[]
): void {
  db.prepare("DELETE FROM production_cost_components WHERE batch_id = ?").run(batchId);

  const insert = db.prepare(`
    INSERT INTO production_cost_components (id, batch_id, component_name, amount_minor, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const row of components) {
    insert.run(
      randomUUID(),
      batchId,
      row.componentName.trim(),
      toMinorUnits(row.amount),
      row.notes ?? null
    );
  }
}

function loadConsumptions(db: Database.Database, batchId: string) {
  return db
    .prepare(`
      SELECT id, material_id AS materialId, quantity, notes
      FROM production_material_consumptions
      WHERE batch_id = ?
    `)
    .all(batchId) as Array<{ id: string; materialId: string; quantity: number; notes: string | null }>;
}

function loadOutputs(db: Database.Database, batchId: string) {
  return db
    .prepare(`
      SELECT id, model_variant_id AS modelVariantId, good_quantity AS goodQuantity
      FROM production_batch_outputs
      WHERE batch_id = ?
    `)
    .all(batchId) as Array<{ id: string; modelVariantId: string; goodQuantity: number }>;
}

function resolveOverheadForDate(
  db: Database.Database,
  completedDate: string,
  goodQuantity: number
): { overheadCostMinor: number; overheadPeriodId: string | null; overheadPerPieceMinor: number } {
  const [yearText, monthText] = completedDate.split("-");
  const periodYear = Number(yearText);
  const periodMonth = Number(monthText);

  const period = db
    .prepare(`
      SELECT id, status, overhead_per_piece_minor AS overheadPerPieceMinor
      FROM overhead_periods
      WHERE period_year = ? AND period_month = ?
    `)
    .get(periodYear, periodMonth) as
    | { id: string; status: string; overheadPerPieceMinor: number }
    | undefined;

  if (!period || period.status === "open" || period.overheadPerPieceMinor <= 0) {
    return { overheadCostMinor: 0, overheadPeriodId: null, overheadPerPieceMinor: 0 };
  }

  const overheadCostMinor = Math.round(goodQuantity * period.overheadPerPieceMinor);
  return {
    overheadCostMinor,
    overheadPeriodId: period.id,
    overheadPerPieceMinor: period.overheadPerPieceMinor
  };
}

export function createProductionBatch(
  db: Database.Database,
  input: {
    modelId: string;
    plannedQuantity: number;
    notes?: string | null;
    consumptions?: ConsumptionInput[];
    outputs?: OutputInput[];
    costComponents?: CostComponentInput[];
    createdBy?: string;
  }
): { id: string; batchNumber: string } {
  const model = db.prepare("SELECT id FROM models WHERE id = ? AND is_active = 1").get(input.modelId);
  if (!model) {
    throw new Error("Model not found");
  }

  if (input.plannedQuantity < 0) {
    throw new Error("Planned quantity cannot be negative");
  }

  const runCreate = db.transaction(() => {
    const id = randomUUID();
    const batchNumber = nextDocumentNumber(db, "production_batch");
    const today = new Date().toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO production_batches (
        id, batch_number, model_id, status, planned_quantity, notes, created_by
      )
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `).run(id, batchNumber, input.modelId, input.plannedQuantity, input.notes ?? null, input.createdBy ?? null);

    if (input.consumptions?.length) {
      replaceConsumptions(db, id, input.consumptions, today);
    }

    if (input.outputs?.length) {
      replaceOutputs(db, id, input.outputs);
    }

    if (input.costComponents?.length) {
      replaceCostComponents(db, id, input.costComponents);
    }

    return { id, batchNumber };
  });

  return runCreate();
}

export function updateProductionBatch(
  db: Database.Database,
  batchId: string,
  input: {
    plannedQuantity?: number;
    notes?: string | null;
    consumptions?: ConsumptionInput[];
    outputs?: OutputInput[];
    costComponents?: CostComponentInput[];
  }
): void {
  const batch = getBatch(db, batchId);
  if (!batch) {
    throw new Error("Production batch not found");
  }

  if (batch.status !== "draft") {
    throw new Error("Only draft batches can be updated");
  }

  const runUpdate = db.transaction(() => {
    if (input.plannedQuantity !== undefined) {
      if (input.plannedQuantity < 0) {
        throw new Error("Planned quantity cannot be negative");
      }

      db.prepare(`
        UPDATE production_batches
        SET planned_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.plannedQuantity, batchId);
    }

    if (input.notes !== undefined) {
      db.prepare(`
        UPDATE production_batches
        SET notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.notes, batchId);
    }

    const today = new Date().toISOString().slice(0, 10);

    if (input.consumptions) {
      replaceConsumptions(db, batchId, input.consumptions, today);
    }

    if (input.outputs) {
      replaceOutputs(db, batchId, input.outputs);
    }

    if (input.costComponents) {
      replaceCostComponents(db, batchId, input.costComponents);
    }
  });

  runUpdate();
}

export function startProductionBatch(
  db: Database.Database,
  batchId: string,
  startDate?: string
): void {
  const batch = getBatch(db, batchId);
  if (!batch) {
    throw new Error("Production batch not found");
  }

  if (batch.status !== "draft") {
    throw new Error("Only draft batches can be started");
  }

  db.prepare(`
    UPDATE production_batches
    SET status = 'in_progress', start_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(startDate ?? new Date().toISOString().slice(0, 10), batchId);
}

export function cancelProductionBatch(db: Database.Database, batchId: string): void {
  const batch = getBatch(db, batchId);
  if (!batch) {
    throw new Error("Production batch not found");
  }

  if (batch.status === "completed" || batch.status === "cancelled") {
    throw new Error("Batch cannot be cancelled");
  }

  db.prepare(`
    UPDATE production_batches
    SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(batchId);
}

export function completeProductionBatch(
  db: Database.Database,
  batchId: string,
  input: {
    completedDate?: string;
    goodQuantity?: number;
    damagedQuantity?: number;
    wastedQuantity?: number;
    consumptions?: ConsumptionInput[];
    outputs?: OutputInput[];
    costComponents?: CostComponentInput[];
    createdBy?: string;
  }
): {
  directCostMinor: number;
  overheadCostMinor: number;
  totalCostMinor: number;
  costPerGoodPieceMinor: number;
} {
  const batch = getBatch(db, batchId);
  if (!batch) {
    throw new Error("Production batch not found");
  }

  if (batch.status !== "in_progress") {
    throw new Error("Only in-progress batches can be completed");
  }

  const completedDate = input.completedDate ?? new Date().toISOString().slice(0, 10);

  const runComplete = db.transaction(() => {
    if (input.consumptions) {
      replaceConsumptions(db, batchId, input.consumptions, completedDate);
    }

    if (input.outputs) {
      replaceOutputs(db, batchId, input.outputs);
    }

    if (input.costComponents) {
      replaceCostComponents(db, batchId, input.costComponents);
    }

    const outputs = loadOutputs(db, batchId);
    const consumptions = loadConsumptions(db, batchId);

    if (outputs.length === 0) {
      throw new Error("At least one output variant is required");
    }

    if (consumptions.length === 0) {
      throw new Error("At least one material consumption is required");
    }

    const outputGoodTotal = outputs.reduce((sum, row) => sum + row.goodQuantity, 0);
    if (outputGoodTotal <= 0) {
      throw new Error("Total good output quantity must be greater than zero");
    }

    const goodQuantity = input.goodQuantity ?? outputGoodTotal;
    const damagedQuantity = input.damagedQuantity ?? 0;
    const wastedQuantity = input.wastedQuantity ?? 0;

    if (goodQuantity <= 0) {
      throw new Error("Good quantity must be greater than zero");
    }

    if (Math.abs(goodQuantity - outputGoodTotal) > 0.0001) {
      throw new Error("Good quantity must match the sum of output variant quantities");
    }

    for (const consumption of consumptions) {
      const material = db
        .prepare(`
          SELECT id, current_quantity AS currentQuantity,
                 weighted_average_cost_minor AS weightedAverageCostMinor
          FROM materials
          WHERE id = ?
        `)
        .get(consumption.materialId) as
        | { id: string; currentQuantity: number; weightedAverageCostMinor: number }
        | undefined;

      if (!material) {
        throw new Error("Material not found");
      }

      if (material.currentQuantity < consumption.quantity) {
        throw new Error(`Insufficient stock for material ${consumption.materialId}`);
      }
    }

    let materialCostMinor = 0;

    for (const consumption of consumptions) {
      const material = db
        .prepare(`
          SELECT current_quantity AS currentQuantity,
                 weighted_average_cost_minor AS weightedAverageCostMinor
          FROM materials
          WHERE id = ?
        `)
        .get(consumption.materialId) as {
        currentQuantity: number;
        weightedAverageCostMinor: number;
      };

      const unitCostMinor = material.weightedAverageCostMinor;
      const totalCostMinor = Math.round(consumption.quantity * unitCostMinor);
      materialCostMinor += totalCostMinor;

      const newQuantity = material.currentQuantity - consumption.quantity;

      db.prepare(`
        UPDATE materials
        SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newQuantity, consumption.materialId);

      db.prepare(`
        INSERT INTO material_stock_movements (
          id, material_id, movement_date, movement_type, source_type, source_id,
          quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
          description, created_by
        )
        VALUES (?, ?, ?, 'production_consumption', 'production_batch', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        consumption.materialId,
        completedDate,
        batchId,
        -consumption.quantity,
        unitCostMinor,
        totalCostMinor,
        newQuantity,
        `Production batch ${batch.batchNumber}`,
        input.createdBy ?? null
      );

      db.prepare(`
        UPDATE production_material_consumptions
        SET unit_cost_minor = ?, total_cost_minor = ?
        WHERE id = ?
      `).run(unitCostMinor, totalCostMinor, consumption.id);
    }

    const componentRows = db
      .prepare(`
        SELECT amount_minor AS amountMinor
        FROM production_cost_components
        WHERE batch_id = ?
      `)
      .all(batchId) as Array<{ amountMinor: number }>;

    const componentCostMinor = componentRows.reduce((sum, row) => sum + row.amountMinor, 0);
    const directCostMinor = materialCostMinor + componentCostMinor;

    const overhead = resolveOverheadForDate(db, completedDate, goodQuantity);
    const totalCostMinor = directCostMinor + overhead.overheadCostMinor;
    const costPerGoodPieceMinor =
      goodQuantity > 0 ? Math.round(totalCostMinor / goodQuantity) : 0;

    for (const output of outputs) {
      const variant = db
        .prepare(`
          SELECT id, model_id AS modelId, current_quantity AS currentQuantity,
                 current_average_cost_minor AS currentAverageCostMinor
          FROM model_variants
          WHERE id = ?
        `)
        .get(output.modelVariantId) as
        | {
            id: string;
            modelId: string;
            currentQuantity: number;
            currentAverageCostMinor: number;
          }
        | undefined;

      if (!variant) {
        throw new Error("Model variant not found");
      }

      if (variant.modelId !== batch.modelId) {
        throw new Error("Output variant does not belong to batch model");
      }

      const outputTotalCostMinor = Math.round(output.goodQuantity * costPerGoodPieceMinor);
      const newQuantity = variant.currentQuantity + output.goodQuantity;
      const newAverageCostMinor = calculateWeightedAverageMinor(
        variant.currentQuantity,
        variant.currentAverageCostMinor,
        output.goodQuantity,
        costPerGoodPieceMinor
      );

      db.prepare(`
        UPDATE model_variants
        SET current_quantity = ?, current_average_cost_minor = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newQuantity, newAverageCostMinor, output.modelVariantId);

      db.prepare(`
        UPDATE production_batch_outputs
        SET unit_cost_minor = ?, total_cost_minor = ?
        WHERE id = ?
      `).run(costPerGoodPieceMinor, outputTotalCostMinor, output.id);

      db.prepare(`
        INSERT INTO finished_stock_movements (
          id, model_variant_id, movement_date, movement_type, source_type, source_id,
          quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
          description, created_by
        )
        VALUES (?, ?, ?, 'production_output', 'production_batch', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        output.modelVariantId,
        completedDate,
        batchId,
        output.goodQuantity,
        costPerGoodPieceMinor,
        outputTotalCostMinor,
        newQuantity,
        `Production batch ${batch.batchNumber}`,
        input.createdBy ?? null
      );
    }

    if (overhead.overheadPeriodId) {
      db.prepare(`
        INSERT INTO production_overhead_allocations (
          id, overhead_period_id, production_batch_id, good_quantity,
          overhead_per_piece_minor, allocated_amount_minor
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(overhead_period_id, production_batch_id) DO UPDATE SET
          good_quantity = excluded.good_quantity,
          overhead_per_piece_minor = excluded.overhead_per_piece_minor,
          allocated_amount_minor = excluded.allocated_amount_minor
      `).run(
        randomUUID(),
        overhead.overheadPeriodId,
        batchId,
        goodQuantity,
        overhead.overheadPerPieceMinor,
        overhead.overheadCostMinor
      );
    }

    db.prepare(`
      UPDATE production_batches
      SET status = 'completed',
          good_quantity = ?,
          damaged_quantity = ?,
          wasted_quantity = ?,
          completed_date = ?,
          direct_cost_minor = ?,
          overhead_cost_minor = ?,
          total_cost_minor = ?,
          cost_per_good_piece_minor = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      goodQuantity,
      damagedQuantity,
      wastedQuantity,
      completedDate,
      directCostMinor,
      overhead.overheadCostMinor,
      totalCostMinor,
      costPerGoodPieceMinor,
      batchId
    );

    return {
      directCostMinor,
      overheadCostMinor: overhead.overheadCostMinor,
      totalCostMinor,
      costPerGoodPieceMinor
    };
  });

  return runComplete();
}

export function getProductionCostSummary(db: Database.Database, batchId: string) {
  const batch = getBatch(db, batchId);
  if (!batch) {
    throw new Error("Production batch not found");
  }

  const consumptions = db
    .prepare(`
      SELECT pmc.id, pmc.material_id AS materialId, materials.name AS materialName,
             pmc.quantity, pmc.unit_cost_minor AS unitCostMinor,
             pmc.total_cost_minor AS totalCostMinor, pmc.notes
      FROM production_material_consumptions pmc
      JOIN materials ON materials.id = pmc.material_id
      WHERE pmc.batch_id = ?
    `)
    .all(batchId);

  const components = db
    .prepare(`
      SELECT id, component_name AS componentName, amount_minor AS amountMinor, notes
      FROM production_cost_components
      WHERE batch_id = ?
    `)
    .all(batchId);

  const outputs = db
    .prepare(`
      SELECT pbo.id, pbo.model_variant_id AS modelVariantId,
             sizes.name AS sizeName, colors.name AS colorName,
             pbo.good_quantity AS goodQuantity,
             pbo.unit_cost_minor AS unitCostMinor,
             pbo.total_cost_minor AS totalCostMinor
      FROM production_batch_outputs pbo
      JOIN model_variants mv ON mv.id = pbo.model_variant_id
      JOIN sizes ON sizes.id = mv.size_id
      JOIN colors ON colors.id = mv.color_id
      WHERE pbo.batch_id = ?
    `)
    .all(batchId);

  const materialCostMinor = (consumptions as Array<{ totalCostMinor: number }>).reduce(
    (sum, row) => sum + row.totalCostMinor,
    0
  );
  const componentCostMinor = (components as Array<{ amountMinor: number }>).reduce(
    (sum, row) => sum + row.amountMinor,
    0
  );

  return {
    batch,
    consumptions,
    components,
    outputs,
    materialCostMinor,
    componentCostMinor,
    directCostMinor: batch.directCostMinor || materialCostMinor + componentCostMinor,
    overheadCostMinor: batch.overheadCostMinor,
    totalCostMinor: batch.totalCostMinor,
    costPerGoodPieceMinor: batch.costPerGoodPieceMinor
  };
}

export function adjustFinishedStock(
  db: Database.Database,
  input: {
    modelVariantId: string;
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

  const variant = db
    .prepare(`
      SELECT id, current_quantity AS currentQuantity,
             current_average_cost_minor AS currentAverageCostMinor
      FROM model_variants
      WHERE id = ?
    `)
    .get(input.modelVariantId) as
    | { id: string; currentQuantity: number; currentAverageCostMinor: number }
    | undefined;

  if (!variant) {
    throw new Error("Model variant not found");
  }

  const quantityDelta = input.newQuantity - variant.currentQuantity;
  if (quantityDelta === 0) {
    throw new Error("New quantity matches current quantity");
  }

  const runAdjustment = db.transaction(() => {
    db.prepare(`
      UPDATE model_variants
      SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.newQuantity, input.modelVariantId);

    db.prepare(`
      INSERT INTO finished_stock_movements (
        id, model_variant_id, movement_date, movement_type, source_type, source_id,
        quantity_delta, unit_cost_minor, total_cost_minor, quantity_after,
        description, created_by
      )
      VALUES (?, ?, ?, 'adjustment', 'finished_adjustment', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.modelVariantId,
      input.adjustmentDate,
      input.modelVariantId,
      quantityDelta,
      variant.currentAverageCostMinor,
      Math.round(Math.abs(quantityDelta) * variant.currentAverageCostMinor),
      input.newQuantity,
      input.reason.trim(),
      input.createdBy ?? null
    );

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'adjust_finished_stock', 'model_variant', ?, ?, ?)
    `).run(
      randomUUID(),
      input.createdBy ?? null,
      input.modelVariantId,
      JSON.stringify({ quantity: variant.currentQuantity }),
      JSON.stringify({ quantity: input.newQuantity, reason: input.reason.trim() })
    );
  });

  runAdjustment();

  return {
    previousQuantity: variant.currentQuantity,
    newQuantity: input.newQuantity
  };
}
