import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface BarcodeInputProps {
  onScanned: (barcode: string) => void | Promise<void>;
  placeholder?: string;
  onError?: (error: string) => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * BarcodeInput Component
 * Handles barcode scanning via keyboard input
 * Detects scanner input (rapid key presses within short timeframe)
 * Useful for warehouse/production environments with USB barcode scanners
 */
export function BarcodeInput({
  onScanned,
  placeholder = "ضع المسح الضوئي أو اكتب الرمز الشريطي...",
  onError,
  autoFocus,
  className,
}: BarcodeInputProps) {
  const [value, setValue] = useState("");
  const [isScannerActive, setIsScannerActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyCountRef = useRef<number>(0);
  const startTimeRef = useRef<number | undefined>(undefined);

  const handleClear = () => {
    setValue("");
    inputRef.current?.focus();
  };

  const processScan = async (barcode: string) => {
    if (!barcode.trim()) return;

    setValue("");
    keyCountRef.current = 0;

    try {
      await onScanned(barcode.trim());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Barcode processing error";
      onError?.(message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();

    // Reset if more than 100ms since last key
    if (startTimeRef.current && now - startTimeRef.current > 100) {
      keyCountRef.current = 0;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = now;
    }

    keyCountRef.current++;

    if (e.key === "Enter") {
      e.preventDefault();
      processScan(value);
      return;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Clear existing timeout
    if (scannerTimeoutRef.current) {
      clearTimeout(scannerTimeoutRef.current);
    }

    // Detect scanner pattern: many keys pressed quickly ending with Enter-like behavior
    // Most USB scanners send data rapidly followed by Enter, Tab, or immediate focus loss
    if (keyCountRef.current > 5) {
      setIsScannerActive(true);

      scannerTimeoutRef.current = setTimeout(() => {
        if (newValue.trim()) {
          processScan(newValue);
        }
        setIsScannerActive(false);
      }, 50); // Scanner typically sends data within 50ms
    }
  };

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }

    return () => {
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
      }
    };
  }, [autoFocus]);

  return (
    <div className={className} style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          background: isScannerActive ? "#fffbeb" : "#ffffff",
          border: `1px solid ${isScannerActive ? "#fbbf24" : "#e5e7eb"}`,
          borderRadius: "var(--radius)",
          transition: "all 0.2s ease",
        }}
      >
        <Search
          size={16}
          style={{
            position: "absolute",
            left: 12,
            color: "#9ca3af",
            pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: "10px 10px 10px 40px",
            border: "none",
            background: "transparent",
            fontSize: "14px",
            fontFamily: "monospace",
            outline: "none",
          }}
          autoComplete="off"
          spellCheck="false"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: "none",
              border: "none",
              padding: "8px 12px",
              cursor: "pointer",
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
            }}
            title="مسح الحقل"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {isScannerActive && (
        <small
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            color: "#f59e0b",
            fontSize: "12px",
            animation: "pulse 0.5s ease",
          }}
        >
          جاري المسح...
        </small>
      )}
    </div>
  );
}
