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
import { formatMoney, listOwners, listSafes } from "../lib/master-data";
import {
  adjustSafeBalance,
  createCapitalTransaction,
  createSafeTransfer,
  listCapitalTransactions,
  listSafeTransactions,
  listSafeTransfers,
  getTreasuryReport
} from "../lib/treasury";

const transferFormStart = {
  transferDate: new Date().toISOString().slice(0, 10),
  fromSafeId: "",
  toSafeId: "",
  amount: "",
  notes: ""
};

const adjustmentFormStart = {
  adjustmentDate: new Date().toISOString().slice(0, 10),
  safeId: "",
  newBalance: "",
  reason: ""
};

const capitalFormStart = {
  transactionDate: new Date().toISOString().slice(0, 10),
  transactionType: "capital_injection" as "capital_injection" | "owner_withdrawal",
  ownerId: "",
  safeId: "",
  amount: "",
  notes: ""
};

function transactionLabel(type: string, t: (k: string) => string): string {
  switch (type) {
    case "transfer_in":
      return t("treasury.transfers");
    case "transfer_out":
      return t("treasury.transfers");
    case "adjustment":
      return t("treasury.adjust.title");
    case "expense_payment":
      return t("expenses.title");
    case "customer_payment":
      return t("customerPayments.title");
    case "supplier_payment":
      return t("supplierPayments.title");
    case "capital_injection":
      return t("treasury.capitalForm.injection");
    case "owner_withdrawal":
      return t("treasury.capitalForm.withdrawal");
    default:
      return type;
  }
}

