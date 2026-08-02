import { describe, expect, it } from "vitest";
import { validateUsername } from "./auth";

describe("validateUsername", () => {
  it.each(["abc", "Player_1", "a-b", "A".repeat(24)])("accepts %s", (value) => {
    expect(validateUsername(value)).toBeNull();
  });

  it.each(["ab", "a b", "игрок", "a.b", "A".repeat(25)])("rejects %s", (value) => {
    expect(validateUsername(value)).not.toBeNull();
  });
});
