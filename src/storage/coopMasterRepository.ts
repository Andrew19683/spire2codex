import { CoopMasterAttempt, CoopMasterGroup, CoopMasterHistory } from "@/domain/coopMasterRotation";
import { CharacterId, MasterRotationMode } from "@/domain/types";
import { SupabaseClient } from "@supabase/supabase-js";

type Row = { id:string;name:string;owner_id:string;initialized:boolean;mode:MasterRotationMode;current_ascension:number;max_ascension:number;fairies:number;completed_a10_once:boolean;active_attempt:CoopMasterAttempt|null;history:CoopMasterHistory[];updated_at:string;coop_master_group_members:{user_id:string;status:"pending"|"accepted";profiles:{username:string}|{username:string}[]}[] };
const map=(row:Row):CoopMasterGroup=>({id:row.id,name:row.name,ownerId:row.owner_id,initialized:row.initialized,mode:row.mode,currentAscension:row.current_ascension,maxAscension:row.max_ascension,fairies:row.fairies,completedA10Once:row.completed_a10_once,activeAttempt:row.active_attempt,history:row.history??[],updatedAt:row.updated_at,members:row.coop_master_group_members.map(member=>({userId:member.user_id,status:member.status,username:(Array.isArray(member.profiles)?member.profiles[0]:member.profiles)?.username??"Unknown"}))});

export class CoopMasterRepository {
  constructor(private client:SupabaseClient,private userId:string){}
  async profiles(){const {data,error}=await this.client.from("profiles").select("id, username").neq("id",this.userId).order("username");if(error)throw error;return data as {id:string;username:string}[]}
  async groups(){const {data:memberships,error:membershipError}=await this.client.from("coop_master_group_members").select("group_id").eq("user_id",this.userId).neq("status","declined");if(membershipError)throw membershipError;const ids=memberships.map(item=>item.group_id);if(!ids.length)return [];const {data,error}=await this.client.from("coop_master_groups").select("*, coop_master_group_members(user_id, status, profiles!coop_master_group_members_user_id_fkey(username))").in("id",ids).order("created_at");if(error)throw error;return (data as unknown as Row[]).map(map)}
  async create(name:string,invitedIds:string[]){const {error}=await this.client.rpc("create_coop_master_group",{group_name:name,invited_user_ids:invitedIds});if(error)throw error}
  async answer(groupId:string,accept:boolean){const {error}=await this.client.from("coop_master_group_members").update({status:accept?"accepted":"declined",responded_at:new Date().toISOString()}).eq("group_id",groupId).eq("user_id",this.userId).eq("status","pending");if(error)throw error}
  async remove(groupId:string){const {error}=await this.client.from("coop_master_groups").delete().eq("id",groupId);if(error)throw error}
  async initialize(groupId:string,mode:MasterRotationMode,expectedUpdatedAt:string){const {error}=await this.client.rpc("initialize_coop_master",{target_group_id:groupId,chosen_mode:mode,expected_updated_at:expectedUpdatedAt});if(error)throw error}
  async start(groupId:string,assignments:Record<string,CharacterId>,expectedUpdatedAt:string){const {error}=await this.client.rpc("start_coop_master_run",{target_group_id:groupId,chosen_assignments:assignments,expected_updated_at:expectedUpdatedAt});if(error)throw error}
  async finish(groupId:string,result:"win"|"lose",useFairy:boolean,expectedUpdatedAt:string){const {error}=await this.client.rpc("advance_coop_master_run",{target_group_id:groupId,run_result:result,use_fairy:useFairy,expected_updated_at:expectedUpdatedAt});if(error)throw error}
  async enableMaster(groupId:string,expectedUpdatedAt:string){return this.initialize(groupId,"master",expectedUpdatedAt)}
}