export function TreasuryPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState(transferFormStart);
  const [adjustmentForm, setAdjustmentForm] = useState(adjustmentFormStart);
  const [capitalForm, setCapitalForm] = useState(capitalFormStart);
  const [reportDates, setReportDates] = useState({
    dateFrom: new Date().toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10)
  });
  const [error, setError] = useState("");

  const transactionsQuery = useQuery({
    queryKey: ["safe-transactions", page, pageSize, debouncedSearch],
    queryFn: () => listSafeTransactions({ page, pageSize, search: debouncedSearch })
  });

  const transfersQuery = useQuery({
    queryKey: ["safe-transfers", "recent"],
    queryFn: () => listSafeTransfers({ page: 1, pageSize: 5 })
  });

  const capitalQuery = useQuery({
    queryKey: ["capital-transactions", "recent"],
    queryFn: () => listCapitalTransactions({ page: 1, pageSize: 5 })
  });

  const safesQuery = useQuery({
    queryKey: ["safes", "treasury-options"],
    queryFn: () => listSafes({ page: 1, pageSize: 100 })
  });

  const ownersQuery = useQuery({
    queryKey: ["owners", "treasury-options"],
    queryFn: () => listOwners({ page: 1, pageSize: 100 })
  });

  const reportQuery = useQuery({
    queryKey: ["treasury-report", reportDates],
    queryFn: () => getTreasuryReport(reportDates)
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(transferForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t("treasury.transfer.error"));
      }

      return createSafeTransfer({
        transferDate: transferForm.transferDate,
        fromSafeId: transferForm.fromSafeId,
        toSafeId: transferForm.toSafeId,
        amount,
        notes: transferForm.notes.trim() || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safe-transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["safe-transfers"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setTransferOpen(false);
      setTransferForm(transferFormStart);
      setError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setError(t("treasury.transfer.error"))
  });

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const newBalance = Number(adjustmentForm.newBalance);
      if (!Number.isFinite(newBalance) || newBalance < 0) {
        throw new Error(t("treasury.adjust.error"));
      }

      return adjustSafeBalance(adjustmentForm.safeId, {
        adjustmentDate: adjustmentForm.adjustmentDate,
        newBalance,
        reason: adjustmentForm.reason.trim()
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safe-transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setAdjustmentOpen(false);
      setAdjustmentForm(adjustmentFormStart);
      setError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setError(t("treasury.adjust.error"))
  });

  const capitalMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(capitalForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t("treasury.capitalForm.error"));
      }

      return createCapitalTransaction({
        transactionDate: capitalForm.transactionDate,
        transactionType: capitalForm.transactionType,
        ownerId: capitalForm.ownerId || null,
        safeId: capitalForm.safeId,
        amount,
        notes: capitalForm.notes.trim() || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safe-transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["capital-transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["safes"] });
      setCapitalOpen(false);
      setCapitalForm(capitalFormStart);
      setError("");
      showToast(t("common.save") + " ✓");
    },
    onError: () => setError(t("treasury.capitalForm.error"))
  });

  const rows = transactionsQuery.data?.data ?? [];
  const meta = transactionsQuery.data?.meta;
  const safes = safesQuery.data?.data ?? [];
  const owners = ownersQuery.data?.data ?? [];

  return (
    <>
      <ListPageShell
        title={t("treasury.title")}
        description={t("treasury.description")}
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
        <div className="tab-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setError("");
              setTransferOpen(true);
            }}
          >
            {t("treasury.transfer.title")}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setError("");
              setAdjustmentOpen(true);
            }}
          >
            {t("treasury.adjust.title")}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setError("");
              setCapitalOpen(true);
            }}
          >
            {t("treasury.capital")}
          </button>
        </div>

        <div className="summary-strip">
          <div>
            <span>{t("treasury.totalBalance")}</span>
            {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(reportQuery.data?.totalSafeBalanceMinor ?? 0)}</strong>}
            {reportQuery.isLoading ? <div className="skeleton" style={{ height: 12, marginTop: 6 }} /> : <small>{reportQuery.data?.safeCount ?? 0} {t("safes.title")}</small>}
          </div>
          <div>
            <span>{t("treasury.inflow")}</span>
            {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(reportQuery.data?.inflowMinor ?? 0)}</strong>}
            <small dir="ltr">{reportDates.dateFrom} {t("statementPrint.to")} {reportDates.dateTo}</small>
          </div>
          <div>
            <span>{t("treasury.outflow")}</span>
            {reportQuery.isLoading ? <div className="skeleton" style={{ height: 18 }} /> : <strong dir="ltr">{formatMoney(reportQuery.data?.outflowMinor ?? 0)}</strong>}
            {reportQuery.isLoading ? <div className="skeleton" style={{ height: 12, marginTop: 6 }} /> : <small>{t("treasury.net")} {formatMoney(reportQuery.data?.netMovementMinor ?? 0)}</small>}
          </div>
          {(transfersQuery.data?.data ?? []).slice(0, 3).map((transfer) => (
            <div key={transfer.id}>
              <span dir="ltr">{transfer.transferNumber}</span>
              <strong dir="ltr">{formatMoney(transfer.amountMinor)}</strong>
              <small>
                {transfer.fromSafeName} {t("statementPrint.to")} {transfer.toSafeName}
              </small>
            </div>
          ))}
          {(capitalQuery.data?.data ?? []).slice(0, 2).map((transaction) => (
            <div key={transaction.id}>
              <span>
                {transaction.transactionType === "capital_injection"
                  ? t("treasury.capitalForm.injection")
                  : t("treasury.capitalForm.withdrawal")}
              </span>
              <strong dir="ltr">{formatMoney(transaction.amountMinor)}</strong>
              <small>{transaction.ownerName || transaction.safeName}</small>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <h3>{t("treasury.report")}</h3>
              <p>{t("treasury.description")}</p>
            </div>
            <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
              <label>
                {t("treasury.dateFrom")}
                <input
                  dir="ltr"
                  type="date"
                  value={reportDates.dateFrom}
                  onChange={(event) =>
                    setReportDates({ ...reportDates, dateFrom: event.target.value })
                  }
                />
              </label>
              <label>
                {t("treasury.dateTo")}
                <input
                  dir="ltr"
                  type="date"
                  value={reportDates.dateTo}
                  onChange={(event) =>
                    setReportDates({ ...reportDates, dateTo: event.target.value })
                  }
                />
              </label>
            </form>
          </div>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table>
              <thead>
                <tr>
                  <th>{t("treasury.safe")}</th>
                  <th>{t("treasury.totalBalance")}</th>
                  <th>{t("treasury.inflow")}</th>
                  <th>{t("treasury.outflow")}</th>
                  <th>{t("treasury.net")}</th>
                </tr>
              </thead>
              <tbody>
                {reportQuery.isLoading ? (
                  <>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        <td><div className="skeleton" style={{ height: 16 }} /></td>
                        <td><div className="skeleton" style={{ height: 16 }} /></td>
                        <td><div className="skeleton" style={{ height: 16 }} /></td>
                        <td><div className="skeleton" style={{ height: 16 }} /></td>
                        <td><div className="skeleton" style={{ height: 16 }} /></td>
                      </tr>
                    ))}
                  </>
                ) : (reportQuery.data?.bySafe ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title={t("treasury.noTransactions")} />
                    </td>
                  </tr>
                ) : (
                  (reportQuery.data?.bySafe ?? []).map((row) => (
                    <tr key={row.safeId}>
                      <td>{row.safeName}</td>
                      <td dir="ltr">{formatMoney(row.currentBalanceMinor)}</td>
                      <td dir="ltr">{formatMoney(row.inflowMinor)}</td>
                      <td dir="ltr">{formatMoney(row.outflowMinor)}</td>
                      <td dir="ltr">{formatMoney(row.netMovementMinor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>{t("common.date")}</th>
              <th>{t("treasury.safe")}</th>
              <th>{t("treasury.transactionType")}</th>
              <th>{t("treasury.direction")}</th>
              <th>{t("common.amount")}</th>
              <th>{t("statements.balance")}</th>
              <th>{t("common.description")}</th>
            </tr>
          </thead>
          <tbody>
            {transactionsQuery.isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 18 }} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={t("treasury.noTransactions")}
                    description={t("treasury.description")}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.transactionDate}</td>
                  <td>{row.safeName}</td>
                  <td>{transactionLabel(row.transactionType, t)}</td>
                  <td><StatusPill status={row.direction} /></td>
                  <td dir="ltr">{formatMoney(row.amountMinor)}</td>
                  <td dir="ltr">{formatMoney(row.balanceAfterMinor)}</td>
                  <td>{row.description || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ListPageShell>

      {transferOpen ? (
        <Modal title={t("treasury.transfer.title")} onClose={() => setTransferOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              transferMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("treasury.transfer.date")}
              <input
                required
                dir="ltr"
                type="date"
                value={transferForm.transferDate}
                onChange={(event) =>
                  setTransferForm({ ...transferForm, transferDate: event.target.value })
                }
              />
            </label>
            <label>
              {t("treasury.transfer.from")}
              <select
                required
                value={transferForm.fromSafeId}
                onChange={(event) =>
                  setTransferForm({ ...transferForm, fromSafeId: event.target.value })
                }
              >
                <option value="">{t("common.select")}</option>
                {safes.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.name} ({formatMoney(safe.currentBalanceMinor)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("treasury.transfer.to")}
              <select
                required
                value={transferForm.toSafeId}
                onChange={(event) =>
                  setTransferForm({ ...transferForm, toSafeId: event.target.value })
                }
              >
                <option value="">{t("common.select")}</option>
                {safes.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("treasury.transfer.amount")}
              <input
                required
                dir="ltr"
                min="0.01"
                step="0.01"
                type="number"
                value={transferForm.amount}
                onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })}
              />
            </label>
            <label className="full-span">
              {t("treasury.transfer.notes")}
              <textarea
                value={transferForm.notes}
                onChange={(event) => setTransferForm({ ...transferForm, notes: event.target.value })}
              />
            </label>
            <button disabled={transferMutation.isPending} type="submit">
              {transferMutation.isPending ? t("common.saving") : t("treasury.transfer.save")}
            </button>
          </form>
        </Modal>
      ) : null}

      {adjustmentOpen ? (
        <Modal title={t("treasury.adjust.title")} onClose={() => setAdjustmentOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              adjustmentMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("treasury.adjust.date")}
              <input
                required
                dir="ltr"
                type="date"
                value={adjustmentForm.adjustmentDate}
                onChange={(event) =>
                  setAdjustmentForm({ ...adjustmentForm, adjustmentDate: event.target.value })
                }
              />
            </label>
            <label>
              {t("treasury.safe")}
              <select
                required
                value={adjustmentForm.safeId}
                onChange={(event) =>
                  setAdjustmentForm({ ...adjustmentForm, safeId: event.target.value })
                }
              >
                <option value="">{t("common.select")}</option>
                {safes.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.name} ({formatMoney(safe.currentBalanceMinor)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("treasury.adjust.newBalance")}
              <input
                required
                dir="ltr"
                min="0"
                step="0.01"
                type="number"
                value={adjustmentForm.newBalance}
                onChange={(event) =>
                  setAdjustmentForm({ ...adjustmentForm, newBalance: event.target.value })
                }
              />
            </label>
            <label className="full-span">
              {t("treasury.adjust.reason")}
              <textarea
                required
                value={adjustmentForm.reason}
                onChange={(event) =>
                  setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })
                }
              />
            </label>
            <button disabled={adjustmentMutation.isPending} type="submit">
              {adjustmentMutation.isPending ? t("common.saving") : t("treasury.adjust.save")}
            </button>
          </form>
        </Modal>
      ) : null}

      {capitalOpen ? (
        <Modal title={t("treasury.capitalForm.title")} onClose={() => setCapitalOpen(false)}>
          <form
            className="form-grid"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              capitalMutation.mutate();
            }}
          >
            {error ? <p className="form-error">{error}</p> : null}
            <label>
              {t("treasury.capitalForm.date")}
              <input
                required
                dir="ltr"
                type="date"
                value={capitalForm.transactionDate}
                onChange={(event) =>
                  setCapitalForm({ ...capitalForm, transactionDate: event.target.value })
                }
              />
            </label>
            <label>
              {t("treasury.capitalForm.type")}
              <select
                value={capitalForm.transactionType}
                onChange={(event) =>
                  setCapitalForm({
                    ...capitalForm,
                    transactionType: event.target.value as "capital_injection" | "owner_withdrawal"
                  })
                }
              >
                <option value="capital_injection">{t("treasury.capitalForm.injection")}</option>
                <option value="owner_withdrawal">{t("treasury.capitalForm.withdrawal")}</option>
              </select>
            </label>
            <label>
              {t("treasury.capitalForm.owner")}
              <select
                value={capitalForm.ownerId}
                onChange={(event) => setCapitalForm({ ...capitalForm, ownerId: event.target.value })}
              >
                <option value="">{t("common.none")}</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("treasury.capitalForm.safe")}
              <select
                required
                value={capitalForm.safeId}
                onChange={(event) => setCapitalForm({ ...capitalForm, safeId: event.target.value })}
              >
                <option value="">{t("common.select")}</option>
                {safes.map((safe) => (
                  <option key={safe.id} value={safe.id}>
                    {safe.name} ({formatMoney(safe.currentBalanceMinor)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("treasury.capitalForm.amount")}
              <input
                required
                dir="ltr"
                min="0.01"
                step="0.01"
                type="number"
                value={capitalForm.amount}
                onChange={(event) => setCapitalForm({ ...capitalForm, amount: event.target.value })}
              />
            </label>
            <label className="full-span">
              {t("treasury.capitalForm.notes")}
              <textarea
                value={capitalForm.notes}
                onChange={(event) => setCapitalForm({ ...capitalForm, notes: event.target.value })}
              />
            </label>
            <button disabled={capitalMutation.isPending} type="submit">
              {capitalMutation.isPending ? t("common.saving") : t("treasury.capitalForm.save")}
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
