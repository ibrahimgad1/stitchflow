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
  createModel,
  createModelVariant,
  isActive,
  listColors,
  listModelVariants,
  listModels,
  listSizes,
  updateModel
} from "../lib/master-data";
import type { Model } from "../lib/types";

const emptyForm = {
  modelCode: "",
  modelName: "",
  description: "",
  isActive: true
};

export function ModelsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [modalOpen, setModalOpen] = useState(false);
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [variantForm, setVariantForm] = useState({ sizeId: "", colorId: "" });
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const modelsQuery = useQuery({
    queryKey: ["models", page, pageSize, debouncedSearch],
    queryFn: () => listModels({ page, pageSize, search: debouncedSearch })
  });

  const sizesQuery = useQuery({
    queryKey: ["sizes", "options"],
    queryFn: () => listSizes({ page: 1, pageSize: 100 })
  });

  const colorsQuery = useQuery({
    queryKey: ["colors", "options"],
    queryFn: () => listColors({ page: 1, pageSize: 100 })
  });

  const variantsQuery = useQuery({
    queryKey: ["model-variants", selectedModel?.id],
    queryFn: () => listModelVariants(selectedModel!.id),
    enabled: Boolean(selectedModel)
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.modelCode.trim() || !form.modelName.trim()) {
        throw new Error(t("errors.required"));
      }
      const payload = {
        modelCode: form.modelCode.trim(),
        modelName: form.modelName.trim(),
        description: form.description.trim() || null,
        isActive: form.isActive
      };

      return editing ? updateModel(editing.id, payload) : createModel(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setError("");
      setFieldError("");
      showToast(editing ? t("common.save") + " ✓" : t("models.addModel") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("errors.couldNotSave");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  const variantMutation = useMutation({
    mutationFn: async () =>
      createModelVariant(selectedModel!.id, {
        sizeId: variantForm.sizeId,
        colorId: variantForm.colorId
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-variants", selectedModel?.id] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      setVariantForm({ sizeId: "", colorId: "" });
      setError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setError(t("errors.couldNotSave"))
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setFieldError("");
    setModalOpen(true);
  }

  function openEdit(model: Model) {
    setEditing(model);
    setForm({
      modelCode: model.modelCode,
      modelName: model.modelName,
      description: model.description ?? "",
      isActive: isActive(model.isActive)
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

  function openVariants(model: Model) {
    setSelectedModel(model);
    setVariantModalOpen(true);
    setError("");
  }

  const rows = modelsQuery.data?.data ?? [];
  const meta = modelsQuery.data?.meta;

  return (
    <>
      <ListPageShell
        title={t("models.title")}
        description={t("models.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("models.addModel")}
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
              <th>{t("models.modelCode")}</th>
              <th>{t("models.modelName")}</th>
              <th>{t("models.variants")}</th>
              <th>{t("common.status")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {modelsQuery.isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={t("models.noModels")}
                    description={t("models.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("models.addModel")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((model) => (
                <tr key={model.id}>
                  <td dir="ltr">{model.modelCode}</td>
                  <td>{model.modelName}</td>
                  <td>{model.variantCount ?? 0}</td>
                  <td><StatusPill status={isActive(model.isActive) ? "active" : "inactive"} /></td>
                  <td className="row-actions">
                    <button className="link-button" onClick={() => openVariants(model)} type="button">
                      {t("models.variants")}
                    </button>
                    <button className="link-button" onClick={() => openEdit(model)} type="button">
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
          title={editing ? t("common.edit") : t("models.addModel")}
          onClose={() => setModalOpen(false)}
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("models.modelCode")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                dir="ltr"
                value={form.modelCode}
                onChange={(event) => setForm({ ...form, modelCode: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("models.modelName")} <span style={{ color: "#b42318" }}>*</span>
              <input
                required
                value={form.modelName}
                onChange={(event) => setForm({ ...form, modelName: event.target.value })}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
            </label>
            <label>
              {t("common.description")}
              <textarea
                rows={2}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <label className="checkbox-row">
              <input
                checked={form.isActive}
                type="checkbox"
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              {t("common.active")}
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {variantModalOpen && selectedModel ? (
        <Modal
          title={`${t("models.variants")}: ${selectedModel.modelName}`}
          onClose={() => {
            setVariantModalOpen(false);
            setSelectedModel(null);
          }}
        >
          <div className="form-grid">
            {error ? <p className="form-error">{error}</p> : null}
            <table>
              <thead>
                <tr>
                  <th>{t("models.variant.size")}</th>
                  <th>{t("models.variant.color")}</th>
                  <th>{t("models.variant.stock")}</th>
                </tr>
              </thead>
              <tbody>
                {variantsQuery.isLoading ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="skeleton" style={{ height: 18 }} />
                    </td>
                  </tr>
                ) : (variantsQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <EmptyState title={t("models.variant.noVariants")} />
                    </td>
                  </tr>
                ) : (
                  (variantsQuery.data ?? []).map((variant) => (
                    <tr key={variant.id}>
                      <td>{variant.sizeName}</td>
                      <td>{variant.colorName}</td>
                      <td>{variant.currentQuantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <form
              className="inline-form"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                variantMutation.mutate();
              }}
            >
              <label>
                {t("models.variant.size")}
                <select
                  required
                  value={variantForm.sizeId}
                  onChange={(event) =>
                    setVariantForm({ ...variantForm, sizeId: event.target.value })
                  }
                >
                  <option value="">{t("common.select")}</option>
                  {(sizesQuery.data?.data ?? []).map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("models.variant.color")}
                <select
                  required
                  value={variantForm.colorId}
                  onChange={(event) =>
                    setVariantForm({ ...variantForm, colorId: event.target.value })
                  }
                >
                  <option value="">{t("common.select")}</option>
                  {(colorsQuery.data?.data ?? []).map((color) => (
                    <option key={color.id} value={color.id}>
                      {color.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" disabled={variantMutation.isPending} type="submit">
                {t("models.variant.add")}
              </button>
            </form>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
