export type CharacterId = "ironclad" | "silent" | "regent" | "necrobinder" | "defect";
export type RunStatus = "active" | "lost" | "completed";
export type Run = { id:string; characterId:CharacterId; status:RunStatus; currentAscension:number; completedAscensions:number; startedAt:string; finishedAt?:string };
export type Preferences = { interfaceLocale:"ru"|"en"; contentLocale:"en"|"ru" };
export type MasterRotationMode = "normal" | "master";
export type MasterRotationAttempt = {
  id:string;
  ascension:number;
  completedCharacters:CharacterId[];
  activeCharacter:CharacterId|null;
  startedAt:string;
};
export type MasterRotationHistory = {
  id:string;
  ascension:number;
  completedCharacters:CharacterId[];
  lostCharacter:CharacterId|null;
  fairyUsed:boolean;
  successful:boolean;
  startedAt:string;
  finishedAt:string;
};
export type MasterRotationData = {
  initialized:boolean;
  mode:MasterRotationMode;
  currentAscension:number;
  maxAscension:number;
  fairies:number;
  activeAttempt:MasterRotationAttempt|null;
  history:MasterRotationHistory[];
  completedA10Once:boolean;
};
export type UserData = { activeRun:Run|null; history:Run[]; preferences:Preferences; masterRotation:MasterRotationData };
