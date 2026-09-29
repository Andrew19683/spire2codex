import { describe, expect, it, vi } from "vitest";
import { SupabaseClient } from "@supabase/supabase-js";
import { CardMasteryRepository } from "./cardMasteryRepository";

describe("CardMasteryRepository", () => {
  it("loads a bounded snapshot through one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        state: {
          current_ascension: 3,
          active_card_id: null,
          selected_character_id: null,
          active_attempt_started_at: null,
          completed: false,
          first_completed_at: null,
          last_completed_at: null,
          additional_cards_count: 0,
        },
        cards: [{
          id: "card-1", name: "Card", description: "Text", type: "Skill", rarity: "common",
          character_id: "silent", pool_id: "silent", active: true, coop_only: false,
          solo_only: false, eligible: true,
        }],
        progress: [{
          card_id: "card-1", max_mastered_ascension: 2,
          first_mastered_at: "2026-01-01T00:00:00Z", last_mastered_at: "2026-01-02T00:00:00Z",
        }],
        attempts: [],
        attempt_stats: [{ card_id: "card-1", attempts: 4, mastered: 2, lost: 1, not_found: 1 }],
      },
      error: null,
    });
    const repository = new CardMasteryRepository({ rpc } as unknown as SupabaseClient);

    const snapshot = await repository.load("ru");

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_card_mastery_snapshot", { content_locale: "ru" });
    expect(snapshot.state.currentAscension).toBe(3);
    expect(snapshot.cards[0]).toMatchObject({ id: "card-1", characterId: "silent", poolId: "silent" });
    expect(snapshot.attemptStats[0]).toEqual({ cardId: "card-1", attempts: 4, mastered: 2, lost: 1, notFound: 1 });
  });
});
