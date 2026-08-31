import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
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
import {
  formatMoney,
  listExpenseCategories,
  listPaymentMethods,
  listSafes
} from "../lib/master-data";
import { createExpense, listExpenses } from "../lib/treasury";

const emptyForm = {
  expenseDate: new Date().toISOString().slice(0, 10),
  categoryId: "",
  description: "",
  amount: "",
  paymentStatus: "paid" as "paid" | "unpaid",
  paymentMethodId: "",
  safeId: "",
  notes: ""
};

export function ExpensesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const expensesQuery = useQuery({
    queryKey: ["expenses", page, pageSize, debouncedSearch],
    queryFn: () => listExpenses({ page, pageSize, search: debouncedSearch })
  });

  const categoriesQuery = useQuery({
    queryKey: ["expense-categories", "options"],
    queryFn: () => listExpenseCategories({ page: 1, pageSize: 100 })
  });

  const safesQuery = useQuery({
    queryKey: ["safes", "options"],
    queryFn: () => listSafes({ page: 1, pageSize: 100 })
  });

  const methodsQuery = useQuery({
    queryKey: ["payment-methods", "options"],
    queryFn: () => listPaymentMethods({ page: 1, pageSize: 100 })
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) {
        throw new Error(t("errors.required"));
      }
      if (!form.categoryId) {
        throw new Error(t("errors.required"));
      }
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t("errors.required"));
      }

      return createExpense({
        expenseDate: form.expenseDate,
        categoryId: form.categoryId || null,
        description: form.description.trim(),
        amount,
        paymentStatus: form.paymentStatus,
        paymentMethodId: form.paymentMethodId || null,
        safeId: form.paymentStatus === "paid" ? form.safeId : null,
        notes: form.notes.trim() || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setModalOpen(false);
      setForm(emptyForm);
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("expenses.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  function openCreate() {
    setForm(emptyForm);
    setError("");
    setFieldError("");
    setModalOpen(true);
  }

  const rows = expensesQuery.data?.data ?? [];
  const meta = expensesQuery.data?.meta;

  return (
    <>
      <ListPageShell
        title={t("expenses.title")}
        description={t("expenses.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("expenses.add")}
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
              <th>{t("expenses.number")}</th>
              <th>{t("expenses.date")}</th>
              <th>{t("expenses.descriptionCol")}</th>
              <th>{t("expenses.category")}</th>
              <th>{t("expenses.paymentStatus")}</th>
              <th>{t("expenses.amount")}</th>
              <th>{t("expenses.safe")}</th>
            </tr>
          </thead>
          <tbody>
            {expensesQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={t("expenses.noExpenses")}
                    description={t("expenses.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("expenses.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((expense) => (
                <tr key={expense.id}>
                  <td dir="ltr">{expense.expenseNumber}</td>
                  <td dir="ltr">{expense.expenseDate}</td>
                  <td>{expense.description}</td>
                  <td>{expense.categoryName || "-"}</td>
                  <td><StatusPill status={expense.paymentStatus} /></td>
                  <td dir="ltr">{formatMoney(expense.amountMinor)}</td>
                  <td>{expense.safeName || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ListPageShell>

      {modalOpen ? (
        <Modal title={t("expenses.add")} onClose={() => setModalOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              setFieldError("");
              saveMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("expenses.form.expenseDate")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                dir="ltr"
                type="date"
                value={form.expenseDate}
                onChange={(event) => setForm({ ...form, expenseDate: event.target.value })}
              />
            </label>
            <label>
              {t("expenses.form.description")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("expenses.form.category")} <span style={{ color: "#b42318" }}>*</span>
              <select
                required
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              >
                <option value="">{t("common.none")}</option>
                {(categoriesQuery.data?.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("expenses.form.amount")} <span style={{ color: "#b42318" }}>*</span>
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
              {t("expenses.form.paymentStatus")}
              <select
                value={form.paymentStatus}
                onChange={(event) =>
                  setForm({ ...form, paymentStatus: event.target.value as "paid" | "unpaid" })
                }
              >
                <option value="paid">{t("expenses.form.paid")}</option>
                <option value="unpaid">{t("expenses.form.unpaid")}</option>
              </select>
            </label>
            {form.paymentStatus === "paid" ? (
              <>
                <label>
                  {t("expenses.form.safe")}
                  <select
                    required
                    value={form.safeId}
                    onChange={(event) => setForm({ ...form, safeId: event.target.value })}
                  >
                    <option value="">{t("common.select")}</option>
                    {(safesQuery.data?.data ?? []).map((safe) => (
                      <option key={safe.id} value={safe.id}>
                        {safe.name} ({formatMoney(safe.currentBalanceMinor)})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("expenses.form.paymentMethod")}
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
              </>
            ) : null}
            <label className="full-span">
              {t("expenses.form.notes")}
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
            <button disabled={saveMutation.isPending} type="submit">
              {saveMutation.isPending ? t("common.saving") : t("common.save")}
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
