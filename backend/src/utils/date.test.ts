import { describe, expect, it } from "vitest";
import { isoDateSchema } from "./date.js";

describe("isoDateSchema", () => {
  it("accepts valid ISO calendar dates", () => {
    expect(isoDateSchema.parse("2026-09-02")).toBe("2026-09-02");
    expect(isoDateSchema.parse("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects malformed and impossible dates", () => {
    expect(isoDateSchema.safeParse("2026-9-2").success).toBe(false);
    expect(isoDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(isoDateSchema.safeParse("2026-04-31").success).toBe(false);
  });
});
