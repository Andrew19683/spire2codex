import { CoopGroup, CoopRun } from "@/domain/coopLadder";
import { CharacterId } from "@/domain/types";
import { SupabaseClient } from "@supabase/supabase-js";

type GroupRow = { id: string; name: string; owner_id: string; updated_at: string; coop_group_members: { user_id: string; status: "pending" | "accepted"; profiles: { username: string } | { username: string }[] }[]; coop_runs: { id: string; assignments: Record<string, CharacterId>; status: "active" | "lost" | "completed"; current_ascension: number; completed_ascensions: number; started_at: string; finished_at?: string; last_attempt_at: string | null }[] };

function mapGroup(row: GroupRow): CoopGroup {
  const runs: CoopRun[] = row.coop_runs.map((run) => ({ id: run.id, assignments: run.assignments, status: run.status, currentAscension: run.current_ascension, completedAscensions: run.completed_ascensions, startedAt: run.started_at, finishedAt: run.finished_at, lastAttemptAt: run.last_attempt_at }));
  return { id: row.id, name: row.name, ownerId: row.owner_id, updatedAt: row.updated_at, members: row.coop_group_members.map((member) => ({ userId: member.user_id, status: member.status, username: (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles)?.username ?? "Unknown" })), activeRun: runs.find((run) => run.status === "active") ?? null, history: runs.filter((run) => run.status !== "active").sort((a, b) => b.startedAt.localeCompare(a.startedAt)) };
}

export class CoopRepository {
  constructor(private client: SupabaseClient, private userId: string) {}
  async profiles() { const { data, error } = await this.client.from("profiles").select("id, username").neq("id", this.userId).order("username"); if (error) throw error; return data as { id: string; username: string }[]; }
  async groups() {
    const { data: memberships, error: membershipError } = await this.client.from("coop_group_members").select("group_id").eq("user_id", this.userId).neq("status", "declined");
    if (membershipError) throw membershipError;
    const ids = memberships.map((item) => item.group_id);
    if (!ids.length) return [];
    const { data, error } = await this.client.from("coop_groups").select("id, name, owner_id, updated_at, coop_group_members(user_id, status, profiles!coop_group_members_user_id_fkey(username)), coop_runs(id, assignments, status, current_ascension, completed_ascensions, started_at, finished_at, last_attempt_at)").in("id", ids).order("created_at");
    if (error) throw error;
    return (data as unknown as GroupRow[]).map(mapGroup);
  }
  async create(name: string, invitedIds: string[]) { const { error } = await this.client.rpc("create_coop_group", { group_name: name, invited_user_ids: invitedIds }); if (error) throw error; }
  async answer(groupId: string, accept: boolean) { const { error } = await this.client.from("coop_group_members").update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() }).eq("group_id", groupId).eq("user_id", this.userId).eq("status", "pending"); if (error) throw error; }
  async remove(groupId: string) { const { error } = await this.client.from("coop_groups").delete().eq("id", groupId); if (error) throw error; }
  async start(groupId: string, assignments: Record<string, CharacterId>, expectedUpdatedAt: string) { const { error } = await this.client.rpc("start_coop_run", { target_group_id: groupId, chosen_assignments: assignments, expected_updated_at: expectedUpdatedAt }); if (error) throw error; }
  async finish(groupId: string, runId: string, result: "win" | "lose", expectedUpdatedAt: string) { const { error } = await this.client.rpc("advance_coop_run", { target_group_id: groupId, target_run_id: runId, run_result: result, expected_updated_at: expectedUpdatedAt }); if (error) throw error; }
}
