import { Router } from "express";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

alertsRouter.get("/alerts/low-stock", (_req, res) => {
  const db = getDatabase();

  const lowMaterials = db
    .prepare(
      `SELECT id, name, color_name AS colorName, unit, current_quantity AS currentQuantity,
              weighted_average_cost_minor AS weightedAverageCostMinor, safety_threshold AS safetyThreshold,
              supplier_id AS supplierId, (safety_threshold - current_quantity) AS shortage
       FROM materials
       WHERE is_active = 1 AND safety_threshold > 0 AND current_quantity < safety_threshold
       ORDER BY (current_quantity / safety_threshold) ASC
       LIMIT 50`
    )
    .all() as Array<{
    id: string;
    name: string;
    colorName: string | null;
    unit: string;
    currentQuantity: number;
    weightedAverageCostMinor: number;
    safetyThreshold: number;
    supplierId: string | null;
    shortage: number;
  }>;

  const lowVariants = db
    .prepare(
      `SELECT mv.id, mv.current_quantity AS currentQuantity, mv.safety_threshold AS safetyThreshold,
              mv.current_average_cost_minor AS currentAverageCostMinor,
              (mv.safety_threshold - mv.current_quantity) AS shortage,
              m.model_code AS modelCode, m.model_name AS modelName,
              s.name AS sizeName, c.name AS colorName, mv.model_id AS modelId
       FROM model_variants mv
       JOIN models m ON m.id = mv.model_id
       JOIN sizes s ON s.id = mv.size_id
       JOIN colors c ON c.id = mv.color_id
       WHERE mv.is_active = 1 AND m.is_active = 1 AND mv.safety_threshold > 0 AND mv.current_quantity < mv.safety_threshold
       ORDER BY (mv.current_quantity / mv.safety_threshold) ASC
       LIMIT 50`
    )
    .all() as Array<{
    id: string;
    currentQuantity: number;
    safetyThreshold: number;
    currentAverageCostMinor: number;
    shortage: number;
    modelCode: string;
    modelName: string;
    sizeName: string;
    colorName: string;
    modelId: string;
  }>;

  res.json({
    data: {
      lowMaterials,
      lowVariants,
      total: lowMaterials.length + lowVariants.length,
      hasAlerts: lowMaterials.length + lowVariants.length > 0
    }
  });
});
