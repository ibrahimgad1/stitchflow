import { api } from "./api";
import type {
  Color,
  Customer,
  ExpenseCategory,
  ListParams,
  Material,
  Model,
  ModelVariant,
  Owner,
  PaginatedResponse,
  PaymentMethod,
  Safe,
  Size,
  Supplier
} from "./types";

function queryString(params: ListParams = {}): string {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search) searchParams.set("search", params.search);
  if (params.activeOnly === false) searchParams.set("activeOnly", "false");
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listCustomers(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Customer>>(`/customers${queryString(params)}`);
  return response.data;
}

export async function getCustomer(id: string) {
  const response = await api.get<{ data: Customer }>(`/customers/${id}`);
  return response.data.data;
}

export async function createCustomer(payload: Omit<Customer, "id">) {
  const response = await api.post<Customer>("/customers", payload);
  return response.data;
}

export async function updateCustomer(id: string, payload: Omit<Customer, "id">) {
  const response = await api.put<Customer>(`/customers/${id}`, payload);
  return response.data;
}

export async function listSuppliers(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Supplier>>(`/suppliers${queryString(params)}`);
  return response.data;
}

export async function getSupplier(id: string) {
  const response = await api.get<{ data: Supplier }>(`/suppliers/${id}`);
  return response.data.data;
}

export async function createSupplier(payload: Omit<Supplier, "id">) {
  const response = await api.post<Supplier>("/suppliers", payload);
  return response.data;
}

export async function updateSupplier(id: string, payload: Omit<Supplier, "id">) {
  const response = await api.put<Supplier>(`/suppliers/${id}`, payload);
  return response.data;
}

export async function listMaterials(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Material>>(`/materials${queryString(params)}`);
  return response.data;
}

export async function createMaterial(payload: Partial<Material> & Pick<Material, "name" | "unit">) {
  const response = await api.post<Material>("/materials", payload);
  return response.data;
}

export async function updateMaterial(id: string, payload: Partial<Material> & Pick<Material, "name" | "unit">) {
  const response = await api.put<Material>(`/materials/${id}`, payload);
  return response.data;
}

export async function listSizes(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Size>>(`/sizes${queryString(params)}`);
  return response.data;
}

export async function createSize(payload: Omit<Size, "id">) {
  const response = await api.post<Size>("/sizes", payload);
  return response.data;
}

export async function updateSize(id: string, payload: Omit<Size, "id">) {
  const response = await api.put<Size>(`/sizes/${id}`, payload);
  return response.data;
}

export async function listColors(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Color>>(`/colors${queryString(params)}`);
  return response.data;
}

export async function createColor(payload: Omit<Color, "id">) {
  const response = await api.post<Color>("/colors", payload);
  return response.data;
}

export async function updateColor(id: string, payload: Omit<Color, "id">) {
  const response = await api.put<Color>(`/colors/${id}`, payload);
  return response.data;
}

export async function listModels(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Model>>(`/models${queryString(params)}`);
  return response.data;
}

export async function createModel(payload: Omit<Model, "id" | "variantCount">) {
  const response = await api.post<Model>("/models", payload);
  return response.data;
}

export async function updateModel(id: string, payload: Omit<Model, "id" | "variantCount">) {
  const response = await api.put<Model>(`/models/${id}`, payload);
  return response.data;
}

export async function listModelVariants(modelId: string) {
  const response = await api.get<{ data: ModelVariant[] }>(`/models/${modelId}/variants`);
  return response.data.data;
}

export async function createModelVariant(
  modelId: string,
  payload: Pick<ModelVariant, "sizeId" | "colorId"> & { isActive?: boolean }
) {
  const response = await api.post<ModelVariant>(`/models/${modelId}/variants`, payload);
  return response.data;
}

export async function listSafes(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Safe>>(`/safes${queryString(params)}`);
  return response.data;
}

export async function createSafe(payload: { name: string; openingBalance: number; isActive?: boolean }) {
  const response = await api.post<Safe>("/safes", payload);
  return response.data;
}

export async function updateSafe(id: string, payload: { name: string; isActive?: boolean }) {
  const response = await api.put<Safe>(`/safes/${id}`, payload);
  return response.data;
}

export async function listPaymentMethods(params?: ListParams) {
  const response = await api.get<PaginatedResponse<PaymentMethod>>(
    `/payment-methods${queryString(params)}`
  );
  return response.data;
}

export async function createPaymentMethod(payload: Omit<PaymentMethod, "id">) {
  const response = await api.post<PaymentMethod>("/payment-methods", payload);
  return response.data;
}

export async function updatePaymentMethod(id: string, payload: Omit<PaymentMethod, "id">) {
  const response = await api.put<PaymentMethod>(`/payment-methods/${id}`, payload);
  return response.data;
}

export async function listExpenseCategories(params?: ListParams) {
  const response = await api.get<PaginatedResponse<ExpenseCategory>>(
    `/expense-categories${queryString(params)}`
  );
  return response.data;
}

export async function createExpenseCategory(payload: Omit<ExpenseCategory, "id">) {
  const response = await api.post<ExpenseCategory>("/expense-categories", payload);
  return response.data;
}

export async function updateExpenseCategory(id: string, payload: Omit<ExpenseCategory, "id">) {
  const response = await api.put<ExpenseCategory>(`/expense-categories/${id}`, payload);
  return response.data;
}

export async function listOwners(params?: ListParams) {
  const response = await api.get<PaginatedResponse<Owner>>(`/owners${queryString(params)}`);
  return response.data;
}

export async function createOwner(payload: Omit<Owner, "id">) {
  const response = await api.post<Owner>("/owners", payload);
  return response.data;
}

export async function updateOwner(id: string, payload: Omit<Owner, "id">) {
  const response = await api.put<Owner>(`/owners/${id}`, payload);
  return response.data;
}

export function formatMoney(minor: number): string {
  return (minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function isActive(value: number | boolean | undefined): boolean {
  return value === true || value === 1;
}
