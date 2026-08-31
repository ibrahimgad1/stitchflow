import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { formatMoney } from "../lib/master-data";
import { saveCurrentPageAsPdf } from "../lib/pdf";
import { getSalesInvoice } from "../lib/sales";

export function SalesInvoicePrintPage() {
  const { t, statusLabel } = useI18n();
  const { id } = useParams();
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const invoiceQuery = useQuery({
    queryKey: ["sales-invoice-print", id],
    queryFn: () => getSalesInvoice(id!),
    enabled: Boolean(id)
  });

  const invoice = invoiceQuery.data;

  async function handleSavePdf() {
    setIsSavingPdf(true);

    try {
      await saveCurrentPageAsPdf(`sales-invoice-${invoice?.invoiceNumber ?? id ?? "document"}.pdf`);
    } finally {
      setIsSavingPdf(false);
    }
  }

  return (
    <main className="print-page" dir="rtl">
      <div className="print-actions">
        <Link className="ghost-button" to="/sales-invoices">
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

      {invoiceQuery.isLoading ? (
        <section className="invoice-sheet">
          <p>{t("print.loading")}</p>
        </section>
      ) : !invoice ? (
        <section className="invoice-sheet">
          <p>{t("print.notFound")}</p>
        </section>
      ) : (
        <section className="invoice-sheet" aria-label={t("print.salesTitle")}>
          <header className="invoice-print-header">
            <div>
              <p className="eyebrow">{t("print.salesTitle")}</p>
              <h1>{t("print.factoryName")}</h1>
              <p>{t("print.subtitle")}</p>
            </div>
            <div className="invoice-number-block">
              <span>{t("print.invoice")}</span>
              <strong dir="ltr">{invoice.invoiceNumber}</strong>
              <small>{statusLabel(invoice.status)}</small>
            </div>
          </header>

          <section className="invoice-meta-grid">
            <div>
              <span>{t("print.customer")}</span>
              <strong>{invoice.customerName}</strong>
            </div>
            <div>
              <span>{t("print.invoiceDate")}</span>
              <strong dir="ltr">{invoice.invoiceDate}</strong>
            </div>
            <div>
              <span>{t("print.dueDate")}</span>
              <strong dir="ltr">{invoice.dueDate || "-"}</strong>
            </div>
            <div>
              <span>{t("print.remaining")}</span>
              <strong dir="ltr">{formatMoney(invoice.remainingMinor)}</strong>
            </div>
          </section>

          <table className="invoice-print-table">
            <thead>
              <tr>
                <th>{t("print.item")}</th>
                <th>{t("print.size")}</th>
                <th>{t("print.color")}</th>
                <th>{t("print.qty")}</th>
                <th>{t("print.unitPrice")}</th>
                <th>{t("print.total")}</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong dir="ltr">{item.modelCode}</strong>
                    <span>{item.modelName}</span>
                  </td>
                  <td>{item.sizeName}</td>
                  <td>{item.colorName}</td>
                  <td dir="ltr">{item.quantity}</td>
                  <td dir="ltr">{formatMoney(item.unitPriceMinor)}</td>
                  <td dir="ltr">{formatMoney(item.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="invoice-total-grid">
            <div>
              <span>{t("print.subtotal")}</span>
              <strong dir="ltr">{formatMoney(invoice.subtotalMinor)}</strong>
            </div>
            <div>
              <span>{t("print.discount")}</span>
              <strong dir="ltr">{formatMoney(invoice.discountMinor)}</strong>
            </div>
            <div>
              <span>{t("print.total")}</span>
              <strong dir="ltr">{formatMoney(invoice.totalMinor)}</strong>
            </div>
            <div>
              <span>{t("print.paid")}</span>
              <strong dir="ltr">{formatMoney(invoice.paidMinor)}</strong>
            </div>
            <div>
              <span>{t("print.remaining")}</span>
              <strong dir="ltr">{formatMoney(invoice.remainingMinor)}</strong>
            </div>
          </section>

          {invoice.notes ? (
            <section className="invoice-notes">
              <span>{t("print.notes")}</span>
              <p>{invoice.notes}</p>
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
