import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import {
  ListPageShell,
  PaginationBar,
  useDebouncedValue
} from "../components/ListPageShell";
import { useI18n } from "../i18n";
import { exportRowsToExcel, moneyMinorToMajor } from "../lib/export-excel";
import { formatMoney } from "../lib/master-data";
import {
  getFinishedStockReport,
  getRawMaterialStockReport
} from "../lib/reports";

type ReportMode = "raw" | "finished";

export function StockReportsPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<ReportMode>("raw");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const rawQuery = useQuery({
    queryKey: ["report", "raw-material-stock", page, debouncedSearch],
    queryFn: () => getRawMaterialStockReport({ page, pageSize: 30, search: debouncedSearch }),
    enabled: mode === "raw"
  });

  const finishedQuery = useQuery({
    queryKey: ["report", "finished-stock", page, debouncedSearch],
    queryFn: () => getFinishedStockReport({ page, pageSize: 30, search: debouncedSearch }),
    enabled: mode === "finished"
  });

  const activeSummary = mode === "raw" ? rawQuery.data?.summary : finishedQuery.data?.summary;
  const activeMeta = mode === "raw" ? rawQuery.data?.meta : finishedQuery.data?.meta;
  const isLoading = mode === "raw" ? rawQuery.isLoading : finishedQuery.isLoading;

  async function handleExport() {
    setIsExporting(true);
    const exportedOn = new Date().toISOString().slice(0, 10);

    try {
      if (mode === "raw") {
        const report = await getRawMaterialStockReport({
          page: 1,
          pageSize: 10000,
          search: debouncedSearch
        });
        exportRowsToExcel(`raw-material-stock-${exportedOn}.xlsx`, t("reports.rawStock"), [
          ...report.data.map((row) => ({
            [t("materials.name")]: row.name,
            [t("materials.color")]: row.colorName || "",
            [t("materials.supplier")]: row.supplierName || "",
            [t("common.quantity")]: row.currentQuantity,
            [t("materials.unit")]: row.unit,
            [t("reports.avgCost")]: moneyMinorToMajor(row.weightedAverageCostMinor),
            [t("reports.totalValue")]: moneyMinorToMajor(row.stockValueMinor)
          })),
          {
            [t("materials.name")]: t("common.total"),
            [t("materials.color")]: "",
            [t("materials.supplier")]: "",
            [t("common.quantity")]: report.summary.totalQuantity,
            [t("materials.unit")]: "",
            [t("reports.avgCost")]: "",
            [t("reports.totalValue")]: moneyMinorToMajor(report.summary.totalValueMinor)
          }
        ]);
        return;
      }

      const report = await getFinishedStockReport({
        page: 1,
        pageSize: 10000,
        search: debouncedSearch
      });
      exportRowsToExcel(`finished-stock-${exportedOn}.xlsx`, t("reports.finishedStock"), [
        ...report.data.map((row) => ({
          [t("models.modelCode")]: row.modelCode,
          [t("models.modelName")]: row.modelName,
          [t("models.variant.size")]: row.sizeName,
          [t("models.variant.color")]: row.colorName,
          [t("common.quantity")]: row.currentQuantity,
          [t("reports.avgCost")]: moneyMinorToMajor(row.currentAverageCostMinor),
          [t("reports.totalValue")]: moneyMinorToMajor(row.stockValueMinor)
        })),
        {
          [t("models.modelCode")]: t("common.total"),
          [t("models.modelName")]: "",
          [t("models.variant.size")]: "",
          [t("models.variant.color")]: "",
          [t("common.quantity")]: report.summary.totalQuantity,
          [t("reports.avgCost")]: "",
          [t("reports.totalValue")]: moneyMinorToMajor(report.summary.totalValueMinor)
        }
      ]);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <ListPageShell
      title={t("reports.stockTitle")}
      description={t("reports.rawStock") + " / " + t("reports.finishedStock")}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      footer={
        activeMeta ? (
          <PaginationBar
            page={activeMeta.page}
            total={activeMeta.total}
            totalPages={activeMeta.totalPages}
            onPageChange={setPage}
          />
        ) : null
      }
    >
      <div className="tab-row">
        <button
          className={mode === "raw" ? "tab-button active" : "tab-button"}
          type="button"
          onClick={() => {
            setMode("raw");
            setPage(1);
          }}
        >
          {t("reports.rawStock")}
        </button>
        <button
          className={mode === "finished" ? "tab-button active" : "tab-button"}
          type="button"
          onClick={() => {
            setMode("finished");
            setPage(1);
          }}
        >
          {t("reports.finishedStock")}
        </button>
      </div>

      <div className="toolbar">
        <span>{mode === "raw" ? t("reports.rawStock") : t("reports.finishedStock")}</span>
        <button className="primary-button" type="button" disabled={isExporting} onClick={handleExport}>
          <Download aria-hidden="true" />
          {isExporting ? t("common.loading") : t("reports.export")}
        </button>
      </div>

      <div className="summary-strip">
        <div>
          <span>{t("reports.totalQuantity")}</span>
          {isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{activeSummary?.totalQuantity ?? 0}</strong>}
        </div>
        <div>
          <span>{t("reports.totalValue")}</span>
          {isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(activeSummary?.totalValueMinor ?? 0)}</strong>}
        </div>
        <div>
          <span>{t("common.total")}</span>
          {isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{activeMeta?.total ?? 0}</strong>}
        </div>
      </div>

      {mode === "raw" ? (
        <table>
          <thead>
            <tr>
              <th>{t("materials.name")}</th>
              <th>{t("materials.color")}</th>
              <th>{t("materials.supplier")}</th>
              <th>{t("common.quantity")}</th>
              <th>{t("reports.avgCost")}</th>
              <th>{t("reports.totalValue")}</th>
            </tr>
          </thead>
          <tbody>
            {rawQuery.isLoading ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                  </tr>
                ))}
              </>
            ) : (rawQuery.data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6}>{t("reports.noData")}</td>
              </tr>
            ) : (
              (rawQuery.data?.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.colorName || "-"}</td>
                  <td>{row.supplierName || "-"}</td>
                  <td dir="ltr">
                    {row.currentQuantity} {row.unit}
                  </td>
                  <td dir="ltr">{formatMoney(row.weightedAverageCostMinor)}</td>
                  <td dir="ltr">{formatMoney(row.stockValueMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("models.modelCode")}</th>
              <th>{t("models.modelName")}</th>
              <th>{t("models.variant.size")}</th>
              <th>{t("models.variant.color")}</th>
              <th>{t("common.quantity")}</th>
              <th>{t("reports.avgCost")}</th>
              <th>{t("reports.totalValue")}</th>
            </tr>
          </thead>
          <tbody>
            {finishedQuery.isLoading ? (
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
                  </tr>
                ))}
              </>
            ) : (finishedQuery.data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7}>{t("reports.noData")}</td>
              </tr>
            ) : (
              (finishedQuery.data?.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.modelCode}</td>
                  <td>{row.modelName}</td>
                  <td>{row.sizeName}</td>
                  <td>{row.colorName}</td>
                  <td dir="ltr">{row.currentQuantity}</td>
                  <td dir="ltr">{formatMoney(row.currentAverageCostMinor)}</td>
                  <td dir="ltr">{formatMoney(row.stockValueMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </ListPageShell>
  );
}
