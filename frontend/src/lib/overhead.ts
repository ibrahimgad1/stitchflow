import { api } from "./api";

export type OverheadPeriod = {
  id: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  totalOverheadMinor: number;
  totalGoodQuantity: number;
  overheadPerPieceMinor: number;
  calculatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export async function listOverheadPeriods(params: { page?: number; pageSize?: number } = {}) {
  const res = await api.get("/overhead-periods", { params });
  return res.data as { data: OverheadPeriod[]; meta: { page: number; total: number; totalPages: number } };
}

export async function getOverheadPeriod(id: string) {
  const res = await api.get(`/overhead-periods/${id}`);
  return res.data.data as OverheadPeriod & { entries: unknown[]; allocations: unknown[] };
}

export async function createOverheadPeriod(input: { periodYear: number; periodMonth: number }) {
  const res = await api.post("/overhead-periods", input);
  return res.data as OverheadPeriod;
}

export async function calculateOverheadPeriod(id: string) {
  const res = await api.post(`/overhead-periods/${id}/calculate`);
  return res.data as OverheadPeriod;
}

export async function closeOverheadPeriod(id: string) {
  const res = await api.post(`/overhead-periods/${id}/close`);
  return res.data;
}
