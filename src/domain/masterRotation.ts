import { allCharacters, characters } from "./ladder";
import { CharacterId, MasterRotationAttempt, MasterRotationData, MasterRotationHistory, MasterRotationMode } from "./types";

export const emptyMasterRotation = (): MasterRotationData => ({
  initialized:false, mode:"normal", currentAscension:1, maxAscension:1, fairies:0,
  activeAttempt:null, history:[], completedA10Once:false,
});

export function initializeMasterRotation(mode:MasterRotationMode):MasterRotationData {
  const ascension=mode==="master"?10:1;
  return {...emptyMasterRotation(),initialized:true,mode,currentAscension:ascension,maxAscension:ascension};
}

export function enableMasterMode(data:MasterRotationData):MasterRotationData {
  if(data.activeAttempt) return data;
  return {...data,initialized:true,mode:"master",currentAscension:10,maxAscension:10};
}

export function startMasterCharacter(data:MasterRotationData, characterId:CharacterId, now=new Date()):MasterRotationData {
  const used=data.activeAttempt?.completedCharacters??[];
  if(data.activeAttempt?.activeCharacter || used.includes(characterId)) return data;
  const attempt:MasterRotationAttempt=data.activeAttempt??{id:crypto.randomUUID(),ascension:data.currentAscension,completedCharacters:[],activeCharacter:null,startedAt:now.toISOString()};
  return {...data,activeAttempt:{...attempt,activeCharacter:characterId}};
}

export function winMasterCharacter(data:MasterRotationData, now=new Date()):MasterRotationData {
  const attempt=data.activeAttempt;
  if(!attempt?.activeCharacter) return data;
  const completed=[...attempt.completedCharacters,attempt.activeCharacter];
  if(completed.length<characters.length) return {...data,activeAttempt:{...attempt,completedCharacters:completed,activeCharacter:null}};
  const successfulA10=attempt.ascension===10;
  const nextAscension=data.mode==="master"?10:Math.min(10,attempt.ascension+1);
  const record:MasterRotationHistory={id:attempt.id,ascension:attempt.ascension,completedCharacters:completed,lostCharacter:null,fairyUsed:false,successful:true,startedAt:attempt.startedAt,finishedAt:now.toISOString()};
  return {...data,currentAscension:nextAscension,maxAscension:Math.max(data.maxAscension,nextAscension),fairies:data.fairies+1,activeAttempt:null,history:[record,...data.history],completedA10Once:data.completedA10Once||successfulA10};
}

export function loseMasterCharacter(data:MasterRotationData, useFairy:boolean, now=new Date()):MasterRotationData {
  const attempt=data.activeAttempt;
  if(!attempt?.activeCharacter) return data;
  const fairyUsed=useFairy&&data.fairies>0;
  const record:MasterRotationHistory={id:attempt.id,ascension:attempt.ascension,completedCharacters:attempt.completedCharacters,lostCharacter:attempt.activeCharacter,fairyUsed,successful:false,startedAt:attempt.startedAt,finishedAt:now.toISOString()};
  const nextAscension=data.mode==="master"||fairyUsed?data.currentAscension:Math.max(1,data.currentAscension-1);
  return {...data,currentAscension:nextAscension,fairies:data.fairies-(fairyUsed?1:0),activeAttempt:null,history:[record,...data.history]};
}

export function masterRotationStats(data:MasterRotationData){
  const attempts=data.history.length;
  const successfulA10=data.history.filter(item=>item.successful&&item.ascension===10).length;
  let a10Streak=0;
  for(const item of data.history){if(item.ascension!==10) continue;if(!item.successful) break;a10Streak++;}
  const failed=data.history.filter(item=>!item.successful);
  const averageProgress=failed.length?failed.reduce((sum,item)=>sum+item.completedCharacters.length,0)/failed.length:0;
  const characterStats=allCharacters.map(character=>{
    const records=data.history.filter(item=>item.completedCharacters.includes(character.id)||item.lostCharacter===character.id);
    const wins=records.filter(item=>item.completedCharacters.includes(character.id)).length;
    const maxAscension=records.reduce((max,item)=>Math.max(max,item.ascension),0);
    return {characterId:character.id,attempts:records.length,wins,winRate:records.length?wins/records.length:0,maxAscension,order:character.order};
  }).sort((a,b)=>b.maxAscension-a.maxAscension||b.winRate-a.winRate||a.order-b.order);
  const played=characterStats.filter(item=>item.attempts>0);
  const best=[...played].sort((a,b)=>b.winRate-a.winRate||a.order-b.order)[0]??null;
  const hardest=[...played].sort((a,b)=>a.winRate-b.winRate||a.order-b.order)[0]??null;
  return {attempts,successfulA10,a10Streak,averageProgress,characterStats,best,hardest,mastered:data.history.filter(item=>item.successful).length};
}
