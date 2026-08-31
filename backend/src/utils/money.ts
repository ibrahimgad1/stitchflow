export function toMinorUnits(value: number | string): number {
  const numeric = typeof value === "string" ? Number(value.trim()) : value;

  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid money value");
  }

  return Math.round(numeric * 100);
}

export function fromMinorUnits(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error("Money minor units must be an integer");
  }

  return value / 100;
}

