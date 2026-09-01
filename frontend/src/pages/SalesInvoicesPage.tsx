import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, KeyboardEvent, useState } from "react";
import { Link } from "react-router-dom";
import {
  EmptyState,
  ListPageShell,
  Modal,
  PaginationBar,
  showToast,
  StatusPill,
  useDebouncedValue
} from "../components/ListPageShell";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n";
import { exportToCsv } from "../lib/export";
import { formatMoney, listCustomers } from "../lib/master-data";
import { listFinishedInventory } from "../lib/production";
import {
  cancelSalesInvoice,
  confirmSalesInvoice,
  createSalesInvoice,
  getSalesInvoice,
  listSalesInvoices,
  type SalesInvoiceItemInput
} from "../lib/sales";

type ItemLine = SalesInvoiceItemInput & { key: string };

const emptyForm = {
  customerId: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  discountAmount: "0",
  notes: "",
  confirm: true
};

const emptyItem = (): ItemLine => ({
  key: crypto.randomUUID(),
  modelVariantId: "",
  quantity: 1,
  unitPrice: 0
});

export function SalesInvoicesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemLine[]>([emptyItem()]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const [balanceCustomerId, setBalanceCustomerId] = useState<string | null>(null);
  const invoicesQuery = useQuery({
    queryKey: ["sales-invoices", page, pageSize, debouncedSearch, statusFilter, customerFilter],
    queryFn: () => listSalesInvoices({ page, pageSize, search: debouncedSearch, status: statusFilter || undefined, customerId: customerFilter || undefined })
  });

  const customerBalanceQuery = useQuery({
    queryKey: ["customer-balance", balanceCustomerId],
    queryFn: async () => {
      if (!balanceCustomerId) return null;
      const res = await fetch(`/api/customers/${balanceCustomerId}/ledger?page=1&pageSize=1`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth.token")}` }
      });
      const data = await res.json();
      return data.balanceMinor as number;
    },
    enabled: Boolean(balanceCustomerId)
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => listCustomers({ page: 1, pageSize: 100 })
  });

  const stockQuery = useQuery({
    queryKey: ["finished-inventory", "sale-options"],
    queryFn: () => listFinishedInventory({ page: 1, pageSize: 500 })
  });

  const detailQuery = useQuery({
    queryKey: ["sales-invoice", detailId],
    queryFn: () => getSalesInvoice(detailId!),
    enabled: Boolean(detailId)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const discountAmount = Number(form.discountAmount) || 0;
      const itemRows = items
        .filter((row) => row.modelVariantId && row.quantity > 0)
        .map(({ modelVariantId, quantity, unitPrice, notes }) => ({
          modelVariantId,
          quantity,
          unitPrice,
          notes
        }));

      if (!form.customerId || itemRows.length === 0) {
        throw new Error(t("sales.form.error"));
      }

      return createSalesInvoice({
        customerId: form.customerId,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || null,
        discountAmount,
        notes: form.notes.trim() || null,
        confirm: form.confirm,
        items: itemRows
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setItems([emptyItem()]);
      setError("");
      showToast(t("sales.add") + " ✓");
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : t("sales.form.error"));
    }
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => confirmSalesInvoice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-invoice", detailId] });
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      setActionError("");
      showToast(t("sales.confirm") + " ✓");
    },
    onError: (e: unknown) => {
      setActionError(e instanceof Error ? e.message : t("sales.confirmError"));
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => cancelSalesInvoice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-invoice", detailId] });
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      setActionError("");
      showToast(t("sales.cancel") + " ✓");
    },
    onError: (e: unknown) => {
      setActionError(e instanceof Error ? e.message : t("sales.cancelError"));
    }
  });

  const rows = invoicesQuery.data?.data ?? [];
  const meta = invoicesQuery.data?.meta;
  const detail = detailQuery.data;
  const stockRows = stockQuery.data?.data ?? [];

  const handleEnterNext = (e: KeyboardEvent<HTMLInputElement>, index: number, field: "quantity" | "unitPrice") => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (field === "quantity") {
      const rowsEls = document.querySelectorAll(".line-row");
      const row = rowsEls[index] as HTMLElement | undefined;
      const inputs = row?.querySelectorAll("input");
      const unitPriceInput = inputs?.[1] as HTMLInputElement | undefined;
      unitPriceInput?.focus();
    } else {
      const rowsEls = document.querySelectorAll(".line-row");
      if (index + 1 < rowsEls.length) {
        const nextRow = rowsEls[index + 1] as HTMLElement;
        const nextInput = nextRow.querySelector("input") as HTMLInputElement | null;
        nextInput?.focus();
      } else {
        const newItems = [...items, emptyItem()];
        setItems(newItems);
        setTimeout(() => {
          const updatedRows = document.querySelectorAll(".line-row");
          const lastRow = updatedRows[updatedRows.length - 1] as HTMLElement | undefined;
          const lastInput = lastRow?.querySelector("input") as HTMLInputElement | null;
          lastInput?.focus();
        }, 0);
      }
    }
  };

  function openCreate() {
    setForm(emptyForm);
    setItems([emptyItem()]);
    setError("");
    setCreateOpen(true);
  }

  function handleExport() {
    exportToCsv<any>(
      "فواتير-المبيعات",
      [
        { header: "رقم الفاتورة", accessor: (i) => i.invoiceNumber },
        { header: "العميل", accessor: (i) => i.customerName },
        { header: "تاريخ الفاتورة", accessor: (i) => i.invoiceDate },
        { header: "تاريخ الاستحقاق", accessor: (i) => i.dueDate || "-" },
        { header: "الحالة", accessor: (i) => (i.status === "confirmed" ? "مؤكدة" : i.status === "cancelled" ? "ملغاة" : "مسودة") },
        { header: "إجمالي البنود (ج.م)", accessor: (i) => ((i.subtotalMinor || 0) / 100).toFixed(2) },
        { header: "الخصم (ج.م)", accessor: (i) => ((i.discountMinor || 0) / 100).toFixed(2) },
        { header: "الصافي النهائي (ج.م)", accessor: (i) => ((i.totalAmountMinor || 0) / 100).toFixed(2) },
        { header: "المدفوع (ج.م)", accessor: (i) => ((i.paidAmountMinor || 0) / 100).toFixed(2) },
        { header: "المتبقي (ج.م)", accessor: (i) => ((i.remainingAmountMinor || 0) / 100).toFixed(2) }
      ],
      rows
    );
  }

  return (
    <>
      <ListPageShell
        title={t("sales.title")}
        description={t("sales.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("sales.add")}
        onExport={handleExport}
        footer={
          meta ? (
            <PaginationBar
              page={meta.page}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          ) : null
        }
      >
        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <label>
            {t("sales.status")}
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">{t("common.all")}</option>
              <option value="draft">{t("status.draft")}</option>
              <option value="confirmed">{t("status.confirmed")}</option>
              <option value="cancelled">{t("status.cancelled")}</option>
            </select>
          </label>
          <label>
            {t("sales.customer")}
            <select value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}>
              <option value="">{t("common.all")}</option>
              {(customersQuery.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
          </label>
          {(statusFilter || customerFilter) ? <button className="ghost-button" type="button" onClick={() => { setStatusFilter(""); setCustomerFilter(""); setPage(1); }}>{t("common.cancel")}</button> : null}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t("sales.number")}</th>
              <th>{t("sales.customer")}</th>
              <th>{t("sales.date")}</th>
              <th>{t("sales.status")}</th>
              <th>{t("sales.total")}</th>
              <th>{t("sales.remaining")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {invoicesQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={t("sales.noInvoices")}
                    description={t("sales.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("sales.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.invoiceNumber}</td>
                  <td>{row.customerName || "-"}</td>
                  <td dir="ltr">{row.invoiceDate}</td>
                  <td><StatusPill status={row.status} /></td>
                  <td dir="ltr">{formatMoney(row.totalMinor)}</td>
                  <td dir="ltr">{formatMoney(row.remainingMinor)}</td>
                  <td>
                    <button className="link-button" onClick={() => setDetailId(row.id)} type="button">
                      {t("common.view")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ListPageShell>

      {createOpen ? (
        <Modal title={t("sales.add")} onClose={() => setCreateOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("sales.form.customer")}
              <SearchableSelect
                value={form.customerId}
                onChange={(v) => {
                  setForm({ ...form, customerId: v });
                  setBalanceCustomerId(v || null);
                }}
                options={(customersQuery.data?.data ?? []).map((c) => ({ value: c.id, label: c.companyName }))}
                placeholder={t("common.select")}
                required
              />
              {balanceCustomerId && customerBalanceQuery.data !== undefined && customerBalanceQuery.data !== null ? (
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background: (customerBalanceQuery.data ?? 0) > 0 ? "#fef3c7" : "#ecfdf5",
                    color: (customerBalanceQuery.data ?? 0) > 0 ? "#92400e" : "#065f46",
                    border: `1px solid ${(customerBalanceQuery.data ?? 0) > 0 ? "#fcd34d" : "#a7f3d0"}`
                  }}
                >
                  الرصيد الحالي: {formatMoney(customerBalanceQuery.data ?? 0)} {(customerBalanceQuery.data ?? 0) > 0 ? "(مدين — له متأخرات)" : "(لا يوجد متأخرات)"}
                </span>
              ) : null}
            </label>
            <label>
              {t("sales.form.invoiceDate")}
              <input
                required
                dir="ltr"
                type="date"
                value={form.invoiceDate}
                onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}
              />
            </label>
            <label>
              {t("sales.form.dueDate")}
              <input
                dir="ltr"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </label>
            <label>
              {t("sales.form.discount")}
              <input
                dir="ltr"
                min="0"
                step="0.01"
                type="number"
                value={form.discountAmount}
                onChange={(event) => setForm({ ...form, discountAmount: event.target.value })}
              />
            </label>
            <label className="checkbox-label">
              <input
                checked={form.confirm}
                type="checkbox"
                onChange={(event) => setForm({ ...form, confirm: event.target.checked })}
              />
              {t("sales.form.confirmNow")}
            </label>
            <label className="full-span">
              {t("sales.form.notes")}
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>

            <div className="full-span line-editor">
              <div className="line-editor-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <strong>{t("sales.form.items")}</strong>
                <button className="ghost-button" type="button" onClick={() => setItems([...items, emptyItem()])}>
                  + {t("sales.form.addItem")}
                </button>
              </div>
              {items.map((item, index) => {
                const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
                return (
                  <div className="line-row" key={item.key} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                    <select
                      required
                      value={item.modelVariantId}
                      onChange={(event) =>
                        setItems(
                          items.map((row) =>
                            row.key === item.key ? { ...row, modelVariantId: event.target.value } : row
                          )
                        )
                      }
                    >
                      <option value="">{t("sales.form.selectItem")}</option>
                      {stockRows.map((stock) => (
                        <option key={stock.id} value={stock.id}>
                          {stock.modelCode} - {stock.modelName} / {stock.sizeName} / {stock.colorName} ({stock.currentQuantity})
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${t("sales.form.quantity")} ${index + 1}`}
                      dir="ltr"
                      min="0.01"
                      step="0.01"
                      type="number"
                      placeholder={t("sales.form.quantity")}
                      value={item.quantity}
                      onChange={(event) =>
                        setItems(
                          items.map((row) =>
                            row.key === item.key ? { ...row, quantity: Number(event.target.value) } : row
                          )
                        )
                      }
                      onKeyDown={(e) => handleEnterNext(e, index, "quantity")}
                    />
                    <input
                      aria-label={`${t("sales.form.unitPrice")} ${index + 1}`}
                      dir="ltr"
                      min="0"
                      step="0.01"
                      type="number"
                      placeholder={t("sales.form.unitPrice")}
                      value={item.unitPrice}
                      onChange={(event) =>
                        setItems(
                          items.map((row) =>
                            row.key === item.key ? { ...row, unitPrice: Number(event.target.value) } : row
                          )
                        )
                      }
                      onKeyDown={(e) => handleEnterNext(e, index, "unitPrice")}
                    />
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--primary)", textAlign: "end" }}>
                      {lineTotal.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </div>
                    <button
                      className="ghost-button"
                      style={{ padding: "0 8px", color: "var(--danger)" }}
                      disabled={items.length === 1}
                      type="button"
                      onClick={() => setItems(items.filter((row) => row.key !== item.key))}
                    >
                      {t("sales.form.remove")}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Live Invoice Totals Summary */}
            {(() => {
              const subtotal = items.reduce((acc, row) => acc + (Number(row.quantity) * Number(row.unitPrice) || 0), 0);
              const discount = Number(form.discountAmount) || 0;
              const netTotal = Math.max(0, subtotal - discount);
              return (
                <div
                  className="full-span"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "10px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "12px",
                    marginTop: "4px"
                  }}
                >
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>إجمالي البنود:</span>
                    <strong style={{ display: "block", fontSize: "15px" }}>
                      {subtotal.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>الخصم الممنوح:</span>
                    <strong style={{ display: "block", fontSize: "15px", color: "#dc2626" }}>
                      {discount.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "var(--primary)" }}>الصافي النهائي:</span>
                    <strong style={{ display: "block", fontSize: "17px", color: "var(--primary)" }}>
                      {netTotal.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </strong>
                  </div>
                </div>
              );
            })()}

            <div className="form-actions full-span">
              <button className="ghost-button" type="button" onClick={() => setCreateOpen(false)}>
                {t("common.cancel") || "إلغاء"}
              </button>
              <button className="primary-button" disabled={createMutation.isPending} type="submit">
                {createMutation.isPending ? t("common.saving") : t("sales.form.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detailId ? (
        <Modal title={t("sales.details.title")} onClose={() => setDetailId(null)}>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          {detail ? (
            <div className="detail-stack">
              <p>
                <strong dir="ltr">{detail.invoiceNumber}</strong> - {detail.customerName} - <StatusPill status={detail.status} />
              </p>
              <p>
                {t("sales.details.total")} {formatMoney(detail.totalMinor)} | {t("sales.details.paid")} {formatMoney(detail.paidMinor)} | {t("sales.details.remaining")}{" "}
                {formatMoney(detail.remainingMinor)}
              </p>
              <p>
                {t("sales.details.cogs")} {formatMoney(detail.costOfGoodsMinor)} | {t("sales.details.grossProfit")}{" "}
                {formatMoney(detail.grossProfitMinor)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>{t("sales.details.item")}</th>
                    <th>{t("sales.details.qty")}</th>
                    <th>{t("sales.details.price")}</th>
                    <th>{t("sales.details.totalCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.modelCode} / {item.sizeName} / {item.colorName}
                      </td>
                      <td dir="ltr">{item.quantity}</td>
                      <td dir="ltr">{formatMoney(item.unitPriceMinor)}</td>
                      <td dir="ltr">{formatMoney(item.totalMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detail.status === "draft" ? (
                <button type="button" onClick={() => confirmMutation.mutate(detail.id)}>
                  {t("sales.details.confirm")}
                </button>
              ) : null}
              {detail.status !== "cancelled" && detail.paidMinor === 0 ? (
                <button type="button" onClick={() => cancelMutation.mutate(detail.id)}>
                  {t("sales.details.cancel")}
                </button>
              ) : null}
              <Link className="ghost-button" to={`/sales-invoices/${detail.id}/print`}>
                {t("sales.details.print")}
              </Link>
            </div>
          ) : (
            <p>{t("common.loading")}</p>
          )}
        </Modal>
      ) : null}
    </>
  );
}
