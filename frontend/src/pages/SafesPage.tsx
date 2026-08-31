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
  createSafe,
  formatMoney,
  isActive,
  listSafes,
  updateSafe
} from "../lib/master-data";
import type { Safe } from "../lib/types";

const emptyForm = {
  name: "",
  openingBalance: "",
  isActive: true
};

export function SafesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Safe | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const safesQuery = useQuery({
    queryKey: ["safes", page, pageSize, debouncedSearch],
    queryFn: () => listSafes({ page, pageSize, search: debouncedSearch })
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) {
        throw new Error(t("errors.required"));
      }
      if (editing) {
        return updateSafe(editing.id, {
          name: form.name.trim(),
          isActive: form.isActive
        });
      }

      if (!form.openingBalance.trim()) {
        throw new Error(t("errors.required"));
      }
      const openingBalance = Number(form.openingBalance);
      if (!Number.isFinite(openingBalance) || openingBalance < 0) {
        throw new Error(t("safes.form.invalid"));
      }

      return createSafe({
        name: form.name.trim(),
        openingBalance,
        isActive: form.isActive
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
      setFieldError("");
      showToast(editing ? t("common.save") + " ✓" : t("safes.add") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("safes.form.invalid");
      if (msg === t("errors.required") || msg === t("safes.form.invalid")) setFieldError(msg);
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

  function openEdit(safe: Safe) {
    setEditing(safe);
    setForm({
      name: safe.name,
      openingBalance: String(safe.openingBalanceMinor / 100),
      isActive: isActive(safe.isActive)
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

  const rows = safesQuery.data?.data ?? [];
  const meta = safesQuery.data?.meta;

  return (
    <>
      <ListPageShell
        title={t("safes.title")}
        description={t("safes.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("safes.add")}
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
              <th>{t("safes.name")}</th>
              <th>{t("safes.openingBalance")}</th>
              <th>{t("safes.currentBalance")}</th>
              <th>{t("safes.status")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {safesQuery.isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={t("safes.noSafes")}
                    description={t("safes.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("safes.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((safe) => (
                <tr key={safe.id}>
                  <td>{safe.name}</td>
                  <td dir="ltr">{formatMoney(safe.openingBalanceMinor)}</td>
                  <td dir="ltr">{formatMoney(safe.currentBalanceMinor)}</td>
                  <td><StatusPill status={isActive(safe.isActive) ? "active" : "inactive"} /></td>
                  <td>
                    <button className="link-button" onClick={() => openEdit(safe)} type="button">
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
          title={editing ? t("safes.edit") : t("safes.add")}
          onClose={() => setModalOpen(false)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("safes.form.name")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            {!editing ? (
              <label>
                {t("safes.form.openingBalance")} <span style={{ color: "#b42318" }}>*</span>
                <input
                  required
                  dir="ltr"
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.openingBalance}
                  onChange={(event) => setForm({ ...form, openingBalance: event.target.value })}
                  aria-invalid={Boolean(fieldError)}
                />
                {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
                <span className="muted" style={{ fontSize: 12, display: "block" }}>{t("safes.form.openingLocked")}</span>
              </label>
            ) : (
              <p className="muted">{t("safes.form.openingLocked")}</p>
            )}
            <label className="checkbox-row">
              <input
                checked={form.isActive}
                type="checkbox"
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              {t("safes.form.active")}
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
