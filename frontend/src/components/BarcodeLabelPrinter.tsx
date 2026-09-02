import { BarcodeDisplay } from "./BarcodeDisplay";

export interface BarcodeLabelPrinterProps {
  barcodes: Array<{
    barcode: string;
    label: string;
    quantity?: number;
  }>;
  onClose?: () => void;
}

/**
 * BarcodeLabelPrinter Component
 * Renders printable barcode labels in various sizes for warehouse use
 * Optimized for thermal printers (40mm, 50mm, 80mm widths)
 */
export function BarcodeLabelPrinter({
  barcodes,
  onClose,
}: BarcodeLabelPrinterProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: "20px" }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handlePrint}
          style={{
            padding: "8px 16px",
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          🖨️ اطبع الملصقات
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#e5e7eb",
              color: "#000",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            إغلاق
          </button>
        )}
      </div>

      {/* Print Container */}
      <div
        id="barcode-labels-container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "12px",
          pageBreakInside: "avoid",
        }}
      >
        {barcodes.map((item, idx) => (
          <div
            key={idx}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              padding: "12px",
              background: "#ffffff",
              pageBreakInside: "avoid",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {/* Label Text */}
            <div style={{ textAlign: "center", width: "100%" }}>
              <strong style={{ fontSize: "12px", display: "block" }}>
                {item.label}
              </strong>
              {item.quantity && (
                <small style={{ color: "#6b7280", fontSize: "11px" }}>
                  الكمية: {item.quantity}
                </small>
              )}
            </div>

            {/* Barcode & QR */}
            <BarcodeDisplay
              barcode={item.barcode}
              format="barcode"
              variant="print"
              includeText={true}
              width={150}
            />

            {/* Bottom separators for cutting */}
            <div
              style={{
                width: "100%",
                height: "1px",
                borderTop: "1px dashed #d1d5db",
                marginTop: "8px",
              }}
            />
          </div>
        ))}
      </div>

      {/* CSS for printing */}
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          
          #barcode-labels-container {
            display: grid;
            gridTemplateColumns: repeat(2, 1fr);
            gap: 12px;
            width: 100%;
          }
          
          div[style*="pageBreakInside"] {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          button, div[style*="flexEnd"] {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
