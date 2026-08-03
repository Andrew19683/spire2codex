import { CharacterId, Run } from "./types";

export type Character = { id: CharacterId; name: string; initials: string; sigil: string; color: string; order: number; available: boolean; portrait?: string };

export const characters: Character[] = [
  {id:"ironclad",name:"Ironclad",initials:"IC",sigil:"◆",color:"#ba4538",order:1,available:true},
  {id:"silent",name:"Silent",initials:"SL",sigil:"◒",color:"#4b8b62",order:2,available:true},
  {id:"regent",name:"Regent",initials:"RG",sigil:"✦",color:"#d0a04b",order:3,available:true},
  {id:"necrobinder",name:"Necrobinder",initials:"NB",sigil:"☽",color:"#7661a8",order:4,available:true},
  {id:"defect",name:"Defect",initials:"DF",sigil:"◎",color:"#4b82a8",order:5,available:true},
];
export function createRun(characterId:CharacterId, now=new Date()):Run { return {id:crypto.randomUUID(),characterId,status:"active",currentAscension:1,completedAscensions:0,startedAt:now.toISOString()}; }
export function winAscension(run:Run, now=new Date()):Run { if(run.status!=="active") return run; const done=run.currentAscension; return done===10?{...run,status:"completed",completedAscensions:10,finishedAt:now.toISOString()}:{...run,completedAscensions:done,currentAscension:done+1}; }
export function loseRun(run:Run, now=new Date()):Run { return {...run,status:"lost",finishedAt:now.toISOString()}; }
export type Stat={characterId:CharacterId;runs:number;average:number;wins:number};
export function calculateStats(runs:Run[]):Stat[]{ return characters.map((c,index)=>{const own=runs.filter(r=>r.characterId===c.id);return {characterId:c.id,runs:own.length,average:own.length?own.reduce((s,r)=>s+r.completedAscensions,0)/own.length:0,wins:own.filter(r=>r.status==="completed").length,index};}).sort((a,b)=>b.wins-a.wins||b.average-a.average||a.index-b.index).map(item=>({characterId:item.characterId,runs:item.runs,average:item.average,wins:item.wins})); }
