import { Router } from "express";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/dashboard/summary", (_req, res) => {
  const db = getDatabase();

  const customerReceivables = db
    .prepare(`
      SELECT COALESCE(SUM(remaining_minor), 0) AS value
      FROM sales_invoices
      WHERE status = 'confirmed'
    `)
    .get() as { value: number };

  const supplierPayables = db
    .prepare(`
      SELECT COALESCE(SUM(remaining_minor), 0) AS value
      FROM material_receivings
      WHERE status = 'confirmed'
    `)
    .get() as { value: number };

  const treasury = db
    .prepare(`
      SELECT COALESCE(SUM(current_balance_minor), 0) AS value
      FROM safes
      WHERE is_active = 1
    `)
    .get() as { value: number };

  const rawMaterials = db
    .prepare(`
      SELECT COALESCE(SUM(ROUND(current_quantity * weighted_average_cost_minor)), 0) AS value,
             COALESCE(SUM(current_quantity), 0) AS quantity
      FROM materials
      WHERE is_active = 1
    `)
    .get() as { value: number; quantity: number };

  const finishedGoods = db
    .prepare(`
      SELECT COALESCE(SUM(ROUND(current_quantity * current_average_cost_minor)), 0) AS value,
             COALESCE(SUM(current_quantity), 0) AS quantity
      FROM model_variants
      WHERE is_active = 1
    `)
    .get() as { value: number; quantity: number };

  const production = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) AS inProgressCount,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completedCount,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN good_quantity ELSE 0 END), 0) AS completedQuantity
      FROM production_batches
    `)
    .get() as { inProgressCount: number; completedCount: number; completedQuantity: number };

  const sales = db
    .prepare(`
      SELECT COALESCE(COUNT(*), 0) AS invoiceCount,
             COALESCE(SUM(total_minor), 0) AS revenueMinor,
             COALESCE(SUM(cost_of_goods_minor), 0) AS costOfGoodsMinor,
             COALESCE(SUM(gross_profit_minor), 0) AS grossProfitMinor
      FROM sales_invoices
      WHERE status = 'confirmed'
    `)
    .get() as {
    invoiceCount: number;
    revenueMinor: number;
    costOfGoodsMinor: number;
    grossProfitMinor: number;
  };

  const expenses = db
    .prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) AS value
      FROM expenses
      WHERE payment_status = 'paid'
    `)
    .get() as { value: number };

  res.json({
    data: {
      customerReceivablesMinor: customerReceivables.value,
      supplierPayablesMinor: supplierPayables.value,
      treasuryBalanceMinor: treasury.value,
      rawMaterialStockValueMinor: rawMaterials.value,
      rawMaterialQuantity: rawMaterials.quantity,
      finishedStockValueMinor: finishedGoods.value,
      finishedStockQuantity: finishedGoods.quantity,
      productionInProgressCount: production.inProgressCount,
      productionCompletedCount: production.completedCount,
      productionCompletedQuantity: production.completedQuantity,
      salesInvoiceCount: sales.invoiceCount,
      salesRevenueMinor: sales.revenueMinor,
      salesCostOfGoodsMinor: sales.costOfGoodsMinor,
      grossProfitMinor: sales.grossProfitMinor,
      paidExpensesMinor: expenses.value,
      estimatedNetMinor: sales.grossProfitMinor - expenses.value
    }
  });
});

