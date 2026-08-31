import { api } from "./api";
import type { ListParams, PaginatedResponse } from "./types";

export type SalesInvoiceItemInput = {
  modelVariantId: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type SalesInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  invoiceDate: string;
  dueDate?: string | null;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  costOfGoodsMinor: number;
  grossProfitMinor: number;
  notes?: string | null;
  items?: Array<{
    id: string;
    modelVariantId: string;
    modelCode: string;
    modelName: string;
    sizeName: string;
    colorName: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
    unitCostMinor: number;
    totalCostMinor: number;
  }>;
};

export type CustomerPayment = {
  id: string;
  paymentNumber: string;
  customerId: string;
  customerName?: string;
  paymentDate: string;
  amountMinor: number;
  unallocatedAmountMinor: number;
  status?: string;
  reversedAt?: string | null;
  reversalNotes?: string | null;
  safeId: string;
  safeName?: string;
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
  notes?: string | null;
};

export type CustomerLedgerResponse = PaginatedResponse<{
  id: string;
  entryDate: string;
  sourceType: string;
  sourceId?: string | null;
  description: string;
  debitMinor: number;
  creditMinor: number;
  balanceAfterMinor: number;
  createdAt?: string;
}> & {
  balanceMinor: number;
};

function queryString(params: ListParams & { customerId?: string; status?: string } = {}): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.customerId) searchParams.set("customerId", params.customerId);
  if (params.status) searchParams.set("status", params.status);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listSalesInvoices(params?: ListParams & { customerId?: string; status?: string }) {
  const response = await api.get<PaginatedResponse<SalesInvoice>>(
    `/sales-invoices${queryString(params)}`
  );
  return response.data;
}

export async function listCustomerSalesInvoices(customerId: string, params?: ListParams) {
  const response = await api.get<PaginatedResponse<SalesInvoice>>(
    `/customers/${customerId}/sales-invoices${queryString(params)}`
  );
  return response.data;
}

export async function getCustomerLedger(customerId: string, params?: ListParams) {
  const response = await api.get<CustomerLedgerResponse>(
    `/customers/${customerId}/ledger${queryString(params)}`
  );
  return response.data;
}

export async function getSalesInvoice(id: string) {
  const response = await api.get<{ data: SalesInvoice }>(`/sales-invoices/${id}`);
  return response.data.data;
}

export async function createSalesInvoice(payload: {
  customerId: string;
  invoiceDate: string;
  dueDate?: string | null;
  discountAmount?: number;
  notes?: string | null;
  confirm?: boolean;
  items: SalesInvoiceItemInput[];
}) {
  const response = await api.post<{ id: string; invoiceNumber: string; totalMinor: number }>(
    "/sales-invoices",
    payload
  );
  return response.data;
}

export async function updateSalesInvoice(
  id: string,
  payload: {
    customerId: string;
    invoiceDate: string;
    dueDate?: string | null;
    discountAmount?: number;
    notes?: string | null;
    items: SalesInvoiceItemInput[];
  }
) {
  const response = await api.put<{ id: string; totalMinor: number }>(
    `/sales-invoices/${id}`,
    payload
  );
  return response.data;
}

export async function confirmSalesInvoice(id: string) {
  const response = await api.post<{ id: string; status: string }>(
    `/sales-invoices/${id}/confirm`,
    {}
  );
  return response.data;
}

export async function cancelSalesInvoice(id: string) {
  const response = await api.post<{ id: string; status: string }>(
    `/sales-invoices/${id}/cancel`,
    {}
  );
  return response.data;
}

export async function listCustomerPayments(params?: ListParams & { customerId?: string }) {
  const response = await api.get<PaginatedResponse<CustomerPayment>>(
    `/customer-payments${queryString(params)}`
  );
  return response.data;
}

export async function getCustomerPayment(id: string) {
  const response = await api.get<{
    data: CustomerPayment & {
      allocations: Array<{
        id: string;
        salesInvoiceId: string;
        invoiceNumber: string;
        allocatedAmountMinor: number;
      }>;
    };
  }>(`/customer-payments/${id}`);
  return response.data.data;
}

export async function createCustomerPayment(payload: {
  customerId: string;
  paymentDate: string;
  amount: number;
  safeId: string;
  paymentMethodId?: string | null;
  notes?: string | null;
  allocations?: Array<{ salesInvoiceId: string; allocatedAmount: number }>;
}) {
  const response = await api.post<{ id: string; paymentNumber: string }>(
    "/customer-payments",
    payload
  );
  return response.data;
}

export async function reverseCustomerPayment(
  id: string,
  payload: { reversalDate?: string; notes?: string | null } = {}
) {
  const response = await api.post<{ id: string; status: string }>(
    `/customer-payments/${id}/reverse`,
    payload
  );
  return response.data;
}
