import { api } from "./api";
import type { ListParams, PaginatedResponse } from "./types";

export type MaterialReceivingItemInput = {
  materialId: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type MaterialReceiving = {
  id: string;
  receivingNumber: string;
  supplierId: string;
  supplierName?: string;
  receivingDate: string;
  dueDate?: string | null;
  documentReference?: string | null;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: string;
  notes?: string | null;
  createdAt?: string;
  items?: Array<{
    id: string;
    materialId: string;
    materialName: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
    notes?: string | null;
  }>;
};

export type SupplierPayment = {
  id: string;
  paymentNumber: string;
  supplierId: string;
  supplierName?: string;
  paymentDate: string;
  amountMinor: number;
  unallocatedAmountMinor: number;
  safeId: string;
  safeName?: string;
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
  notes?: string | null;
};

export type SupplierLedgerResponse = PaginatedResponse<{
  id: string;
  entryDate: string;
  sourceType: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
  balanceAfterMinor: number;
}> & {
  balanceMinor: number;
  openingMinor?: number;
  totals?: { debit: number; credit: number };
};

export type StockMovement = {
  id: string;
  movementDate: string;
  movementType: string;
  quantityDelta: number;
  unitCostMinor: number;
  quantityAfter: number;
  description?: string | null;
};

function queryString(params: ListParams & { supplierId?: string } = {}): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.supplierId) searchParams.set("supplierId", params.supplierId);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listMaterialReceivings(params?: ListParams & { supplierId?: string }) {
  const response = await api.get<PaginatedResponse<MaterialReceiving>>(
    `/material-receivings${queryString(params)}`
  );
  return response.data;
}

export async function getMaterialReceiving(id: string) {
  const response = await api.get<{ data: MaterialReceiving }>(`/material-receivings/${id}`);
  return response.data.data;
}

export async function listSupplierReceivings(supplierId: string, params?: ListParams) {
  const response = await api.get<PaginatedResponse<MaterialReceiving>>(
    `/suppliers/${supplierId}/receivings${queryString(params)}`
  );
  return response.data;
}

export async function createMaterialReceiving(payload: {
  supplierId: string;
  receivingDate: string;
  dueDate?: string | null;
  documentReference?: string | null;
  notes?: string | null;
  items: MaterialReceivingItemInput[];
  paidAmount?: number;
  safeId?: string | null;
  paymentMethodId?: string | null;
}) {
  const response = await api.post<MaterialReceiving>("/material-receivings", payload);
  return response.data;
}

export async function listSupplierPayments(params?: ListParams & { supplierId?: string }) {
  const response = await api.get<PaginatedResponse<SupplierPayment>>(
    `/supplier-payments${queryString(params)}`
  );
  return response.data;
}

export async function getSupplierPayment(id: string) {
  const response = await api.get<{
    data: SupplierPayment & {
      allocations: Array<{
        id: string;
        materialReceivingId: string;
        receivingNumber: string;
        allocatedAmountMinor: number;
      }>;
    };
  }>(`/supplier-payments/${id}`);
  return response.data.data;
}

export async function createSupplierPayment(payload: {
  supplierId: string;
  paymentDate: string;
  amount: number;
  safeId: string;
  paymentMethodId?: string | null;
  notes?: string | null;
  allocations?: Array<{ materialReceivingId: string; allocatedAmount: number }>;
}) {
  const response = await api.post<{ id: string; paymentNumber: string }>(
    "/supplier-payments",
    payload
  );
  return response.data;
}

export async function getSupplierLedger(
  supplierId: string,
  params?: ListParams & { dateFrom?: string; dateTo?: string }
) {
  const qs = queryString(params as ListParams);
  const extra: string[] = [];
  if ((params as any)?.dateFrom) extra.push(`dateFrom=${encodeURIComponent((params as any).dateFrom)}`);
  if ((params as any)?.dateTo) extra.push(`dateTo=${encodeURIComponent((params as any).dateTo)}`);
  const url = `/suppliers/${supplierId}/ledger${qs}${extra.length ? (qs ? "&" : "?") + extra.join("&") : ""}`;
  const response = await api.get<SupplierLedgerResponse>(url);
  return response.data;
}

export async function listMaterialMovements(materialId: string, params?: ListParams) {
  const response = await api.get<PaginatedResponse<StockMovement>>(
    `/materials/${materialId}/movements${queryString(params)}`
  );
  return response.data;
}

export async function adjustMaterialStock(
  materialId: string,
  payload: { newQuantity: number; reason: string; adjustmentDate?: string }
) {
  const response = await api.post<{ previousQuantity: number; newQuantity: number }>(
    `/materials/${materialId}/adjustments`,
    payload
  );
  return response.data;
}
