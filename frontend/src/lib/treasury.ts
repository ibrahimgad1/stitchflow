import { api } from "./api";
import type { ListParams, PaginatedResponse } from "./types";

export type Expense = {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  categoryId?: string | null;
  categoryName?: string | null;
  description: string;
  amountMinor: number;
  paymentStatus: "paid" | "unpaid";
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
  safeId?: string | null;
  safeName?: string | null;
  overheadPeriodId?: string | null;
  notes?: string | null;
  createdAt?: string;
};

export type SafeTransfer = {
  id: string;
  transferNumber: string;
  transferDate: string;
  fromSafeId: string;
  fromSafeName: string;
  toSafeId: string;
  toSafeName: string;
  amountMinor: number;
  notes?: string | null;
  createdAt?: string;
};

export type SafeTransaction = {
  id: string;
  safeId: string;
  safeName: string;
  transactionDate: string;
  transactionType: string;
  sourceType: string;
  sourceId?: string | null;
  direction: "in" | "out";
  amountMinor: number;
  balanceAfterMinor: number;
  description?: string | null;
  createdAt?: string;
};

export type CapitalTransaction = {
  id: string;
  transactionDate: string;
  transactionType: "capital_injection" | "owner_withdrawal";
  ownerId?: string | null;
  ownerName?: string | null;
  safeId: string;
  safeName: string;
  amountMinor: number;
  notes?: string | null;
  createdAt?: string;
};

export type TreasuryReport = {
  dateFrom?: string | null;
  dateTo?: string | null;
  totalSafeBalanceMinor: number;
  safeCount: number;
  inflowMinor: number;
  outflowMinor: number;
  netMovementMinor: number;
  bySafe: Array<{
    safeId: string;
    safeName: string;
    currentBalanceMinor: number;
    inflowMinor: number;
    outflowMinor: number;
    netMovementMinor: number;
  }>;
};

function queryString(
  params: ListParams & {
    paymentStatus?: string;
    safeId?: string;
    transactionType?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.paymentStatus) searchParams.set("paymentStatus", params.paymentStatus);
  if (params.safeId) searchParams.set("safeId", params.safeId);
  if (params.transactionType) searchParams.set("transactionType", params.transactionType);
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listExpenses(params?: ListParams & { paymentStatus?: string }) {
  const response = await api.get<PaginatedResponse<Expense>>(`/expenses${queryString(params)}`);
  return response.data;
}

export async function createExpense(payload: {
  expenseDate: string;
  categoryId?: string | null;
  description: string;
  amount: number;
  paymentStatus: "paid" | "unpaid";
  paymentMethodId?: string | null;
  safeId?: string | null;
  overheadPeriodId?: string | null;
  notes?: string | null;
}) {
  const response = await api.post<{
    id: string;
    expenseNumber: string;
    amountMinor: number;
    paymentStatus: string;
  }>("/expenses", payload);
  return response.data;
}

export async function listSafeTransfers(params?: ListParams) {
  const response = await api.get<PaginatedResponse<SafeTransfer>>(
    `/safe-transfers${queryString(params)}`
  );
  return response.data;
}

export async function createSafeTransfer(payload: {
  transferDate: string;
  fromSafeId: string;
  toSafeId: string;
  amount: number;
  notes?: string | null;
}) {
  const response = await api.post<{ id: string; transferNumber: string; amountMinor: number }>(
    "/safe-transfers",
    payload
  );
  return response.data;
}

export async function adjustSafeBalance(
  safeId: string,
  payload: { adjustmentDate: string; newBalance: number; reason: string }
) {
  const response = await api.post<{
    previousBalanceMinor: number;
    newBalanceMinor: number;
  }>(`/safes/${safeId}/adjustments`, payload);
  return response.data;
}

export async function listSafeTransactions(params?: ListParams & { safeId?: string }) {
  const response = await api.get<PaginatedResponse<SafeTransaction>>(
    `/safe-transactions${queryString(params)}`
  );
  return response.data;
}

export async function listCapitalTransactions(
  params?: ListParams & { transactionType?: string }
) {
  const response = await api.get<PaginatedResponse<CapitalTransaction>>(
    `/capital-transactions${queryString(params)}`
  );
  return response.data;
}

export async function createCapitalTransaction(payload: {
  transactionDate: string;
  transactionType: "capital_injection" | "owner_withdrawal";
  ownerId?: string | null;
  safeId: string;
  amount: number;
  notes?: string | null;
}) {
  const response = await api.post<{
    id: string;
    amountMinor: number;
    transactionType: string;
  }>("/capital-transactions", payload);
  return response.data;
}

export async function getTreasuryReport(params?: { dateFrom?: string; dateTo?: string }) {
  const response = await api.get<{ data: TreasuryReport }>(`/treasury/report${queryString(params)}`);
  return response.data.data;
}