reportsRouter.get("/dashboard/charts", (_req, res) => {
  const db = getDatabase();
  const monthly = db
    .prepare(
      `SELECT 
         substr(invoice_date, 1, 7) as month,
         COALESCE(SUM(total_minor),0) as salesMinor,
         COALESCE(SUM(gross_profit_minor),0) as profitMinor
       FROM sales_invoices WHERE status='confirmed' AND invoice_date >= date('now','-6 months')
       GROUP BY substr(invoice_date, 1, 7) ORDER BY month ASC`
    )
    .all() as Array<{ month: string; salesMinor: number; profitMinor: number }>;

  const monthlyExpenses = db
    .prepare(
      `SELECT substr(expense_date, 1, 7) as month, COALESCE(SUM(amount_minor),0) as expenseMinor
       FROM expenses WHERE payment_status='paid' AND expense_date >= date('now','-6 months')
       GROUP BY substr(expense_date, 1, 7) ORDER BY month ASC`
    )
    .all() as Array<{ month: string; expenseMinor: number }>;

  const expMap = new Map(monthlyExpenses.map((e) => [e.month, e.expenseMinor]));
  const combined = monthly.map((m) => ({
    month: m.month,
    salesMinor: m.salesMinor,
    expenseMinor: expMap.get(m.month) ?? 0,
    profitMinor: m.profitMinor
  }));

  const topSelling = db
    .prepare(
      `SELECT m.model_code AS modelCode, m.model_name AS modelName, COALESCE(SUM(sii.quantity),0) as totalQty
       FROM sales_invoice_items sii
       JOIN model_variants mv ON mv.id = sii.model_variant_id
       JOIN models m ON m.id = mv.model_id
       JOIN sales_invoices si ON si.id = sii.sales_invoice_id AND si.status='confirmed'
       GROUP BY m.id ORDER BY totalQty DESC LIMIT 5`
    )
    .all();

  res.json({ data: { monthly: combined, topSelling } });
});

reportsRouter.get("/dashboard/recent-activity", (_req, res) => {
  const db = getDatabase();
  const invoices = db
    .prepare(
      `SELECT si.id, si.invoice_number AS invoiceNumber, c.company_name AS customerName, si.total_minor AS totalMinor, si.status, si.invoice_date AS invoiceDate
       FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
       ORDER BY si.created_at DESC LIMIT 5`
    )
    .all();
  const batches = db
    .prepare(
      `SELECT pb.id, pb.batch_number AS batchNumber, m.model_code AS modelCode, pb.status, pb.good_quantity AS goodQuantity FROM production_batches pb JOIN models m ON m.id = pb.model_id ORDER BY pb.created_at DESC LIMIT 5`
    )
    .all();
  const payments = db
    .prepare(
      `SELECT cp.id, cp.payment_number AS paymentNumber, c.company_name AS customerName, cp.amount_minor AS amountMinor FROM customer_payments cp JOIN customers c ON c.id = cp.customer_id ORDER BY cp.created_at DESC LIMIT 5`
    )
    .all();
  res.json({ data: { invoices, batches, payments } });
});

