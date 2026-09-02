export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type Customer = {
  id: string;
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: number | boolean;
};

export type Supplier = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: number | boolean;
};

export type Material = {
  id: string;
  name: string;
  colorName?: string | null;
  unit: string;
  currentQuantity: number;
  weightedAverageCostMinor: number;
  safetyThreshold: number;
  supplierId?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  isActive: number | boolean;
};

export type Size = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: number | boolean;
};

export type Color = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: number | boolean;
};

export type Model = {
  id: string;
  modelCode: string;
  modelName: string;
  mainMaterialId?: string | null;
  mainMaterialName?: string | null;
  description?: string | null;
  isActive: number | boolean;
  variantCount?: number;
};

export type ModelVariant = {
  id: string;
  modelId: string;
  sizeId: string;
  sizeName: string;
  colorId: string;
  colorName: string;
  currentQuantity: number;
  currentAverageCostMinor: number;
  barcode?: string | null;
  isActive: number | boolean;
};

export type Safe = {
  id: string;
  name: string;
  openingBalanceMinor: number;
  currentBalanceMinor: number;
  isActive: number | boolean;
};

export type PaymentMethod = {
  id: string;
  name: string;
  isActive: number | boolean;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  isOverhead: number | boolean;
  isActive: number | boolean;
};

export type Owner = {
  id: string;
  name: string;
  ownershipPercent?: number | null;
  isActive: number | boolean;
};

export type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  activeOnly?: boolean;
};
