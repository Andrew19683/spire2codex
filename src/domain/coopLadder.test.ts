import { describe, expect, it } from "vitest";
import { allCombinations, combinationStats, featuredCombinations } from "./coopLadder";
import { CoopRun } from "./coopLadder";

const members = ["alice", "bob"];
const run: CoopRun = { id: "1", assignments: { alice: "ironclad", bob: "silent" }, status: "completed", currentAscension: 10, completedAscensions: 10, startedAt: "2026-01-01", lastAttemptAt: null };

describe("co-op ladder", () => {
  it("generates 5^n ordered player assignments and allows duplicate characters", () => {
    const combinations = allCombinations(members);
    expect(combinations).toHaveLength(25);
    expect(combinations).toContainEqual({ alice: "ironclad", bob: "ironclad" });
  });
  it("sorts combinations like the regular ladder: wins, average, runs", () => {
    const stats = combinationStats(members, [run]);
    expect(stats[0]).toMatchObject({ assignments: run.assignments, runs: 1, average: 10, wins: 1 });
  });
  it("does not repeat top combinations among the worst", () => {
    const featured = featuredCombinations(combinationStats(members, [run]));
    expect(featured.worst.map((item) => item.key)).not.toContain(featured.best[0].key);
    expect(featured.random).toHaveLength(3);
  });
});
