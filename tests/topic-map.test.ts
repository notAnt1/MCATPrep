import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topicMap,compareTopics} from '../src/lib/topic-map';
import type {Attempt} from '../src/lib/types';
const attempt=(topic:string,correct:boolean,extra:Partial<Attempt>={}):Attempt=>({session_id:'s',question_id:'q',topic,section:'C/P',skill:'Foundational application',mode:'training',correct,active_ms:10000,target_seconds:60,hints_used:0,repeated:false,timing_valid:true,created_at:'2026-10-09T12:00:00Z',selected:0,points:0,question_version:1,...extra});
test('topic map groups catalog and new topics while ranking established weaknesses before early misses',()=>{
 const attempts=[...Array.from({length:5},(_,i)=>attempt('Established weakness',i===0)),attempt('Early miss',false),attempt('Assisted',false,{hints_used:1}),attempt('Unknown topic',false,{section:'new-section'})];
 const map=topicMap(attempts);
 assert.equal(map.find(t=>t.topic==='Electric circuits and power')!.section,'C/P');
 assert.equal(map.find(t=>t.topic==='Unknown topic')!.section,'Other');
 assert.equal(map.find(t=>t.topic==='Assisted')!.accuracy,null);
 assert.equal(map.find(t=>t.topic==='Early miss')!.priority,false);
 assert.equal(map.filter(t=>t.priority).length,1);
 assert.equal([...map].sort(compareTopics)[0].topic,'Established weakness');
 const updated=topicMap([...attempts,...Array.from({length:4},()=>attempt('Early miss',false))]);
 assert.equal(updated.find(t=>t.topic==='Early miss')!.priority,true);
 assert.equal(updated.sort(compareTopics)[0].topic,'Early miss');
});
test('session map stays scoped and topics spanning sections are not assigned arbitrarily',()=>{
 const map=topicMap([attempt('Shared topic',true),attempt('Shared topic',false,{section:'B/B'})],true);
 assert.equal(map.length,1);assert.equal(map[0].section,'Cross-section');assert.equal(map[0].accuracy,50);
});
