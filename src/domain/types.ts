export type CharacterId = "ironclad" | "silent" | "regent" | "necrobinder" | "defect";
export type RunStatus = "active" | "lost" | "completed";
export type Run = { id:string; characterId:CharacterId; status:RunStatus; currentAscension:number; completedAscensions:number; startedAt:string; finishedAt?:string };
export type Preferences = { interfaceLocale:"ru"|"en"; contentLocale:"en"|"ru" };
export type UserData = { activeRun:Run|null; history:Run[]; preferences:Preferences };
