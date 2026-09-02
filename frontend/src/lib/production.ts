import { api } from "./api";
import type { ListParams, PaginatedResponse } from "./types";

export type ProductionBatch = {
  id: string;
  batchNumber: string;
  modelId: string;
  modelCode?: string;
  modelName?: string;
  status: string;
  plannedQuantity: number;
  goodQuantity: number;
  damagedQuantity: number;
  wastedQuantity: number;
  startDate?: string | null;
  completedDate?: string | null;
  directCostMinor: number;
  overheadCostMinor: number;
  totalCostMinor: number;
  costPerGoodPieceMinor: number;
  notes?: string | null;
  createdAt?: string;
  consumptions?: Array<{
    id: string;
    materialId: string;
    materialName: string;
    quantity: number;
    unitCostMinor: number;
    totalCostMinor: number;
    notes?: string | null;
  }>;
  outputs?: Array<{
    id: string;
    modelVariantId: string;
    sizeName: string;
    colorName: string;
    goodQuantity: number;
    unitCostMinor: number;
    totalCostMinor: number;
  }>;
  costComponents?: Array<{
    id: string;
    componentName: string;
    amountMinor: number;
    notes?: string | null;
  }>;
};

export type FinishedInventoryRow = {
  id: string;
  modelId: string;
  modelCode: string;
  modelName: string;
  sizeId: string;
  sizeName: string;
  colorId: string;
  colorName: string;
  currentQuantity: number;
  currentAverageCostMinor: number;
  safetyThreshold: number;
  barcode?: string | null;
  updatedAt?: string;
};

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

function queryString(
  params: ListParams & {
    status?: string;
    modelId?: string;
    modelVariantId?: string;
  } = {},
): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.status) searchParams.set("status", params.status);
  if (params.modelId) searchParams.set("modelId", params.modelId);
  if (params.modelVariantId)
    searchParams.set("modelVariantId", params.modelVariantId);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listProductionBatches(
  params?: ListParams & { status?: string; modelId?: string },
) {
  const response = await api.get<PaginatedResponse<ProductionBatch>>(
    `/production-batches${queryString(params)}`,
  );
  return response.data;
}

export async function getProductionBatch(id: string) {
  const response = await api.get<{ data: ProductionBatch }>(
    `/production-batches/${id}`,
  );
  return response.data.data;
}

export async function createProductionBatch(payload: {
  modelId: string;
  plannedQuantity: number;
  notes?: string | null;
  consumptions?: ConsumptionInput[];
  outputs?: OutputInput[];
  costComponents?: CostComponentInput[];
}) {
  const response = await api.post<{ id: string; batchNumber: string }>(
    "/production-batches",
    payload,
  );
  return response.data;
}

export async function startProductionBatch(id: string, startDate?: string) {
  const response = await api.post<{ id: string; status: string }>(
    `/production-batches/${id}/start`,
    startDate ? { startDate } : {},
  );
  return response.data;
}

export async function completeProductionBatch(
  id: string,
  payload: {
    completedDate?: string;
    damagedQuantity?: number;
    wastedQuantity?: number;
    consumptions?: ConsumptionInput[];
    outputs?: OutputInput[];
    costComponents?: CostComponentInput[];
  } = {},
) {
  const response = await api.post<{
    id: string;
    status: string;
    directCostMinor: number;
    overheadCostMinor: number;
    totalCostMinor: number;
    costPerGoodPieceMinor: number;
  }>(`/production-batches/${id}/complete`, payload);
  return response.data;
}

export async function updateProductionBatch(
  id: string,
  payload: {
    plannedQuantity?: number;
    notes?: string | null;
    consumptions?: ConsumptionInput[];
    outputs?: OutputInput[];
    costComponents?: CostComponentInput[];
  },
) {
  const response = await api.put<{ id: string }>(
    `/production-batches/${id}`,
    payload,
  );
  return response.data;
}

export async function updateProductionStage(id: string, stage: string) {
  const response = await api.put<{ id: string; stage: string }>(
    `/production-batches/${id}/stage`,
    { stage },
  );
  return response.data;
}

export async function cancelProductionBatch(id: string) {
  const response = await api.post<{ id: string; status: string }>(
    `/production-batches/${id}/cancel`,
    {},
  );
  return response.data;
}

export async function getProductionCostSummary(id: string) {
  const response = await api.get<{
    data: ProductionBatch & {
      materialCostMinor: number;
      componentCostMinor: number;
    };
  }>(`/production-batches/${id}/cost-summary`);
  return response.data.data;
}

export async function listFinishedInventory(
  params?: ListParams & { modelId?: string },
) {
  const response = await api.get<PaginatedResponse<FinishedInventoryRow>>(
    `/finished-inventory${queryString(params)}`,
  );
  return response.data;
}

export async function adjustFinishedStock(
  modelVariantId: string,
  payload: { newQuantity: number; reason: string; adjustmentDate?: string },
) {
  const response = await api.post<{
    previousQuantity: number;
    newQuantity: number;
  }>(`/model-variants/${modelVariantId}/stock-adjustments`, payload);
  return response.data;
}
