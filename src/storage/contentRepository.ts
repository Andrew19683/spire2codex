import { Character, CharacterId } from "@/domain/types";
import { characterPresentation } from "@/domain/characterPresentation";
import { SupabaseClient } from "@supabase/supabase-js";

type CharacterRow = { id: string; display_order: number; active: boolean };
type TranslationRow = { character_id: string; locale: string; name: string };

export class ContentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async characters(locale = "en"): Promise<Character[]> {
    const [{ data: rows, error: characterError }, { data: translations, error: translationError }] = await Promise.all([
      this.client.from("characters").select("id, display_order, active").order("display_order"),
      this.client.from("character_translations").select("character_id, locale, name").in("locale", [...new Set([locale, "en"])]),
    ]);
    if (characterError) throw characterError;
    if (translationError) throw translationError;

    const names = new Map<string, string>();
    for (const item of (translations ?? []) as TranslationRow[]) {
      const key = item.character_id;
      if (item.locale === "en" || !names.has(key)) names.set(key, item.name);
    }
    for (const item of (translations ?? []) as TranslationRow[]) {
      if (item.locale === locale) names.set(item.character_id, item.name);
    }

    return ((rows ?? []) as CharacterRow[]).map((item) => {
      const name = names.get(item.id) ?? item.id;
      return {
        id: item.id as CharacterId,
        name,
        ...characterPresentation(item.id, name),
        order: item.display_order,
        available: item.active,
      };
    });
  }
}
