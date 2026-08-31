import { describe, expect, it } from "vitest";
import { fromMinorUnits, toMinorUnits } from "./money.js";

describe("money utilities", () => {
  it("converts decimal money to integer minor units", () => {
    expect(toMinorUnits(12.5)).toBe(1250);
    expect(toMinorUnits("100")).toBe(10000);
  });

  it("converts integer minor units to decimal money", () => {
    expect(fromMinorUnits(1250)).toBe(12.5);
  });

  it("rejects invalid money values", () => {
    expect(() => toMinorUnits("abc")).toThrow("Invalid money value");
    expect(() => fromMinorUnits(12.5)).toThrow("Money minor units must be an integer");
  });
});

