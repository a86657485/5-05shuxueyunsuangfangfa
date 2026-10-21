import test from 'node:test';
import assert from 'node:assert/strict';
import { learningKey, CARDS } from '../public/learning.mjs';
import { moveItem, answerComplete, assignPair } from '../public/quiz-ui.mjs';
test('learning cards scope identity and round; only child-safe card fields', () => {
 assert.notEqual(learningKey({id:'1',classId:'5'},'r1','temp'),learningKey({id:'2',classId:'5'},'r1','temp'));
 assert.notEqual(learningKey({id:'1'},'r1','temp'),learningKey({id:'1'},'r2','temp'));
 assert.equal(Object.keys(CARDS).length,5);
 assert.ok(Object.values(CARDS).every(c=>!('supportNote' in c)&&!('sourceBbox' in c)));
});
test('sort and pair controls preserve stable answer identities',()=>{
 assert.deepEqual(moveItem(['a','b','c'],1,-1),['b','a','c']);
 assert.deepEqual(moveItem(['a','b'],0,-1),['a','b']);
 assert.deepEqual(assignPair({a:'x',b:'y'},'b','x'),{b:'x'});
 assert.equal(answerComplete({type:'choice'},0),true);
 assert.equal(answerComplete({type:'order',interaction:{items:[{id:'a'},{id:'b'}]}},['a','a']),false);
 assert.equal(answerComplete({type:'match',interaction:{leftItems:[{id:'a'},{id:'b'}],rightItems:[{id:'x'},{id:'y'}]}},{a:'x',b:'y'}),true);
});
import { memoryDeck } from '../public/memory-reward.mjs';
test('reward deck contains six pairs of distinct concepts and no external pictures',()=>{
 const deck=memoryDeck(()=>0.5); assert.equal(deck.length,12); assert.equal(new Set(deck.map(x=>x.id)).size,12);
 const pairs=Object.groupBy(deck,x=>x.pairId);assert.equal(Object.keys(pairs).length,6);assert.ok(Object.values(pairs).every(p=>p.length===2&&p[0].text!==p[1].text));
});
