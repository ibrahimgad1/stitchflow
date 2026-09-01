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
  createSupplier,
  formatMoney,
  isActive,
  listSuppliers,
  updateSupplier
} from "../lib/master-data";
import { getSupplierLedger } from "../lib/purchasing";
import type { Supplier } from "../lib/types";

const emptyForm = {
  name: "",
  contactName: "",
  phone: "",
  address: "",
  notes: "",
  isActive: true
};

export function SuppliersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [ledgerSupplierId, setLedgerSupplierId] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", page, pageSize, debouncedSearch],
    queryFn: () => listSuppliers({ page, pageSize, search: debouncedSearch })
  });

  const ledgerQuery = useQuery({
    queryKey: ["supplier-ledger", ledgerSupplierId],
    queryFn: () => getSupplierLedger(ledgerSupplierId!, { page: 1, pageSize: 50 }),
    enabled: Boolean(ledgerSupplierId)
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = {
        name: form.name.trim(),
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive
      };

      return editing ? updateSupplier(editing.id, payload) : createSupplier(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
      setFieldError("");
      showToast(editing ? t("common.save") + " ✓" : t("suppliers.add") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("suppliers.form.error");
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

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
      isActive: isActive(supplier.isActive)
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

  const rows = suppliersQuery.data?.data ?? [];
  const meta = suppliersQuery.data?.meta;

  function handleExport() {
    exportToCsv<Supplier>(
      "قائمة-الموردين",
      [
        { header: "اسم المورد", accessor: (s) => s.name },
        { header: "جهة الاتصال", accessor: (s) => s.contactName || "-" },
        { header: "رقم الهاتف", accessor: (s) => s.phone || "-" },
        { header: "العنوان", accessor: (s) => s.address || "-" },
        { header: "الحالة", accessor: (s) => (isActive(s.isActive) ? "نشط" : "غير نشط") },
        { header: "ملاحظات", accessor: (s) => s.notes || "-" }
      ],
      rows
    );
  }

  return (
    <>
      <ListPageShell
        title={t("suppliers.title")}
        description={t("suppliers.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("suppliers.add")}
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
              <th>{t("suppliers.name")}</th>
              <th>{t("suppliers.contact")}</th>
              <th>{t("suppliers.phone")}</th>
              <th>{t("suppliers.status")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {suppliersQuery.isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={t("suppliers.noSuppliers")}
                    description={t("suppliers.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("suppliers.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.contactName || "-"}</td>
                  <td dir="ltr">{supplier.phone || "-"}</td>
                  <td><StatusPill status={isActive(supplier.isActive) ? "active" : "inactive"} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="link-button" onClick={() => openEdit(supplier)} type="button">
                        {t("common.edit")}
                      </button>
                      <button
                        className="link-button"
                        onClick={() => setLedgerSupplierId(supplier.id)}
                        type="button"
                      >
                        {t("statements.balance")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ListPageShell>

      {modalOpen ? (
        <Modal
          title={editing ? t("suppliers.edit") : t("suppliers.add")}
          onClose={() => setModalOpen(false)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("suppliers.form.name")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("suppliers.form.contactName")}
              <input
                value={form.contactName}
                onChange={(event) => setForm({ ...form, contactName: event.target.value })}
              />
            </label>
            <label>
              {t("suppliers.form.phone")}
              <input
                dir="ltr"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label>
              {t("suppliers.form.address")}
              <textarea
                rows={2}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </label>
            <label>
              {t("suppliers.form.notes")}
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
              {t("suppliers.form.isActive")}
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {ledgerSupplierId ? (
        <Modal title={t("statements.titleSupplier")} onClose={() => setLedgerSupplierId(null)}>
          <p dir="ltr">
            <strong>{t("statements.balance")}:</strong> {formatMoney(ledgerQuery.data?.balanceMinor ?? 0)}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("statements.date")}</th>
                  <th>{t("common.description")}</th>
                  <th>{t("statements.debit")}</th>
                  <th>{t("statements.credit")}</th>
                  <th>{t("statements.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {ledgerQuery.isLoading ? (
                  <tr>
                    <td colSpan={5}>{t("statements.loading")}</td>
                  </tr>
                ) : (ledgerQuery.data?.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5}>{t("statements.noEntries")}</td>
                  </tr>
                ) : (
                  (ledgerQuery.data?.data ?? []).map((row) => (
                    <tr key={row.id}>
                      <td dir="ltr">{row.entryDate}</td>
                      <td>{row.description}</td>
                      <td dir="ltr">{formatMoney(row.debitMinor)}</td>
                      <td dir="ltr">{formatMoney(row.creditMinor)}</td>
                      <td dir="ltr">{formatMoney(row.balanceAfterMinor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
