type Props = {
  onSelect: (from: string, to: string) => void;
};

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function DatePresets({ onSelect }: Props) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="ghost-button"
        style={{ padding: "6px 10px", fontSize: 12 }}
        onClick={() => {
          const today = new Date();
          const iso = toISO(today);
          onSelect(iso, iso);
        }}
      >
        اليوم
      </button>
      <button
        type="button"
        className="ghost-button"
        style={{ padding: "6px 10px", fontSize: 12 }}
        onClick={() => {
          const today = new Date();
          const day = today.getDay();
          const monday = new Date(today);
          monday.setDate(today.getDate() - ((day + 6) % 7));
          onSelect(toISO(monday), toISO(today));
        }}
      >
        هذا الأسبوع
      </button>
      <button
        type="button"
        className="ghost-button"
        style={{ padding: "6px 10px", fontSize: 12 }}
        onClick={() => {
          const today = new Date();
          const first = new Date(today.getFullYear(), today.getMonth(), 1);
          onSelect(toISO(first), toISO(today));
        }}
      >
        هذا الشهر
      </button>
      <button
        type="button"
        className="ghost-button"
        style={{ padding: "6px 10px", fontSize: 12 }}
        onClick={() => {
          const today = new Date();
          const from = new Date(today);
          from.setDate(today.getDate() - 30);
          onSelect(toISO(from), toISO(today));
        }}
      >
        آخر 30 يوم
      </button>
    </div>
  );
}
