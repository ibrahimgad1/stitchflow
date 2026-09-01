import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  ariaLabel?: string;
};

export function SearchableSelect({ value, onChange, options, placeholder = "اختر...", required, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim() === "" ? options : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  function handleSelect(val: string) {
    onChange(val);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px",
          border: "1px solid #cabda7",
          borderRadius: 8,
          background: "white",
          textAlign: "start",
          cursor: "pointer"
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "#25211b" : "#9ca3af" }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>▼</span>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            insetInline: 0,
            background: "white",
            border: "1px solid #cabda7",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 20,
            maxHeight: 220,
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{ padding: 6, borderBottom: "1px solid #ece3d4" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); if (filtered[highlight]) handleSelect(filtered[highlight].value); }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="اكتب للبحث (حرفين)..."
              style={{ width: "100%", padding: "8px", border: "1px solid #e5e7eb", borderRadius: 6 }}
            />
          </div>
          <div style={{ overflow: "auto", maxHeight: 160 }} role="listbox">
            {filtered.length === 0 ? (
              <div style={{ padding: 10, color: "#9ca3af", fontSize: 13, textAlign: "center" }}>لا توجد نتائج</div>
            ) : (
              filtered.map((opt, idx) => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={value === opt.value}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlight(idx)}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: idx === highlight ? "#eef2ff" : value === opt.value ? "#f5f3ff" : "white",
                    color: value === opt.value ? "#4f46e5" : "#25211b",
                    fontWeight: value === opt.value ? 700 : 400,
                    fontSize: 13
                  }}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
      {/* hidden required input for form validation */}
      {required ? <input required value={value} onChange={() => {}} style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }} tabIndex={-1} aria-hidden /> : null}
    </div>
  );
}
