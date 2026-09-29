import {
  CardMasteryAttempt,
  CardMasteryAttemptStat,
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
  attemptStats: CardMasteryAttemptStat[];
};

type SnapshotRow = {
  state: StateRow;
  cards: Array<{
    id: string; name: string; description: string; type: string; rarity: string;
    character_id: string | null; pool_id: string; active: boolean;
    coop_only: boolean; solo_only: boolean; eligible: boolean;
  }>;
  progress: Array<{
    card_id: string; max_mastered_ascension: number;
    first_mastered_at: string | null; last_mastered_at: string | null;
  }>;
  attempts: Array<{
    id: string; card_id: string; ascension: number; character_id: string;
    result: CardMasteryResult; card_found: boolean; mastered: boolean;
    started_at: string; finished_at: string;
  }>;
  attempt_stats: Array<{
    card_id: string; attempts: number; mastered: number; lost: number; not_found: number;
  }>;
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
    const response = await this.client.rpc("get_card_mastery_snapshot", { content_locale: locale });
    if (response.error) throw response.error;
    const row = response.data as SnapshotRow;
    const cards: CardMasteryCard[] = row.cards.map((item) => ({
        id: item.id, name: item.name, description: item.description,
        type: item.type,
        rarity: item.rarity,
        characterId: item.character_id,
        poolId: item.pool_id,
        active: item.active,
        coopOnly: item.coop_only,
        soloOnly: item.solo_only,
        eligible: item.eligible,
      }));
    const progress: CardMasteryProgress[] = row.progress.map((item) => ({
      cardId: item.card_id,
      maxMasteredAscension: item.max_mastered_ascension,
      firstMasteredAt: item.first_mastered_at,
      lastMasteredAt: item.last_mastered_at,
    }));
    const attempts: CardMasteryAttempt[] = row.attempts.map((item) => ({
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
    const attemptStats: CardMasteryAttemptStat[] = row.attempt_stats.map((item) => ({
      cardId: item.card_id,
      attempts: item.attempts,
      mastered: item.mastered,
      lost: item.lost,
      notFound: item.not_found,
    }));
    return { state: stateFromRow(row.state), cards, progress, attempts, attemptStats };
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
