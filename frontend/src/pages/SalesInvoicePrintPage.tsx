import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Printer, Receipt, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { formatMoney } from "../lib/master-data";
import { saveCurrentPageAsPdf } from "../lib/pdf";
import { getSalesInvoice } from "../lib/sales";
import { BarcodeDisplay } from "../components/BarcodeDisplay";

export function SalesInvoicePrintPage() {
  const { t, statusLabel } = useI18n();
  const { id } = useParams();
  const [printFormat, setPrintFormat] = useState<"a4" | "thermal">("a4");
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const invoiceQuery = useQuery({
    queryKey: ["sales-invoice-print", id],
    queryFn: () => getSalesInvoice(id!),
    enabled: Boolean(id),
  });

  const invoice = invoiceQuery.data;

  async function handleSavePdf() {
    setIsSavingPdf(true);
    try {
      await saveCurrentPageAsPdf(
        `sales-invoice-${invoice?.invoiceNumber ?? id ?? "document"}.pdf`,
      );
    } finally {
      setIsSavingPdf(false);
    }
  }

  return (
    <main className="print-page" dir="rtl">
      {/* Top Action & Mode Selector Bar */}
      <div
        className="print-actions"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link className="ghost-button" to="/sales-invoices">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t("print.back") || "العودة للفواتير"}</span>
          </Link>
          <div
            style={{
              display: "flex",
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "2px",
            }}
          >
            <button
              className={`tab-button ${printFormat === "a4" ? "active" : ""}`}
              style={{
                minHeight: "32px",
                padding: "0 12px",
                border: 0,
                borderRadius: "var(--radius-sm)",
              }}
              onClick={() => setPrintFormat("a4")}
              type="button"
            >
              فاتورة رسمية A4
            </button>
            <button
              className={`tab-button ${printFormat === "thermal" ? "active" : ""}`}
              style={{
                minHeight: "32px",
                padding: "0 12px",
                border: 0,
                borderRadius: "var(--radius-sm)",
              }}
              onClick={() => setPrintFormat("thermal")}
              type="button"
            >
              إيصال كاشير 80 مم
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="primary-button"
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={16} aria-hidden="true" />
            <span>{t("print.print") || "طباعة"}</span>
          </button>
          {printFormat === "a4" ? (
            <button
              className="ghost-button"
              type="button"
              disabled={isSavingPdf}
              onClick={handleSavePdf}
            >
              <FileDown size={16} aria-hidden="true" />
              <span>
                {isSavingPdf ? t("print.saving") : t("print.savePdf")}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {invoiceQuery.isLoading ? (
        <section className="invoice-sheet">
          <p>{t("print.loading")}</p>
        </section>
      ) : !invoice ? (
        <section className="invoice-sheet">
          <p>{t("print.notFound")}</p>
        </section>
      ) : printFormat === "a4" ? (
        /* Standard A4 Formal Invoice Layout */
        <section className="invoice-sheet" aria-label={t("print.salesTitle")}>
          <header className="invoice-print-header">
            <div>
              <p className="eyebrow">
                {t("print.salesTitle") || "فاتورة مبيعات معتمدة"}
              </p>
              <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>
                {t("print.factoryName") || "مصنع الملابس الجاهزة"}
              </h1>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "var(--text-muted)",
                  fontSize: "14px",
                }}
              >
                {t("print.subtitle") || "نظام إدارة التصنيع والإنتاج المتكامل"}
              </p>
            </div>
            <div
              className="invoice-number-block"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <span>{t("print.invoice") || "رقم الفاتورة"}</span>
                <strong
                  dir="ltr"
                  style={{ display: "block", fontSize: "18px" }}
                >
                  {invoice.invoiceNumber}
                </strong>
                <small>{statusLabel(invoice.status)}</small>
              </div>
              {/* QR Code for Invoice Verification */}
              <BarcodeDisplay
                barcode={`INV-${invoice.invoiceNumber}-${invoice.id}`}
                format="qr"
                variant="print"
                width={80}
                includeText={false}
              />
            </div>
          </header>

          <section className="invoice-meta-grid">
            <div>
              <span>{t("print.customer") || "السادة / العميل"}</span>
              <strong>{invoice.customerName}</strong>
            </div>
            <div>
              <span>{t("print.invoiceDate") || "تاريخ الفاتورة"}</span>
              <strong dir="ltr">{invoice.invoiceDate}</strong>
            </div>
            <div>
              <span>{t("print.dueDate") || "تاريخ الاستحقاق"}</span>
              <strong dir="ltr">{invoice.dueDate || "-"}</strong>
            </div>
            <div>
              <span>{t("print.remaining") || "المتبقي على الفاتورة"}</span>
              <strong
                dir="ltr"
                style={{
                  color:
                    invoice.remainingMinor > 0
                      ? "var(--danger)"
                      : "var(--success)",
                }}
              >
                {formatMoney(invoice.remainingMinor)}
              </strong>
            </div>
          </section>

          <table className="invoice-print-table">
            <thead>
              <tr>
                <th>{t("print.item") || "البند / الموديل"}</th>
                <th>{t("print.size") || "المقاس"}</th>
                <th>{t("print.color") || "اللون"}</th>
                <th style={{ textAlign: "center" }}>
                  {t("print.qty") || "الكمية"}
                </th>
                <th style={{ textAlign: "end" }}>
                  {t("print.unitPrice") || "سعر الوحدة"}
                </th>
                <th style={{ textAlign: "end" }}>
                  {t("print.total") || "الإجمالي"}
                </th>
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
                  <td
                    dir="ltr"
                    style={{ textAlign: "center", fontWeight: 700 }}
                  >
                    {item.quantity}
                  </td>
                  <td dir="ltr" style={{ textAlign: "end" }}>
                    {formatMoney(item.unitPriceMinor)}
                  </td>
                  <td dir="ltr" style={{ textAlign: "end", fontWeight: 700 }}>
                    {formatMoney(item.totalMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="invoice-total-grid">
            <div>
              <span>{t("print.subtotal") || "إجمالي البنود"}</span>
              <strong dir="ltr">{formatMoney(invoice.subtotalMinor)}</strong>
            </div>
            <div>
              <span>{t("print.discount") || "الخصم"}</span>
              <strong dir="ltr" style={{ color: "var(--danger)" }}>
                {formatMoney(invoice.discountMinor)}
              </strong>
            </div>
            <div>
              <span>{t("print.total") || "الصافي المستحق"}</span>
              <strong dir="ltr">{formatMoney(invoice.totalMinor)}</strong>
            </div>
            <div>
              <span>{t("print.paid") || "المسدد"}</span>
              <strong dir="ltr" style={{ color: "var(--success)" }}>
                {formatMoney(invoice.paidMinor)}
              </strong>
            </div>
            <div>
              <span>{t("print.remaining") || "المتبقي"}</span>
              <strong dir="ltr">{formatMoney(invoice.remainingMinor)}</strong>
            </div>
          </section>

          {invoice.notes ? (
            <section className="invoice-notes">
              <span>{t("print.notes") || "ملاحظات الفاتورة"}</span>
              <p>{invoice.notes}</p>
            </section>
          ) : null}

          <footer className="invoice-signatures">
            <div>{t("print.preparedBy") || "توقيع المحاسب / المسؤول"}</div>
            <div>{t("print.receivedBy") || "توقيع المستلم"}</div>
          </footer>
        </section>
      ) : (
        /* 80mm POS Thermal Receipt Layout */
        <section
          className="thermal-receipt"
          style={{
            width: "320px",
            margin: "0 auto",
            background: "#ffffff",
            padding: "20px 16px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-md)",
            fontFamily:
              "'Courier New', Courier, monospace, 'Cairo', sans-serif",
          }}
        >
          <div
            style={{
              textAlign: "center",
              borderBottom: "1px dashed #000000",
              paddingBottom: "12px",
              marginBottom: "12px",
            }}
          >
            <h2
              style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800 }}
            >
              {t("print.factoryName") || "مصنع الملابس"}
            </h2>
            <p style={{ margin: 0, fontSize: "12px" }}>إيصال مبيعات كاشير</p>
            <p style={{ margin: "4px 0 0", fontSize: "13px", fontWeight: 700 }}>
              #{invoice.invoiceNumber}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "11px" }}>
              التاريخ: {invoice.invoiceDate}
            </p>
          </div>

          <div style={{ fontSize: "12px", marginBottom: "10px" }}>
            <div>
              <strong>العميل:</strong> {invoice.customerName}
            </div>
          </div>

          <div
            style={{
              borderBottom: "1px dashed #000000",
              paddingBottom: "10px",
              marginBottom: "10px",
            }}
          >
            {(invoice.items ?? []).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  marginBottom: "6px",
                }}
              >
                <div>
                  <div>
                    {item.modelCode} ({item.sizeName}/{item.colorName})
                  </div>
                  <small style={{ color: "#666" }}>
                    {item.quantity} × {formatMoney(item.unitPriceMinor)}
                  </small>
                </div>
                <strong>{formatMoney(item.totalMinor)}</strong>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gap: "4px",
              fontSize: "12px",
              borderBottom: "1px dashed #000000",
              paddingBottom: "10px",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>إجمالي البنود:</span>
              <span>{formatMoney(invoice.subtotalMinor)}</span>
            </div>
            {invoice.discountMinor > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>الخصم:</span>
                <span>-{formatMoney(invoice.discountMinor)}</span>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                fontWeight: 800,
              }}
            >
              <span>الصافي:</span>
              <span>{formatMoney(invoice.totalMinor)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>المدفوع:</span>
              <span>{formatMoney(invoice.paidMinor)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
              }}
            >
              <span>المتبقي:</span>
              <span>{formatMoney(invoice.remainingMinor)}</span>
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: "11px", color: "#666" }}>
            <p style={{ margin: 0 }}>شكراً لتعاملكم معنا</p>
            <p style={{ margin: "2px 0 0" }}>
              البضاعة المباعة ترد وتستبدل خلال 14 يوم
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
