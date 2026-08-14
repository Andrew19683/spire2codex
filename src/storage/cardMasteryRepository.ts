import {
  CardMasteryAttempt,
  CardMasteryCard,
  CardMasteryProgress,
  CardMasteryResult,
  CardMasteryState,
} from "@/domain/cardMastery";
import { SupabaseClient } from "@supabase/supabase-js";

type StateRow = {
  current_ascension: number;
  active_card_id: string | null;
  selected_character_id: string | null;
  active_attempt_started_at: string | null;
  completed: boolean;
  first_completed_at: string | null;
  last_completed_at: string | null;
  additional_cards_count: number;
};

const stateFromRow = (row: StateRow): CardMasteryState => ({
  currentAscension: row.current_ascension,
  activeCardId: row.active_card_id,
  selectedCharacterId: row.selected_character_id,
  activeAttemptStartedAt: row.active_attempt_started_at,
  completed: row.completed,
  firstCompletedAt: row.first_completed_at,
  lastCompletedAt: row.last_completed_at,
  additionalCardsCount: row.additional_cards_count,
});

export type CardMasterySnapshot = {
  state: CardMasteryState;
  cards: CardMasteryCard[];
  progress: CardMasteryProgress[];
  attempts: CardMasteryAttempt[];
};

export class CardMasteryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async state(): Promise<CardMasteryState> {
    const result = await this.client.from("card_mastery_state").select("*").maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return stateFromRow(result.data as StateRow);
    const initialized = await this.client.rpc("initialize_card_mastery");
    if (initialized.error) throw initialized.error;
    return stateFromRow(initialized.data as StateRow);
  }

  async load(locale: "en" | "ru"): Promise<CardMasterySnapshot> {
    const state = await this.state();

    const locales = [...new Set([locale, "en"])] as string[];
    const [cardsResult, translationsResult, settingsResult, membershipsResult, progressResult, attemptsResult] = await Promise.all([
      this.client.from("cards").select("id, character_id, type, rarity, active, coop_only, solo_only"),
      this.client.from("card_translations").select("card_id, locale, name, description").in("locale", locales),
      this.client.from("card_challenge_settings").select("card_id, eligible").eq("challenge_id", "card_mastery"),
      this.client.from("card_pool_memberships").select("card_id, pool_id"),
      this.client.from("card_mastery_progress").select("card_id, max_mastered_ascension, first_mastered_at, last_mastered_at"),
      this.client.from("card_mastery_attempts").select("id, card_id, ascension, character_id, result, card_found, mastered, started_at, finished_at").order("finished_at", { ascending: false }),
    ]);
    for (const result of [cardsResult, translationsResult, settingsResult, membershipsResult, progressResult, attemptsResult]) {
      if (result.error) throw result.error;
    }

    const translations = new Map<string, { name: string; description: string }>();
    for (const item of translationsResult.data ?? []) {
      if (item.locale === "en") translations.set(item.card_id, { name: item.name, description: item.description });
    }
    for (const item of translationsResult.data ?? []) {
      if (item.locale === locale) translations.set(item.card_id, { name: item.name, description: item.description });
    }
    const eligibility = new Map((settingsResult.data ?? []).map((item) => [item.card_id, item.eligible]));
    const pools = new Map<string, string[]>();
    for (const item of membershipsResult.data ?? []) pools.set(item.card_id, [...(pools.get(item.card_id) ?? []), item.pool_id]);

    const cards: CardMasteryCard[] = (cardsResult.data ?? []).map((item) => {
      const translation = translations.get(item.id) ?? { name: item.id, description: "" };
      return {
        id: item.id,
        ...translation,
        type: item.type,
        rarity: item.rarity,
        characterId: item.character_id,
        poolId: item.character_id ?? (pools.get(item.id)?.includes("colorless") ? "colorless" : pools.get(item.id)?.[0] ?? "other"),
        active: item.active,
        coopOnly: item.coop_only,
        soloOnly: item.solo_only,
        eligible: eligibility.get(item.id) ?? true,
      };
    });
    const progress: CardMasteryProgress[] = (progressResult.data ?? []).map((item) => ({
      cardId: item.card_id,
      maxMasteredAscension: item.max_mastered_ascension,
      firstMasteredAt: item.first_mastered_at,
      lastMasteredAt: item.last_mastered_at,
    }));
    const attempts: CardMasteryAttempt[] = (attemptsResult.data ?? []).map((item) => ({
      id: item.id,
      cardId: item.card_id,
      ascension: item.ascension,
      characterId: item.character_id,
      result: item.result as CardMasteryResult,
      cardFound: item.card_found,
      mastered: item.mastered,
      startedAt: item.started_at,
      finishedAt: item.finished_at,
    }));
    return { state, cards, progress, attempts };
  }

  async start(cardId: string, characterId: string) {
    const result = await this.client.rpc("start_card_mastery_attempt", {
      target_card_id: cardId,
      chosen_character_id: characterId,
    });
    if (result.error) throw result.error;
    return stateFromRow(result.data as StateRow);
  }

  async finish(result: CardMasteryResult) {
    const response = await this.client.rpc("finish_card_mastery_attempt", { attempt_result: result });
    if (response.error) throw response.error;
    return stateFromRow(response.data as StateRow);
  }

  async cancelInvalidAttempt() {
    const response = await this.client.rpc("cancel_invalid_card_mastery_attempt");
    if (response.error) throw response.error;
    return stateFromRow(response.data as StateRow);
  }
}
