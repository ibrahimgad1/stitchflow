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
  createMaterial,
  formatMoney,
  isActive,
  listMaterials,
  listSuppliers,
  updateMaterial
} from "../lib/master-data";
import { adjustMaterialStock, listMaterialMovements } from "../lib/purchasing";
import type { Material } from "../lib/types";

const emptyForm = {
  name: "",
  colorName: "",
  unit: "meter",
  supplierId: "",
  notes: "",
  isActive: true
};

export function MaterialsPage() {
  const { t, statusLabel } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [movementsMaterialId, setMovementsMaterialId] = useState<string | null>(null);
  const [adjustMaterial, setAdjustMaterial] = useState<Material | null>(null);
  const [adjustForm, setAdjustForm] = useState({ newQuantity: "", reason: "" });
  const [adjustError, setAdjustError] = useState("");

  const materialsQuery = useQuery({
    queryKey: ["materials", page, pageSize, debouncedSearch],
    queryFn: () => listMaterials({ page, pageSize, search: debouncedSearch })
  });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: () => listSuppliers({ page: 1, pageSize: 100 })
  });

  const movementsQuery = useQuery({
    queryKey: ["material-movements", movementsMaterialId],
    queryFn: () => listMaterialMovements(movementsMaterialId!, { page: 1, pageSize: 50 }),
    enabled: Boolean(movementsMaterialId)
  });

  const adjustMutation = useMutation({
    mutationFn: async () =>
      adjustMaterialStock(adjustMaterial!.id, {
        newQuantity: Number(adjustForm.newQuantity),
        reason: adjustForm.reason.trim()
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
      setAdjustMaterial(null);
      setAdjustForm({ newQuantity: "", reason: "" });
      setAdjustError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setAdjustError(t("materials.adjust.error"))
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.unit.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = {
        name: form.name.trim(),
        colorName: form.colorName.trim() || null,
        unit: form.unit.trim(),
        supplierId: form.supplierId || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive
      };

      return editing ? updateMaterial(editing.id, payload) : createMaterial(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
      setFieldError("");
      showToast(editing ? t("common.save") + " ✓" : t("materials.add") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("materials.form.error");
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

  function openEdit(material: Material) {
    setEditing(material);
    setForm({
      name: material.name,
      colorName: material.colorName ?? "",
      unit: material.unit,
      supplierId: material.supplierId ?? "",
      notes: material.notes ?? "",
      isActive: isActive(material.isActive)
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

  const rows = materialsQuery.data?.data ?? [];
  const meta = materialsQuery.data?.meta;

  return (
    <>
      <ListPageShell
        title={t("materials.title")}
        description={t("materials.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("materials.add")}
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
              <th>{t("materials.name")}</th>
              <th>{t("materials.color")}</th>
              <th>{t("materials.unit")}</th>
              <th>{t("materials.stock")}</th>
              <th>{t("materials.avgCost")}</th>
              <th>{t("materials.supplier")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {materialsQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={t("materials.noMaterials")}
                    description={t("materials.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("materials.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((material) => (
                <tr key={material.id}>
                  <td>{material.name}</td>
                  <td>{material.colorName || "-"}</td>
                  <td>{material.unit}</td>
                  <td>{material.currentQuantity}</td>
                  <td dir="ltr">
                    {formatMoney(material.weightedAverageCostMinor)}
                    {material.currentQuantity > 0 && material.weightedAverageCostMinor === 0 ? (
                      <span style={{ color: "#924437", fontSize: 12, display: "block" }}>{t("materials.avgWarning")}</span>
                    ) : null}
                  </td>
                  <td>{material.supplierName || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="link-button" onClick={() => openEdit(material)} type="button">
                        {t("materials.actions.edit")}
                      </button>
                      <button
                        className="link-button"
                        onClick={() => setMovementsMaterialId(material.id)}
                        type="button"
                      >
                        {t("materials.actions.movements")}
                      </button>
                      <button
                        className="link-button"
                        onClick={() => {
                          setAdjustMaterial(material);
                          setAdjustForm({
                            newQuantity: String(material.currentQuantity),
                            reason: ""
                          });
                          setAdjustError("");
                        }}
                        type="button"
                      >
                        {t("materials.actions.adjust")}
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
          title={editing ? t("materials.edit") : t("materials.add")}
          onClose={() => setModalOpen(false)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("materials.form.name")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("materials.form.colorName")}
              <input
                value={form.colorName}
                onChange={(event) => setForm({ ...form, colorName: event.target.value })}
              />
            </label>
            <label>
              {t("materials.form.unit")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("materials.form.supplier")}
              <select
                value={form.supplierId}
                onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
              >
                <option value="">{t("materials.form.none")}</option>
                {(suppliersQuery.data?.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("materials.form.notes")}
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
              {t("materials.form.active")}
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {movementsMaterialId ? (
        <Modal title={t("materials.movements.title")} onClose={() => setMovementsMaterialId(null)}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("materials.movements.date")}</th>
                  <th>{t("materials.movements.type")}</th>
                  <th>{t("materials.movements.delta")}</th>
                  <th>{t("materials.movements.after")}</th>
                  <th>{t("materials.movements.description")}</th>
                </tr>
              </thead>
              <tbody>
                {movementsQuery.isLoading ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="skeleton" style={{ height: 18 }} />
                    </td>
                  </tr>
                ) : (movementsQuery.data?.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title={t("materials.movements.noMovements")} />
                    </td>
                  </tr>
                ) : (
                  (movementsQuery.data?.data ?? []).map((row) => (
                    <tr key={row.id}>
                      <td dir="ltr">{row.movementDate}</td>
                      <td><StatusPill status={row.movementType} /></td>
                      <td>{row.quantityDelta}</td>
                      <td>{row.quantityAfter}</td>
                      <td>{row.description || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}

      {adjustMaterial ? (
        <Modal title={`${t("materials.adjust.title")} - ${adjustMaterial.name}`} onClose={() => setAdjustMaterial(null)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              adjustMutation.mutate();
            }}
          >
            {adjustError ? <p className="form-error">{adjustError}</p> : null}
            <p className="muted">{t("materials.adjust.current", { value: adjustMaterial.currentQuantity })}</p>
            <label>
              {t("materials.adjust.newQuantity")}
              <input
                required
                dir="ltr"
                min="0"
                step="0.01"
                type="number"
                value={adjustForm.newQuantity}
                onChange={(event) =>
                  setAdjustForm({ ...adjustForm, newQuantity: event.target.value })
                }
              />
            </label>
            <label>
              {t("materials.adjust.reason")}
              <textarea
                required
                rows={2}
                value={adjustForm.reason}
                onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })}
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={adjustMutation.isPending} type="submit">
                {adjustMutation.isPending ? t("common.saving") : t("materials.adjust.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
