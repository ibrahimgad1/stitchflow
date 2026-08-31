import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
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
import { useI18n } from "../i18n";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemLine[]>([emptyItem()]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const invoicesQuery = useQuery({
    queryKey: ["sales-invoices", page, pageSize, debouncedSearch],
    queryFn: () => listSalesInvoices({ page, pageSize, search: debouncedSearch })
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
      showToast(t("common.save") + " ✓");
    },
    onError: () => setError(t("sales.form.error"))
  });

  const confirmMutation = useMutation({
    mutationFn: (invoiceId: string) => confirmSalesInvoice(invoiceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      if (detailId) {
        await queryClient.invalidateQueries({ queryKey: ["sales-invoice", detailId] });
      }
      setActionError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setActionError(t("sales.details.errorConfirm"))
  });

  const cancelMutation = useMutation({
    mutationFn: (invoiceId: string) => cancelSalesInvoice(invoiceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      if (detailId) {
        await queryClient.invalidateQueries({ queryKey: ["sales-invoice", detailId] });
      }
      setActionError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setActionError(t("sales.details.errorCancel"))
  });

  const rows = invoicesQuery.data?.data ?? [];
  const meta = invoicesQuery.data?.meta;
  const detail = detailQuery.data;
  const stockRows = stockQuery.data?.data ?? [];

  function openCreate() {
    setCreateOpen(true);
    setError("");
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
              <select
                required
                value={form.customerId}
                onChange={(event) => setForm({ ...form, customerId: event.target.value })}
              >
                <option value="">{t("common.select")}</option>
                {(customersQuery.data?.data ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName}
                  </option>
                ))}
              </select>
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
              <div className="line-editor-header">
                <strong>{t("sales.form.items")}</strong>
                <button type="button" onClick={() => setItems([...items, emptyItem()])}>
                  {t("sales.form.addItem")}
                </button>
              </div>
              {items.map((item, index) => (
                <div className="line-row" key={item.key}>
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
                  />
                  <button
                    disabled={items.length === 1}
                    type="button"
                    onClick={() => setItems(items.filter((row) => row.key !== item.key))}
                  >
                    {t("sales.form.remove")}
                  </button>
                </div>
              ))}
            </div>
            <button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? t("common.saving") : t("sales.form.save")}
            </button>
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
