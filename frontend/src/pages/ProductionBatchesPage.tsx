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
import { formatMoney, listMaterials, listModels, listModelVariants } from "../lib/master-data";
import {
  cancelProductionBatch,
  completeProductionBatch,
  createProductionBatch,
  getProductionBatch,
  listProductionBatches,
  startProductionBatch,
  updateProductionBatch,
  type ConsumptionInput,
  type CostComponentInput,
  type OutputInput
} from "../lib/production";

type ConsumptionLine = ConsumptionInput & { key: string };
type OutputLine = OutputInput & { key: string };
type ComponentLine = CostComponentInput & { key: string };

const emptyForm = {
  modelId: "",
  plannedQuantity: "50",
  notes: "",
  startDate: new Date().toISOString().slice(0, 10),
  completedDate: new Date().toISOString().slice(0, 10),
  damagedQuantity: "0",
  wastedQuantity: "0"
};

const emptyConsumption = (): ConsumptionLine => ({
  key: crypto.randomUUID(),
  materialId: "",
  quantity: 1
});

const emptyOutput = (): OutputLine => ({
  key: crypto.randomUUID(),
  modelVariantId: "",
  goodQuantity: 1
});

const emptyComponent = (): ComponentLine => ({
  key: crypto.randomUUID(),
  componentName: "",
  amount: 0
});

const defaultComponentOptions = ["قص", "باترون", "أحبال", "أكياس وتكت", "حديد اكسسوار", "مصنعية", "تشطيب ومكواة", "استك", "بترون", "احبال"];

