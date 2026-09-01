import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Boxes,
  CheckCircle2,
  Factory,
  PackageCheck,
  PlusCircle,
  Receipt,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wallet
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { getLowStockAlerts } from "../lib/alerts";
import { formatMoney } from "../lib/master-data";
import { getDashboardSummary } from "../lib/reports";

export function DashboardPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

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

  const alertsQuery = useQuery({
    queryKey: ["low-stock-alerts"],
    queryFn: getLowStockAlerts,
    refetchInterval: 60000
  });
  const alerts = alertsQuery.data;

  const chartsQuery = useQuery({
    queryKey: ["dashboard-charts"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/charts", { headers: { Authorization: `Bearer ${localStorage.getItem("auth.token")}` } });
      const data = await res.json();
      return data.data as { monthly: Array<{ month: string; salesMinor: number; expenseMinor: number }>; topSelling: Array<{ modelCode: string; modelName: string; totalQty: number }> };
    }
  });

  const recentQuery = useQuery({
    queryKey: ["dashboard-recent"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/recent-activity", { headers: { Authorization: `Bearer ${localStorage.getItem("auth.token")}` } });
      const data = await res.json();
      return data.data as { invoices: Array<{ id: string; invoiceNumber: string; customerName: string; totalMinor: number; status: string }>; batches: Array<{ id: string; batchNumber: string; modelCode: string; status: string }>; payments: Array<{ id: string; paymentNumber: string; customerName: string; amountMinor: number }> };
    }
  });

  const topCards = [
    {
      title: t("dashboard.customerReceivables") || "مستحقات على العملاء",
      value: formatMoney(summary?.customerReceivablesMinor ?? 0),
      icon: ReceiptText,
      color: "#4f46e5",
      bgColor: "#eef2ff",
      helper: "إجمالي الآجل لدى العملاء"
    },
    {
      title: t("dashboard.supplierPayables") || "مستحقات للموردين",
      value: formatMoney(summary?.supplierPayablesMinor ?? 0),
      icon: Banknote,
      color: "#d97706",
      bgColor: "#fffbeb",
      helper: "إجمالي الآجل للموردين"
    },
    {
      title: t("dashboard.treasuryBalance") || "رصيد الخزائن والبنوك",
      value: formatMoney(summary?.treasuryBalanceMinor ?? 0),
      icon: Wallet,
      color: "#059669",
      bgColor: "#ecfdf5",
      helper: "السيولة النقدية الحالية"
    },
    {
      title: t("dashboard.estimatedNet") || "صافي المركز المالي التقديري",
      value: formatMoney(summary?.estimatedNetMinor ?? 0),
      icon: TrendingUp,
      color: "#0284c7",
      bgColor: "#f0f9ff",
      helper: "السيولة + المستحقات - الالتزامات"
    }
  ];

  const operationalCards = [
    {
      title: t("dashboard.rawMaterialValue") || "قيمة مخزون الخامات",
      value: formatMoney(summary?.rawMaterialStockValueMinor ?? 0),
      helper: t("dashboard.helperUnits", { count: summary?.rawMaterialQuantity ?? 0 }),
      icon: Boxes,
      color: "#7c3aed",
      bgColor: "#f5f3ff"
    },
    {
      title: t("dashboard.finishedStockValue") || "قيمة مخزون الإنتاج التام",
      value: formatMoney(summary?.finishedStockValueMinor ?? 0),
      helper: t("dashboard.helperPieces", { count: summary?.finishedStockQuantity ?? 0 }),
      icon: PackageCheck,
      color: "#2563eb",
      bgColor: "#eff6ff"
    },
    {
      title: t("dashboard.salesRevenue") || "إجمالي المبيعات",
      value: formatMoney(summary?.salesRevenueMinor ?? 0),
      helper: t("dashboard.helperInvoices", { count: summary?.salesInvoiceCount ?? 0 }),
      icon: Activity,
      color: "#0d9488",
      bgColor: "#f0fdfa"
    },
    {
      title: t("dashboard.productionCompleted") || "أوامر التشغيل المكتملة",
      value: String(summary?.productionCompletedCount ?? 0),
      helper: t("dashboard.helperInProgress", { count: summary?.productionInProgressCount ?? 0 }),
      icon: Factory,
      color: "#ea580c",
      bgColor: "#fff7ed"
    }
  ];

  if (summaryQuery.isLoading) {
    return (
      <section className="page-section">
        <div className="card-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="status-card">
              <div className="skeleton" style={{ width: 80, height: 16 }} />
              <div className="skeleton" style={{ width: 120, height: 24 }} />
              <div className="skeleton" style={{ width: 90, height: 12 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      {/* Executive Financial Metrics */}
      <div className="card-grid">
        {topCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="status-card" key={card.title}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div
                  className="icon-wrapper"
                  style={{ background: card.bgColor, color: card.color }}
                >
                  <Icon aria-hidden="true" />
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: card.bgColor, color: card.color }}>
                  مؤشر مالي
                </span>
              </div>
              <div>
                <span>{card.title}</span>
                <strong>{card.value}</strong>
              </div>
              <small>{card.helper}</small>
            </article>
          );
        })}
      </div>

      {/* Operational & Inventory Metrics */}
      <div className="card-grid" style={{ marginTop: 12 }}>
        {operationalCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="status-card" key={card.title}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div
                  className="icon-wrapper"
                  style={{ background: card.bgColor, color: card.color }}
                >
                  <Icon aria-hidden="true" />
                </div>
              </div>
              <div>
                <span>{card.title}</span>
                <strong>{card.value}</strong>
              </div>
              <small>{card.helper}</small>
            </article>
          );
        })}
      </div>

      {/* Quick-Action Launchpad */}
      <div style={{ marginTop: 12 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 800, color: "var(--text-main)" }}>
          إجراءات سريعة واختصارات التشغيل
        </h3>
        <div className="dashboard-launchpad">
          <div
            className="launchpad-card"
            onClick={() => navigate("/sales-invoices")}
          >
            <div className="icon-box" style={{ background: "#eef2ff", color: "#4f46e5" }}>
              <ShoppingCart size={22} />
            </div>
            <div>
              <strong>إنشاء فاتورة مبيعات</strong>
              <span>تسجيل مبيعات جديدة للعملاء</span>
            </div>
          </div>

          <div
            className="launchpad-card"
            onClick={() => navigate("/production-batches")}
          >
            <div className="icon-box" style={{ background: "#ecfdf5", color: "#059669" }}>
              <Factory size={22} />
            </div>
            <div>
              <strong>إصدار أمر تشغيل</strong>
              <span>بدء دورة إنتاج ومتابعة المراحل</span>
            </div>
          </div>

          <div
            className="launchpad-card"
            onClick={() => navigate("/material-receivings")}
          >
            <div className="icon-box" style={{ background: "#f0f9ff", color: "#0284c7" }}>
              <Receipt size={22} />
            </div>
            <div>
              <strong>استلام وتوريد خامات</strong>
              <span>تسجيل وارد أقمشة ومستلزمات</span>
            </div>
          </div>

          <div
            className="launchpad-card"
            onClick={() => navigate("/treasury")}
          >
            <div className="icon-box" style={{ background: "#fffbeb", color: "#d97706" }}>
              <Wallet size={22} />
            </div>
            <div>
              <strong>حركة الخزينة والتحويلات</strong>
              <span>إدارة السيولة وحسابات الشركاء</span>
            </div>
          </div>
        </div>
      </div>

      {/* Safety Stock Alerts */}
      {alerts && alerts.hasAlerts ? (
        <article
          style={{
            marginTop: 16,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "var(--radius-xl)",
            padding: "16px 20px",
            display: "grid",
            gap: "12px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#dc2626", display: "flex", gap: 8, alignItems: "center" }}>
              <AlertTriangle size={18} /> تنبيهات مخزون الأمان ({alerts.total})
            </h4>
            <span style={{ fontSize: 12, color: "#991b1b" }}>مخزون منخفض — يحتاج توريد</span>
          </div>
          {alerts.lowMaterials.length > 0 ? (
            <div>
              <strong style={{ fontSize: 13 }}>خامات منخفضة:</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {alerts.lowMaterials.slice(0, 5).map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: "8px 10px", borderRadius: 8, border: "1px solid #fecaca" }}>
                    <span>{m.name} {m.colorName ? `(${m.colorName})` : ""} — {m.currentQuantity} / {m.safetyThreshold} {m.unit} <span style={{ color: "#dc2626" }}>ناقص {m.shortage.toFixed(2)}</span></span>
                    <button className="primary-button" style={{ padding: "6px 10px", fontSize: 12, background: "#dc2626" }} onClick={() => navigate("/material-receivings", { state: { materialId: m.id, shortage: m.shortage, supplierId: m.supplierId } })} type="button">توريد</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {alerts.lowVariants.length > 0 ? (
            <div>
              <strong style={{ fontSize: 13 }}>منتج جاهز منخفض:</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {alerts.lowVariants.slice(0, 5).map((v) => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", padding: "8px 10px", borderRadius: 8, border: "1px solid #fecaca" }}>
                    <span>{v.modelCode} {v.sizeName}/{v.colorName} — {v.currentQuantity} / {v.safetyThreshold} <span style={{ color: "#dc2626" }}>ناقص {v.shortage}</span></span>
                    <button className="ghost-button" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => navigate("/finished-inventory")} type="button">عرض</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}

      {/* Charts & Top Selling */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginTop: 16 }}>
        <article style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800 }}>المبيعات vs المصروفات (6 أشهر)</h4>
          {chartsQuery.isLoading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (chartsQuery.data?.monthly?.length ?? 0) === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>لا توجد بيانات بعد</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {(chartsQuery.data?.monthly ?? []).map((m) => {
                const max = Math.max(...(chartsQuery.data?.monthly ?? []).map((x) => Math.max(x.salesMinor, x.expenseMinor)), 1);
                const salesW = (m.salesMinor / max) * 100;
                const expW = (m.expenseMinor / max) * 100;
                return (
                  <div key={m.month} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span dir="ltr" style={{ fontWeight: 600 }}>{m.month}</span>
                    <div style={{ display: "grid", gap: 3 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ flex: 1, background: "#eef2ff", borderRadius: 999, height: 8, overflow: "hidden" }}>
                          <div style={{ width: `${salesW}%`, background: "#4f46e5", height: "100%" }} />
                        </div>
                        <span style={{ minWidth: 80, textAlign: "end" }} dir="ltr">{formatMoney(m.salesMinor)}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ flex: 1, background: "#fef2f2", borderRadius: 999, height: 8, overflow: "hidden" }}>
                          <div style={{ width: `${expW}%`, background: "#dc2626", height: "100%" }} />
                        </div>
                        <span style={{ minWidth: 80, textAlign: "end" }} dir="ltr">{formatMoney(m.expenseMinor)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}><span style={{ width: 10, height: 10, background: "#4f46e5", borderRadius: 2, display: "inline-block" }} /> مبيعات</span>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}><span style={{ width: 10, height: 10, background: "#dc2626", borderRadius: 2, display: "inline-block" }} /> مصروفات</span>
              </div>
            </div>
          )}
        </article>
        <article style={{ background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800 }}>الأكثر مبيعا</h4>
          {chartsQuery.isLoading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (chartsQuery.data?.topSelling?.length ?? 0) === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>لا توجد مبيعات</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {(chartsQuery.data?.topSelling ?? []).map((item, idx) => (
                <div key={item.modelCode} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: idx === 0 ? "#eef2ff" : "#f8fafc", borderRadius: 8, border: `1px solid ${idx === 0 ? "#c7d2fe" : "#e2e8f0"}` }}>
                  <span style={{ fontWeight: idx === 0 ? 800 : 600, fontSize: 13 }}>{idx + 1}. {item.modelCode} — {item.modelName}</span>
                  <span style={{ fontWeight: 700, color: "#4f46e5" }}>{item.totalQty} قطعة</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      {/* Recent Activity Feed */}
      <article style={{ marginTop: 12, background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 16 }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>النشاط الأخير</h4>
        {recentQuery.isLoading ? (
          <div className="skeleton" style={{ height: 80 }} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div>
              <strong style={{ fontSize: 12, color: "#4f46e5" }}>آخر الفواتير</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {(recentQuery.data?.invoices ?? []).map((inv) => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "#f8fafc", borderRadius: 6, fontSize: 12 }}>
                    <span dir="ltr">{inv.invoiceNumber}</span>
                    <span>{inv.customerName}</span>
                    <button className="link-button" style={{ fontSize: 11 }} onClick={() => navigate("/sales-invoices")}>عرض</button>
                  </div>
                ))}
                {(recentQuery.data?.invoices?.length ?? 0) === 0 ? <span className="muted" style={{ fontSize: 12 }}>لا يوجد</span> : null}
              </div>
            </div>
            <div>
              <strong style={{ fontSize: 12, color: "#059669" }}>آخر أوامر التشغيل</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {(recentQuery.data?.batches ?? []).map((b) => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "#f8fafc", borderRadius: 6, fontSize: 12 }}>
                    <span dir="ltr">{b.batchNumber}</span>
                    <span>{b.modelCode}</span>
                    <button className="link-button" style={{ fontSize: 11 }} onClick={() => navigate("/production-batches")}>عرض</button>
                  </div>
                ))}
                {(recentQuery.data?.batches?.length ?? 0) === 0 ? <span className="muted" style={{ fontSize: 12 }}>لا يوجد</span> : null}
              </div>
            </div>
            <div>
              <strong style={{ fontSize: 12, color: "#d97706" }}>آخر التحصيلات</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {(recentQuery.data?.payments ?? []).map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "#f8fafc", borderRadius: 6, fontSize: 12 }}>
                    <span dir="ltr">{p.paymentNumber}</span>
                    <span>{p.customerName}</span>
                    <button className="link-button" style={{ fontSize: 11 }} onClick={() => navigate("/customer-payments")}>عرض</button>
                  </div>
                ))}
                {(recentQuery.data?.payments?.length ?? 0) === 0 ? <span className="muted" style={{ fontSize: 12 }}>لا يوجد</span> : null}
              </div>
            </div>
          </div>
        )}
      </article>

      {/* Financial Health Summary Banner */}
      <article
        style={{
          marginTop: 16,
          background: "#ffffff",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "20px 24px",
          boxShadow: "var(--shadow-sm)",
          display: "grid",
          gap: "12px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
              {t("dashboard.businessSnapshot") || "الملخص المالي والتشغيلي العام"}
            </h4>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "13px" }}>
              {t("dashboard.snapshotDesc") || "نظرة شاملة وسريعة على أداء المصنع والسيولة والأرباح"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "12px", color: healthQuery.data ? "#059669" : "#d97706" }}>
            <CheckCircle2 size={16} />
            <span>حالة النظام: {healthQuery.isLoading ? "جاري الفحص..." : healthQuery.data ? "يعمل بكفاءة متصلة" : "غير متاح"}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 4 }}>
          <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("dashboard.grossProfit") || "مجمل الربح التقديري"}:</span>
            <strong style={{ display: "block", fontSize: "16px", marginTop: 2, color: "#059669" }}>
              {formatMoney(summary?.grossProfitMinor ?? 0)}
            </strong>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{t("dashboard.paidExpenses") || "المصروفات العامة المدفوعة"}:</span>
            <strong style={{ display: "block", fontSize: "16px", marginTop: 2, color: "#dc2626" }}>
              {formatMoney(summary?.paidExpensesMinor ?? 0)}
            </strong>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border-subtle)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>إجمالي الفواتير الصادرة:</span>
            <strong style={{ display: "block", fontSize: "16px", marginTop: 2 }}>
              {summary?.salesInvoiceCount ?? 0} فاتورة
            </strong>
          </div>
        </div>
      </article>
    </section>
  );
}
