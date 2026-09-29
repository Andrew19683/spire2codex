import { CharacterId } from "./types";

export const CARD_MASTERY_CHALLENGE_ID = "card_mastery";
export const CARD_MASTERY_POOL_ORDER = [
  "ironclad",
  "silent",
  "regent",
  "necrobinder",
  "defect",
  "colorless",
] as const;
const CARD_MASTERY_TYPES = new Set(["Attack", "Skill", "Power"]);
const CARD_MASTERY_RARITIES = new Set(["common", "uncommon", "rare"]);

export function isCardMasteryCatalogCard(card: Pick<CardMasteryCard, "characterId" | "poolId" | "type" | "rarity">) {
  const poolId = card.characterId ?? card.poolId;
  return (CARD_MASTERY_POOL_ORDER as readonly string[]).includes(poolId)
    && CARD_MASTERY_TYPES.has(card.type)
    && CARD_MASTERY_RARITIES.has(card.rarity);
}

export type CardMasteryCard = {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  characterId: CharacterId | null;
  poolId: string;
  active: boolean;
  coopOnly: boolean;
  soloOnly: boolean;
  eligible: boolean;
};

export type CardMasteryProgress = {
  cardId: string;
  maxMasteredAscension: number;
  firstMasteredAt: string | null;
  lastMasteredAt: string | null;
};

export type CardMasteryState = {
  currentAscension: number;
  activeCardId: string | null;
  selectedCharacterId: CharacterId | null;
  activeAttemptStartedAt: string | null;
  completed: boolean;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
  additionalCardsCount: number;
};

export type CardMasteryResult = "mastered" | "won_not_found" | "lost";

export type CardMasteryAttempt = {
  id: string;
  cardId: string;
  ascension: number;
  characterId: CharacterId;
  result: CardMasteryResult;
  cardFound: boolean;
  mastered: boolean;
  startedAt: string;
  finishedAt: string;
};

export type CardMasteryAttemptStat = {
  cardId: string;
  attempts: number;
  mastered: number;
  lost: number;
  notFound: number;
};

export type CardMasteryPoolStat = {
  poolId: string;
  total: number;
  masteredA10: number;
  percentA10: number;
  ascensions: number[];
};

export type CardMasteryStats = {
  totalCards: number;
  masteredA10: number;
  percentA10: number;
  masteredAtCurrent: number;
  poolStats: CardMasteryPoolStat[];
};

export function availableCards(
  cards: CardMasteryCard[],
  progress: CardMasteryProgress[],
  ascension: number,
) {
  const mastered = new Map(progress.map((item) => [item.cardId, item.maxMasteredAscension]));
  return cards.filter((card) =>
    card.active && card.eligible && !card.coopOnly && isCardMasteryCatalogCard(card)
      && (mastered.get(card.id) ?? 0) < ascension,
  );
}

function sample<T>(items: T[], random: () => number) {
  if (!items.length) return null;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Prefer one Colorless card and cards from two different characters. */
export function createCardOffer(
  cards: CardMasteryCard[],
  progress: CardMasteryProgress[],
  ascension: number,
  random: () => number = Math.random,
) {
  const remaining = availableCards(cards, progress, ascension);
  if (remaining.length <= 3) return shuffled(remaining, random);

  const colorless = remaining.filter((card) => card.poolId === "colorless");
  const characterCards = remaining.filter((card) => card.characterId);
  const characterIds = [...new Set(characterCards.map((card) => card.characterId!))];
  const firstCharacter = sample(characterIds, random);
  const secondCharacter = sample(characterIds.filter((id) => id !== firstCharacter), random);

  if (colorless.length && firstCharacter && secondCharacter) {
    return [
      sample(colorless, random)!,
      sample(characterCards.filter((card) => card.characterId === firstCharacter), random)!,
      sample(characterCards.filter((card) => card.characterId === secondCharacter), random)!,
    ];
  }

  return shuffled(remaining, random).slice(0, 3);
}

export function calculateCardMasteryStats(
  cards: CardMasteryCard[],
  progress: CardMasteryProgress[],
  currentAscension: number,
): CardMasteryStats {
  const eligible = cards.filter((card) => card.active && card.eligible && !card.coopOnly && isCardMasteryCatalogCard(card));
  const levels = new Map(progress.map((item) => [item.cardId, item.maxMasteredAscension]));
  const masteredA10 = eligible.filter((card) => (levels.get(card.id) ?? 0) >= 10).length;
  const poolStats = CARD_MASTERY_POOL_ORDER.map((poolId) => {
    const poolCards = eligible.filter((card) => (card.characterId ?? card.poolId) === poolId);
    const poolMastered = poolCards.filter((card) => (levels.get(card.id) ?? 0) >= 10).length;
    return {
      poolId,
      total: poolCards.length,
      masteredA10: poolMastered,
      percentA10: poolCards.length ? poolMastered / poolCards.length * 100 : 0,
      ascensions: Array.from({ length: 10 }, (_, index) => {
        const level = index + 1;
        return poolCards.length
          ? poolCards.filter((card) => (levels.get(card.id) ?? 0) >= level).length / poolCards.length * 100
          : 0;
      }),
    };
  });
  return {
    totalCards: eligible.length,
    masteredA10,
    percentA10: eligible.length ? masteredA10 / eligible.length * 100 : 0,
    masteredAtCurrent: eligible.filter((card) => (levels.get(card.id) ?? 0) >= currentAscension).length,
    poolStats,
  };
}

export function emptyCardMasteryState(): CardMasteryState {
  return {
    currentAscension: 1,
    activeCardId: null,
    selectedCharacterId: null,
    activeAttemptStartedAt: null,
    completed: false,
    firstCompletedAt: null,
    lastCompletedAt: null,
    additionalCardsCount: 0,
  };
}
