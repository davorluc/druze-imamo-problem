import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/engine.js';
import { MISSIONS } from '../shared/content.js';

function squad(count = 4, speed = 1) {
  let now = 10000;
  const game = new Game('TEST', { speed, now: () => now });
  for (let i = 0; i < count; i++) game.join(`Comrade ${i + 1}`).ready = true;
  return { game, advance: ms => { now += ms; game.tick(); } };
}
function loadout(game) {
  game.players.forEach((p, i) => game.plan(p.id, { route: i === 0 ? 'river' : i === 1 ? 'road' : 'ridge', gear: game.gearPool[i].id, lock: true }));
}
function solve(game, advance) {
  const e = game.event;
  if (!e) return;
  if (e.participants.length) {
    e.participants.forEach(id => game.act(id, { kind: 'hold', down: true, eventId: e.id }));
    advance(3001 * game.speed);
    if (!game.event) return;
  }
  const data = { kind: 'submit', eventId: e.id, pin: e.pin };
  if (e.spec.type === 'sniper') Object.assign(data, e.target);
  else data.value = e.spec.type === 'interrupt' ? e.warning : e.target;
  game.act(e.operator, data);
}

for (const n of [4, 5, 6]) {
  test(`${n} players: balanced private intel and complete winning two-mission campaign`, () => {
    const { game, advance } = squad(n);
    game.start();
    assert.equal(game.phase, 'BRIEFING');
    assert.ok(game.players.every(p => p.clues.length === (n === 4 ? 3 : 2)));
    assert.equal(new Set(game.players.flatMap(p => p.clues)).size, n === 5 ? 10 : 12);
    for (let mission = 0; mission < 2; mission++) {
      advance(30000);
      assert.equal(game.phase, 'DAY_PLANNING');
      loadout(game);
      assert.equal(game.phase, 'NIGHT_ACTION');
      let elapsed = 0;
      for (const spec of MISSIONS[mission].obstacles) {
        const delta = spec.at * 1000 - elapsed;
        advance(delta);
        elapsed += delta;
        assert.equal(game.event.spec.id, spec.id);
        if (n >= 5 && ['wire', 'radio', 'sniper'].includes(spec.type)) {
          assert.ok(game.event.verifier);
          assert.equal(game.event.participants.length, 1);
        }
        const usesHold = game.event.participants.length > 0;
        solve(game, advance);
        if (usesHold) elapsed += 3001;
        assert.equal(game.event, null);
      }
      advance(150000 - elapsed);
      assert.equal(game.phase, 'DEBRIEF');
      assert.equal(game.results[mission].success, true);
      assert.equal(game.results[mission].wounded, 0);
      assert.equal(game.results[mission].alert, 0);
      if (mission === 0) { advance(45000); assert.equal(game.missionIndex, 1); }
    }
    assert.equal(game.deadline, null);
    advance(10000000);
    assert.equal(game.phase, 'DEBRIEF');
  });
}

test('cannot start early, share gear, change locked plan, or bypass active state', () => {
  const { game } = squad(4);
  game.players[0].ready = false;
  assert.throws(() => game.start(), /ready/);
  game.players[0].ready = true;
  game.start(); game.advance();
  const [a,b] = game.players;
  game.plan(a.id, { route: 'river', gear: 'satchel_charge', lock: true });
  assert.throws(() => game.plan(b.id, { route: 'road', gear: 'satchel_charge', lock: true }), /taken/);
  assert.throws(() => game.plan(a.id, { route: 'ridge', gear: 'captured_radio' }), /locked/);
  assert.throws(() => game.act(a.id, {}), /No active/);
});

test('public snapshots do not expose intel, tokens, randomized answers or authentication codes', () => {
  const { game } = squad(6);
  game.start(); game.advance(); loadout(game);
  game.createEvent(MISSIONS[0].obstacles[0]);
  const host = game.snapshot();
  assert.equal(host.me, null);
  assert.equal(host.mission.clues, undefined);
  assert.equal(host.mission.obstacles, undefined);
  assert.ok(host.players.every(p => p.clues === undefined && p.token === undefined));
  assert.equal(host.event.target, undefined);
  assert.equal(host.event.pin, undefined);
  assert.equal(host.hostToken, undefined);
  const operator = game.snapshot(game.event.operator);
  assert.ok(!operator.me.assignment.instruction.includes('MHz'));
  assert.equal(operator.me.token, undefined);
  const reader = game.snapshot(game.event.reader);
  assert.match(reader.me.assignment.instruction, /MHz/);
  assert.equal(reader.me.clues.length, 2);
});

