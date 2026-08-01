import { UserData } from "@/domain/types";

export type StoredSession = { logged: boolean; data: UserData };

export interface UserDataRepository {
  load(): StoredSession | null;
  save(session: StoredSession): void;
}

const STORAGE_KEY = "spire2codex.demo.v1";
const LEGACY_STORAGE_KEY = "spirebound.demo.v1";

export class LocalStorageUserDataRepository implements UserDataRepository {
  load(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  save(session: StoredSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

export const userDataRepository: UserDataRepository = new LocalStorageUserDataRepository();
