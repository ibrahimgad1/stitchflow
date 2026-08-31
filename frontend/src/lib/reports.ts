import { api } from "./api";
import type { ListParams, PaginatedResponse } from "./types";

export type DashboardSummary = {
  customerReceivablesMinor: number;
  supplierPayablesMinor: number;
  treasuryBalanceMinor: number;
  rawMaterialStockValueMinor: number;
  rawMaterialQuantity: number;
  finishedStockValueMinor: number;
  finishedStockQuantity: number;
  productionInProgressCount: number;
  productionCompletedCount: number;
  productionCompletedQuantity: number;
  salesInvoiceCount: number;
  salesRevenueMinor: number;
  salesCostOfGoodsMinor: number;
  grossProfitMinor: number;
  paidExpensesMinor: number;
  estimatedNetMinor: number;
};

export async function getDashboardSummary() {
  const response = await api.get<{ data: DashboardSummary }>("/dashboard/summary");
  return response.data.data;
}

export type RawMaterialStockReportRow = {
  id: string;
  name: string;
  colorName?: string | null;
  unit: string;
  supplierName?: string | null;
  currentQuantity: number;
  weightedAverageCostMinor: number;
  stockValueMinor: number;
  updatedAt?: string;
};

export type FinishedStockReportRow = {
  id: string;
  modelCode: string;
  modelName: string;
  sizeName: string;
  colorName: string;
  currentQuantity: number;
  currentAverageCostMinor: number;
  stockValueMinor: number;
  updatedAt?: string;
};

type StockReportSummary = {
  totalQuantity: number;
  totalValueMinor: number;
};

type MovementReportSummary = {
  quantityIn: number;
  quantityOut: number;
  netQuantity: number;
  valueInMinor: number;
  valueOutMinor: number;
  netValueMinor: number;
};

type StockReportResponse<T> = PaginatedResponse<T> & {
  summary: StockReportSummary;
};

function queryString(params: ListParams = {}): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if ("dateFrom" in params && typeof params.dateFrom === "string") {
    searchParams.set("dateFrom", params.dateFrom);
  }
  if ("dateTo" in params && typeof params.dateTo === "string") {
    searchParams.set("dateTo", params.dateTo);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function getRawMaterialStockReport(params?: ListParams) {
  const response = await api.get<StockReportResponse<RawMaterialStockReportRow>>(
    `/reports/raw-material-stock${queryString(params)}`
  );
  return response.data;
}

export async function getFinishedStockReport(params?: ListParams) {
  const response = await api.get<StockReportResponse<FinishedStockReportRow>>(
    `/reports/finished-stock${queryString(params)}`
  );
  return response.data;
}

export type RawMaterialMovementReportRow = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  movementDate: string;
  movementType: string;
  sourceType: string;
  sourceId?: string | null;
  quantityDelta: number;
  unitCostMinor: number;
  totalCostMinor: number;
  quantityAfter: number;
  description?: string | null;
  createdAt?: string;
};

export type FinishedMovementReportRow = {
  id: string;
  itemId: string;
  modelCode: string;
  modelName: string;
  sizeName: string;
  colorName: string;
  movementDate: string;
  movementType: string;
  sourceType: string;
  sourceId?: string | null;
  quantityDelta: number;
  unitCostMinor: number;
  totalCostMinor: number;
  quantityAfter: number;
  description?: string | null;
  createdAt?: string;
};

type MovementReportResponse<T> = PaginatedResponse<T> & {
  summary: MovementReportSummary;
};

type MovementReportParams = ListParams & {
  dateFrom?: string;
  dateTo?: string;
};

type ProductionCostReportSummary = {
  goodQuantity: number;
  damagedQuantity: number;
  wastedQuantity: number;
  materialCostMinor: number;
  componentCostMinor: number;
  directCostMinor: number;
  overheadCostMinor: number;
  totalCostMinor: number;
  averageCostPerGoodPieceMinor: number;
};

export async function getRawMaterialMovementReport(params?: MovementReportParams) {
  const response = await api.get<MovementReportResponse<RawMaterialMovementReportRow>>(
    `/reports/raw-material-movements${queryString(params)}`
  );
  return response.data;
}

export async function getFinishedMovementReport(params?: MovementReportParams) {
  const response = await api.get<MovementReportResponse<FinishedMovementReportRow>>(
    `/reports/finished-stock-movements${queryString(params)}`
  );
  return response.data;
}

export type ProductionCostReportRow = {
  id: string;
  batchNumber: string;
  completedDate: string;
  modelId: string;
  modelCode: string;
  modelName: string;
  goodQuantity: number;
  damagedQuantity: number;
  wastedQuantity: number;
  materialCostMinor: number;
  componentCostMinor: number;
  directCostMinor: number;
  overheadCostMinor: number;
  totalCostMinor: number;
  costPerGoodPieceMinor: number;
};

type ProductionCostReportResponse = PaginatedResponse<ProductionCostReportRow> & {
  summary: ProductionCostReportSummary;
};

export async function getProductionCostReport(params?: MovementReportParams) {
  const response = await api.get<ProductionCostReportResponse>(
    `/reports/production-costs${queryString(params)}`
  );
  return response.data;
}
