import {
  AlertTriangle,
  Banknote,
  Boxes,
  ChevronDown,
  Factory,
  FileSpreadsheet,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShoppingCart,
  Sparkles,
  Truck,
  User,
  Wallet,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../i18n";
import type { AuthUser } from "../lib/api";
import { CommandPalette } from "./CommandPalette";

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
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar.collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const quickActionRef = useRef<HTMLDivElement>(null);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("sidebar.groups");
    if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
    return { dashboard: true, sales: true, purchasing: true, production: true, finance: true, settings: true };
  });

  const alertsQuery = useQuery({
    queryKey: ["low-stock-alerts"],
    queryFn: async () => {
      const { getLowStockAlerts } = await import("../lib/alerts");
      return getLowStockAlerts();
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true
  });
  const lowCount = alertsQuery.data?.total ?? 0;
  const lowMaterialsCount = alertsQuery.data?.lowMaterials.length ?? 0;
  const lowVariantsCount = alertsQuery.data?.lowVariants.length ?? 0;

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
    setQuickActionOpen(false);
  }, [location.pathname]);

  // Global Ctrl + K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click outside quick action dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickActionRef.current && !quickActionRef.current.contains(event.target as Node)) {
        setQuickActionOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <main className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-badge">
            <div className="brand-logo">
              <Factory size={20} />
            </div>
            {!collapsed ? (
              <div className="brand-text">
                <h1 className="brand-title">{t("auth.appName") || "StitchFlow"}</h1>
                <span className="brand-sub">إدارة مصانع الملابس</span>
              </div>
            ) : null}
          </div>
          <button
            className="sidebar-collapse"
            onClick={() => setCollapsed((c) => !c)}
            type="button"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>

        <nav aria-label={t("appShell.mainNavigation")}>
          {navGroups.map((group) => {
            const Icon = group.icon;
            const isOpen = openGroups[group.id] ?? true;
            const hasActive = group.items.some((it) =>
              location.pathname === it.to || (it.end ? location.pathname === "/" : location.pathname.startsWith(it.to))
            );
            return (
              <div key={group.id} className={`nav-group ${hasActive ? "has-active" : ""}`}>
                <button
                  className="nav-group-header"
                  onClick={() => toggleGroup(group.id)}
                  type="button"
                  aria-expanded={isOpen}
                >
                  <Icon size={16} />
                  {!collapsed ? <span>{t(group.labelKey)}</span> : null}
                  {!collapsed ? (
                    <ChevronDown size={14} className={`chevron ${isOpen ? "open" : ""}`} />
                  ) : null}
                </button>
                {isOpen || collapsed ? (
                  <div className="nav-group-items">
                    {group.items.map((item) => {
                      const isMaterials = item.to === "/materials" && lowMaterialsCount > 0;
                      const isFinished = item.to === "/finished-inventory" && lowVariantsCount > 0;
                      const showBadge = isMaterials || isFinished;
                      const badgeCount = isMaterials ? lowMaterialsCount : lowVariantsCount;
                      return (
                        <NavLink end={item.end} key={item.to} to={item.to} title={t(item.key)} style={{ position: "relative" }}>
                          {collapsed ? <Boxes size={16} /> : null}
                          <span>{t(item.key)}</span>
                          {showBadge && !collapsed ? (
                            <span style={{ background: "#dc2626", color: "white", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 3 }}>
                              <AlertTriangle size={10} /> {badgeCount}
                            </span>
                          ) : null}
                          {showBadge && collapsed ? (
                            <span style={{ position: "absolute", top: 2, insetInlineEnd: 2, width: 8, height: 8, background: "#dc2626", borderRadius: "50%" }} />
                          ) : null}
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="command-bar-trigger"
            style={{ width: "100%", justifyContent: collapsed ? "center" : "space-between" }}
            type="button"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={14} />
              {!collapsed ? <span>بحث سريع</span> : null}
            </div>
            {!collapsed ? <span className="command-key-badge">Ctrl K</span> : null}
          </button>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Header Bar */}
        <header className="top-header-bar">
          <div className="header-left">
            <button
              className="ghost-button mobile-menu"
              onClick={() => setMobileOpen((o) => !o)}
              type="button"
            >
              <Menu size={18} />
            </button>

            <button
              className="command-bar-trigger"
              onClick={() => setCommandPaletteOpen(true)}
              type="button"
            >
              <Search size={15} />
              <span>البحث السريع في النظام...</span>
              <span className="command-key-badge">Ctrl K</span>
            </button>
          </div>

          <div className="header-right">
            {/* Quick Action Dropdown */}
            <div ref={quickActionRef} style={{ position: "relative" }}>
              <button
                className="quick-action-btn"
                onClick={() => setQuickActionOpen((prev) => !prev)}
                type="button"
              >
                <Plus size={16} />
                <span>إجراء سريع</span>
                <ChevronDown size={14} />
              </button>

              {quickActionOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    insetInlineEnd: 0,
                    width: "220px",
                    background: "#ffffff",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-xl)",
                    padding: "6px",
                    zIndex: 50,
                    display: "grid",
                    gap: "2px"
                  }}
                >
                  <button
                    className="command-item"
                    style={{ padding: "8px 10px", fontSize: "13px" }}
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate("/sales-invoices");
                    }}
                    type="button"
                  >
                    <ShoppingCart size={15} style={{ color: "var(--primary)" }} />
                    <span>فاتورة مبيعات جديدة</span>
                  </button>
                  <button
                    className="command-item"
                    style={{ padding: "8px 10px", fontSize: "13px" }}
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate("/production-batches");
                    }}
                    type="button"
                  >
                    <Factory size={15} style={{ color: "#059669" }} />
                    <span>أمر تشغيل جديد</span>
                  </button>
                  <button
                    className="command-item"
                    style={{ padding: "8px 10px", fontSize: "13px" }}
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate("/material-receivings");
                    }}
                    type="button"
                  >
                    <Receipt size={15} style={{ color: "#0284c7" }} />
                    <span>إيصال استلام خامات</span>
                  </button>
                  <button
                    className="command-item"
                    style={{ padding: "8px 10px", fontSize: "13px" }}
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate("/customer-payments");
                    }}
                    type="button"
                  >
                    <Banknote size={15} style={{ color: "#d97706" }} />
                    <span>سند تحصيل عميل</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* Language Switch */}
            <button
              className="ghost-button"
              style={{ minHeight: "36px", padding: "0 10px" }}
              onClick={() => setLanguage(lang === "ar" ? "en" : "ar")}
              type="button"
              title="تغيير اللغة"
            >
              <Globe size={15} />
              <span>{lang === "ar" ? "English" : "العربية"}</span>
            </button>

            {/* User Profile */}
            <div className="user-profile-badge">
              <User size={15} style={{ color: "var(--primary)" }} />
              <strong>{user.displayName}</strong>
              <span className="role-pill">{user.role}</span>
            </div>

            {/* Logout Button */}
            <button
              className="ghost-button"
              style={{ minHeight: "36px", padding: "0 10px", color: "var(--danger)" }}
              onClick={onLogout}
              type="button"
              title={t("auth.signOut")}
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <section className="content">
          <header className="page-header">
            <div>
              <p className="eyebrow">{t("appShell.eyebrow")}</p>
              <h2>{t(meta.titleKey)}</h2>
              <p>{t(meta.descKey)}</p>
            </div>
          </header>

          <Outlet />
        </section>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </main>
  );
}
