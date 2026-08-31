import type { Request } from "express";

export type PaginationParams = {
  page: number;
  pageSize: number;
  search: string;
  activeOnly: boolean;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function parsePagination(req: Request): PaginationParams {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const activeOnly = req.query.activeOnly !== "false";

  return { page, pageSize, search, activeOnly };
}

export function paginatedResponse<T>(
  rows: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  return {
    data: rows,
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize))
    }
  };
}

export function likePattern(search: string): string {
  return `%${search.replace(/[%_\\]/g, "\\$&")}%`;
}
