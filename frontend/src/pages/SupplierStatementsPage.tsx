import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ListPageShell,
  PaginationBar,
  useDebouncedValue
} from "../components/ListPageShell";
import { useI18n } from "../i18n";
import { formatMoney, listSuppliers } from "../lib/master-data";
import { getSupplierLedger, listSupplierReceivings } from "../lib/purchasing";

function entryKindLabel(sourceType: string, t: (k: string) => string): string {
  switch (sourceType) {
    case "material_receiving":
      return t("receivings.title");
    case "supplier_payment":
      return t("supplierPayments.title");
    default:
      return sourceType;
  }
}

export function SupplierStatementsPage() {
  const { t } = useI18n();
  const [supplierPage, setSupplierPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "statements", supplierPage, debouncedSearch],
    queryFn: () => listSuppliers({ page: supplierPage, pageSize: 12, search: debouncedSearch })
  });

  const ledgerQuery = useQuery({
    queryKey: ["supplier-ledger", selectedSupplierId, ledgerPage],
    queryFn: () => getSupplierLedger(selectedSupplierId!, { page: ledgerPage, pageSize: 50 }),
    enabled: Boolean(selectedSupplierId)
  });

  const openReceivingsQuery = useQuery({
    queryKey: ["supplier-open-receivings", selectedSupplierId],
    queryFn: () => listSupplierReceivings(selectedSupplierId!, { page: 1, pageSize: 100 }),
    enabled: Boolean(selectedSupplierId)
  });

  const suppliers = suppliersQuery.data?.data ?? [];
  const supplierMeta = suppliersQuery.data?.meta;
  const ledgerMeta = ledgerQuery.data?.meta;
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId),
    [suppliers, selectedSupplierId]
  );
  const openTotalMinor = (openReceivingsQuery.data?.data ?? []).reduce(
    (sum, receiving) => sum + receiving.remainingMinor,
    0
  );

  return (
    <ListPageShell
      title={t("statements.titleSupplier")}
      description={t("statements.description")}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setSupplierPage(1);
      }}
      footer={
        supplierMeta ? (
          <PaginationBar
            page={supplierMeta.page}
            total={supplierMeta.total}
            totalPages={supplierMeta.totalPages}
            onPageChange={setSupplierPage}
          />
        ) : null
      }
    >
      <div className="split-panel">
        <section className="panel-list" aria-label={t("suppliers.title")}>
          {suppliersQuery.isLoading ? (
            <p>{t("statements.loading")}</p>
          ) : suppliers.length === 0 ? (
            <p>{t("suppliers.noSuppliers")}</p>
          ) : (
            suppliers.map((supplier) => (
              <button
                className={supplier.id === selectedSupplierId ? "select-row active" : "select-row"}
                key={supplier.id}
                type="button"
                onClick={() => {
                  setSelectedSupplierId(supplier.id);
                  setLedgerPage(1);
                }}
              >
                <span>{supplier.name}</span>
                <small dir="ltr">{supplier.phone || t("common.none")}</small>
              </button>
            ))
          )}
        </section>

        <section className="statement-panel" aria-label={t("statements.titleSupplier")}>
          {selectedSupplierId ? (
            <>
              <div className="statement-header">
                <div>
                  <p className="eyebrow">{t("statements.statementFor")}</p>
                  <h3>{selectedSupplier?.name ?? t("statements.selectSupplier")}</h3>
                </div>
                <Link className="ghost-button" to={`/supplier-statements/${selectedSupplierId}/print`}>
                  <FileText aria-hidden="true" />
                  {t("statements.print")}
                </Link>
              </div>

              <div className="summary-strip">
                <div>
                  <span>{t("statements.balance")}</span>
                  <strong dir="ltr">{formatMoney(ledgerQuery.data?.balanceMinor ?? 0)}</strong>
                </div>
                <div>
                  <span>{t("common.remaining")}</span>
                  <strong dir="ltr">{formatMoney(openTotalMinor)}</strong>
                </div>
                <div>
                  <span>{t("statements.summary")}</span>
                  <strong dir="ltr">{ledgerMeta?.total ?? 0}</strong>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>{t("statements.date")}</th>
                    <th>{t("statements.source")}</th>
                    <th>{t("common.description")}</th>
                    <th>{t("statements.debit")}</th>
                    <th>{t("statements.credit")}</th>
                    <th>{t("statements.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQuery.isLoading ? (
                    <tr>
                      <td colSpan={6}>{t("statements.loading")}</td>
                    </tr>
                  ) : (ledgerQuery.data?.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>{t("statements.noEntries")}</td>
                    </tr>
                  ) : (
                    (ledgerQuery.data?.data ?? []).map((entry) => (
                      <tr key={entry.id}>
                        <td dir="ltr">{entry.entryDate}</td>
                        <td>{entryKindLabel(entry.sourceType, t)}</td>
                        <td>{entry.description}</td>
                        <td dir="ltr">{entry.debitMinor ? formatMoney(entry.debitMinor) : "-"}</td>
                        <td dir="ltr">{entry.creditMinor ? formatMoney(entry.creditMinor) : "-"}</td>
                        <td dir="ltr">{formatMoney(entry.balanceAfterMinor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {ledgerMeta ? (
                <PaginationBar
                  page={ledgerMeta.page}
                  total={ledgerMeta.total}
                  totalPages={ledgerMeta.totalPages}
                  onPageChange={setLedgerPage}
                />
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <FileText aria-hidden="true" />
              <p>{t("statements.selectSupplier")}</p>
            </div>
          )}
        </section>
      </div>
    </ListPageShell>
  );
}