reportsRouter.get("/reports/raw-material-stock", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["materials.is_active = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(materials.name LIKE ? ESCAPE '\\' OR materials.color_name LIKE ? ESCAPE '\\' OR suppliers.name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM materials
      LEFT JOIN suppliers ON suppliers.id = materials.supplier_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const summary = db
    .prepare(`
      SELECT COALESCE(SUM(materials.current_quantity), 0) AS totalQuantity,
             COALESCE(SUM(ROUND(materials.current_quantity * materials.weighted_average_cost_minor)), 0) AS totalValueMinor
      FROM materials
      LEFT JOIN suppliers ON suppliers.id = materials.supplier_id
      WHERE ${where}
    `)
    .get(...values) as { totalQuantity: number; totalValueMinor: number };

  const rows = db
    .prepare(`
      SELECT materials.id,
             materials.name,
             materials.color_name AS colorName,
             materials.unit,
             suppliers.name AS supplierName,
             materials.current_quantity AS currentQuantity,
             materials.weighted_average_cost_minor AS weightedAverageCostMinor,
             ROUND(materials.current_quantity * materials.weighted_average_cost_minor) AS stockValueMinor,
             materials.updated_at AS updatedAt
      FROM materials
      LEFT JOIN suppliers ON suppliers.id = materials.supplier_id
      WHERE ${where}
      ORDER BY materials.name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json({
    ...paginatedResponse(rows, total.count, params),
    summary
  });
});

reportsRouter.get("/reports/finished-stock", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["model_variants.is_active = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(models.model_code LIKE ? ESCAPE '\\' OR models.model_name LIKE ? ESCAPE '\\' OR sizes.name LIKE ? ESCAPE '\\' OR colors.name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM model_variants
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const summary = db
    .prepare(`
      SELECT COALESCE(SUM(model_variants.current_quantity), 0) AS totalQuantity,
             COALESCE(SUM(ROUND(model_variants.current_quantity * model_variants.current_average_cost_minor)), 0) AS totalValueMinor
      FROM model_variants
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
    `)
    .get(...values) as { totalQuantity: number; totalValueMinor: number };

  const rows = db
    .prepare(`
      SELECT model_variants.id,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             sizes.name AS sizeName,
             colors.name AS colorName,
             model_variants.current_quantity AS currentQuantity,
             model_variants.current_average_cost_minor AS currentAverageCostMinor,
             ROUND(model_variants.current_quantity * model_variants.current_average_cost_minor) AS stockValueMinor,
             model_variants.updated_at AS updatedAt
      FROM model_variants
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
      ORDER BY models.model_code ASC, sizes.sort_order ASC, colors.sort_order ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json({
    ...paginatedResponse(rows, total.count, params),
    summary
  });
});

reportsRouter.get("/reports/raw-material-movements", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(materials.name LIKE ? ESCAPE '\\' OR material_stock_movements.description LIKE ? ESCAPE '\\' OR material_stock_movements.movement_type LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
  if (dateFrom) {
    conditions.push("material_stock_movements.movement_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("material_stock_movements.movement_date <= ?");
    values.push(dateTo);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM material_stock_movements
      JOIN materials ON materials.id = material_stock_movements.material_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const summary = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END), 0) AS quantityIn,
        COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN ABS(quantity_delta) ELSE 0 END), 0) AS quantityOut,
        COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN total_cost_minor ELSE 0 END), 0) AS valueInMinor,
        COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN total_cost_minor ELSE 0 END), 0) AS valueOutMinor
      FROM material_stock_movements
      JOIN materials ON materials.id = material_stock_movements.material_id
      WHERE ${where}
    `)
    .get(...values) as {
    quantityIn: number;
    quantityOut: number;
    valueInMinor: number;
    valueOutMinor: number;
  };

  const rows = db
    .prepare(`
      SELECT material_stock_movements.id,
             material_stock_movements.material_id AS itemId,
             materials.name AS itemName,
             materials.unit,
             material_stock_movements.movement_date AS movementDate,
             material_stock_movements.movement_type AS movementType,
             material_stock_movements.source_type AS sourceType,
             material_stock_movements.source_id AS sourceId,
             material_stock_movements.quantity_delta AS quantityDelta,
             material_stock_movements.unit_cost_minor AS unitCostMinor,
             material_stock_movements.total_cost_minor AS totalCostMinor,
             material_stock_movements.quantity_after AS quantityAfter,
             material_stock_movements.description,
             material_stock_movements.created_at AS createdAt
      FROM material_stock_movements
      JOIN materials ON materials.id = material_stock_movements.material_id
      WHERE ${where}
      ORDER BY material_stock_movements.movement_date DESC, material_stock_movements.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json({
    ...paginatedResponse(rows, total.count, params),
    summary: {
      ...summary,
      netQuantity: summary.quantityIn - summary.quantityOut,
      netValueMinor: summary.valueInMinor - summary.valueOutMinor
    }
  });
});

reportsRouter.get("/reports/finished-stock-movements", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(models.model_code LIKE ? ESCAPE '\\' OR models.model_name LIKE ? ESCAPE '\\' OR finished_stock_movements.description LIKE ? ESCAPE '\\' OR finished_stock_movements.movement_type LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern, pattern);
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
  if (dateFrom) {
    conditions.push("finished_stock_movements.movement_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("finished_stock_movements.movement_date <= ?");
    values.push(dateTo);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM finished_stock_movements
      JOIN model_variants ON model_variants.id = finished_stock_movements.model_variant_id
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const summary = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END), 0) AS quantityIn,
        COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN ABS(quantity_delta) ELSE 0 END), 0) AS quantityOut,
        COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN total_cost_minor ELSE 0 END), 0) AS valueInMinor,
        COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN total_cost_minor ELSE 0 END), 0) AS valueOutMinor
      FROM finished_stock_movements
      JOIN model_variants ON model_variants.id = finished_stock_movements.model_variant_id
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
    `)
    .get(...values) as {
    quantityIn: number;
    quantityOut: number;
    valueInMinor: number;
    valueOutMinor: number;
  };

  const rows = db
    .prepare(`
      SELECT finished_stock_movements.id,
             finished_stock_movements.model_variant_id AS itemId,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             sizes.name AS sizeName,
             colors.name AS colorName,
             finished_stock_movements.movement_date AS movementDate,
             finished_stock_movements.movement_type AS movementType,
             finished_stock_movements.source_type AS sourceType,
             finished_stock_movements.source_id AS sourceId,
             finished_stock_movements.quantity_delta AS quantityDelta,
             finished_stock_movements.unit_cost_minor AS unitCostMinor,
             finished_stock_movements.total_cost_minor AS totalCostMinor,
             finished_stock_movements.quantity_after AS quantityAfter,
             finished_stock_movements.description,
             finished_stock_movements.created_at AS createdAt
      FROM finished_stock_movements
      JOIN model_variants ON model_variants.id = finished_stock_movements.model_variant_id
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
      ORDER BY finished_stock_movements.movement_date DESC, finished_stock_movements.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json({
    ...paginatedResponse(rows, total.count, params),
    summary: {
      ...summary,
      netQuantity: summary.quantityIn - summary.quantityOut,
      netValueMinor: summary.valueInMinor - summary.valueOutMinor
    }
  });
});

