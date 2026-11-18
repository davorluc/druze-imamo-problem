import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/engine.js';
import { MISSIONS } from '../shared/content.js';
function setup() {
  let now=10000; const game=new Game('TEST',{now:()=>now});
  for(let i=0;i<4;i++) game.join(`Player ${i}`).ready=true;
  game.start();game.advance();
  game.players.forEach((p,i)=>game.plan(p.id,{route:'road',gear:game.gearPool[i].id,lock:true}));
  game.eventsDone=MISSIONS[0].obstacles.map(o=>o.id);
  return {game,setNow:n=>{now=n;game.tick();}};
}
test('an unused flare can substitute for absent equipment',()=>{
  const {game}=setup();
  const sniper=game.players.find(p=>p.gear==='sniper_rifle'); sniper.gear='flare_gun';
  game.players[0].route='river';
  game.createEvent(MISSIONS[0].obstacles.find(o=>o.type==='sniper'));
  assert.ok(game.event,'flare holder must get an obstacle window');
  assert.equal(game.snapshot(sniper.id).me.assignment.role,'support');
  game.act(sniper.id,{kind:'flare',eventId:game.event.id});
  assert.equal(game.event,null);assert.equal(game.alert,0);
});
test('a hold completed after expiry cannot succeed on the next server tick',()=>{
  const {game,setNow}=setup();
  game.createEvent(MISSIONS[0].obstacles.find(o=>o.type==='hold'));
  const e=game.event;
  setNow(e.deadline-2900);
  e.participants.forEach(id=>game.act(id,{kind:'hold',eventId:e.id,down:true}));
  setNow(e.deadline+100);
  assert.equal(game.event,null);assert.ok(game.alert>0);
});
test('garrison satchel route constraint matches the priority-one intel',()=>{
  const {game}=setup();game.createEvent(MISSIONS[0].obstacles.at(-1));
  assert.equal(game.event,null);assert.match(game.log[0].text,/riverbed/);
});
