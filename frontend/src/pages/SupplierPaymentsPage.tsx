import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import {
  EmptyState,
  ListPageShell,
  Modal,
  PaginationBar,
  showToast,
  useDebouncedValue
} from "../components/ListPageShell";
import { SearchableSelect } from "../components/SearchableSelect";
import { useI18n } from "../i18n";
import {
  formatMoney,
  listPaymentMethods,
  listSafes,
  listSuppliers
} from "../lib/master-data";
import {
  createSupplierPayment,
  getSupplierPayment,
  listSupplierPayments,
  listSupplierReceivings
} from "../lib/purchasing";

type AllocationRow = {
  key: string;
  materialReceivingId: string;
  allocatedAmount: number;
};

const emptyForm = {
  supplierId: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: "",
  safeId: "",
  paymentMethodId: "",
  notes: ""
};

export function SupplierPaymentsPage() {
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
  const [fieldError, setFieldError] = useState("");

  const paymentsQuery = useQuery({
    queryKey: ["supplier-payments", page, pageSize, debouncedSearch],
    queryFn: () => listSupplierPayments({ page, pageSize, search: debouncedSearch })
  });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: () => listSuppliers({ page: 1, pageSize: 100 })
  });

  const safesQuery = useQuery({
    queryKey: ["safes", "options"],
    queryFn: () => listSafes({ page: 1, pageSize: 100 })
  });

  const methodsQuery = useQuery({
    queryKey: ["payment-methods", "options"],
    queryFn: () => listPaymentMethods({ page: 1, pageSize: 100 })
  });

  const receivingsQuery = useQuery({
    queryKey: ["supplier-receivings", form.supplierId],
    queryFn: () => listSupplierReceivings(form.supplierId, { page: 1, pageSize: 100 }),
    enabled: Boolean(form.supplierId)
  });

  const detailQuery = useQuery({
    queryKey: ["supplier-payment", detailId],
    queryFn: () => getSupplierPayment(detailId!),
    enabled: Boolean(detailId)
  });

  useEffect(() => {
    if (!form.supplierId) {
      setAllocations([]);
      return;
    }

    const unpaid = (receivingsQuery.data?.data ?? []).filter((row) => row.remainingMinor > 0);
    setAllocations(
      unpaid.map((row) => ({
        key: row.id,
        materialReceivingId: row.id,
        allocatedAmount: row.remainingMinor / 100
      }))
    );
  }, [form.supplierId, receivingsQuery.data?.data]);

  const totalAllocatedMinor = allocations.reduce((sum, row) => sum + Math.round((Number(row.allocatedAmount) || 0) * 100), 0);
  const amountMinor = Math.round((Number(form.amount) || 0) * 100);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.supplierId || !form.safeId) {
        throw new Error(t("errors.required"));
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t("errors.required"));
      }

      return createSupplierPayment({
        supplierId: form.supplierId,
        paymentDate: form.paymentDate,
        amount,
        safeId: form.safeId,
        paymentMethodId: form.paymentMethodId || null,
        notes: form.notes.trim() || null,
        allocations: allocations
          .filter((row) => row.materialReceivingId && row.allocatedAmount > 0)
          .map((row) => ({
            materialReceivingId: row.materialReceivingId,
            allocatedAmount: row.allocatedAmount
          }))
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
      await queryClient.invalidateQueries({ queryKey: ["material-receivings"] });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setAllocations([]);
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("supplierPayments.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  const rows = paymentsQuery.data?.data ?? [];
  const meta = paymentsQuery.data?.meta;
  const openReceivings = receivingsQuery.data?.data ?? [];

  function openCreate() {
    setForm(emptyForm);
    setAllocations([]);
    setError("");
    setFieldError("");
    setCreateOpen(true);
  }

  return (
    <>
      <ListPageShell
        title={t("supplierPayments.title")}
        description={t("supplierPayments.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("supplierPayments.add")}
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
              <th>{t("supplierPayments.number")}</th>
              <th>{t("supplierPayments.supplier")}</th>
              <th>{t("supplierPayments.date")}</th>
              <th>{t("supplierPayments.amount")}</th>
              <th>{t("supplierPayments.safe")}</th>
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
                    title={t("supplierPayments.noPayments")}
                    description={t("supplierPayments.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("supplierPayments.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.paymentNumber}</td>
                  <td>{row.supplierName || "-"}</td>
                  <td dir="ltr">{row.paymentDate}</td>
                  <td dir="ltr">{formatMoney(row.amountMinor)}</td>
                  <td>{row.safeName || "-"}</td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => setDetailId(row.id)}
                      type="button"
                    >
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
        <Modal title={t("supplierPayments.add")} onClose={() => setCreateOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              setFieldError("");
              createMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("supplierPayments.form.supplier")} <span style={{ color: "#b42318" }}>*</span>
              <SearchableSelect
                value={form.supplierId}
                onChange={(v) => setForm({ ...form, supplierId: v })}
                options={(suppliersQuery.data?.data ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                placeholder={t("common.select")}
                required
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("supplierPayments.form.paymentDate")}
              <input
                required
                dir="ltr"
                type="date"
                value={form.paymentDate}
                onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
              />
            </label>
            <label>
              {t("supplierPayments.form.amount")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                dir="ltr"
                min="0.01"
                step="0.01"
                type="number"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("supplierPayments.form.safe")} <span style={{ color: "#b42318" }}>*</span>
              <SearchableSelect
                value={form.safeId}
                onChange={(v) => setForm({ ...form, safeId: v })}
                options={(safesQuery.data?.data ?? []).map((safe) => ({ value: safe.id, label: `${safe.name} (${formatMoney(safe.currentBalanceMinor)})` }))}
                placeholder={t("common.select")}
                required
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("supplierPayments.form.paymentMethod")}
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

            {form.supplierId ? (
              <div className="panel">
                <h3>{t("supplierPayments.form.allocations")}</h3>
                <p className="muted">
                  {t("supplierPayments.description")}
                </p>
                {openReceivings.length === 0 ? (
                  <p className="muted">{t("supplierPayments.noPayments")}</p>
                ) : (
                  allocations.map((row, index) => {
                    const receiving = openReceivings.find((item) => item.id === row.materialReceivingId);
                    return (
                      <div className="inline-form" key={row.key}>
                        <label>
                          {t("receivings.number")}
                          <select
                            value={row.materialReceivingId}
                            onChange={(event) => {
                              const next = [...allocations];
                              next[index] = { ...row, materialReceivingId: event.target.value };
                              setAllocations(next);
                            }}
                          >
                            {openReceivings.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.receivingNumber} ({formatMoney(item.remainingMinor)} {t("receivings.remaining")})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t("supplierPayments.form.allocatedAmount")}
                          <input
                            dir="ltr"
                            min="0"
                            step="0.01"
                            type="number"
                            value={row.allocatedAmount}
                            onChange={(event) => {
                              const next = [...allocations];
                              next[index] = {
                                ...row,
                                allocatedAmount: Number(event.target.value)
                              };
                              setAllocations(next);
                            }}
                          />
                        </label>
                        <p className="muted">
                          {t("receivings.remaining")}: {formatMoney(receiving?.remainingMinor ?? 0)}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            <p dir="ltr" style={{ fontWeight: 600, marginTop: 8 }}>
              {t("supplierPayments.form.allocatedAmount")}: {formatMoney(totalAllocatedMinor)} / {formatMoney(amountMinor)}
            </p>

            <label>
              {t("supplierPayments.form.notes")}
              <textarea
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={createMutation.isPending} type="submit">
                {createMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detailId && detailQuery.data ? (
        <Modal title={`${t("supplierPayments.title")} ${detailQuery.data.paymentNumber}`} onClose={() => setDetailId(null)}>
          <div className="form-grid">
            <p>
              <strong>{t("supplierPayments.supplier")}:</strong> {detailQuery.data.supplierName}
            </p>
            <p dir="ltr">
              <strong>{t("supplierPayments.date")}:</strong> {detailQuery.data.paymentDate}
            </p>
            <p dir="ltr">
              <strong>{t("supplierPayments.amount")}:</strong> {formatMoney(detailQuery.data.amountMinor)}
            </p>
            <p>
              <strong>{t("supplierPayments.safe")}:</strong> {detailQuery.data.safeName}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("receivings.number")}</th>
                    <th>{t("supplierPayments.form.allocatedAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailQuery.data.allocations ?? []).map((row) => (
                    <tr key={row.id}>
                      <td dir="ltr">{row.receivingNumber}</td>
                      <td dir="ltr">{formatMoney(row.allocatedAmountMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
