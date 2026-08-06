import { UserData } from "@/domain/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { emptyMasterRotation } from "@/domain/masterRotation";

export interface UserDataRepository {
  load(): Promise<UserData | null>;
  save(data: UserData): Promise<void>;
}

const STORAGE_KEY = "spire2codex.demo.v1";
const LEGACY_STORAGE_KEY = "spirebound.demo.v1";

type LegacyStoredSession = { logged?: boolean; data?: UserData };
const normalize = (data:UserData):UserData => ({...data,masterRotation:data.masterRotation??emptyMasterRotation()});

export class LocalStorageUserDataRepository implements UserDataRepository {
  async load(): Promise<UserData | null> {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as UserData | LegacyStoredSession;
      if ("activeRun" in parsed && "history" in parsed && "preferences" in parsed) {
        return normalize(parsed as UserData);
      }
      return parsed.data ? normalize(parsed.data) : null;
    } catch {
      return null;
    }
  }

  async save(data: UserData): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

export class SupabaseUserDataRepository implements UserDataRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async load(): Promise<UserData | null> {
    const { data, error } = await this.client
      .from("user_data")
      .select("data")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) throw error;
    return data?.data ? normalize(data.data as UserData) : null;
  }

  async save(value: UserData): Promise<void> {
    const { error } = await this.client.from("user_data").upsert({
      user_id: this.userId,
      data: value,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}
