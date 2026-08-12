import { describe, expect, it } from "vitest";
import { characterPresentation } from "./characterPresentation";

describe("character presentation", () => {
  it("preserves the original visual identity of catalog characters", () => {
    expect(characterPresentation("ironclad", "Ironclad")).toEqual({ initials: "IC", sigil: "◆", color: "#ba4538" });
    expect(characterPresentation("silent", "Silent")).toMatchObject({ sigil: "◒", color: "#4b8b62" });
    expect(characterPresentation("regent", "Regent")).toMatchObject({ sigil: "✦", color: "#d0a04b" });
    expect(characterPresentation("necrobinder", "Necrobinder")).toMatchObject({ sigil: "☽", color: "#7661a8" });
    expect(characterPresentation("defect", "Defect")).toMatchObject({ sigil: "◎", color: "#4b82a8" });
  });

  it("provides deterministic defaults for a new database character", () => {
    expect(characterPresentation("new_hero", "New Hero")).toEqual({ initials: "NE", sigil: "◆", color: "hsl(129 38% 48%)" });
  });
});
