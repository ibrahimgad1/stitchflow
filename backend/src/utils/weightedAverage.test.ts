import { describe, expect, it } from "vitest";
import { calculateWeightedAverageMinor } from "./weightedAverage.js";

describe("weighted average cost", () => {
  it("calculates weighted average for first receipt", () => {
    expect(calculateWeightedAverageMinor(0, 0, 100, 500)).toBe(500);
  });

  it("recalculates weighted average after additional receipt", () => {
    expect(calculateWeightedAverageMinor(100, 500, 50, 800)).toBe(600);
  });

  it("rejects non-positive received quantity", () => {
    expect(() => calculateWeightedAverageMinor(10, 500, 0, 800)).toThrow(
      "Received quantity must be positive"
    );
  });
});