reportsRouter.get("/reports/production-costs", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["production_batches.status = 'completed'"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(production_batches.batch_number LIKE ? ESCAPE '\\' OR models.model_code LIKE ? ESCAPE '\\' OR models.model_name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
  if (dateFrom) {
    conditions.push("production_batches.completed_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("production_batches.completed_date <= ?");
    values.push(dateTo);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const summary = db
    .prepare(`
      SELECT COALESCE(SUM(production_batches.good_quantity), 0) AS goodQuantity,
             COALESCE(SUM(production_batches.damaged_quantity), 0) AS damagedQuantity,
             COALESCE(SUM(production_batches.wasted_quantity), 0) AS wastedQuantity,
             COALESCE(SUM(production_batches.direct_cost_minor), 0) AS directCostMinor,
             COALESCE(SUM(production_batches.overhead_cost_minor), 0) AS overheadCostMinor,
             COALESCE(SUM(production_batches.total_cost_minor), 0) AS totalCostMinor
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      WHERE ${where}
    `)
    .get(...values) as {
    goodQuantity: number;
    damagedQuantity: number;
    wastedQuantity: number;
    directCostMinor: number;
    overheadCostMinor: number;
    totalCostMinor: number;
  };

  const componentSummary = db
    .prepare(`
      SELECT COALESCE(SUM(production_material_consumptions.total_cost_minor), 0) AS materialCostMinor
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      LEFT JOIN production_material_consumptions
        ON production_material_consumptions.batch_id = production_batches.id
      WHERE ${where}
    `)
    .get(...values) as { materialCostMinor: number };

  const rows = db
    .prepare(`
      SELECT production_batches.id,
             production_batches.batch_number AS batchNumber,
             production_batches.completed_date AS completedDate,
             production_batches.model_id AS modelId,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             production_batches.good_quantity AS goodQuantity,
             production_batches.damaged_quantity AS damagedQuantity,
             production_batches.wasted_quantity AS wastedQuantity,
             production_batches.direct_cost_minor AS directCostMinor,
             production_batches.overhead_cost_minor AS overheadCostMinor,
             production_batches.total_cost_minor AS totalCostMinor,
             production_batches.cost_per_good_piece_minor AS costPerGoodPieceMinor,
             COALESCE(materials.material_cost_minor, 0) AS materialCostMinor,
             COALESCE(components.component_cost_minor, 0) AS componentCostMinor
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      LEFT JOIN (
        SELECT batch_id, SUM(total_cost_minor) AS material_cost_minor
        FROM production_material_consumptions
        GROUP BY batch_id
      ) materials ON materials.batch_id = production_batches.id
      LEFT JOIN (
        SELECT batch_id, SUM(amount_minor) AS component_cost_minor
        FROM production_cost_components
        GROUP BY batch_id
      ) components ON components.batch_id = production_batches.id
      WHERE ${where}
      ORDER BY production_batches.completed_date DESC, production_batches.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json({
    ...paginatedResponse(rows, total.count, params),
    summary: {
      ...summary,
      materialCostMinor: componentSummary.materialCostMinor,
      componentCostMinor: summary.directCostMinor - componentSummary.materialCostMinor,
      averageCostPerGoodPieceMinor:
        summary.goodQuantity > 0 ? Math.round(summary.totalCostMinor / summary.goodQuantity) : 0
    }
  });
});
