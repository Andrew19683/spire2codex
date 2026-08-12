import {beforeAll,describe,expect,it} from "vitest";
import {calculateStats,loseRun,replaceCharacters,winAscension} from "./ladder";
import {Run} from "./types";
import {testCharacters} from "./testCharacters";
beforeAll(()=>replaceCharacters(testCharacters));
const base:Run={id:"1",characterId:"ironclad",status:"active",currentAscension:1,completedAscensions:0,startedAt:"2026-01-01T00:00:00Z"};
describe("ladder",()=>{
 it("moves through ascensions and completes A10",()=>{let run=base;for(let i=0;i<10;i++)run=winAscension(run,new Date("2026-01-02"));expect(run.status).toBe("completed");expect(run.completedAscensions).toBe(10)});
 it("records a loss without adding current ascension",()=>{const run=loseRun({...base,currentAscension:5,completedAscensions:4});expect(run.completedAscensions).toBe(4);expect(run.status).toBe("lost")});
 it("sorts by wins then average then game order",()=>{const runs:Run[]=[{...base,id:"2",characterId:"silent",status:"lost",completedAscensions:7},{...base,id:"3",characterId:"ironclad",status:"lost",completedAscensions:3}];const stats=calculateStats(runs);expect(stats[0].characterId).toBe("silent");expect(stats[1].characterId).toBe("ironclad")});
 it("includes a catalog character without changing domain code",()=>{replaceCharacters([...testCharacters,{...testCharacters[0],id:"new_hero",name:"New Hero",order:6}]);expect(calculateStats([]).map(item=>item.characterId)).toContain("new_hero")});
});
