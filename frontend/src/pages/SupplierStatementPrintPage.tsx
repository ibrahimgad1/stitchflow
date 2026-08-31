import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { formatMoney, getSupplier } from "../lib/master-data";
import { saveCurrentPageAsPdf } from "../lib/pdf";
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

export function SupplierStatementPrintPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const printedOn = new Date().toISOString().slice(0, 10);

  const supplierQuery = useQuery({
    queryKey: ["supplier-statement-print", "supplier", id],
    queryFn: () => getSupplier(id!),
    enabled: Boolean(id)
  });

  const ledgerQuery = useQuery({
    queryKey: ["supplier-statement-print", "ledger", id],
    queryFn: () => getSupplierLedger(id!, { page: 1, pageSize: 500 }),
    enabled: Boolean(id)
  });

  const openReceivingsQuery = useQuery({
    queryKey: ["supplier-statement-print", "open-receivings", id],
    queryFn: () => listSupplierReceivings(id!, { page: 1, pageSize: 500 }),
    enabled: Boolean(id)
  });

  const supplier = supplierQuery.data;
  const entries = ledgerQuery.data?.data ?? [];
  const openTotalMinor = (openReceivingsQuery.data?.data ?? []).reduce(
    (sum, receiving) => sum + receiving.remainingMinor,
    0
  );
  const isLoading = supplierQuery.isLoading || ledgerQuery.isLoading || openReceivingsQuery.isLoading;

  async function handleSavePdf() {
    setIsSavingPdf(true);

    try {
      await saveCurrentPageAsPdf(`supplier-statement-${supplier?.name ?? id ?? "document"}-${printedOn}.pdf`);
    } finally {
      setIsSavingPdf(false);
    }
  }

  return (
    <main className="print-page" dir="rtl">
      <div className="print-actions">
        <Link className="ghost-button" to="/supplier-statements">
          <ArrowLeft aria-hidden="true" />
          {t("print.back")}
        </Link>
        <button className="primary-button" type="button" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          {t("print.print")}
        </button>
        <button className="primary-button" type="button" disabled={isSavingPdf} onClick={handleSavePdf}>
          <FileDown aria-hidden="true" />
          {isSavingPdf ? t("print.saving") : t("print.savePdf")}
        </button>
      </div>

      {isLoading ? (
        <section className="invoice-sheet">
          <p>{t("statementPrint.loading")}</p>
        </section>
      ) : !supplier ? (
        <section className="invoice-sheet">
          <p>{t("common.noData")}</p>
        </section>
      ) : (
        <section className="invoice-sheet statement-sheet" aria-label={t("statementPrint.titleSupplier")}>
          <header className="invoice-print-header">
            <div>
              <p className="eyebrow">{t("statementPrint.titleSupplier")}</p>
              <h1>{t("print.factoryName")}</h1>
              <p>{t("print.subtitle")}</p>
            </div>
            <div className="invoice-number-block">
              <span>{t("common.date")}</span>
              <strong dir="ltr">{printedOn}</strong>
              <small>{t("statements.balance")}</small>
            </div>
          </header>

          <section className="invoice-meta-grid">
            <div>
              <span>{t("statementPrint.supplier")}</span>
              <strong>{supplier.name}</strong>
            </div>
            <div>
              <span>{t("common.phone")}</span>
              <strong dir="ltr">{supplier.phone || "-"}</strong>
            </div>
            <div>
              <span>{t("common.address")}</span>
              <strong>{supplier.contactName || "-"}</strong>
            </div>
            <div>
              <span>{t("statementPrint.balance")}</span>
              <strong dir="ltr">{formatMoney(ledgerQuery.data?.balanceMinor ?? 0)}</strong>
            </div>
          </section>

          <section className="invoice-total-grid">
            <div>
              <span>{t("common.remaining")}</span>
              <strong dir="ltr">{formatMoney(openTotalMinor)}</strong>
            </div>
            <div>
              <span>{t("common.total")}</span>
              <strong dir="ltr">{entries.length}</strong>
            </div>
            <div>
              <span>{t("statements.summary")}</span>
              <strong dir="ltr">{ledgerQuery.data?.meta.total ?? 0}</strong>
            </div>
            <div>
              <span>{t("common.type")}</span>
              <strong>{t("statementPrint.supplier")}</strong>
            </div>
            <div>
              <span>{t("statementPrint.balance")}</span>
              <strong dir="ltr">{formatMoney(ledgerQuery.data?.balanceMinor ?? 0)}</strong>
            </div>
          </section>

          <table className="invoice-print-table statement-print-table">
            <thead>
              <tr>
                <th>{t("statementPrint.date")}</th>
                <th>{t("common.type")}</th>
                <th>{t("statementPrint.desc")}</th>
                <th>{t("statementPrint.debit")}</th>
                <th>{t("statementPrint.credit")}</th>
                <th>{t("statementPrint.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6}>{t("statementPrint.noData")}</td>
                </tr>
              ) : (
                entries.map((entry) => (
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

          {supplier.address || supplier.notes ? (
            <section className="invoice-notes">
              <span>{t("common.notes")}</span>
              <p>{[supplier.address, supplier.notes].filter(Boolean).join(" | ")}</p>
            </section>
          ) : null}

          <footer className="invoice-signatures">
            <div>{t("print.preparedBy")}</div>
            <div>{t("print.receivedBy")}</div>
          </footer>
        </section>
      )}
    </main>
  );
}
