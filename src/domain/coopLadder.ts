import { characters } from "./ladder";
import { CharacterId } from "./types";

export type CoopMember = { userId: string; username: string; status: "pending" | "accepted"; characterId?: CharacterId };
export type CoopRun = { id: string; assignments: Record<string, CharacterId>; status: "active" | "lost" | "completed"; currentAscension: number; completedAscensions: number; startedAt: string; finishedAt?: string };
export type CoopGroup = { id: string; name: string; ownerId: string; members: CoopMember[]; activeRun: CoopRun | null; history: CoopRun[]; updatedAt: string };
export type CombinationStat = { key: string; assignments: Record<string, CharacterId>; runs: number; average: number; wins: number };

export function combinationKey(memberIds: string[], assignments: Record<string, CharacterId>) {
  return memberIds.map((id) => assignments[id]).join("|");
}

export function allCombinations(memberIds: string[]): Record<string, CharacterId>[] {
  return memberIds.reduce<Record<string, CharacterId>[]>((result, userId) =>
    result.flatMap((current) => characters.map((item) => ({ ...current, [userId]: item.id }))), [{}]);
}

export function combinationStats(memberIds: string[], history: CoopRun[]): CombinationStat[] {
  return allCombinations(memberIds).map((assignments, index) => {
    const key = combinationKey(memberIds, assignments);
    const own = history.filter((run) => combinationKey(memberIds, run.assignments) === key);
    return { key, assignments, runs: own.length, average: own.length ? own.reduce((sum, run) => sum + run.completedAscensions, 0) / own.length : 0, wins: own.filter((run) => run.status === "completed").length, index };
  }).sort((a, b) => b.wins - a.wins || b.average - a.average || b.runs - a.runs || a.index - b.index)
    .map((stat) => ({ key: stat.key, assignments: stat.assignments, runs: stat.runs, average: stat.average, wins: stat.wins }));
}

export function featuredCombinations(stats: CombinationStat[]) {
  const played = stats.filter((stat) => stat.runs > 0);
  const best = played.slice(0, 3);
  const bestKeys = new Set(best.map((item) => item.key));
  const worst = [...played].reverse().filter((item) => !bestKeys.has(item.key)).slice(0, 3);
  const unplayed = stats.filter((stat) => stat.runs === 0).sort(() => Math.random() - .5).slice(0, 3);
  const random = (unplayed.length ? unplayed : [...stats].sort(() => Math.random() - .5).slice(0, 3));
  return { best, worst, random };
}
