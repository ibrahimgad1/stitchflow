import {
  Banknote,
  Boxes,
  Calculator,
  Factory,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  PlusCircle,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";

type CommandItem = {
  id: string;
  title: string;
  category: string;
  icon: React.ElementType;
  keywords?: string[];
  action: () => void;
};

export function CommandPalette({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    // Navigation Pages
    {
      id: "nav-dashboard",
      title: t("nav.dashboard") || "لوحة التحكم (Dashboard)",
      category: "الصفحات الرئيسية",
      icon: LayoutDashboard,
      keywords: ["dashboard", "home", "الرئيسية", "احصائيات"],
      action: () => navigate("/")
    },
    {
      id: "nav-customers",
      title: t("nav.customers") || "العملاء (Customers)",
      category: "المبيعات والعملاء",
      icon: Users,
      keywords: ["customers", "عملاء", "عميل"],
      action: () => navigate("/customers")
    },
    {
      id: "nav-sales",
      title: t("nav.sales") || "فواتير المبيعات (Sales Invoices)",
      category: "المبيعات والعملاء",
      icon: ShoppingCart,
      keywords: ["sales", "invoices", "فواتير", "مبيعات", "فاتورة"],
      action: () => navigate("/sales-invoices")
    },
    {
      id: "nav-customer-payments",
      title: t("nav.customerPayments") || "مدفوعات وسندات العملاء",
      category: "المبيعات والعملاء",
      icon: Banknote,
      keywords: ["payments", "تحصيل", "سند قبض", "قبض"],
      action: () => navigate("/customer-payments")
    },
    {
      id: "nav-customer-statements",
      title: t("nav.customerStatements") || "كشوف حسابات العملاء",
      category: "المبيعات والعملاء",
      icon: FileSpreadsheet,
      keywords: ["statement", "كشف حساب", "حسابات"],
      action: () => navigate("/customer-statements")
    },
    {
      id: "nav-suppliers",
      title: t("nav.suppliers") || "الموردين (Suppliers)",
      category: "المشتريات والموردين",
      icon: Truck,
      keywords: ["suppliers", "موردين", "مورد"],
      action: () => navigate("/suppliers")
    },
    {
      id: "nav-materials",
      title: t("nav.materials") || "خامات الإنتاج (Raw Materials)",
      category: "المشتريات والموردين",
      icon: Boxes,
      keywords: ["materials", "خامات", "قماش", "أزرار", "خيط"],
      action: () => navigate("/materials")
    },
    {
      id: "nav-receivings",
      title: t("nav.receivings") || "إيصالات استلام الخامات",
      category: "المشتريات والموردين",
      icon: Receipt,
      keywords: ["receivings", "توريد", "استلام خامات"],
      action: () => navigate("/material-receivings")
    },
    {
      id: "nav-supplier-payments",
      title: t("nav.supplierPayments") || "مدفوعات الموردين (سندات صرف)",
      category: "المشتريات والموردين",
      icon: Banknote,
      keywords: ["supplier payments", "صرف", "سداد موردين"],
      action: () => navigate("/supplier-payments")
    },
    {
      id: "nav-models",
      title: t("nav.models") || "الموديلات والتصميمات (Models)",
      category: "التشغيل والإنتاج",
      icon: Calculator,
      keywords: ["models", "موديلات", "تصميم", "قميص", "بنطلون"],
      action: () => navigate("/models")
    },
    {
      id: "nav-production",
      title: t("nav.production") || "أوامر التشغيل والإنتاج (Batches)",
      category: "التشغيل والإنتاج",
      icon: Factory,
      keywords: ["production", "تشغيل", "أمر إنتاج", "باتش"],
      action: () => navigate("/production-batches")
    },
    {
      id: "nav-finished-stock",
      title: t("nav.finishedStock") || "مخزن الإنتاج التام (Finished Stock)",
      category: "التشغيل والإنتاج",
      icon: Boxes,
      keywords: ["finished", "جاهز", "مخزن تام", "جاهزة"],
      action: () => navigate("/finished-inventory")
    },
    {
      id: "nav-stock-reports",
      title: t("nav.stockReports") || "تقارير أرصدة المخزون",
      category: "التقارير",
      icon: FileText,
      keywords: ["stock reports", "تقرير مخزون", "جرد"],
      action: () => navigate("/stock-reports")
    },
    {
      id: "nav-stock-movements",
      title: t("nav.stockMovements") || "حركة المخزون التفصيلية",
      category: "التقارير",
      icon: History,
      keywords: ["movements", "حركة مخزون", "وارد", "منصرف"],
      action: () => navigate("/stock-movements")
    },
    {
      id: "nav-production-costs",
      title: t("nav.productionCosts") || "تقارير تكاليف الإنتاج",
      category: "التقارير",
      icon: Calculator,
      keywords: ["costs", "تكلفة", "حساب تكلفة"],
      action: () => navigate("/production-costs")
    },
    {
      id: "nav-treasury",
      title: t("nav.treasury") || "الخزينة والشركاء (Treasury)",
      category: "المالية والحسابات",
      icon: Wallet,
      keywords: ["treasury", "خزينة", "بنك", "شركاء", "سحب"],
      action: () => navigate("/treasury")
    },
    {
      id: "nav-expenses",
      title: t("nav.expenses") || "المصروفات العامة (Expenses)",
      category: "المالية والحسابات",
      icon: Banknote,
      keywords: ["expenses", "مصروفات", "إيجار", "كهرباء", "نثريات"],
      action: () => navigate("/expenses")
    },
    {
      id: "nav-settings",
      title: t("nav.settings") || "إعدادات النظام والنسخ الاحتياطي",
      category: "النظام",
      icon: Settings,
      keywords: ["settings", "إعدادات", "نسخ احتياطي", "backup"],
      action: () => navigate("/settings")
    }
  ];

  const filteredCommands = commands.filter((cmd) => {
    if (!query.trim()) return true;
    const lower = query.toLowerCase();
    const titleMatch = cmd.title.toLowerCase().includes(lower);
    const catMatch = cmd.category.toLowerCase().includes(lower);
    const keyMatch = cmd.keywords?.some((k) => k.toLowerCase().includes(lower));
    return titleMatch || catMatch || keyMatch;
  });

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open
        }
      }

      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="command-palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="قائمة البحث السريع"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-search-header">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            className="command-search-input"
            placeholder="اكتب للبحث أو الانتقال لأي شاشة... (مثال: فواتير، عملاء، تشغيل)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <button
            className="ghost-button"
            style={{ minHeight: "32px", padding: "0 8px" }}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="command-results-list">
          {filteredCommands.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
              لا توجد نتائج مطابقة لـ "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  className={`command-item ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  type="button"
                >
                  <div className="command-item-icon">
                    <Icon aria-hidden="true" style={{ width: 16, height: 16 }} />
                  </div>
                  <strong>{cmd.title}</strong>
                  <span className="command-item-tag">{cmd.category}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
