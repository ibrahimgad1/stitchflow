import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import {
  ListPageShell,
  PaginationBar,
  StatusPill,
  useDebouncedValue
} from "../components/ListPageShell";
import { useI18n } from "../i18n";
import { exportRowsToExcel, moneyMinorToMajor } from "../lib/export-excel";
import { formatMoney } from "../lib/master-data";
import { calculateOverheadPeriod, createOverheadPeriod, getOverheadPeriod, listOverheadPeriods } from "../lib/overhead";
import { getProductionCostReport } from "../lib/reports";
import { DatePresets } from "../components/DatePresets";

const today = new Date().toISOString().slice(0, 10);

export function ProductionCostReportsPage() {
  const { t, statusLabel } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(today);
  const [isExporting, setIsExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search);
  const [overheadYear, setOverheadYear] = useState(String(new Date().getFullYear()));
  const [overheadMonth, setOverheadMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedOverheadId, setSelectedOverheadId] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");

  const reportQuery = useQuery({
    queryKey: ["report", "production-costs", page, debouncedSearch, dateFrom, dateTo],
    queryFn: () =>
      getProductionCostReport({
        page,
        pageSize: 30,
        search: debouncedSearch,
        dateFrom,
        dateTo
      })
  });

  const summary = reportQuery.data?.summary;
  const meta = reportQuery.data?.meta;
  const rows = reportQuery.data?.data ?? [];

  const overheadQuery = useQuery({
    queryKey: ["overhead-periods"],
    queryFn: () => listOverheadPeriods({ page: 1, pageSize: 20 })
  });

  const createOverheadMutation = useMutation({
    mutationFn: () => createOverheadPeriod({ periodYear: Number(overheadYear), periodMonth: Number(overheadMonth) }),
    onSuccess: async () => {
      setCreateError("");
      await queryClient.invalidateQueries({ queryKey: ["overhead-periods"] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "";
      if (msg.includes("already exists") || msg.includes("موجود")) {
        setCreateError("الفترة موجودة مسبقا — اختر شهر آخر أو اضغط احتساب على الفترة الحالية");
      } else {
        setCreateError(t("overhead.error"));
      }
    }
  });

  const calculateMutation = useMutation({
    mutationFn: (id: string) => calculateOverheadPeriod(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["overhead-periods"] });
      await queryClient.invalidateQueries({ queryKey: ["report", "production-costs"] });
      if (selectedOverheadId) {
        await queryClient.invalidateQueries({ queryKey: ["overhead-period", selectedOverheadId] });
      }
    }
  });

  const overheadDetailQuery = useQuery({
    queryKey: ["overhead-period", selectedOverheadId],
    queryFn: () => getOverheadPeriod(selectedOverheadId!),
    enabled: Boolean(selectedOverheadId)
  });

  const existingPeriodForInput = (overheadQuery.data?.data ?? []).find(
    (p) => p.periodYear === Number(overheadYear) && p.periodMonth === Number(overheadMonth)
  );
  const isDuplicateCreate = Boolean(existingPeriodForInput);

  async function handleExport() {
    setIsExporting(true);
    const exportedOn = new Date().toISOString().slice(0, 10);

    try {
      const report = await getProductionCostReport({
        page: 1,
        pageSize: 10000,
        search: debouncedSearch,
        dateFrom,
        dateTo
      });

      exportRowsToExcel(`production-costs-${exportedOn}.xlsx`, t("reports.productionCosts"), [
        ...report.data.map((row) => ({
          [t("production.batchNumber")]: row.batchNumber,
          [t("common.date")]: row.completedDate,
          [t("models.modelCode")]: row.modelCode,
          [t("models.modelName")]: row.modelName,
          [t("reports.goodQuantity")]: row.goodQuantity,
          [t("reports.damagedQuantity")]: row.damagedQuantity,
          [t("reports.wastedQuantity")]: row.wastedQuantity,
          [t("reports.materialCost")]: moneyMinorToMajor(row.materialCostMinor),
          [t("reports.componentCost")]: moneyMinorToMajor(row.componentCostMinor),
          [t("reports.directCost")]: moneyMinorToMajor(row.directCostMinor),
          [t("reports.overheadCost")]: moneyMinorToMajor(row.overheadCostMinor),
          [t("reports.totalCost")]: moneyMinorToMajor(row.totalCostMinor),
          [t("reports.avgCost")]: moneyMinorToMajor(row.costPerGoodPieceMinor)
        })),
        {
          [t("production.batchNumber")]: t("common.total"),
          [t("common.date")]: "",
          [t("models.modelCode")]: "",
          [t("models.modelName")]: "",
          [t("reports.goodQuantity")]: report.summary.goodQuantity,
          [t("reports.damagedQuantity")]: report.summary.damagedQuantity,
          [t("reports.wastedQuantity")]: report.summary.wastedQuantity,
          [t("reports.materialCost")]: moneyMinorToMajor(report.summary.materialCostMinor),
          [t("reports.componentCost")]: moneyMinorToMajor(report.summary.componentCostMinor),
          [t("reports.directCost")]: moneyMinorToMajor(report.summary.directCostMinor),
          [t("reports.overheadCost")]: moneyMinorToMajor(report.summary.overheadCostMinor),
          [t("reports.totalCost")]: moneyMinorToMajor(report.summary.totalCostMinor),
          [t("reports.avgCost")]: moneyMinorToMajor(report.summary.averageCostPerGoodPieceMinor)
        }
      ]);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <ListPageShell
      title={t("reports.productionTitle")}
      description={t("reports.productionCosts")}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      footer={
        meta ? (
          <PaginationBar
            page={meta.page}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
          />
        ) : null
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <DatePresets
          onSelect={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
            setPage(1);
          }}
        />
        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <label>
            {t("reports.dateFrom")}
            <input
              dir="ltr"
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            {t("reports.dateTo")}
            <input
              dir="ltr"
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <button className="primary-button" type="button" disabled={isExporting} onClick={handleExport}>
            <Download aria-hidden="true" />
            {isExporting ? t("common.loading") : t("reports.export")}
          </button>
        </form>
      </div>

      <div className="summary-strip">
        <div>
          <span>{t("reports.goodQuantity")}</span>
          {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{summary?.goodQuantity ?? 0}</strong>}
        </div>
        <div>
          <span>{t("reports.totalCost")}</span>
          {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(summary?.totalCostMinor ?? 0)}</strong>}
        </div>
        <div>
          <span>{t("reports.materialCost")}</span>
          {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(summary?.materialCostMinor ?? 0)}</strong>}
        </div>
        <div>
          <span>{t("reports.componentCost")}</span>
          {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(summary?.componentCostMinor ?? 0)}</strong>}
        </div>
        <div>
          <span>{t("reports.avgCost")}</span>
          {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(summary?.averageCostPerGoodPieceMinor ?? 0)}</strong>}
        </div>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h3>{t("overhead.title")}</h3>
        <p className="muted">{t("overhead.description")}</p>
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            if (isDuplicateCreate) {
              setCreateError("الفترة موجودة مسبقا — اختر شهر آخر أو اضغط احتساب على الفترة الحالية");
              return;
            }
            createOverheadMutation.mutate();
          }}
        >
          <label>
            {t("overhead.year")}
            <input dir="ltr" type="number" value={overheadYear} onChange={(e) => { setOverheadYear(e.target.value); setCreateError(""); }} style={{ width: 90 }} />
          </label>
          <label>
            {t("overhead.month")}
            <input dir="ltr" type="number" min={1} max={12} value={overheadMonth} onChange={(e) => { setOverheadMonth(e.target.value); setCreateError(""); }} style={{ width: 70 }} />
          </label>
          <button className="primary-button" type="submit" disabled={createOverheadMutation.isPending || isDuplicateCreate}>
            {createOverheadMutation.isPending ? t("common.saving") : t("overhead.create")}
          </button>
          {isDuplicateCreate ? <span className="muted" style={{ fontSize: 12, color: "#b42318" }}>الفترة {overheadYear}-{String(overheadMonth).padStart(2,"0")} موجودة مسبقا</span> : null}
        </form>
        {createError ? <p className="form-error">{createError}</p> : null}
        {createOverheadMutation.isError && !createError ? <p className="form-error">{t("overhead.error")}</p> : null}
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>{t("overhead.period")}</th>
                <th>{t("overhead.status")}</th>
                <th>{t("overhead.totalOverhead")}</th>
                <th>{t("overhead.totalGoodQty")}</th>
                <th>{t("overhead.perPiece")}</th>
                <th aria-label={t("common.actions")} />
              </tr>
            </thead>
            <tbody>
              {overheadQuery.isLoading ? (
                <>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td><div className="skeleton" style={{ height: 16 }} /></td>
                      <td><div className="skeleton" style={{ height: 16, width: 60 }} /></td>
                      <td><div className="skeleton" style={{ height: 16 }} /></td>
                      <td><div className="skeleton" style={{ height: 16 }} /></td>
                      <td><div className="skeleton" style={{ height: 16 }} /></td>
                      <td><div className="skeleton" style={{ height: 16 }} /></td>
                    </tr>
                  ))}
                </>
              ) : (overheadQuery.data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6}>{t("overhead.noPeriods")}</td>
                </tr>
              ) : (
                (overheadQuery.data?.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td dir="ltr">
                      {p.periodYear}-{String(p.periodMonth).padStart(2, "0")}
                    </td>
                    <td><StatusPill status={p.status} /></td>
                    <td dir="ltr">{formatMoney(p.totalOverheadMinor)}</td>
                    <td>{p.totalGoodQuantity}</td>
                    <td dir="ltr">{formatMoney(p.overheadPerPieceMinor)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="link-button" onClick={() => setSelectedOverheadId(selectedOverheadId === p.id ? null : p.id)} type="button">
                          {selectedOverheadId === p.id ? t("common.close") : t("common.view")}
                        </button>
                        {p.status !== "closed" ? (
                          <button className="link-button" onClick={() => calculateMutation.mutate(p.id)} type="button" disabled={calculateMutation.isPending}>
                            {p.status === "calculated" ? "إعادة احتساب" : t("overhead.calculate")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {t("overhead.tooltip")} — {t("production.costSummary.overheadCost")} يظهر بعد الاحتساب. لإضافة تكاليف: اذهب لـ <strong>المصروفات → إضافة مصروف</strong> واختر <strong>تصنيف غير مباشر</strong> + <strong>الفترة {overheadYear}-{String(overheadMonth).padStart(2,"0")}</strong> ثم ارجع واضغط احتساب.
        </p>

        {selectedOverheadId && overheadDetailQuery.data ? (
          <div className="panel" style={{ marginTop: 12, background: "#fefce8" }}>
            <h4>
              تفاصيل الفترة {overheadDetailQuery.data.periodYear}-{String(overheadDetailQuery.data.periodMonth).padStart(2,"0")} — {statusLabel(overheadDetailQuery.data.status)}
            </h4>
            <p className="muted">
              الحساب: <strong dir="ltr">{formatMoney(overheadDetailQuery.data.totalOverheadMinor)} / {overheadDetailQuery.data.totalGoodQuantity} قطعة</strong> ={" "}
              <strong dir="ltr">{formatMoney(overheadDetailQuery.data.overheadPerPieceMinor)}</strong> للقطعة
              {overheadDetailQuery.data.totalOverheadMinor === 0 ? (
                <span style={{ color: "#b42318" }}> — لا يوجد مصروف غير مباشر مرتبط، لذلك حصة القطعة 0.00 (35 قطعة من PB-00004 20 + PB-00005 15)</span>
              ) : null}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
              <div>
                <h5>{t("overhead.entries")} ({(overheadDetailQuery.data.entries as unknown[]).length})</h5>
                {(overheadDetailQuery.data.entries as Array<{ amountMinor: number; categoryName: string | null; entryDate: string; notes: string | null }>).length === 0 ? (
                  <p className="muted">لا يوجد مصروف مرتبط — أضف مصروف غير مباشر لهذه الفترة</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>{t("common.date")}</th>
                        <th>{t("expenses.category")}</th>
                        <th>{t("common.amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overheadDetailQuery.data.entries as Array<{ amountMinor: number; categoryName: string | null; entryDate: string }>).map((e, idx) => (
                        <tr key={idx}>
                          <td dir="ltr">{e.entryDate}</td>
                          <td>{e.categoryName || "-"}</td>
                          <td dir="ltr">{formatMoney(e.amountMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h5>الدفعات في الشهر ({(overheadDetailQuery.data.allocations as unknown[]).length})</h5>
                {(overheadDetailQuery.data.allocations as Array<{ batchNumber: string; modelCode: string; goodQuantity: number; allocatedAmountMinor: number }>).length === 0 ? (
                  <p className="muted">35 قطعة حاليا (PB-00004 20 + PB-00005 15) — أي دفعة جديدة تكتمل في هذا الشهر ستأخذ الحصة تلقائيا</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>{t("production.batchNumber")}</th>
                        <th>{t("reports.goodQuantity")}</th>
                        <th>{t("overhead.perPiece")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overheadDetailQuery.data.allocations as Array<{ batchNumber: string; goodQuantity: number; overheadPerPieceMinor: number }>).map((a) => (
                        <tr key={a.batchNumber}>
                          <td dir="ltr">{a.batchNumber}</td>
                          <td>{a.goodQuantity}</td>
                          <td dir="ltr">{formatMoney(a.overheadPerPieceMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <table>
        <thead>
          <tr>
            <th>{t("production.batchNumber")}</th>
            <th>{t("common.date")}</th>
            <th>{t("models.modelCode")}</th>
            <th>{t("reports.goodQuantity")}</th>
            <th>{t("reports.damagedQuantity")}</th>
            <th>{t("reports.materialCost")}</th>
            <th>{t("reports.componentCost")}</th>
            <th>{t("reports.overheadCost")}</th>
            <th>{t("reports.totalCost")}</th>
            <th>{t("reports.avgCost")}</th>
          </tr>
        </thead>
        <tbody>
          {reportQuery.isLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                  <td><div className="skeleton" style={{ height: 16 }} /></td>
                </tr>
              ))}
            </>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={10}>{t("reports.noData")}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td dir="ltr">{row.batchNumber}</td>
                <td dir="ltr">{row.completedDate}</td>
                <td>
                  {row.modelCode} - {row.modelName}
                </td>
                <td dir="ltr">{row.goodQuantity}</td>
                <td dir="ltr">{row.damagedQuantity}</td>
                <td dir="ltr">{formatMoney(row.materialCostMinor)}</td>
                <td dir="ltr">{formatMoney(row.componentCostMinor)}</td>
                <td dir="ltr">{formatMoney(row.overheadCostMinor)}</td>
                <td dir="ltr">{formatMoney(row.totalCostMinor)}</td>
                <td dir="ltr">{formatMoney(row.costPerGoodPieceMinor)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ListPageShell>
  );
}
