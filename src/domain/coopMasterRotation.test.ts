import { beforeAll, describe, expect, it } from "vitest";
import { CoopMasterGroup, coopMasterStats } from "./coopMasterRotation";
import { replaceCharacters } from "./ladder";
import { testCharacters } from "./testCharacters";
beforeAll(() => replaceCharacters(testCharacters));

const group: CoopMasterGroup = {
  id: "g", name: "Team", ownerId: "alice", initialized: true, mode: "normal", currentAscension: 3, maxAscension: 4, fairies: 1, completedA10Once: false, activeAttempt: null, updatedAt: "2026-08-07",
  members: [
    { userId: "alice", username: "Alice", status: "accepted" },
    { userId: "bob", username: "Bob", status: "accepted" },
  ],
  history: [
    { id: "2", ascension: 4, completed: { alice: ["ironclad"], bob: ["silent", "defect"] }, lostAssignments: { alice: "silent", bob: "regent" }, fairyUsed: true, successful: false, startedAt: "2026-08-02", finishedAt: "2026-08-03" },
    { id: "1", ascension: 3, completed: { alice: ["ironclad", "silent", "regent", "necrobinder", "defect"], bob: ["ironclad", "silent", "regent", "necrobinder", "defect"] }, lostAssignments: null, fairyUsed: false, successful: true, startedAt: "2026-08-01", finishedAt: "2026-08-02" },
  ],
};

describe("co-op master rotation statistics", () => {
  it("calculates group progress from every player's completed characters", () => {
    const stats = coopMasterStats(group);
    expect(stats).toMatchObject({ attempts: 2, mastered: 1, averageProgress: 3 });
  });

  it("keeps character statistics scoped to each player", () => {
    const stats = coopMasterStats(group);
    const aliceIronclad = stats.players[0].characterStats.find((item) => item.characterId === "ironclad");
    const bobDefect = stats.players[1].characterStats.find((item) => item.characterId === "defect");
    expect(aliceIronclad).toMatchObject({ attempts: 2, wins: 2, maxAscension: 4 });
    expect(bobDefect).toMatchObject({ attempts: 2, wins: 2, maxAscension: 4 });
  });
});
