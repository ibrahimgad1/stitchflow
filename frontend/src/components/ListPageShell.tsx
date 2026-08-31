import { Plus, Search } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useI18n } from "../i18n";

type ListPageShellProps = {
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate?: () => void;
  createLabel?: string;
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
  children,
  footer
}: ListPageShellProps) {
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
            <Plus aria-hidden="true" />
            {createLabel}
          </button>
        ) : null}
      </div>

      <form className="toolbar" onSubmit={handleSearch}>
        <label className="search-field">
          <Search aria-hidden="true" />
          <input
            placeholder={useI18n().t("common.search")}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
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
      <span>{t("common.pageInfo", { page, totalPages, total })}</span>
      <div className="pagination-actions">
        {pageSize && onPageSizeChange ? (
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} style={{ padding: "6px" }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
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

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {description ? <p className="muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { statusLabel } = useI18n();
  const cls = `status-pill pill-${status}`;
  return <span className={cls}>{statusLabel(status)}</span>;
}

let toastTimer: number | null = null;
export function showToast(message: string) {
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = "block";
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (el) el.style.display = "none";
  }, 3000) as unknown as number;
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
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
