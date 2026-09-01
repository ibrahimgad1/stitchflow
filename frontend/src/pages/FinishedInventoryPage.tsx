import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import {
  EmptyState,
  ListPageShell,
  Modal,
  PaginationBar,
  showToast,
  useDebouncedValue
} from "../components/ListPageShell";
import { useI18n } from "../i18n";
import { formatMoney } from "../lib/master-data";
import {
  adjustFinishedStock,
  listFinishedInventory,
  type FinishedInventoryRow
} from "../lib/production";
import { updateVariantThreshold } from "../lib/alerts";

export function FinishedInventoryPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [adjustRow, setAdjustRow] = useState<FinishedInventoryRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ newQuantity: "", reason: "" });
  const [adjustError, setAdjustError] = useState("");
  const [thresholdRow, setThresholdRow] = useState<FinishedInventoryRow | null>(null);
  const [thresholdValue, setThresholdValue] = useState("");
  const [thresholdError, setThresholdError] = useState("");

  const inventoryQuery = useQuery({
    queryKey: ["finished-inventory", page, pageSize, debouncedSearch],
    queryFn: () => listFinishedInventory({ page, pageSize, search: debouncedSearch })
  });

  const adjustMutation = useMutation({
    mutationFn: async () =>
      adjustFinishedStock(adjustRow!.id, {
        newQuantity: Number(adjustForm.newQuantity),
        reason: adjustForm.reason.trim()
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      setAdjustRow(null);
      setAdjustForm({ newQuantity: "", reason: "" });
      setAdjustError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setAdjustError(t("finished.adjust.error"))
  });

  const thresholdMutation = useMutation({
    mutationFn: async () => updateVariantThreshold(thresholdRow!.id, Number(thresholdValue)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finished-inventory"] });
      setThresholdRow(null);
      setThresholdValue("");
      setThresholdError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setThresholdError(t("errors.couldNotSave"))
  });

  const rows = inventoryQuery.data?.data ?? [];
  const meta = inventoryQuery.data?.meta;

  return (
    <>
      <ListPageShell
        title={t("finished.title")}
        description={t("finished.description")}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
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
              <th>{t("finished.model")}</th>
              <th>{t("finished.size")}</th>
              <th>{t("finished.color")}</th>
              <th>{t("finished.stock")}</th>
              <th>حد الأمان</th>
              <th>{t("finished.avgCost")}</th>
              <th aria-label={t("common.actions")} />
            </tr>
          </thead>
          <tbody>
            {inventoryQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title={t("finished.noStock")} description={t("finished.description")} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} style={row.safetyThreshold > 0 && row.currentQuantity < row.safetyThreshold ? { background: "#fef2f2" } : undefined}>
                  <td>
                    {row.modelCode} - {row.modelName}
                  </td>
                  <td>{row.sizeName}</td>
                  <td>{row.colorName}</td>
                  <td>
                    <span style={row.safetyThreshold > 0 && row.currentQuantity < row.safetyThreshold ? { color: "#dc2626", fontWeight: 700 } : undefined}>{row.currentQuantity}</span>
                    {row.safetyThreshold > 0 && row.currentQuantity < row.safetyThreshold ? <span style={{ color: "#dc2626", fontSize: 11, display: "block" }}>⚠️ منخفض</span> : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span>{row.safetyThreshold ?? 0}</span>
                      <button className="link-button" style={{ fontSize: 11 }} onClick={() => { setThresholdRow(row); setThresholdValue(String(row.safetyThreshold ?? 0)); setThresholdError(""); }} type="button">تعديل</button>
                    </div>
                  </td>
                  <td dir="ltr">{formatMoney(row.currentAverageCostMinor)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="link-button"
                        onClick={() => {
                          setAdjustRow(row);
                          setAdjustForm({
                            newQuantity: String(row.currentQuantity),
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

      {adjustRow ? (
        <Modal
          title={`${t("finished.adjust.title")} - ${adjustRow.modelCode} ${adjustRow.sizeName}/${adjustRow.colorName}`}
          onClose={() => setAdjustRow(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              adjustMutation.mutate();
            }}
          >
            {adjustError ? <p className="form-error">{adjustError}</p> : null}
            <p className="muted">{t("finished.adjust.current", { value: adjustRow.currentQuantity })}</p>
            <label>
              {t("finished.adjust.newQuantity")}
              <input
                required
                dir="ltr"
                min="0"
                step="1"
                type="number"
                value={adjustForm.newQuantity}
                onChange={(event) =>
                  setAdjustForm({ ...adjustForm, newQuantity: event.target.value })
                }
              />
            </label>
            <label>
              {t("finished.adjust.reason")}
              <textarea
                required
                rows={2}
                value={adjustForm.reason}
                onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })}
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={adjustMutation.isPending} type="submit">
                {adjustMutation.isPending ? t("common.saving") : t("finished.adjust.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {thresholdRow ? (
        <Modal title={`حد الأمان - ${thresholdRow.modelCode} ${thresholdRow.sizeName}/${thresholdRow.colorName}`} onClose={() => setThresholdRow(null)}>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              thresholdMutation.mutate();
            }}
          >
            {thresholdError ? <p className="form-error">{thresholdError}</p> : null}
            <p className="muted">الكمية الحالية: {thresholdRow.currentQuantity}</p>
            <label>
              حد الأمان <span style={{ color: "#b42318" }}>*</span>
              <input required dir="ltr" type="number" min={0} step={1} value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} />
            </label>
            <p className="muted" style={{ fontSize: 12 }}>اتركه 0 لإيقاف التنبيه.</p>
            <div className="form-actions">
              <button className="primary-button" disabled={thresholdMutation.isPending} type="submit">
                {thresholdMutation.isPending ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
