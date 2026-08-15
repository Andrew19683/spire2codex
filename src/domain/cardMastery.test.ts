import { describe, expect, it } from "vitest";
import { availableCards, calculateCardMasteryStats, CardMasteryCard, createCardOffer } from "./cardMastery";

const card = (id: string, characterId: string | null, overrides: Partial<CardMasteryCard> = {}): CardMasteryCard => ({
  id, name: id, description: "", type: "Skill", rarity: "common", characterId,
  poolId: characterId ?? "colorless", active: true, coopOnly: false, soloOnly: false, eligible: true,
  ...overrides,
});

describe("Card Mastery offers", () => {
  it("prefers Colorless and two different characters", () => {
    const offer = createCardOffer([
      card("c", null), card("i1", "ironclad"), card("i2", "ironclad"),
      card("s", "silent"), card("d", "defect"),
    ], [], 1, () => 0);
    expect(offer).toHaveLength(3);
    expect(offer.filter((item) => item.poolId === "colorless")).toHaveLength(1);
    expect(new Set(offer.filter((item) => item.characterId).map((item) => item.characterId)).size).toBe(2);
  });

  it("falls back and preserves one- or two-card choices", () => {
    expect(createCardOffer([card("a", "ironclad"), card("b", "ironclad")], [], 1, () => 0)).toHaveLength(2);
    expect(createCardOffer([card("a", "ironclad")], [], 1, () => 0)).toHaveLength(1);
  });

  it("filters inactive, coop-only, ineligible and mastered cards but permits solo-only", () => {
    const cards = [
      card("valid", "silent", { soloOnly: true }),
      card("inactive", "silent", { active: false }),
      card("coop", "silent", { coopOnly: true }),
      card("disabled", "silent", { eligible: false }),
      card("event", null, { poolId: "event" }),
      card("starter", "silent", { rarity: "basic" }),
      card("curse", null, { poolId: "curse", rarity: "curse" }),
      card("status", null, { poolId: "status", rarity: "status" }),
      card("quest", null, { poolId: "quest", rarity: "quest" }),
      card("token", null, { poolId: "token", rarity: "token" }),
      card("mastered", "silent"),
    ];
    const progress = [{ cardId: "mastered", maxMasteredAscension: 5, firstMasteredAt: null, lastMasteredAt: null }];
    expect(availableCards(cards, progress, 5).map((item) => item.id)).toEqual(["valid"]);
    expect(availableCards(cards, progress, 6).map((item) => item.id)).toEqual(["valid", "mastered"]);
  });
});

describe("Card Mastery stats", () => {
  it("calculates overall, pool and ascension progress", () => {
    const cards = [
      card("a", "ironclad"), card("b", "ironclad"), card("c", null),
      card("event", null, { poolId: "event", rarity: "event" }),
      card("starter", "silent", { rarity: "basic" }),
      card("status", null, { poolId: "status", rarity: "status" }),
    ];
    const progress = [
      { cardId: "a", maxMasteredAscension: 10, firstMasteredAt: null, lastMasteredAt: null },
      { cardId: "c", maxMasteredAscension: 5, firstMasteredAt: null, lastMasteredAt: null },
    ];
    const stats = calculateCardMasteryStats(cards, progress, 5);
    expect(stats.masteredA10).toBe(1);
    expect(stats.totalCards).toBe(3);
    expect(stats.masteredAtCurrent).toBe(2);
    expect(stats.poolStats.map((item) => item.poolId)).toEqual([
      "ironclad", "silent", "regent", "necrobinder", "defect", "colorless",
    ]);
    expect(stats.poolStats).toHaveLength(6);
    expect(stats.poolStats.some((item) => item.poolId === "event")).toBe(false);
    expect(stats.poolStats.find((item) => item.poolId === "ironclad")?.percentA10).toBe(50);
    expect(stats.poolStats.find((item) => item.poolId === "colorless")?.ascensions[4]).toBe(100);
  });
});
