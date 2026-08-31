import { useQuery } from "@tanstack/react-query";
import { Activity, Banknote, Boxes, Factory, PackageCheck, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { useI18n } from "../i18n";
import { formatMoney } from "../lib/master-data";
import { getDashboardSummary } from "../lib/reports";

export function DashboardPage() {
  const { t } = useI18n();
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      return response.ok;
    }
  });
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary
  });

  const summary = summaryQuery.data;
  const cards = [
    {
      title: t("dashboard.customerReceivables"),
      value: formatMoney(summary?.customerReceivablesMinor ?? 0),
      icon: ReceiptText
    },
    {
      title: t("dashboard.supplierPayables"),
      value: formatMoney(summary?.supplierPayablesMinor ?? 0),
      icon: Banknote
    },
    {
      title: t("dashboard.treasuryBalance"),
      value: formatMoney(summary?.treasuryBalanceMinor ?? 0),
      icon: Wallet
    },
    {
      title: t("dashboard.estimatedNet"),
      value: formatMoney(summary?.estimatedNetMinor ?? 0),
      icon: TrendingUp
    },
    {
      title: t("dashboard.rawMaterialValue"),
      value: formatMoney(summary?.rawMaterialStockValueMinor ?? 0),
      helper: t("dashboard.helperUnits", { count: summary?.rawMaterialQuantity ?? 0 }),
      icon: Boxes
    },
    {
      title: t("dashboard.finishedStockValue"),
      value: formatMoney(summary?.finishedStockValueMinor ?? 0),
      helper: t("dashboard.helperPieces", { count: summary?.finishedStockQuantity ?? 0 }),
      icon: PackageCheck
    },
    {
      title: t("dashboard.salesRevenue"),
      value: formatMoney(summary?.salesRevenueMinor ?? 0),
      helper: t("dashboard.helperInvoices", { count: summary?.salesInvoiceCount ?? 0 }),
      icon: Activity
    },
    {
      title: t("dashboard.productionCompleted"),
      value: String(summary?.productionCompletedCount ?? 0),
      helper: t("dashboard.helperInProgress", { count: summary?.productionInProgressCount ?? 0 }),
      icon: Factory
    }
  ];

  if (summaryQuery.isLoading) {
    return (
      <section className="page-section">
        <div className="card-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="status-card">
              <div className="skeleton" style={{ width: 60, height: 14 }} />
              <div className="skeleton" style={{ width: 100, height: 20 }} />
              <div className="skeleton" style={{ width: 80, height: 12 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const topCards = cards.slice(0, 3);
  const midCards = cards.slice(3, 6);
  const bottomCards = cards.slice(6, 8);

  return (
    <section className="page-section">
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {topCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="status-card" key={card.title} style={{ borderColor: "#c8b596", background: "#fefce8" }}>
              <Icon aria-hidden="true" />
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              {"helper" in card ? <small>{card.helper}</small> : null}
            </article>
          );
        })}
      </div>
      <div className="card-grid" style={{ marginTop: 16 }}>
        {midCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="status-card" key={card.title}>
              <Icon aria-hidden="true" />
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              {"helper" in card ? <small>{card.helper}</small> : null}
            </article>
          );
        })}
      </div>
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginTop: 16 }}>
        {bottomCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="status-card" key={card.title}>
              <Icon aria-hidden="true" />
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              {"helper" in card ? <small>{card.helper}</small> : null}
            </article>
          );
        })}
      </div>

      <article className="panel">
        <h3>{t("dashboard.businessSnapshot")}</h3>
        <p>{t("dashboard.snapshotDesc")}</p>
        <p className="muted">
          {t("dashboard.grossProfit")}: {formatMoney(summary?.grossProfitMinor ?? 0)} | {t("dashboard.paidExpenses")}:{" "}
          {formatMoney(summary?.paidExpensesMinor ?? 0)}
        </p>
        <p className="muted">
          {t("dashboard.backendHealth")}: {healthQuery.isLoading ? t("dashboard.checking") : healthQuery.data ? t("dashboard.ok") : t("dashboard.unavailable")}
        </p>
      </article>
    </section>
  );
}
