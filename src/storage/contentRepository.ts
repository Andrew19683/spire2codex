import { Character, CharacterId } from "@/domain/types";
import { SupabaseClient } from "@supabase/supabase-js";

type CharacterRow = { id: string; display_order: number; active: boolean };
type TranslationRow = { character_id: string; locale: string; name: string };

const colorFor = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 38% 48%)`;
};

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

    return ((rows ?? []) as CharacterRow[]).map((item) => ({
      id: item.id as CharacterId,
      name: names.get(item.id) ?? item.id,
      initials: (names.get(item.id) ?? item.id).slice(0, 2).toUpperCase(),
      sigil: "◆",
      color: colorFor(item.id),
      order: item.display_order,
      available: item.active,
    }));
  }
}