export function ProductionBatchesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [consumptions, setConsumptions] = useState<ConsumptionLine[]>([emptyConsumption()]);
  const [outputs, setOutputs] = useState<OutputLine[]>([emptyOutput()]);
  const [components, setComponents] = useState<ComponentLine[]>([]);
  const [componentOptions, setComponentOptions] = useState<string[]>(() => {
    const saved = localStorage.getItem("production.componentOptions");
    if (saved) try { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) return parsed; } catch { /* ignore */ }
    return defaultComponentOptions;
  });
  const [newComponentName, setNewComponentName] = useState("");
  const [showNewComponentInput, setShowNewComponentInput] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [actionError, setActionError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ plannedQuantity: "", notes: "" });
  const [editConsumptions, setEditConsumptions] = useState<ConsumptionLine[]>([]);
  const [editOutputs, setEditOutputs] = useState<OutputLine[]>([]);
  const [editComponents, setEditComponents] = useState<ComponentLine[]>([]);

  const batchesQuery = useQuery({
    queryKey: ["production-batches", page, pageSize, debouncedSearch],
    queryFn: () => listProductionBatches({ page, pageSize, search: debouncedSearch })
  });

  const modelsQuery = useQuery({
    queryKey: ["models", "options"],
    queryFn: () => listModels({ page: 1, pageSize: 100 })
  });

  const materialsQuery = useQuery({
    queryKey: ["materials", "options"],
    queryFn: () => listMaterials({ page: 1, pageSize: 200 })
  });

  const variantsQuery = useQuery({
    queryKey: ["model-variants", form.modelId],
    queryFn: () => listModelVariants(form.modelId),
    enabled: Boolean(form.modelId)
  });

  const detailQuery = useQuery({
    queryKey: ["production-batch", detailId],
    queryFn: () => getProductionBatch(detailId!),
    enabled: Boolean(detailId)
  });

  useEffect(() => {
    if (!form.modelId) {
      setOutputs([emptyOutput()]);
    }
  }, [form.modelId]);

  const totalComponentsMinor = components.reduce((sum, line) => sum + Math.round((Number(line.amount) || 0) * 100), 0);
  const totalConsumptionQty = consumptions.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalCostPreviewMinor = totalComponentsMinor;

  const createMutation = useMutation({
    mutationFn: async () => {
      const plannedQuantity = Number(form.plannedQuantity);
      if (!form.modelId || !form.plannedQuantity.trim() || !Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
        throw new Error(t("errors.required"));
      }

      const consumptionRows = consumptions
        .filter((row) => row.materialId && row.quantity > 0)
        .map(({ materialId, quantity, notes }) => ({ materialId, quantity, notes }));

      const outputRows = outputs
        .filter((row) => row.modelVariantId && row.goodQuantity > 0)
        .map(({ modelVariantId, goodQuantity }) => ({ modelVariantId, goodQuantity }));

      const componentRows = components
        .filter((row) => row.componentName.trim() && row.amount >= 0)
        .map(({ componentName, amount, notes }) => ({ componentName, amount, notes }));

      return createProductionBatch({
        modelId: form.modelId,
        plannedQuantity,
        notes: form.notes.trim() || null,
        consumptions: consumptionRows.length ? consumptionRows : undefined,
        outputs: outputRows.length ? outputRows : undefined,
        costComponents: componentRows.length ? componentRows : undefined
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["production-batches"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setConsumptions([emptyConsumption()]);
      setOutputs([emptyOutput()]);
      setComponents([]);
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("production.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error(t("errors.required"));
      const plannedQuantity = Number(editForm.plannedQuantity);
      if (!Number.isFinite(plannedQuantity) || plannedQuantity < 0) throw new Error(t("errors.required"));
      const consumptionRows = editConsumptions
        .filter((row) => row.materialId && row.quantity > 0)
        .map(({ materialId, quantity, notes }) => ({ materialId, quantity, notes }));
      const outputRows = editOutputs
        .filter((row) => row.modelVariantId && row.goodQuantity > 0)
        .map(({ modelVariantId, goodQuantity }) => ({ modelVariantId, goodQuantity }));
      const componentRows = editComponents
        .filter((row) => row.componentName.trim() && row.amount >= 0)
        .map(({ componentName, amount, notes }) => ({ componentName, amount, notes }));
      return updateProductionBatch(detail.id, {
        plannedQuantity,
        notes: editForm.notes.trim() || null,
        consumptions: consumptionRows,
        outputs: outputRows,
        costComponents: componentRows
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["production-batches"] });
      if (detailId) await queryClient.invalidateQueries({ queryKey: ["production-batch", detailId] });
      setEditOpen(false);
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("production.form.error");
      setFieldError(msg);
    }
  });

  function openEditDraft() {
    if (!detail) return;
    setEditForm({
      plannedQuantity: String(detail.plannedQuantity ?? 50),
      notes: detail.notes ?? ""
    });
    setEditConsumptions(
      (detail.consumptions ?? []).length
        ? detail.consumptions!.map((c) => ({ key: crypto.randomUUID(), materialId: c.materialId, quantity: c.quantity, notes: c.notes ?? null }))
        : [emptyConsumption()]
    );
    setEditOutputs(
      (detail.outputs ?? []).length
        ? detail.outputs!.map((o) => ({ key: crypto.randomUUID(), modelVariantId: o.modelVariantId, goodQuantity: o.goodQuantity }))
        : [emptyOutput()]
    );
    setEditComponents(
      (detail.costComponents ?? []).map((c) => ({
        key: crypto.randomUUID(),
        componentName: c.componentName,
        amount: c.amountMinor / 100,
        notes: c.notes ?? null
      }))
    );
    setFieldError("");
    setError("");
    setEditOpen(true);
  }

  const startMutation = useMutation({
    mutationFn: (batchId: string) => startProductionBatch(batchId, form.startDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["production-batches"] });
      if (detailId) {
        await queryClient.invalidateQueries({ queryKey: ["production-batch", detailId] });
      }
      setActionError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setActionError(t("production.form.error"))
  });

  const completeMutation = useMutation({
    mutationFn: (batchId: string) =>
      completeProductionBatch(batchId, {
        completedDate: form.completedDate,
        damagedQuantity: Number(form.damagedQuantity) || 0,
        wastedQuantity: Number(form.wastedQuantity) || 0
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["production-batches"] });
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      if (detailId) {
        await queryClient.invalidateQueries({ queryKey: ["production-batch", detailId] });
      }
      setActionError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setActionError(t("production.completeDialog.error"))
  });

  const cancelMutation = useMutation({
    mutationFn: (batchId: string) => cancelProductionBatch(batchId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["production-batches"] });
      if (detailId) {
        await queryClient.invalidateQueries({ queryKey: ["production-batch", detailId] });
      }
      setActionError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setActionError(t("production.form.error"))
  });

  const rows = batchesQuery.data?.data ?? [];
  const meta = batchesQuery.data?.meta;
  const detail = detailQuery.data;

  // تقدير تكلفة المسودة (قبل الإكمال) — متوسط حالي × كمية
  const estimatedDirectMinor = (() => {
    if (!detail || detail.status !== "draft") return 0;
    const matMap = new Map<string, number>();
    (materialsQuery.data?.data ?? []).forEach((m) => matMap.set(m.id, m.weightedAverageCostMinor));
    let sum = 0;
    for (const c of detail.consumptions ?? []) {
      const avg = matMap.get(c.materialId) ?? c.unitCostMinor ?? 0;
      sum += Math.round(c.quantity * avg);
    }
    for (const comp of detail.costComponents ?? []) {
      sum += comp.amountMinor;
    }
    return sum;
  })();
  const estimatedPerPieceMinor =
    detail && detail.status === "draft" && estimatedDirectMinor > 0 && (detail.plannedQuantity || 1) > 0
      ? Math.round(estimatedDirectMinor / (detail.plannedQuantity || 1))
      : 0;

  function openCreate() {
    setCreateOpen(true);
    setError("");
    setFieldError("");
  }

  return (
    <>
      <ListPageShell
        title={t("production.title")}
        description={t("production.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("production.addBatch")}
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
              <th>{t("production.batchNumber")}</th>
              <th>{t("production.model")}</th>
              <th>{t("production.status")}</th>
              <th>{t("production.planned")}</th>
              <th>{t("production.good")}</th>
              <th>{t("production.cost")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {batchesQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={t("production.noBatches")}
                    description={t("production.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("production.addBatch")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((batch) => (
                <tr key={batch.id}>
                  <td dir="ltr">{batch.batchNumber}</td>
                  <td>
                    {batch.modelCode} - {batch.modelName}
                  </td>
                  <td><StatusPill status={batch.status} /></td>
                  <td>{batch.plannedQuantity}</td>
                  <td>{batch.goodQuantity}</td>
                  <td dir="ltr">
                    {batch.costPerGoodPieceMinor > 0
                      ? formatMoney(batch.costPerGoodPieceMinor)
                      : "-"}
                  </td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => {
                        setDetailId(batch.id);
                        setActionError("");
                      }}
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
        <Modal title={t("production.addBatch")} onClose={() => setCreateOpen(false)}>
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
              {t("production.form.model")} <span style={{ color: "#b42318" }}>*</span>
              <SearchableSelect
                value={form.modelId}
                onChange={(v) => setForm({ ...form, modelId: v })}
                options={(modelsQuery.data?.data ?? []).map((model) => ({ value: model.id, label: `${model.modelCode} - ${model.modelName}` }))}
                placeholder={t("common.select")}
                required
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("production.form.plannedQuantity")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                dir="ltr"
                min="0"
                step="1"
                type="number"
                value={form.plannedQuantity}
                onChange={(event) => setForm({ ...form, plannedQuantity: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("production.form.notes")}
              <textarea
                rows={2}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>

            <fieldset className="line-items">
              <legend>{t("production.form.consumptions")}</legend>
              <p dir="ltr" style={{ fontWeight: 600 }}>Total qty: {totalConsumptionQty}</p>
              {consumptions.map((line, index) => (
                <div className="line-item-row" key={line.key}>
                  <SearchableSelect
                    value={line.materialId}
                    onChange={(v) => {
                      const next = [...consumptions];
                      next[index] = { ...line, materialId: v };
                      setConsumptions(next);
                    }}
                    options={(materialsQuery.data?.data ?? []).map((material) => ({
                      value: material.id,
                      label: `${material.name} (${material.currentQuantity} ${material.unit})`
                    }))}
                    placeholder={t("production.form.material")}
                    required={index === 0}
                  />
                  <input
                    dir="ltr"
                    min="0.01"
                    step="0.01"
                    type="number"
                    placeholder={t("production.form.quantity")}
                    value={line.quantity}
                    onChange={(event) => {
                      const next = [...consumptions];
                      next[index] = { ...line, quantity: Number(event.target.value) };
                      setConsumptions(next);
                    }}
                  />
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setConsumptions(consumptions.filter((row) => row.key !== line.key))
                    }
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <button
                className="ghost-button"
                onClick={() => setConsumptions([...consumptions, emptyConsumption()])}
                type="button"
              >
                {t("production.form.addConsumption")}
              </button>
            </fieldset>

            <fieldset className="line-items">
              <legend>{t("production.form.outputs")}</legend>
              {outputs.map((line, index) => (
                <div className="line-item-row" key={line.key}>
                  <SearchableSelect
                    value={line.modelVariantId}
                    onChange={(v) => {
                      const next = [...outputs];
                      next[index] = { ...line, modelVariantId: v };
                      setOutputs(next);
                    }}
                    options={(variantsQuery.data ?? []).map((variant) => ({
                      value: variant.id,
                      label: `${variant.sizeName} / ${variant.colorName}`
                    }))}
                    placeholder={t("finished.variant")}
                    required={index === 0}
                  />
                  <input
                    dir="ltr"
                    min="1"
                    step="1"
                    type="number"
                    placeholder={t("production.form.goodQuantity")}
                    value={line.goodQuantity}
                    onChange={(event) => {
                      const next = [...outputs];
                      next[index] = { ...line, goodQuantity: Number(event.target.value) };
                      setOutputs(next);
                    }}
                  />
                  <button
                    className="ghost-button"
                    onClick={() => setOutputs(outputs.filter((row) => row.key !== line.key))}
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <button
                className="ghost-button"
                onClick={() => setOutputs([...outputs, emptyOutput()])}
                type="button"
              >
                {t("production.form.addOutput")}
              </button>
            </fieldset>

            <fieldset className="line-items">
              <legend>{t("production.form.costComponents")}</legend>
              <p dir="ltr" style={{ fontWeight: 600 }}>{t("production.cost")}: {formatMoney(totalCostPreviewMinor)}</p>
              {components.map((line, index) => (
                <div className="line-item-row" key={line.key}>
                  {showNewComponentInput === line.key ? (
                    <div style={{ display: "flex", gap: 8, flex: 1 }}>
                      <input
                        autoFocus
                        placeholder={t("production.form.newComponentPlaceholder")}
                        value={newComponentName}
                        onChange={(e) => setNewComponentName(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          const name = newComponentName.trim();
                          if (!name) return;
                          if (!componentOptions.includes(name)) {
                            const nextOpts = [...componentOptions, name];
                            setComponentOptions(nextOpts);
                            localStorage.setItem("production.componentOptions", JSON.stringify(nextOpts));
                          }
                          const next = [...components];
                          next[index] = { ...line, componentName: name };
                          setComponents(next);
                          setNewComponentName("");
                          setShowNewComponentInput(null);
                        }}
                      >
                        {t("common.save")}
                      </button>
                      <button className="ghost-button" type="button" onClick={() => { setShowNewComponentInput(null); setNewComponentName(""); }}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <select
                      value={componentOptions.includes(line.componentName) ? line.componentName : line.componentName ? "__custom__" : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__new__") {
                          setShowNewComponentInput(line.key);
                          setNewComponentName("");
                        } else if (val === "__custom__") {
                          // keep custom value as is
                        } else {
                          const next = [...components];
                          next[index] = { ...line, componentName: val };
                          setComponents(next);
                        }
                      }}
                      style={{ flex: 1 }}
                    >
                      <option value="">{t("production.form.componentName")}</option>
                      {componentOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      {line.componentName && !componentOptions.includes(line.componentName) ? (
                        <option value="__custom__">{line.componentName} (مخصص)</option>
                      ) : null}
                      <option value="__new__">{t("production.form.addNewComponent")}</option>
                    </select>
                  )}
                  <input
                    dir="ltr"
                    min="0"
                    step="0.01"
                    type="number"
                    placeholder={t("production.form.amount")}
                    value={line.amount}
                    onChange={(event) => {
                      const next = [...components];
                      next[index] = { ...line, amount: Number(event.target.value) };
                      setComponents(next);
                    }}
                  />
                  <button
                    className="ghost-button"
                    onClick={() => setComponents(components.filter((row) => row.key !== line.key))}
                    type="button"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <button
                className="ghost-button"
                onClick={() => setComponents([...components, emptyComponent()])}
                type="button"
              >
                {t("production.form.addComponent")}
              </button>
            </fieldset>

            <div className="form-actions">
              <button className="primary-button" disabled={createMutation.isPending} type="submit">
                {createMutation.isPending ? t("common.saving") : t("common.create")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {detail ? (
        <Modal title={`${t("production.batchNumber")} ${detail.batchNumber}`} onClose={() => setDetailId(null)}>
          <div className="detail-grid">
            {actionError ? <p className="form-error">{actionError}</p> : null}
            <p>
              <strong>{t("production.model")}:</strong> {detail.modelCode} - {detail.modelName}
            </p>
            <p>
              <strong>{t("production.status")}:</strong> <StatusPill status={detail.status} />
            </p>
            <p>
              <strong>{t("production.planned")}:</strong> {detail.plannedQuantity}
            </p>
            {detail.status === "completed" ? (
              <>
                <p>
                  <strong>{t("production.good")} / {t("production.damaged")} / {t("production.wasted")}:</strong> {detail.goodQuantity} /{" "}
                  {detail.damagedQuantity} / {detail.wastedQuantity}
                </p>
                <p>
                  <strong>{t("production.costSummary.directCost")}:</strong> {formatMoney(detail.directCostMinor)}
                </p>
                <p>
                  <strong>{t("production.costSummary.overheadCost")}:</strong> {formatMoney(detail.overheadCostMinor)}
                </p>
                <p>
                  <strong>{t("production.costSummary.totalCost")}:</strong> {formatMoney(detail.totalCostMinor)}
                </p>
                <p>
                  <strong>{t("production.costSummary.costPerPiece")}:</strong>{" "}
                  {formatMoney(detail.costPerGoodPieceMinor)}
                </p>
              </>
            ) : null}

            <div className="table-wrap">
              <h4>{t("production.details.consumptions")}</h4>
              <table>
                <thead>
                  <tr>
                    <th>{t("materials.name")}</th>
                    <th>{t("production.form.quantity")}</th>
                    <th>{t("production.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.consumptions ?? []).map((row) => (
                    <tr key={row.id}>
                      <td>{row.materialName}</td>
                      <td>{row.quantity}</td>
                      <td dir="ltr">{formatMoney(row.totalCostMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <h4>{t("production.details.outputs")}</h4>
              <table>
                <thead>
                  <tr>
                    <th>{t("finished.variant")}</th>
                    <th>{t("production.form.goodQuantity")}</th>
                    <th>{t("production.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.outputs ?? []).map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.sizeName} / {row.colorName}
                      </td>
                      <td>{row.goodQuantity}</td>
                      <td dir="ltr">{formatMoney(row.totalCostMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.status === "draft" ? (
              <>
                <div className="panel" style={{ background: "#fefce8", borderColor: "#fde68a", padding: 12 }}>
                  <p className="muted" style={{ margin: 0 }}>
                    تكلفة تقديرية (قبل الإكمال): <strong dir="ltr">{formatMoney(estimatedDirectMinor)}</strong> (مباشرة) → للقطعة <strong dir="ltr">{formatMoney(estimatedPerPieceMinor)}</strong>
                    <span style={{ color: "#92400e" }}> — تحسب نهائيا عند الإكمال (متوسط حالي × كمية)</span>
                  </p>
                </div>
                <div className="form-actions">
                  <button className="primary-button" onClick={openEditDraft} type="button">
                    {t("common.edit")}
                  </button>
                  <button
                    className="primary-button"
                    disabled={startMutation.isPending}
                    onClick={() => startMutation.mutate(detail.id)}
                    type="button"
                  >
                    {startMutation.isPending ? t("common.saving") : t("production.actions.start")}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(detail.id)}
                    type="button"
                  >
                    {t("production.actions.cancel")}
                  </button>
                </div>
              </>
            ) : null}

            {detail.status === "in_progress" ? (
              <div className="form-grid">
                <label>
                  {t("production.completeDialog.completedDate")}
                  <input
                    dir="ltr"
                    type="date"
                    value={form.completedDate}
                    onChange={(event) => setForm({ ...form, completedDate: event.target.value })}
                  />
                </label>
                <label>
                  {t("production.completeDialog.damagedQuantity")}
                  <input
                    dir="ltr"
                    min="0"
                    step="1"
                    type="number"
                    value={form.damagedQuantity}
                    onChange={(event) => setForm({ ...form, damagedQuantity: event.target.value })}
                  />
                </label>
                <label>
                  {t("production.completeDialog.wastedQuantity")}
                  <input
                    dir="ltr"
                    min="0"
                    step="1"
                    type="number"
                    value={form.wastedQuantity}
                    onChange={(event) => setForm({ ...form, wastedQuantity: event.target.value })}
                  />
                </label>
                <div className="form-actions">
                  <button
                    className="primary-button"
                    disabled={completeMutation.isPending}
                    onClick={() => completeMutation.mutate(detail.id)}
                    type="button"
                  >
                    {completeMutation.isPending ? t("common.saving") : t("production.completeDialog.save")}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(detail.id)}
                    type="button"
                  >
                    {t("production.actions.cancel")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {editOpen && detail ? (
        <Modal title={t("common.edit") + " - " + detail.batchNumber} onClose={() => setEditOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              editMutation.mutate();
            }}
          >
            {fieldError ? <p className="form-error">{fieldError}</p> : null}
            <label>
              {t("production.form.plannedQuantity")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                dir="ltr"
                type="number"
                min={0}
                value={editForm.plannedQuantity}
                onChange={(e) => setEditForm({ ...editForm, plannedQuantity: e.target.value })}
              />
            </label>
            <label>
              {t("production.form.notes")}
              <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </label>

            <fieldset className="line-items">
              <legend>{t("production.form.consumptions")}</legend>
              {editConsumptions.map((line, idx) => (
                <div className="line-item-row" key={line.key}>
                  <SearchableSelect
                    value={line.materialId}
                    onChange={(v) => { const n=[...editConsumptions]; n[idx]={...line, materialId:v}; setEditConsumptions(n); }}
                    options={(materialsQuery.data?.data ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.currentQuantity})` }))}
                    placeholder={t("production.form.material")}
                  />
                  <input dir="ltr" type="number" min={0.01} step={0.01} value={line.quantity} onChange={(e)=>{const n=[...editConsumptions]; n[idx]={...line, quantity:Number(e.target.value)}; setEditConsumptions(n);}} />
                  <button className="ghost-button" type="button" onClick={()=>setEditConsumptions(editConsumptions.filter(r=>r.key!==line.key))}>{t("common.delete")}</button>
                </div>
              ))}
              <button className="ghost-button" type="button" onClick={()=>setEditConsumptions([...editConsumptions, emptyConsumption()])}>{t("production.form.addConsumption")}</button>
            </fieldset>

            <fieldset className="line-items">
              <legend>{t("production.form.outputs")}</legend>
              {editOutputs.map((line, idx) => (
                <div className="line-item-row" key={line.key}>
                  <SearchableSelect
                    value={line.modelVariantId}
                    onChange={(v)=>{const n=[...editOutputs]; n[idx]={...line, modelVariantId:v}; setEditOutputs(n);}}
                    options={(variantsQuery.data ?? []).map((v) => ({ value: v.id, label: `${v.sizeName} / ${v.colorName}` }))}
                    placeholder={t("finished.variant")}
                  />
                  <input dir="ltr" type="number" min={1} value={line.goodQuantity} onChange={(e)=>{const n=[...editOutputs]; n[idx]={...line, goodQuantity:Number(e.target.value)}; setEditOutputs(n);}} />
                  <button className="ghost-button" type="button" onClick={()=>setEditOutputs(editOutputs.filter(r=>r.key!==line.key))}>{t("common.delete")}</button>
                </div>
              ))}
              <button className="ghost-button" type="button" onClick={()=>setEditOutputs([...editOutputs, emptyOutput()])}>{t("production.form.addOutput")}</button>
            </fieldset>

            <fieldset className="line-items">
              <legend>{t("production.form.costComponents")}</legend>
              {editComponents.map((line, idx) => (
                <div className="line-item-row" key={line.key}>
                  <input placeholder={t("production.form.componentName")} value={line.componentName} onChange={(e)=>{const n=[...editComponents]; n[idx]={...line, componentName:e.target.value}; setEditComponents(n);}} />
                  <input dir="ltr" type="number" value={line.amount} onChange={(e)=>{const n=[...editComponents]; n[idx]={...line, amount:Number(e.target.value)}; setEditComponents(n);}} />
                  <button className="ghost-button" type="button" onClick={()=>setEditComponents(editComponents.filter(r=>r.key!==line.key))}>{t("common.delete")}</button>
                </div>
              ))}
              <button className="ghost-button" type="button" onClick={()=>setEditComponents([...editComponents, emptyComponent()])}>{t("production.form.addComponent")}</button>
            </fieldset>

            <div className="form-actions">
              <button className="primary-button" disabled={editMutation.isPending} type="submit">{editMutation.isPending ? t("common.saving") : t("common.save")}</button>
              <button className="ghost-button" type="button" onClick={()=>setEditOpen(false)}>{t("common.cancel")}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
