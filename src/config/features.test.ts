import { describe, expect, it } from "vitest";
import { isFeatureEnabled } from "./features";

describe("feature flags", () => {
  it("enables a feature only for the explicit true value", () => {
    expect(isFeatureEnabled("true")).toBe(true);
    expect(isFeatureEnabled("false")).toBe(false);
    expect(isFeatureEnabled("1")).toBe(false);
    expect(isFeatureEnabled(undefined)).toBe(false);
  });
});
