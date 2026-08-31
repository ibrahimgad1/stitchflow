import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { formatMoney, getCustomer } from "../lib/master-data";
import { saveCurrentPageAsPdf } from "../lib/pdf";
import { getCustomerLedger, listCustomerSalesInvoices } from "../lib/sales";

function entryKindLabel(sourceType: string, t: (k: string) => string): string {
  switch (sourceType) {
    case "sales_invoice":
      return t("sales.title");
    case "sales_invoice_cancel":
      return t("sales.details.cancel");
    case "customer_payment":
      return t("customerPayments.title");
    case "customer_payment_reversal":
      return t("customerPayments.reverse.title");
    default:
      return sourceType;
  }
}

export function CustomerStatementPrintPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const printedOn = new Date().toISOString().slice(0, 10);

  const customerQuery = useQuery({
    queryKey: ["customer-statement-print", "customer", id],
    queryFn: () => getCustomer(id!),
    enabled: Boolean(id)
  });

  const ledgerQuery = useQuery({
    queryKey: ["customer-statement-print", "ledger", id],
    queryFn: () => getCustomerLedger(id!, { page: 1, pageSize: 500 }),
    enabled: Boolean(id)
  });

  const openInvoicesQuery = useQuery({
    queryKey: ["customer-statement-print", "open-invoices", id],
    queryFn: () => listCustomerSalesInvoices(id!, { page: 1, pageSize: 500 }),
    enabled: Boolean(id)
  });

  const customer = customerQuery.data;
  const entries = ledgerQuery.data?.data ?? [];
  const openTotalMinor = (openInvoicesQuery.data?.data ?? []).reduce(
    (sum, invoice) => sum + invoice.remainingMinor,
    0
  );
  const isLoading = customerQuery.isLoading || ledgerQuery.isLoading || openInvoicesQuery.isLoading;

  async function handleSavePdf() {
    setIsSavingPdf(true);

    try {
      await saveCurrentPageAsPdf(`customer-statement-${customer?.companyName ?? id ?? "document"}-${printedOn}.pdf`);
    } finally {
      setIsSavingPdf(false);
    }
  }

  return (
    <main className="print-page" dir="rtl">
      <div className="print-actions">
        <Link className="ghost-button" to="/customer-statements">
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
      ) : !customer ? (
        <section className="invoice-sheet">
          <p>{t("common.noData")}</p>
        </section>
      ) : (
        <section className="invoice-sheet statement-sheet" aria-label={t("statementPrint.titleCustomer")}>
          <header className="invoice-print-header">
            <div>
              <p className="eyebrow">{t("statementPrint.titleCustomer")}</p>
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
              <span>{t("statementPrint.customer")}</span>
              <strong>{customer.companyName}</strong>
            </div>
            <div>
              <span>{t("common.phone")}</span>
              <strong dir="ltr">{customer.phone || "-"}</strong>
            </div>
            <div>
              <span>{t("common.address")}</span>
              <strong>{customer.contactName || "-"}</strong>
            </div>
            <div>
              <span>{t("statementPrint.balance")}</span>
              <strong dir="ltr">{formatMoney(ledgerQuery.data?.balanceMinor ?? 0)}</strong>
            </div>
          </section>

          <section className="invoice-total-grid">
            <div>
              <span>{t("sales.remaining")}</span>
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
              <strong>{t("statementPrint.customer")}</strong>
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

          {customer.address || customer.notes ? (
            <section className="invoice-notes">
              <span>{t("common.notes")}</span>
              <p>{[customer.address, customer.notes].filter(Boolean).join(" | ")}</p>
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
