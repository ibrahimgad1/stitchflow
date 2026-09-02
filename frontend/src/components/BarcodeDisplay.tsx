import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

export interface BarcodeDisplayProps {
  barcode: string;
  format?: "barcode" | "qr" | "both";
  variant?: "display" | "print";
  width?: number;
  height?: number;
  label?: string;
  includeText?: boolean;
  className?: string;
}

/**
 * BarcodeDisplay Component
 * Renders barcode and/or QR code for products and invoices
 * - format: "barcode" (1D), "qr" (2D), "both" (combined)
 * - variant: "display" (interactive), "print" (optimized for printing)
 */
export function BarcodeDisplay({
  barcode,
  format = "barcode",
  variant = "display",
  width = 200,
  height = 80,
  label,
  includeText = true,
  className,
}: BarcodeDisplayProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [barcodeReady, setBarcodeReady] = useState(false);

  useEffect(() => {
    if (!barcode || format === "qr" || format === "both" || !barcodeRef.current)
      return;

    try {
      JsBarcode(barcodeRef.current, barcode, {
        format: "CODE128",
        width: 2,
        height: variant === "print" ? 60 : 40,
        displayValue: includeText,
        fontSize: variant === "print" ? 14 : 12,
        margin: 10,
      });
      setBarcodeReady(true);
    } catch (err) {
      console.error("Barcode render error:", err);
    }
  }, [barcode, format, variant, includeText]);

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: format === "both" ? "column" : "row",
    alignItems: "center",
    justifyContent: "center",
    gap: format === "both" ? 12 : 16,
    padding: variant === "print" ? 12 : 8,
    background: variant === "print" ? "#ffffff" : "transparent",
    border: variant === "print" ? "1px solid #e5e7eb" : "none",
    borderRadius: variant === "print" ? 0 : "var(--radius)",
    width: "fit-content",
  };

  return (
    <div className={className} style={containerStyle}>
      {/* Barcode (1D) */}
      {(format === "barcode" || format === "both") && barcode && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {label && (
            <small style={{ fontSize: "11px", color: "#666", fontWeight: 600 }}>
              {label}
            </small>
          )}
          <svg
            ref={barcodeRef}
            id="barcode"
            style={{
              maxWidth: "100%",
              height: "auto",
              display: barcodeReady ? "block" : "block",
              background: "#fff",
            }}
          />
          {variant === "print" && includeText && (
            <small
              style={{
                fontSize: "10px",
                fontFamily: "monospace",
                color: "#000",
              }}
            >
              {barcode}
            </small>
          )}
        </div>
      )}

      {/* QR Code (2D) */}
      {(format === "qr" || format === "both") && barcode && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {label && format === "qr" && (
            <small style={{ fontSize: "11px", color: "#666", fontWeight: 600 }}>
              {label}
            </small>
          )}
          <QRCodeSVG
            value={barcode}
            size={format === "both" ? 80 : 120}
            level="H"
            includeMargin
            bgColor="#ffffff"
            fgColor="#000000"
            style={{
              display: "block",
              background: "#fff",
              padding: 2,
              border: "1px solid #e5e7eb",
            }}
          />
        </div>
      )}
    </div>
  );
}
