import {describe,expect,it} from "vitest";
import {enableMasterMode,initializeMasterRotation,loseMasterCharacter,startMasterCharacter,winMasterCharacter} from "./masterRotation";
import {CharacterId} from "./types";

const ids:CharacterId[]=["ironclad","silent","regent","necrobinder","defect"];
describe("master rotation",()=>{
  it("completes a rotation, raises ascension and awards a fairy",()=>{let data=initializeMasterRotation("normal");for(const id of ids){data=startMasterCharacter(data,id);data=winMasterCharacter(data);}expect(data.currentAscension).toBe(2);expect(data.fairies).toBe(1);expect(data.history[0].successful).toBe(true)});
  it("resets progress and lowers ascension after a loss",()=>{let data={...initializeMasterRotation("normal"),currentAscension:4,maxAscension:4};data=startMasterCharacter(data,"ironclad");data=winMasterCharacter(data);data=startMasterCharacter(data,"silent");data=loseMasterCharacter(data,false);expect(data.currentAscension).toBe(3);expect(data.activeAttempt).toBeNull();expect(data.history[0].completedCharacters).toEqual(["ironclad"])});
  it("spends a fairy to preserve ascension",()=>{let data={...initializeMasterRotation("normal"),currentAscension:4,maxAscension:4,fairies:1};data=startMasterCharacter(data,"silent");data=loseMasterCharacter(data,true);expect(data.currentAscension).toBe(4);expect(data.fairies).toBe(0);expect(data.history[0].fairyUsed).toBe(true)});
  it("keeps master mode at A10",()=>{let data=enableMasterMode(initializeMasterRotation("normal"));for(const id of ids){data=startMasterCharacter(data,id);data=winMasterCharacter(data);}expect(data.currentAscension).toBe(10);expect(data.completedA10Once).toBe(true)});
});
