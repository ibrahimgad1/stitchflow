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
import { exportToCsv } from "../lib/export";
import {
  createCustomer,
  isActive,
  listCustomers,
  updateCustomer
} from "../lib/master-data";
import type { Customer } from "../lib/types";

const emptyForm = {
  companyName: "",
  contactName: "",
  phone: "",
  address: "",
  notes: "",
  isActive: true
};

export function CustomersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", page, pageSize, debouncedSearch],
    queryFn: () => listCustomers({ page, pageSize, search: debouncedSearch })
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.companyName.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = {
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive
      };

      if (editing) {
        return updateCustomer(editing.id, payload);
      }

      return createCustomer(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
      setFieldError("");
      showToast(editing ? t("common.save") + " ✓" : t("customers.add") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("customers.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setFieldError("");
    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      companyName: customer.companyName,
      contactName: customer.contactName ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
      isActive: isActive(customer.isActive)
    });
    setError("");
    setFieldError("");
    setModalOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError("");
    saveMutation.mutate();
  }

  const rows = customersQuery.data?.data ?? [];
  const meta = customersQuery.data?.meta;

  function handleExport() {
    exportToCsv<Customer>(
      "قائمة-العملاء",
      [
        { header: "اسم الشركة / العميل", accessor: (c) => c.companyName },
        { header: "جهة الاتصال", accessor: (c) => c.contactName || "-" },
        { header: "رقم الهاتف", accessor: (c) => c.phone || "-" },
        { header: "العنوان", accessor: (c) => c.address || "-" },
        { header: "الحالة", accessor: (c) => (isActive(c.isActive) ? "نشط" : "غير نشط") },
        { header: "ملاحظات", accessor: (c) => c.notes || "-" }
      ],
      rows
    );
  }

  return (
    <>
      <ListPageShell
        title={t("customers.title")}
        description={t("customers.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("customers.add")}
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
        <table>
          <thead>
            <tr>
              <th>{t("customers.company")}</th>
              <th>{t("customers.contact")}</th>
              <th>{t("customers.phone")}</th>
              <th>{t("customers.status")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {customersQuery.isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={t("customers.noCustomers")}
                    description={t("customers.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("customers.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.companyName}</td>
                  <td>{customer.contactName || "-"}</td>
                  <td dir="ltr">{customer.phone || "-"}</td>
                  <td><StatusPill status={isActive(customer.isActive) ? "active" : "inactive"} /></td>
                  <td>
                    <button className="link-button" onClick={() => openEdit(customer)} type="button">
                      {t("common.edit")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ListPageShell>

      {modalOpen ? (
        <Modal
          title={editing ? t("customers.edit") : t("customers.add")}
          onClose={() => setModalOpen(false)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("customers.form.companyName")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.companyName}
                onChange={(event) => setForm({ ...form, companyName: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("customers.form.contactName")}
              <input
                value={form.contactName}
                onChange={(event) => setForm({ ...form, contactName: event.target.value })}
              />
            </label>
            <label>
              {t("customers.form.phone")}
              <input
                dir="ltr"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label>
              {t("customers.form.address")}
              <textarea
                rows={2}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </label>
            <label>
              {t("customers.form.notes")}
              <textarea
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
            <label className="checkbox-row">
              <input
                checked={form.isActive}
                type="checkbox"
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              {t("customers.form.isActive")}
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? t("customers.form.saving") : t("customers.form.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
