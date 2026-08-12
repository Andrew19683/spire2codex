import { allCharacters } from "./ladder";
import { CharacterId, MasterRotationMode } from "./types";
import { CoopMember } from "./coopLadder";

export type CoopMasterAttempt = {
  id: string;
  ascension: number;
  completed: Record<string, CharacterId[]>;
  assignments: Record<string, CharacterId> | null;
  startedAt: string;
};

export type CoopMasterHistory = {
  id: string;
  ascension: number;
  completed: Record<string, CharacterId[]>;
  lostAssignments: Record<string, CharacterId> | null;
  fairyUsed: boolean;
  successful: boolean;
  startedAt: string;
  finishedAt: string;
};

export type CoopMasterGroup = {
  id: string;
  name: string;
  ownerId: string;
  members: CoopMember[];
  initialized: boolean;
  mode: MasterRotationMode;
  currentAscension: number;
  maxAscension: number;
  fairies: number;
  completedA10Once: boolean;
  activeAttempt: CoopMasterAttempt | null;
  history: CoopMasterHistory[];
  updatedAt: string;
};

export function coopMasterStats(group: CoopMasterGroup) {
  const successfulA10 = group.history.filter((item) => item.successful && item.ascension === 10).length;
  let a10Streak = 0;
  for (const item of group.history) { if (item.ascension !== 10) continue; if (!item.successful) break; a10Streak++; }
  const failed = group.history.filter((item) => !item.successful);
  const averageProgress = failed.length
    ? failed.reduce((sum, item) => sum + Object.values(item.completed).reduce((total, ids) => total + ids.length, 0), 0) / failed.length
    : 0;
  const players = group.members.map((member) => {
    const characterStats = allCharacters.map((character) => {
      const records = group.history.filter((item) => item.completed[member.userId]?.includes(character.id) || item.lostAssignments?.[member.userId] === character.id);
      const wins = records.filter((item) => item.completed[member.userId]?.includes(character.id)).length;
      return { characterId: character.id, attempts: records.length, wins, winRate: records.length ? wins / records.length : 0, maxAscension: records.reduce((max, item) => Math.max(max, item.ascension), 0) };
    });
    const played = characterStats.filter((item) => item.attempts);
    return { member, characterStats, best: [...played].sort((a, b) => b.winRate - a.winRate)[0] ?? null, hardest: [...played].sort((a, b) => a.winRate - b.winRate)[0] ?? null };
  });
  return { attempts: group.history.length, successfulA10, a10Streak, averageProgress, mastered: group.history.filter((item) => item.successful).length, players };
}
