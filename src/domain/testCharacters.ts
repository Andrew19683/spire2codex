import { Character } from "./types";

export const testCharacters: Character[] = ["ironclad", "silent", "regent", "necrobinder", "defect"].map((id, index) => ({
  id, name: id, initials: id.slice(0, 2).toUpperCase(), sigil: "◆", color: "#000", order: index + 1, available: true,
}));
