import { AlertCircle, CheckCircle2, FileSpreadsheet, Inbox, Plus, Search, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

type ListPageShellProps = {
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate?: () => void;
  createLabel?: string;
  onExport?: () => void;
  exportLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function ListPageShell({
  title,
  description,
  search,
  onSearchChange,
  onCreate,
  createLabel,
  onExport,
  exportLabel,
  children,
  footer
}: ListPageShellProps) {
  const { t } = useI18n();

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section className="page-section">
      <div className="section-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {createLabel && onCreate ? (
          <button className="primary-button" onClick={onCreate} type="button">
            <Plus size={16} aria-hidden="true" />
            <span>{createLabel}</span>
          </button>
        ) : null}
      </div>

      <form className="toolbar" onSubmit={handleSearch}>
        <div className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            placeholder={t("common.search") || "بحث سريع..."}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search ? (
            <button
              onClick={() => onSearchChange("")}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--text-muted)" }}
              type="button"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>

        {onExport ? (
          <button
            className="ghost-button"
            onClick={onExport}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--success)" }}
            type="button"
          >
            <FileSpreadsheet size={16} />
            <span>{exportLabel || "تصدير Excel"}</span>
          </button>
        ) : null}
      </form>

      <div className="table-wrap">{children}</div>
      {footer}
    </section>
  );
}

export function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
  pageSize,
  onPageSizeChange
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="pagination">
      <span>{t("common.pageInfo", { page, totalPages: Math.max(1, totalPages), total })}</span>
      <div className="pagination-actions">
        {pageSize && onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              padding: "6px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "#ffffff",
              fontSize: "13px"
            }}
          >
            <option value={10}>10 لكل صفحة</option>
            <option value={20}>20 لكل صفحة</option>
            <option value={50}>50 لكل صفحة</option>
          </select>
        ) : null}
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">
          {t("common.previous")}
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div
        style={{
          display: "grid",
          placeItems: "center",
          width: 56,
          height: 56,
          borderRadius: "var(--radius-xl)",
          background: "var(--primary-light)",
          color: "var(--primary)"
        }}
      >
        <Inbox size={28} />
      </div>
      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>{title}</h4>
      {description ? (
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "13px", maxWidth: 360 }}>
          {description}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { statusLabel } = useI18n();
  const cls = `status-pill pill-${status}`;
  return <span className={cls}>{statusLabel(status)}</span>;
}

let toastTimer: number | null = null;
export function showToast(message: string, isError = false) {
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "flex";
  el.style.background = isError ? "#dc2626" : "#0f172a";
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (el) el.style.display = "none";
  }, 3200) as unknown as number;
}

export function Modal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus the first element in modal only once on mount
  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl) return;

    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modalEl.querySelectorAll<HTMLElement>(focusableSelectors);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }, []);

  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl) return;

    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const elements = modalEl.querySelectorAll<HTMLElement>(focusableSelectors);
        if (elements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstEl = elements[0];
        const lastEl = elements[elements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            lastEl.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastEl) {
            firstEl.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="ghost-button" onClick={onClose} type="button">
            {t("common.close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
