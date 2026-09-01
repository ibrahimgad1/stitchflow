import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
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
import {
  formatMoney,
  listCustomers,
  listPaymentMethods,
  listSafes
} from "../lib/master-data";
import {
  createCustomerPayment,
  getCustomerPayment,
  listCustomerPayments,
  listCustomerSalesInvoices,
  reverseCustomerPayment
} from "../lib/sales";

type AllocationRow = {
  key: string;
  salesInvoiceId: string;
  allocatedAmount: number;
};

const emptyForm = {
  customerId: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: "",
  safeId: "",
  paymentMethodId: "",
  notes: ""
};

export function CustomerPaymentsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const paymentsQuery = useQuery({
    queryKey: ["customer-payments", page, pageSize, debouncedSearch],
    queryFn: () => listCustomerPayments({ page, pageSize, search: debouncedSearch })
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "options"],
    queryFn: () => listCustomers({ page: 1, pageSize: 100 })
  });

  const safesQuery = useQuery({
    queryKey: ["safes", "options"],
    queryFn: () => listSafes({ page: 1, pageSize: 100 })
  });

  const methodsQuery = useQuery({
    queryKey: ["payment-methods", "options"],
    queryFn: () => listPaymentMethods({ page: 1, pageSize: 100 })
  });

  const invoicesQuery = useQuery({
    queryKey: ["customer-sales-invoices", form.customerId],
    queryFn: () => listCustomerSalesInvoices(form.customerId, { page: 1, pageSize: 100 }),
    enabled: Boolean(form.customerId)
  });

  const detailQuery = useQuery({
    queryKey: ["customer-payment", detailId],
    queryFn: () => getCustomerPayment(detailId!),
    enabled: Boolean(detailId)
  });

  useEffect(() => {
    if (!form.customerId) {
      setAllocations([]);
      return;
    }

    const unpaid = (invoicesQuery.data?.data ?? []).filter((row) => row.remainingMinor > 0);
    setAllocations(
      unpaid.map((row) => ({
        key: row.id,
        salesInvoiceId: row.id,
        allocatedAmount: row.remainingMinor / 100
      }))
    );
  }, [form.customerId, invoicesQuery.data?.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t("customerPayments.form.error"));
      }

      return createCustomerPayment({
        customerId: form.customerId,
        paymentDate: form.paymentDate,
        amount,
        safeId: form.safeId,
        paymentMethodId: form.paymentMethodId || null,
        notes: form.notes.trim() || null,
        allocations: allocations
          .filter((row) => row.salesInvoiceId && row.allocatedAmount > 0)
          .map((row) => ({
            salesInvoiceId: row.salesInvoiceId,
            allocatedAmount: row.allocatedAmount
          }))
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setAllocations([]);
      setError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setError(t("customerPayments.form.error"))
  });

  const reverseMutation = useMutation({
    mutationFn: (paymentId: string) =>
      reverseCustomerPayment(paymentId, { reversalDate: new Date().toISOString().slice(0, 10) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      if (detailId) {
        await queryClient.invalidateQueries({ queryKey: ["customer-payment", detailId] });
      }
      setActionError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setActionError(t("customerPayments.reverse.error"))
  });

  const rows = paymentsQuery.data?.data ?? [];
  const meta = paymentsQuery.data?.meta;
  const openInvoices = invoicesQuery.data?.data ?? [];
  const detail = detailQuery.data;

  function openCreate() {
    setForm(emptyForm);
    setAllocations([]);
    setError("");
    setCreateOpen(true);
  }

  return (
    <>
      <ListPageShell
        title={t("customerPayments.title")}
        description={t("customerPayments.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("customerPayments.add")}
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
              <th>{t("customerPayments.number")}</th>
              <th>{t("customerPayments.customer")}</th>
              <th>{t("customerPayments.date")}</th>
              <th>{t("customerPayments.amount")}</th>
              <th>{t("customerPayments.safe")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {paymentsQuery.isLoading ? (
              <tr>
                <td colSpan={6}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={t("customerPayments.noPayments")}
                    description={t("customerPayments.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("customerPayments.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.paymentNumber}</td>
                  <td>{row.customerName || "-"}</td>
                  <td dir="ltr">{row.paymentDate}</td>
                  <td dir="ltr">{formatMoney(row.amountMinor)}</td>
                  <td>{row.safeName || "-"}</td>
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
        <Modal title={t("customerPayments.add")} onClose={() => setCreateOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("customerPayments.form.customer")}
              <SearchableSelect
                value={form.customerId}
                onChange={(v) => setForm({ ...form, customerId: v })}
                options={(customersQuery.data?.data ?? []).map((customer) => ({ value: customer.id, label: customer.companyName }))}
                placeholder={t("common.select")}
                required
              />
            </label>
            <label>
              {t("customerPayments.form.paymentDate")}
              <input
                required
                dir="ltr"
                type="date"
                value={form.paymentDate}
                onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
              />
            </label>
            <label>
              {t("customerPayments.form.amount")}
              <input
                required
                dir="ltr"
                min="0.01"
                step="0.01"
                type="number"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </label>
            <label>
              {t("customerPayments.form.safe")}
              <SearchableSelect
                value={form.safeId}
                onChange={(v) => setForm({ ...form, safeId: v })}
                options={(safesQuery.data?.data ?? []).map((safe) => ({ value: safe.id, label: `${safe.name} (${formatMoney(safe.currentBalanceMinor)})` }))}
                placeholder={t("common.select")}
                required
              />
            </label>
            <label>
              {t("customerPayments.form.paymentMethod")}
              <select
                value={form.paymentMethodId}
                onChange={(event) => setForm({ ...form, paymentMethodId: event.target.value })}
              >
                <option value="">{t("common.none")}</option>
                {(methodsQuery.data?.data ?? []).map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-span">
              {t("customerPayments.form.notes")}
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>

            <div className="full-span line-editor">
              <div className="line-editor-header">
                <strong>{t("customerPayments.form.allocations")}</strong>
                <span>{openInvoices.length} {t("sales.title")}</span>
              </div>
              {allocations.length === 0 ? (
                <p>{t("customerPayments.noPayments")}</p>
              ) : (
                allocations.map((allocation, index) => (
                  <div className="line-row" key={allocation.key}>
                    <select
                      value={allocation.salesInvoiceId}
                      onChange={(event) =>
                        setAllocations(
                          allocations.map((row) =>
                            row.key === allocation.key
                              ? { ...row, salesInvoiceId: event.target.value }
                              : row
                          )
                        )
                      }
                    >
                      <option value="">{t("common.select")}</option>
                      {openInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - {t("sales.remaining")} {formatMoney(invoice.remainingMinor)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`${t("customerPayments.form.allocatedAmount")} ${index + 1}`}
                      dir="ltr"
                      min="0"
                      step="0.01"
                      type="number"
                      placeholder={t("customerPayments.form.allocatedAmount")}
                      value={allocation.allocatedAmount}
                      onChange={(event) =>
                        setAllocations(
                          allocations.map((row) =>
                            row.key === allocation.key
                              ? { ...row, allocatedAmount: Number(event.target.value) }
                              : row
                          )
                        )
                      }
                    />
                  </div>
                ))
              )}
            </div>
            <button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? t("common.saving") : t("common.save")}
            </button>
          </form>
        </Modal>
      ) : null}

      {detailId ? (
        <Modal title={t("customerPayments.title")} onClose={() => setDetailId(null)}>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          {detail ? (
            <div className="detail-stack">
              <p>
                <strong dir="ltr">{detail.paymentNumber}</strong> - {detail.customerName} -{" "}
                <StatusPill status={detail.status ?? "confirmed"} />
              </p>
              <p>
                {t("customerPayments.amount")} {formatMoney(detail.amountMinor)} | {t("common.remaining")}{" "}
                {formatMoney(detail.unallocatedAmountMinor)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>{t("sales.number")}</th>
                    <th>{t("customerPayments.form.allocatedAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.allocations.map((allocation) => (
                    <tr key={allocation.id}>
                      <td dir="ltr">{allocation.invoiceNumber}</td>
                      <td dir="ltr">{formatMoney(allocation.allocatedAmountMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(detail.status ?? "confirmed") !== "reversed" ? (
                <button type="button" onClick={() => reverseMutation.mutate(detail.id)}>
                  {t("customerPayments.reverse.save")}
                </button>
              ) : null}
            </div>
          ) : (
            <p>{t("common.loading")}</p>
          )}
        </Modal>
      ) : null}
    </>
  );
}
