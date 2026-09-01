import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Modal, showToast } from "../components/ListPageShell";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
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

type Tab = "sizes" | "colors" | "payment-methods" | "expense-categories" | "owners" | "backup";

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
          ["owners", t("settings.owners")],
          ["backup", t("settings.backups")]
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
      {tab === "backup" ? <BackupSettingsTab /> : null}
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
              <th scope="col">{t("settings.name")}</th>
              <th scope="col">{t("common.status")}</th>
              <th scope="col" aria-label={t("common.actions")} />
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
              <th scope="col">{t("settings.name")}</th>
              <th scope="col">{t("settings.overhead")}</th>
              <th scope="col" aria-label={t("common.actions")} />
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
              <th scope="col">{t("settings.name")}</th>
              <th scope="col">{t("settings.ownershipPercent")}</th>
              <th scope="col" aria-label={t("common.actions")} />
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

interface BackupSettings {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  retentionCount: number;
  lastBackupAt: string | null;
}

interface BackupInfo {
  filename: string;
  size: number;
  type: "auto" | "manual" | "safety";
  createdAt: string;
}

function BackupSettingsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteFile, setDeleteFile] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [retentionCount, setRetentionCount] = useState(5);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const res = await api.get("/backups");
      return res.data.data as BackupInfo[];
    }
  });

  const settingsQuery = useQuery({
    queryKey: ["backup-settings"],
    queryFn: async () => {
      const res = await api.get("/backups/settings");
      const data = res.data.data as BackupSettings;
      setEnabled(data.enabled);
      setFrequency(data.frequency);
      setRetentionCount(data.retentionCount);
      setLastBackupAt(data.lastBackupAt);
      return data;
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put("/backups/settings", {
        enabled,
        frequency,
        retentionCount: Number(retentionCount),
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backup-settings"] });
      showToast(t("backup.toastSaveSettingsSuccess") + " ✓");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || t("errors.couldNotSave"));
    }
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/backups");
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      showToast(t("backup.toastBackupSuccess") + " ✓");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || t("errors.couldNotSave"));
    }
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      await api.delete(`/backups/${filename}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setDeleteModalOpen(false);
      setDeleteFile(null);
      showToast(t("backup.toastDeleteSuccess") + " ✓");
    },
    onError: (err: any) => {
      setDeleteModalOpen(false);
      setDeleteFile(null);
      showToast(err.response?.data?.message || t("errors.couldNotSave"));
    }
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      setIsRestoring(true);
      await api.post("/backups/restore", { filename });
    },
    onSuccess: () => {
      showToast(t("backup.toastRestoreSuccess"));
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: (err: any) => {
      setIsRestoring(false);
      setRestoreModalOpen(false);
      setRestoreFile(null);
      showToast(err.response?.data?.message || t("errors.couldNotSave"));
    }
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const translateType = (type: string) => {
    if (type === "auto") return t("backup.auto");
    if (type === "manual") return t("backup.manual");
    return t("backup.safety");
  };

  const backups = backupsQuery.data ?? [];

  return (
    <div style={{ display: "grid", gap: "24px", marginTop: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
        
        {/* Auto Backup Config Card */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h4 style={{ margin: 0, borderBottom: "1px solid #ece3d4", paddingBottom: "10px" }}>
            {t("backup.autoSettings")}
          </h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSettingsMutation.mutate();
            }}
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <label className="checkbox-row" style={{ fontWeight: "600" }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {t("backup.enabled")}
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#4d463d" }}>
                {t("backup.frequency")}
              </span>
              <select
                value={frequency}
                disabled={!enabled}
                onChange={(e) => setFrequency(e.target.value as any)}
                style={{ padding: "8px", borderRadius: "8px", border: "1px solid #cabda7" }}
              >
                <option value="daily">{t("backup.daily")}</option>
                <option value="weekly">{t("backup.weekly")}</option>
                <option value="monthly">{t("backup.monthly")}</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#4d463d" }}>
                {t("backup.retentionCount")}
              </span>
              <input
                type="number"
                min={1}
                max={50}
                value={retentionCount}
                disabled={!enabled}
                onChange={(e) => setRetentionCount(Number(e.target.value))}
                style={{ padding: "8px", borderRadius: "8px", border: "1px solid #cabda7" }}
              />
            </label>

            <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                className="primary-button"
                type="submit"
                disabled={saveSettingsMutation.isPending}
              >
                {saveSettingsMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </div>

        {/* Manual Actions Card */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h4 style={{ margin: 0, borderBottom: "1px solid #ece3d4", paddingBottom: "10px" }}>
              {t("backup.title")}
            </h4>
            <p style={{ margin: "12px 0 0", color: "#665d51", fontSize: "13px", lineHeight: "1.6" }}>
              {t("backup.subtitle")}
            </p>
            {lastBackupAt ? (
              <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#665d51" }}>
                <strong>{t("backup.lastBackup")}</strong>
                <span dir="ltr">{new Date(lastBackupAt).toLocaleString()}</span>
              </p>
            ) : (
              <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#665d51" }}>
                <strong>{t("backup.lastBackup")}</strong>
                {t("backup.never")}
              </p>
            )}
          </div>
          <div style={{ marginTop: "auto", paddingTop: "16px" }}>
            <button
              className="primary-button"
              type="button"
              disabled={createBackupMutation.isPending}
              onClick={() => createBackupMutation.mutate()}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {createBackupMutation.isPending ? t("common.savingDot") : t("backup.createBtn")}
            </button>
          </div>
        </div>
      </div>

      {/* Backups List Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{t("backup.filename")}</th>
              <th scope="col">{t("backup.date")}</th>
              <th scope="col">{t("backup.size")}</th>
              <th scope="col">{t("backup.type")}</th>
              <th scope="col" aria-label={t("backup.actions")} style={{ textAlign: "center" }} />
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#665d51" }}>
                  {t("settings.noData")}
                </td>
              </tr>
            ) : (
              backups.map((row) => (
                <tr key={row.filename}>
                  <td style={{ fontWeight: "600" }} dir="ltr">{row.filename}</td>
                  <td dir="ltr">{row.createdAt}</td>
                  <td>{formatBytes(row.size)}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        background: row.type === "auto" ? "#e0f2fe" : row.type === "manual" ? "#dcfce7" : "#fef3c7",
                        color: row.type === "auto" ? "#0369a1" : row.type === "manual" ? "#15803d" : "#b45309",
                      }}
                    >
                      {translateType(row.type)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => {
                          setRestoreFile(row.filename);
                          setRestoreModalOpen(true);
                        }}
                        style={{ color: "#9a6428", fontWeight: "600" }}
                      >
                        {t("backup.restore")}
                      </button>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => {
                          setDeleteFile(row.filename);
                          setDeleteModalOpen(true);
                        }}
                        style={{ color: "#b42318", textDecoration: "none" }}
                      >
                        {t("backup.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm Restore Modal */}
      {restoreModalOpen && restoreFile && (
        <Modal title={t("backup.confirmRestoreTitle")} onClose={() => !isRestoring && setRestoreModalOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ color: "#b42318", fontWeight: "600", lineHeight: "1.6" }}>
              {t("backup.confirmRestoreMsg")}
            </p>
            <div style={{ padding: "8px 12px", background: "#efe7d8", borderRadius: "8px", fontSize: "13px" }}>
              <strong>{t("backup.filename")}:</strong> <span dir="ltr">{restoreFile}</span>
            </div>
            <div className="form-actions" style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setRestoreModalOpen(false)}
                style={{
                  background: "#efe7d8",
                  border: 0,
                  borderRadius: "8px",
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontWeight: "600",
                  color: "#25211b"
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isRestoring}
                onClick={() => restoreBackupMutation.mutate(restoreFile)}
                style={{ background: "#b42318", minWidth: "100px", justifyContent: "center" }}
              >
                {isRestoring ? t("backup.restoring") : t("backup.restore")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Delete Modal */}
      {deleteModalOpen && deleteFile && (
        <Modal title={t("backup.confirmDeleteTitle")} onClose={() => setDeleteModalOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p>{t("backup.confirmDeleteMsg")}</p>
            <div style={{ padding: "8px 12px", background: "#efe7d8", borderRadius: "8px", fontSize: "13px" }}>
              <strong>{t("backup.filename")}:</strong> <span dir="ltr">{deleteFile}</span>
            </div>
            <div className="form-actions" style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  background: "#efe7d8",
                  border: 0,
                  borderRadius: "8px",
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontWeight: "600",
                  color: "#25211b"
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={deleteBackupMutation.isPending}
                onClick={() => deleteBackupMutation.mutate(deleteFile)}
                style={{ background: "#b42318" }}
              >
                {deleteBackupMutation.isPending ? t("common.saving") : t("backup.delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
