import { Character, CharacterId, Run } from "./types";
import { characterPresentation } from "./characterPresentation";

export const characters: Character[] = [];
export const allCharacters: Character[] = [];
export function replaceCharacters(next: Character[]) {
  allCharacters.splice(0, allCharacters.length, ...next);
  characters.splice(0, characters.length, ...next.filter((item) => item.available));
}
export function characterById(id: CharacterId) {
  return allCharacters.find((item) => item.id === id) ?? { id, name: id, ...characterPresentation(id, id), order: Number.MAX_SAFE_INTEGER, available: false };
}
export function createRun(characterId:CharacterId, now=new Date()):Run { return {id:crypto.randomUUID(),characterId,status:"active",currentAscension:1,completedAscensions:0,startedAt:now.toISOString()}; }
export function winAscension(run:Run, now=new Date()):Run { if(run.status!=="active") return run; const done=run.currentAscension; return done===10?{...run,status:"completed",completedAscensions:10,finishedAt:now.toISOString()}:{...run,completedAscensions:done,currentAscension:done+1}; }
export function loseRun(run:Run, now=new Date()):Run { return {...run,status:"lost",finishedAt:now.toISOString()}; }
export type Stat={characterId:CharacterId;runs:number;average:number;wins:number};
export function calculateStats(runs:Run[]):Stat[]{ return allCharacters.map((c,index)=>{const own=runs.filter(r=>r.characterId===c.id);return {characterId:c.id,runs:own.length,average:own.length?own.reduce((s,r)=>s+r.completedAscensions,0)/own.length:0,wins:own.filter(r=>r.status==="completed").length,index};}).sort((a,b)=>b.wins-a.wins||b.average-a.average||a.index-b.index).map(item=>({characterId:item.characterId,runs:item.runs,average:item.average,wins:item.wins})); }
