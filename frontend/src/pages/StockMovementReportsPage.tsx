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
  getFinishedMovementReport,
  getRawMaterialMovementReport
} from "../lib/reports";

type ReportMode = "raw" | "finished";

const today = new Date().toISOString().slice(0, 10);

function movementLabel(type: string, t: (k: string) => string): string {
  switch (type) {
    case "receiving":
      return t("receivings.title");
    case "production_consumption":
      return t("production.details.consumptions");
    case "production_output":
      return t("production.details.outputs");
    case "sale":
      return t("sales.title");
    case "adjustment":
      return t("materials.actions.adjust");
    case "reversal":
      return t("status.reversed");
    default:
      return type;
  }
}

export function StockMovementReportsPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<ReportMode>("raw");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(today);
  const [isExporting, setIsExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const queryParams = {
    page,
    pageSize: 30,
    search: debouncedSearch,
    dateFrom,
    dateTo
  };

  const rawQuery = useQuery({
    queryKey: ["report", "raw-material-movements", queryParams],
    queryFn: () => getRawMaterialMovementReport(queryParams),
    enabled: mode === "raw"
  });

  const finishedQuery = useQuery({
    queryKey: ["report", "finished-stock-movements", queryParams],
    queryFn: () => getFinishedMovementReport(queryParams),
    enabled: mode === "finished"
  });

  const activeSummary = mode === "raw" ? rawQuery.data?.summary : finishedQuery.data?.summary;
  const activeMeta = mode === "raw" ? rawQuery.data?.meta : finishedQuery.data?.meta;
  const isActiveLoading = mode === "raw" ? rawQuery.isLoading : finishedQuery.isLoading;

  async function handleExport() {
    setIsExporting(true);
    const exportedOn = new Date().toISOString().slice(0, 10);
    const exportParams = {
      page: 1,
      pageSize: 10000,
      search: debouncedSearch,
      dateFrom,
      dateTo
    };

    try {
      if (mode === "raw") {
        const report = await getRawMaterialMovementReport(exportParams);
        exportRowsToExcel(`raw-material-movements-${exportedOn}.xlsx`, t("reports.rawMovements"), [
          ...report.data.map((row) => ({
            [t("common.date")]: row.movementDate,
            [t("materials.name")]: row.itemName,
            [t("common.type")]: movementLabel(row.movementType, t),
            [t("common.quantity")]: row.quantityDelta,
            [t("reports.totalQuantity")]: row.quantityAfter,
            [t("materials.unit")]: row.unit,
            [t("materials.avgCost")]: moneyMinorToMajor(row.unitCostMinor),
            [t("reports.totalValue")]: moneyMinorToMajor(row.totalCostMinor),
            [t("common.description")]: row.description || ""
          })),
          {
            [t("common.date")]: t("common.total"),
            [t("materials.name")]: "",
            [t("common.type")]: "",
            [t("common.quantity")]: report.summary.netQuantity,
            [t("reports.totalQuantity")]: "",
            [t("materials.unit")]: "",
            [t("materials.avgCost")]: "",
            [t("reports.totalValue")]: moneyMinorToMajor(report.summary.netValueMinor),
            [t("common.description")]: ""
          }
        ]);
        return;
      }

      const report = await getFinishedMovementReport(exportParams);
      exportRowsToExcel(`finished-stock-movements-${exportedOn}.xlsx`, t("reports.finishedMovements"), [
        ...report.data.map((row) => ({
          [t("common.date")]: row.movementDate,
          [t("models.modelCode")]: row.modelCode,
          [t("models.modelName")]: row.modelName,
          [t("finished.variant")]: `${row.sizeName} / ${row.colorName}`,
          [t("common.type")]: movementLabel(row.movementType, t),
          [t("common.quantity")]: row.quantityDelta,
          [t("reports.totalQuantity")]: row.quantityAfter,
          [t("materials.avgCost")]: moneyMinorToMajor(row.unitCostMinor),
          [t("reports.totalValue")]: moneyMinorToMajor(row.totalCostMinor),
          [t("common.description")]: row.description || ""
        })),
        {
          [t("common.date")]: t("common.total"),
          [t("models.modelCode")]: "",
          [t("models.modelName")]: "",
          [t("finished.variant")]: "",
          [t("common.type")]: "",
          [t("common.quantity")]: report.summary.netQuantity,
          [t("reports.totalQuantity")]: "",
          [t("materials.avgCost")]: "",
          [t("reports.totalValue")]: moneyMinorToMajor(report.summary.netValueMinor),
          [t("common.description")]: ""
        }
      ]);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <ListPageShell
      title={t("reports.movementsTitle")}
      description={t("reports.rawMovements") + " / " + t("reports.finishedMovements")}
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
          {t("reports.rawMovements")}
        </button>
        <button
          className={mode === "finished" ? "tab-button active" : "tab-button"}
          type="button"
          onClick={() => {
            setMode("finished");
            setPage(1);
          }}
        >
          {t("reports.finishedMovements")}
        </button>
      </div>

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
        <button className="ghost-button" type="button" onClick={() => setPage(1)}>
          {t("common.apply") !== "common.apply" ? t("common.apply") : "Apply"}
        </button>
        <button className="primary-button" type="button" disabled={isExporting} onClick={handleExport}>
          <Download aria-hidden="true" />
          {isExporting ? t("common.loading") : t("reports.export")}
        </button>
      </form>

      <div className="summary-strip">
        <div>
          <span>{t("reports.quantityIn")}</span>
          {isActiveLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{activeSummary?.quantityIn ?? 0}</strong>}
        </div>
        <div>
          <span>{t("reports.quantityOut")}</span>
          {isActiveLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{activeSummary?.quantityOut ?? 0}</strong>}
        </div>
        <div>
          <span>{t("reports.netQuantity")}</span>
          {isActiveLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{activeSummary?.netQuantity ?? 0}</strong>}
        </div>
        <div>
          <span>{t("reports.valueIn")}</span>
          {isActiveLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(activeSummary?.valueInMinor ?? 0)}</strong>}
        </div>
        <div>
          <span>{t("reports.valueOut")}</span>
          {isActiveLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(activeSummary?.valueOutMinor ?? 0)}</strong>}
        </div>
      </div>

      {mode === "raw" ? (
        <table>
          <thead>
            <tr>
              <th>{t("common.date")}</th>
              <th>{t("materials.name")}</th>
              <th>{t("common.type")}</th>
              <th>{t("common.quantity")}</th>
              <th>{t("reports.totalQuantity")}</th>
              <th>{t("materials.avgCost")}</th>
              <th>{t("reports.totalValue")}</th>
              <th>{t("common.description")}</th>
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
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                  </tr>
                ))}
              </>
            ) : (rawQuery.data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={8}>{t("reports.noData")}</td>
              </tr>
            ) : (
              (rawQuery.data?.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.movementDate}</td>
                  <td>{row.itemName}</td>
                  <td>{movementLabel(row.movementType, t)}</td>
                  <td dir="ltr">
                    {row.quantityDelta} {row.unit}
                  </td>
                  <td dir="ltr">{row.quantityAfter}</td>
                  <td dir="ltr">{formatMoney(row.unitCostMinor)}</td>
                  <td dir="ltr">{formatMoney(row.totalCostMinor)}</td>
                  <td>{row.description || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("common.date")}</th>
              <th>{t("models.modelCode")}</th>
              <th>{t("finished.variant")}</th>
              <th>{t("common.type")}</th>
              <th>{t("common.quantity")}</th>
              <th>{t("reports.totalQuantity")}</th>
              <th>{t("materials.avgCost")}</th>
              <th>{t("reports.totalValue")}</th>
              <th>{t("common.description")}</th>
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
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                    <td><div className="skeleton" style={{ height: 16 }} /></td>
                  </tr>
                ))}
              </>
            ) : (finishedQuery.data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={9}>{t("reports.noData")}</td>
              </tr>
            ) : (
              (finishedQuery.data?.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.movementDate}</td>
                  <td dir="ltr">{row.modelCode}</td>
                  <td>
                    {row.sizeName} / {row.colorName}
                  </td>
                  <td>{movementLabel(row.movementType, t)}</td>
                  <td dir="ltr">{row.quantityDelta}</td>
                  <td dir="ltr">{row.quantityAfter}</td>
                  <td dir="ltr">{formatMoney(row.unitCostMinor)}</td>
                  <td dir="ltr">{formatMoney(row.totalCostMinor)}</td>
                  <td>{row.description || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </ListPageShell>
  );
}
