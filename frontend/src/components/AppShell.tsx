import {
  Boxes,
  ChevronDown,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings2,
  ShoppingCart,
  Truck,
  Wallet,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import type { AuthUser } from "../lib/api";

type NavItem = { to: string; key: string; end?: boolean };
type NavGroup = { id: string; labelKey: string; icon: React.ElementType; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    items: [{ to: "/", key: "nav.dashboard", end: true }]
  },
  {
    id: "sales",
    labelKey: "nav.sales",
    icon: ShoppingCart,
    items: [
      { to: "/customers", key: "nav.customers" },
      { to: "/sales-invoices", key: "nav.sales" },
      { to: "/customer-payments", key: "nav.customerPayments" },
      { to: "/customer-statements", key: "nav.customerStatements" }
    ]
  },
  {
    id: "purchasing",
    labelKey: "nav.suppliers",
    icon: Truck,
    items: [
      { to: "/suppliers", key: "nav.suppliers" },
      { to: "/supplier-statements", key: "nav.supplierStatements" },
      { to: "/materials", key: "nav.materials" },
      { to: "/material-receivings", key: "nav.receivings" },
      { to: "/supplier-payments", key: "nav.supplierPayments" }
    ]
  },
  {
    id: "production",
    labelKey: "nav.production",
    icon: Factory,
    items: [
      { to: "/models", key: "nav.models" },
      { to: "/production-batches", key: "nav.production" },
      { to: "/finished-inventory", key: "nav.finishedStock" },
      { to: "/stock-reports", key: "nav.stockReports" },
      { to: "/stock-movements", key: "nav.stockMovements" },
      { to: "/production-costs", key: "nav.productionCosts" }
    ]
  },
  {
    id: "finance",
    labelKey: "nav.treasury",
    icon: Wallet,
    items: [
      { to: "/expenses", key: "nav.expenses" },
      { to: "/treasury", key: "nav.treasury" },
      { to: "/safes", key: "nav.safes" }
    ]
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    icon: Settings2,
    items: [{ to: "/settings", key: "nav.settings" }]
  }
];

const routeMeta: Record<string, { titleKey: string; descKey: string }> = {
  "/": { titleKey: "dashboard.title", descKey: "dashboard.snapshotDesc" },
  "/customers": { titleKey: "customers.title", descKey: "customers.description" },
  "/sales-invoices": { titleKey: "sales.title", descKey: "sales.description" },
  "/customer-payments": { titleKey: "customerPayments.title", descKey: "customerPayments.description" },
  "/customer-statements": { titleKey: "statements.titleCustomer", descKey: "statements.description" },
  "/suppliers": { titleKey: "suppliers.title", descKey: "suppliers.description" },
  "/supplier-statements": { titleKey: "statements.titleSupplier", descKey: "statements.description" },
  "/materials": { titleKey: "materials.title", descKey: "materials.description" },
  "/material-receivings": { titleKey: "receivings.title", descKey: "receivings.description" },
  "/supplier-payments": { titleKey: "supplierPayments.title", descKey: "supplierPayments.description" },
  "/production-batches": { titleKey: "production.title", descKey: "production.description" },
  "/finished-inventory": { titleKey: "finished.title", descKey: "finished.description" },
  "/expenses": { titleKey: "expenses.title", descKey: "expenses.description" },
  "/treasury": { titleKey: "treasury.title", descKey: "treasury.description" },
  "/stock-reports": { titleKey: "reports.stockTitle", descKey: "reports.rawStock" },
  "/stock-movements": { titleKey: "reports.movementsTitle", descKey: "reports.rawMovements" },
  "/production-costs": { titleKey: "reports.productionTitle", descKey: "reports.productionCosts" },
  "/models": { titleKey: "models.title", descKey: "models.description" },
  "/safes": { titleKey: "safes.title", descKey: "safes.description" },
  "/settings": { titleKey: "settings.title", descKey: "settings.description" }
};

export function AppShell({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const { t, lang, setLanguage } = useI18n();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar.collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("sidebar.groups");
    if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
    return { dashboard: true, sales: true, purchasing: true, production: true, finance: true, settings: true };
  });

  const activePath = "/" + location.pathname.split("/").slice(1, 2).join("/");
  const meta = routeMeta[location.pathname] ?? routeMeta[activePath] ?? { titleKey: "dashboard.title", descKey: "dashboard.snapshotDesc" };

  useEffect(() => {
    const title = t(meta.titleKey);
    document.title = `${title} - ${t("auth.appName")}`;
  }, [meta.titleKey, t]);

  useEffect(() => {
    localStorage.setItem("sidebar.collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("sidebar.groups", JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <main className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">{t("auth.appName")}</p>
            {!collapsed ? <h1>{t("appShell.title")}</h1> : null}
          </div>
          <button className="ghost-button sidebar-collapse" onClick={() => setCollapsed((c) => !c)} type="button" aria-label={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <nav aria-label={t("appShell.mainNavigation")}>
          {navGroups.map((group) => {
            const Icon = group.icon;
            const isOpen = openGroups[group.id] ?? true;
            const hasActive = group.items.some((it) => location.pathname === it.to || (it.end ? location.pathname === "/" : location.pathname.startsWith(it.to)));
            return (
              <div key={group.id} className={`nav-group ${hasActive ? "has-active" : ""}`}>
                <button className="nav-group-header" onClick={() => toggleGroup(group.id)} type="button" aria-expanded={isOpen}>
                  <Icon size={18} />
                  {!collapsed ? <span>{t(group.labelKey)}</span> : null}
                  {!collapsed ? <ChevronDown size={14} className={`chevron ${isOpen ? "open" : ""}`} /> : null}
                </button>
                {isOpen || collapsed ? (
                  <div className="nav-group-items">
                    {group.items.map((item) => (
                      <NavLink end={item.end} key={item.to} to={item.to} title={t(item.key)}>
                        {collapsed ? <Boxes size={16} /> : null}
                        <span>{t(item.key)}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <Receipt size={16} />
          {!collapsed ? <span className="muted" style={{ fontSize: 12 }}>{t("dashboard.estimatedNet")}: {t("common.loading")}</span> : null}
        </div>
      </aside>

      <section className="content">
        <header className="page-header">
          <div className="header-main">
            <button className="ghost-button mobile-menu" onClick={() => setMobileOpen((o) => !o)} type="button">
              <Menu size={18} />
            </button>
            <div>
              <p className="eyebrow">{t("appShell.eyebrow")}</p>
              <h2>{t(meta.titleKey)}</h2>
              <p>{t(meta.descKey)}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignSelf: "start", flexWrap: "wrap" }}>
            <button className="ghost-button" onClick={() => setLanguage(lang === "ar" ? "en" : "ar")} type="button">
              {lang === "ar" ? t("language.switchToEnglish") : t("language.switchToArabic")}
            </button>
            <button className="ghost-button" onClick={onLogout} type="button">
              <LogOut aria-hidden="true" />
              {t("auth.signOut")}
            </button>
          </div>
        </header>

        <section className="user-strip" aria-label={t("appShell.currentUser")}>
          <strong>{user.displayName}</strong>
          <span>{user.username}</span>
          <span>{user.role}</span>
        </section>

        <Outlet />
      </section>
    </main>
  );
}
