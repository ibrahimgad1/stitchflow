import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
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
import { formatMoney, listMaterials, listSafes, listSuppliers } from "../lib/master-data";
import {
  createMaterialReceiving,
  getMaterialReceiving,
  listMaterialReceivings,
  type MaterialReceivingItemInput
} from "../lib/purchasing";

type LineItem = MaterialReceivingItemInput & { key: string };

const emptyLine = (): LineItem => ({
  key: crypto.randomUUID(),
  materialId: "",
  quantity: 1,
  unitPrice: 0
});

const emptyForm = {
  supplierId: "",
  receivingDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  documentReference: "",
  notes: "",
  paidAmount: "",
  safeId: ""
};

export function MaterialReceivingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const location = useLocation() as { state?: { materialId?: string; shortage?: number; supplierId?: string | null } };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    const state = location.state;
    if (state?.materialId) {
      setForm((prev) => ({
        ...prev,
        supplierId: state.supplierId || prev.supplierId,
        receivingDate: new Date().toISOString().slice(0, 10)
      }));
      setLines([{ key: crypto.randomUUID(), materialId: state.materialId, quantity: Math.ceil(state.shortage || 10), unitPrice: 0 }]);
      setCreateOpen(true);
      // Clear state to prevent re-trigger
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [supplierFilter, setSupplierFilter] = useState("");
  const receivingsQuery = useQuery({
    queryKey: ["material-receivings", page, pageSize, debouncedSearch, supplierFilter],
    queryFn: () => listMaterialReceivings({ page, pageSize, search: debouncedSearch, supplierId: supplierFilter || undefined })
  });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "options"],
    queryFn: () => listSuppliers({ page: 1, pageSize: 100 })
  });

  const materialsQuery = useQuery({
    queryKey: ["materials", "options"],
    queryFn: () => listMaterials({ page: 1, pageSize: 200 })
  });

  const safesQuery = useQuery({
    queryKey: ["safes", "options"],
    queryFn: () => listSafes({ page: 1, pageSize: 100 })
  });

  const detailQuery = useQuery({
    queryKey: ["material-receiving", detailId],
    queryFn: () => getMaterialReceiving(detailId!),
    enabled: Boolean(detailId)
  });

  const totalMinor = lines.reduce((sum, line) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    return sum + Math.round(qty * price * 100);
  }, 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.supplierId) {
        throw new Error(t("errors.required"));
      }
      const items = lines
        .filter((line) => line.materialId && line.quantity > 0)
        .map(({ materialId, quantity, unitPrice, notes }) => ({
          materialId,
          quantity,
          unitPrice,
          notes: notes?.trim() || null
        }));

      if (items.length === 0) {
        throw new Error(t("errors.required"));
      }

      return createMaterialReceiving({
        supplierId: form.supplierId,
        receivingDate: form.receivingDate,
        dueDate: form.dueDate.trim() || null,
        documentReference: form.documentReference.trim() || null,
        notes: form.notes.trim() || null,
        items,
        paidAmount: form.paidAmount ? Number(form.paidAmount) : undefined,
        safeId: form.paidAmount ? form.safeId || null : null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["material-receivings"] });
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setLines([emptyLine()]);
      setError("");
      setFieldError("");
      showToast(t("common.save") + " ✓");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t("receivings.form.error");
      if (msg === t("errors.required")) setFieldError(msg);
      else setError(msg);
    }
  });

  const rows = receivingsQuery.data?.data ?? [];
  const meta = receivingsQuery.data?.meta;

  function openCreate() {
    setForm(emptyForm);
    setLines([emptyLine()]);
    setError("");
    setFieldError("");
    setCreateOpen(true);
  }

  return (
    <>
      <ListPageShell
        title={t("receivings.title")}
        description={t("receivings.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onCreate={openCreate}
        createLabel={t("receivings.add")}
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
        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <label>
            {t("receivings.supplier")}
            <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }}>
              <option value="">{t("common.all")}</option>
              {(suppliersQuery.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {(supplierFilter) ? <button className="ghost-button" type="button" onClick={() => { setSupplierFilter(""); setPage(1); }}>{t("common.cancel")}</button> : null}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t("receivings.number")}</th>
              <th>{t("receivings.supplier")}</th>
              <th>{t("receivings.date")}</th>
              <th>{t("receivings.total")}</th>
              <th>{t("receivings.paid")}</th>
              <th>{t("receivings.remaining")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {receivingsQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={t("receivings.noReceivings")}
                    description={t("receivings.description")}
                    action={<button className="primary-button" onClick={openCreate} type="button">{t("receivings.add")}</button>}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.receivingNumber}</td>
                  <td>{row.supplierName || "-"}</td>
                  <td dir="ltr">{row.receivingDate}</td>
                  <td dir="ltr">{formatMoney(row.totalMinor)}</td>
                  <td dir="ltr">{formatMoney(row.paidMinor)}</td>
                  <td dir="ltr">{formatMoney(row.remainingMinor)}</td>
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
        <Modal title={t("receivings.add")} onClose={() => setCreateOpen(false)}>
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
              {t("receivings.form.supplier")} <span style={{ color: "#b42318" }}>*</span>
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
              {t("receivings.form.receivingDate")}
              <input
                required
                dir="ltr"
                type="date"
                value={form.receivingDate}
                onChange={(event) => setForm({ ...form, receivingDate: event.target.value })}
              />
            </label>
            <label>
              {t("receivings.form.dueDate")}
              <input
                dir="ltr"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </label>
            <label>
              {t("receivings.form.documentRef")}
              <input
                value={form.documentReference}
                onChange={(event) => setForm({ ...form, documentReference: event.target.value })}
              />
            </label>

            <div className="panel">
              <h3>{t("receivings.items")}</h3>
              {fieldError ? <span style={{ color: "#b42318", fontSize: 12 }}>{fieldError}</span> : null}
              {lines.map((line, index) => (
                <div className="inline-form" key={line.key}>
                  <label>
                    {t("materials.name")}
                    <SearchableSelect
                      value={line.materialId}
                      onChange={(v) => {
                        const next = [...lines];
                        next[index] = { ...line, materialId: v };
                        setLines(next);
                      }}
                      options={(materialsQuery.data?.data ?? []).map((material) => ({ value: material.id, label: material.name }))}
                      placeholder={t("common.select")}
                      required
                    />
                  </label>
                  <label>
                    {t("receivings.quantity")}
                    <input
                      required
                      dir="ltr"
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={line.quantity}
                      onChange={(event) => {
                        const next = [...lines];
                        next[index] = { ...line, quantity: Number(event.target.value) };
                        setLines(next);
                      }}
                    />
                  </label>
                  <label>
                    {t("receivings.unitPrice")}
                    <input
                      required
                      dir="ltr"
                      min="0"
                      step="0.01"
                      type="number"
                      value={line.unitPrice}
                      onChange={(event) => {
                        const next = [...lines];
                        next[index] = { ...line, unitPrice: Number(event.target.value) };
                        setLines(next);
                      }}
                    />
                    </label>
                  </div>
                ))}
              <p dir="ltr" style={{ fontWeight: 600, marginTop: 8 }}>
                {t("receivings.total")}: {formatMoney(totalMinor)}
              </p>
              <div className="row-actions">
                <button
                  className="ghost-button"
                  onClick={() => setLines([...lines, emptyLine()])}
                  type="button"
                >
                  {t("receivings.form.addItem")}
                </button>
                {lines.length > 1 ? (
                  <button
                    className="ghost-button"
                    onClick={() => setLines(lines.slice(0, -1))}
                    type="button"
                  >
                    {t("receivings.form.remove")}
                  </button>
                ) : null}
              </div>
            </div>

            <label>
              {t("receivings.form.paidAmount")}
              <input
                dir="ltr"
                min="0"
                step="0.01"
                type="number"
                value={form.paidAmount}
                onChange={(event) => setForm({ ...form, paidAmount: event.target.value })}
              />
            </label>
            {form.paidAmount ? (
              <label>
                {t("receivings.form.safe")}
                <SearchableSelect
                  value={form.safeId}
                  onChange={(v) => setForm({ ...form, safeId: v })}
                  options={(safesQuery.data?.data ?? []).map((safe) => ({ value: safe.id, label: `${safe.name} (${formatMoney(safe.currentBalanceMinor)})` }))}
                  placeholder={t("common.select")}
                  required
                />
              </label>
            ) : null}
            <label>
              {t("receivings.form.notes")}
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
        <Modal title={`${t("receivings.title")} ${detailQuery.data.receivingNumber}`} onClose={() => setDetailId(null)}>
          <div className="form-grid">
            <p>
              <strong>{t("receivings.supplier")}:</strong> {detailQuery.data.supplierName}
            </p>
            <p dir="ltr">
              <strong>{t("receivings.date")}:</strong> {detailQuery.data.receivingDate}
            </p>
            <p dir="ltr">
              <strong>{t("receivings.total")}:</strong> {formatMoney(detailQuery.data.totalMinor)}
            </p>
            <p dir="ltr">
              <strong>{t("receivings.paid")}:</strong> {formatMoney(detailQuery.data.paidMinor)}
            </p>
            <p dir="ltr">
              <strong>{t("receivings.remaining")}:</strong> {formatMoney(detailQuery.data.remainingMinor)}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("materials.name")}</th>
                    <th>{t("receivings.quantity")}</th>
                    <th>{t("receivings.unitPrice")}</th>
                    <th>{t("receivings.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailQuery.data.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.materialName}</td>
                      <td>{item.quantity}</td>
                      <td dir="ltr">{formatMoney(item.unitPriceMinor)}</td>
                      <td dir="ltr">{formatMoney(item.totalMinor)}</td>
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
