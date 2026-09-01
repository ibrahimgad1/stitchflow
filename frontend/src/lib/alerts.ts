import { api } from "./api";

export type LowStockAlert = {
  lowMaterials: Array<{
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
  lowVariants: Array<{
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
  total: number;
  hasAlerts: boolean;
};

export async function getLowStockAlerts(): Promise<LowStockAlert> {
  const res = await api.get("/alerts/low-stock");
  return res.data.data as LowStockAlert;
}

export async function updateMaterialThreshold(id: string, safetyThreshold: number) {
  const res = await api.put(`/materials/${id}/threshold`, { safetyThreshold });
  return res.data;
}

export async function updateVariantThreshold(id: string, safetyThreshold: number) {
  const res = await api.put(`/model-variants/${id}/threshold`, { safetyThreshold });
  return res.data;
}