test('holds require every participant simultaneously; release and disconnect reset progress', () => {
  const { game, advance } = squad();
  game.start(); game.advance();
  game.players.forEach((p,i) => game.plan(p.id, { route: 'road', gear: game.gearPool[i].id, lock: true }));
  const spec = MISSIONS[0].obstacles.find(o => o.type === 'hold');
  game.eventsDone = MISSIONS[0].obstacles.filter(o => o.id !== spec.id).map(o => o.id);
  game.createEvent(spec);
  const e = game.event;
  const hold = (id,down) => game.act(id,{kind:'hold',down,eventId:e.id});
  e.participants.slice(0,3).forEach(id=>hold(id,true));
  advance(3100); assert.ok(game.event);
  hold(e.participants[3],true); advance(1000);
  hold(e.participants[0],false); advance(2100); assert.ok(game.event);
  hold(e.participants[0],true); game.disconnect(e.participants[1]);
  advance(3100); assert.ok(game.event);
  game.join('',game.players[1].token); hold(e.participants[1],true);
  advance(3001); assert.equal(game.event,null);
});

test('failures cause wounds and alert, flare is single-use, medic heals once', () => {
  const { game } = squad(6);
  game.start(); game.advance(); loadout(game);
  const spec = MISSIONS[0].obstacles[0];
  game.createEvent(spec); game.resolveEvent(false);
  assert.equal(game.alert,15); assert.equal(game.players.filter(p=>p.wounded).length,1);
  const medic = game.players.find(p=>p.gear==='medkit');
  const wounded = game.players.find(p=>p.wounded);
  game.act(medic.id,{kind:'medkit',target:wounded.id});
  assert.equal(wounded.wounded,false);
  assert.throws(()=>game.act(medic.id,{kind:'medkit',target:wounded.id}),/remaining/);
  const flare = game.players.find(p=>p.gear==='flare_gun');
  game.createEvent(spec); game.act(flare.id,{kind:'flare',eventId:game.event.id});
  assert.equal(game.event,null); assert.equal(flare.used,true);
  game.createEvent(spec);
  assert.throws(()=>game.act(flare.id,{kind:'flare',eventId:game.event.id}),/unavailable/);
});

test('day timeout drafts unique gear; night timeout resolves failure and prep penalty carries over', () => {
  const { game, advance } = squad(5);
  game.start(); advance(30000); advance(180000);
  assert.equal(game.phase,'NIGHT_ACTION');
  assert.equal(new Set(game.players.map(p=>p.gear)).size,5);
  for (let i=0;i<150;i++) advance(1000);
  assert.equal(game.phase,'DEBRIEF'); assert.equal(game.results[0].success,false);
  advance(45000); assert.equal(game.phase,'BRIEFING'); assert.equal(game.alert,25);
});

test('wrong answers incur alert and three failures close a panel; stale actions are rejected', () => {
  const { game } = squad(); game.start(); game.advance(); loadout(game);
  game.createEvent(MISSIONS[0].obstacles[0]);
  const e=game.event;
  assert.throws(()=>game.act(e.reader,{kind:'submit',eventId:e.id,value:e.target}),/assigned operator/);
  for(let i=0;i<2;i++) assert.throws(()=>game.act(e.operator,{kind:'submit',eventId:e.id,value:-1}),/attempts left/);
  game.act(e.operator,{kind:'submit',eventId:e.id,value:-1});
  assert.equal(game.event,null); assert.equal(game.alert,30);
  assert.throws(()=>game.act(e.operator,{kind:'submit',eventId:e.id,value:e.target}),/already ended/);
});

test('riverbed placement is mandatory for the viaduct objective; absent gear fails explicitly', () => {
  const { game }=squad(); game.start();game.advance();loadout(game);
  game.players.find(p=>p.gear==='captured_radio').gear=null;
  game.createEvent(MISSIONS[0].obstacles[0]);
  assert.equal(game.event,null); assert.match(game.log[0].text,/left behind/);
  game.missionIndex=1; game.players.find(p=>p.gear==='satchel_charge').route='road';
  game.createEvent(MISSIONS[1].obstacles.at(-1));
  assert.equal(game.event,null);assert.match(game.log[0].text,/riverbed/);
});

test('basic token rejoin preserves identity and slot, but new players cannot enter mid-round', () => {
  const {game}=squad(); const p=game.players[0];
  game.disconnect(p.id); assert.equal(p.connected,false);
  assert.equal(game.join('ignored',p.token).id,p.id);
  assert.equal(game.players.length,4);assert.equal(p.connected,true);
  game.start(); assert.throws(()=>game.join('Intruder'),/already started/);
  assert.equal(game.join('',p.token).id,p.id);
});

test('quick drill scales phase timers, obstacles and synchronized holds consistently', () => {
  const {game,advance}=squad(6,.2);game.start();advance(6000);loadout(game);advance(2000);
  assert.equal(game.event.spec.id,'radio');solve(game,advance);assert.equal(game.event,null);
  assert.equal(game.alert,0);
});
