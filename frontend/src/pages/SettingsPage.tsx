import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Modal, showToast } from "../components/ListPageShell";
import { useI18n } from "../i18n";
import {
  createColor,
  createExpenseCategory,
  createOwner,
  createPaymentMethod,
  createSize,
  isActive,
  listColors,
  listExpenseCategories,
  listOwners,
  listPaymentMethods,
  listSizes,
  updateColor,
  updateExpenseCategory,
  updateOwner,
  updatePaymentMethod,
  updateSize
} from "../lib/master-data";

type Tab = "sizes" | "colors" | "payment-methods" | "expense-categories" | "owners";

export function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("sizes");

  return (
    <section className="page-section">
      <div className="section-header">
        <div>
          <h3>{t("settings.title")}</h3>
          <p>{t("settings.description")}</p>
        </div>
      </div>

      <div className="tab-row">
        {[
          ["sizes", t("settings.sizes")],
          ["colors", t("settings.colors")],
          ["payment-methods", t("settings.paymentMethods")],
          ["expense-categories", t("settings.expenseCategories")],
          ["owners", t("settings.owners")]
        ].map(([key, label]) => (
          <button
            className={tab === key ? "tab-button active" : "tab-button"}
            key={key}
            onClick={() => setTab(key as Tab)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sizes" ? <SimpleNameList kind="size" /> : null}
      {tab === "colors" ? <SimpleNameList kind="color" /> : null}
      {tab === "payment-methods" ? <SimpleNameList kind="payment-method" /> : null}
      {tab === "expense-categories" ? <ExpenseCategoryList /> : null}
      {tab === "owners" ? <OwnersList /> : null}
    </section>
  );
}

function SimpleNameList({ kind }: { kind: "size" | "color" | "payment-method" }) {
  const { t, statusLabel } = useI18n();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const query = useQuery({
    queryKey: [kind],
    queryFn: () => {
      if (kind === "size") return listSizes({ page: 1, pageSize: 100 });
      if (kind === "color") return listColors({ page: 1, pageSize: 100 });
      return listPaymentMethods({ page: 1, pageSize: 100 });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = { name: name.trim(), isActive: true, sortOrder: 0 };
      if (kind === "size") {
        return editingId ? updateSize(editingId, payload) : createSize(payload);
      }
      if (kind === "color") {
        return editingId ? updateColor(editingId, payload) : createColor(payload);
      }
      return editingId
        ? updatePaymentMethod(editingId, { name: name.trim(), isActive: true })
        : createPaymentMethod({ name: name.trim(), isActive: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [kind] });
      setModalOpen(false);
      setEditingId(null);
      setName("");
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("settings.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  const rows = query.data?.data ?? [];

  return (
    <>
      <div className="toolbar">
        <button
          className="primary-button"
          onClick={() => {
            setEditingId(null);
            setName("");
            setModalOpen(true);
          }}
          type="button"
        >
          {t("settings.add")}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("settings.name")}</th>
              <th>{t("common.status")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{statusLabel(isActive(row.isActive) ? "active" : "inactive")}</td>
                <td>
                  <button
                    className="link-button"
                    onClick={() => {
                      setEditingId(row.id);
                      setName(row.name);
                      setModalOpen(true);
                    }}
                    type="button"
                  >
                    {t("common.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <Modal title={editingId ? t("common.edit") : t("common.add")} onClose={() => setModalOpen(false)}>
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
              {t("settings.form.name")} <span style={{ color: "#b42318" }}>*</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldError)} />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? t("common.saving") : t("settings.form.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function ExpenseCategoryList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [isOverhead, setIsOverhead] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const query = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => listExpenseCategories({ page: 1, pageSize: 100 })
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = { name: name.trim(), isOverhead, isActive: true };
      return editingId
        ? updateExpenseCategory(editingId, payload)
        : createExpenseCategory(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setModalOpen(false);
      setEditingId(null);
      setName("");
      setIsOverhead(false);
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("settings.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  return (
    <>
      <div className="toolbar">
        <button
          className="primary-button"
          onClick={() => setModalOpen(true)}
          type="button"
        >
          {t("settings.addCategory")}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("settings.name")}</th>
              <th>{t("settings.overhead")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {(query.data?.data ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.isOverhead ? t("common.yes") : t("common.no")}</td>
                <td>
                  <button
                    className="link-button"
                    onClick={() => {
                      setEditingId(row.id);
                      setName(row.name);
                      setIsOverhead(isActive(row.isOverhead));
                      setModalOpen(true);
                    }}
                    type="button"
                  >
                    {t("common.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <Modal title={t("settings.expenseCategories")} onClose={() => setModalOpen(false)}>
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
              {t("settings.form.name")} <span style={{ color: "#b42318" }}>*</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldError)} />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label className="checkbox-row">
              <input
                checked={isOverhead}
                type="checkbox"
                onChange={(event) => setIsOverhead(event.target.checked)}
              />
              {t("settings.form.overheadCategory")}
            </label>
            <div className="form-actions">
              <button className="primary-button" type="submit">
                {t("settings.form.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function OwnersList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [ownershipPercent, setOwnershipPercent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const query = useQuery({
    queryKey: ["owners"],
    queryFn: () => listOwners({ page: 1, pageSize: 100 })
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = {
        name: name.trim(),
        ownershipPercent: ownershipPercent ? Number(ownershipPercent) : null,
        isActive: true
      };
      return editingId ? updateOwner(editingId, payload) : createOwner(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owners"] });
      setModalOpen(false);
      setEditingId(null);
      setName("");
      setOwnershipPercent("");
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("settings.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  return (
    <>
      <div className="toolbar">
        <button className="primary-button" onClick={() => setModalOpen(true)} type="button">
          {t("settings.addOwner")}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("settings.name")}</th>
              <th>{t("settings.ownershipPercent")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {(query.data?.data ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td dir="ltr">{row.ownershipPercent ?? "-"}</td>
                <td>
                  <button
                    className="link-button"
                    onClick={() => {
                      setEditingId(row.id);
                      setName(row.name);
                      setOwnershipPercent(
                        row.ownershipPercent != null ? String(row.ownershipPercent) : ""
                      );
                      setModalOpen(true);
                    }}
                    type="button"
                  >
                    {t("common.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <Modal title={t("settings.owners")} onClose={() => setModalOpen(false)}>
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
              {t("settings.form.ownerName")} <span style={{ color: "#b42318" }}>*</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldError)} />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("settings.form.ownershipPercent")}
              <input
                dir="ltr"
                min="0"
                max="100"
                step="0.01"
                type="number"
                value={ownershipPercent}
                onChange={(event) => setOwnershipPercent(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" type="submit">
                {t("settings.form.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
