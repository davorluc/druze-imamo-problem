import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game } from '../server/engine.js';
import { Playtest, PlaytestStore } from '../server/playtest.js';
import { MISSIONS } from '../shared/content.js';
import { formatPlaytestReport } from '../shared/playtest-report.js';

function fixture(count = 4) {
  let time = 10000;
  const game = new Game('TEST', { now: () => time });
  for (let i = 0; i < count; i++) game.join(`Player ${i + 1}`).ready = true;
  game.start(); time += 30000; game.tick();
  game.players.forEach((p, i) => game.plan(p.id, { route: i === 0 ? 'river' : 'ridge', gear: game.gearPool[i].id, lock: true }));
  return { game, move: ms => { time += ms; game.tick(); } };
}

test('playtest metrics capture exact timing, attempts, outcomes, connections and safe loadouts', () => {
  const { game, move } = fixture();
  const spec = MISSIONS[0].obstacles.find(o => o.type === 'radio');
  game.createEvent(spec); const e = game.event;
  move(500);
  assert.throws(() => game.act(e.operator, { eventId: e.id, value: -1 }), /Incorrect/);
  move(1000);
  game.act(e.operator, { eventId: e.id, value: e.target });
  game.disconnect(game.players[0].id); move(2000); game.join(null, game.players[0].token);
  const report = game.playtest.report();
  assert.equal(report.summary.successes, 1);
  assert.equal(report.summary.incorrectAnswers, 1);
  assert.equal(report.encounters[0].firstActionMs, 500);
  assert.equal(report.encounters[0].resolutionMs, 1500);
  assert.equal(report.encounters[0].submissions, 2);
  assert.equal(report.encounters[0].cause, 'completed');
  assert.equal(report.players[0].disconnectedMs, 2000);
  assert.equal(report.players[0].disconnects, 1);
  assert.equal(report.players[0].rejoins, 1);
  assert.equal(report.phases.find(p => p.phase === 'BRIEFING').durationMs, 30000);
  assert.equal(report.loadouts.length, 4);
  assert.ok(report.loadouts.every(p => !p.automatic));
  const json = JSON.stringify(report);
  for (const p of game.players) {
    assert.ok(!json.includes(p.token));
    for (const clue of p.clues) assert.ok(!json.includes(clue));
  }
  assert.ok(!json.includes(game.hostToken));
  function checkKeys(object) {
    if (!object || typeof object !== 'object') return;
    for (const [key, value] of Object.entries(object)) {
      assert.ok(!['token', 'hostToken', 'clues', 'pin', 'target', 'value', 'warning'].includes(key), key);
      checkKeys(value);
    }
  }
  checkKeys(report);
  assert.equal(game.snapshot().playtest, undefined);
  assert.match(formatPlaytestReport(report), /\| Mission \| Phase \| Duration/);
});

test('timeouts, missing gear, route avoidance, auto-drafting and holds are distinct evidence', () => {
  const { game, move } = fixture();
  const radio = MISSIONS[0].obstacles.find(o => o.type === 'radio');
  game.createEvent(radio); move(14001);
  assert.equal(game.playtest.report().encounters[0].cause, 'timeout');
  game.createEvent({ ...radio, id: 'absent', gear: 'medkit' });
  assert.equal(game.playtest.report().encounters[1].cause, 'missing_gear');
  game.createEvent({ ...radio, id: 'empty', route: 'road' });
  assert.equal(game.playtest.report().summary.avoided, 1);
  const hold = MISSIONS[0].obstacles.find(o => o.type === 'hold');
  game.createEvent({ ...hold, id: 'hold-test', route: 'ridge' });
  const e = game.event;
  e.participants.forEach(id => game.act(id, { kind: 'hold', eventId: e.id, down: true }));
  move(3001);
  const result = game.playtest.report().encounters.at(-1);
  assert.equal(result.outcome, 'success'); assert.equal(result.firstActionMs, 0);
  assert.equal(result.submissions, 0);
  const auto = new Game('AUTO');
  for (let i = 0; i < 4; i++) auto.join(`Player ${i}`).ready = true;
  auto.start(); auto.enter('DAY_PLANNING'); auto.enter('NIGHT_ACTION');
  assert.equal(auto.playtest.report().loadouts.filter(p => p.automatic).length, 4);
});

test('retention bounds are explicit; incomplete and completed sessions are not conflated', () => {
  let time = 1000;
  const written = [];
  const log = new Playtest({ code: 'TEST', speed: 0.2, now: () => time, maxEvents: 3, onRecord: (_id, event) => written.push(event) });
  log.record('phase_entered', { missionIndex: 0, phase: 'LOBBY' });
  time += 100;
  log.record('phase_entered', { missionIndex: 0, phase: 'BRIEFING' });
  time += 500;
  log.record('session_closed', { reason: 'server_shutdown' });
  time += 5000; log.record('observer_note', { text: 'over limit' });
  const report = log.report();
  assert.equal(report.status, 'interrupted');
  assert.equal(report.gameplayDurationMs, 500);
  assert.equal(report.retention.dropped, 1);
  assert.equal(report.events.length, 3);
  assert.equal(written.length, 4); // Disk sink continues beyond the memory cap.
  assert.equal(written.at(-1).seq, 4);
  const complete = new Playtest({ code: 'DONE', speed: 1, now: () => time });
  complete.record('mission_finished', { missionIndex: 1, result: { score: 100, success: true } });
  const before = complete.report().durationMs;
  time += 10000;
  assert.equal(complete.report().status, 'completed');
  assert.equal(complete.report().durationMs, before);
});

test('persistent JSONL is ordered, JSON/Markdown survive reload, disk errors do not throw', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'druze-playtest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new PlaytestStore(directory);
  const game = new Game('DISK', { onRecord: (id, event) => { store.record(id, event); } });
  game.join('Tester'); game.record('observer_note', { text: 'UI confusion | button' });
  const report = game.playtest.report(store.status());
  await store.save(report); await store.flush();
  const file = join(directory, game.playtest.id);
  const entries = (await readFile(`${file}.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(entries.map(e => e.seq), [1, 2, 3, 4]);
  assert.deepEqual(JSON.parse(await readFile(`${file}.json`, 'utf8')), report);
  assert.match(await readFile(`${file}.md`, 'utf8'), /UI confusion \\\| button/);
  await writeFile(join(directory, 'not-a-directory'), 'blocked');
  const blocked = new PlaytestStore(join(directory, 'not-a-directory'));
  await blocked.record('test', { type: 'test' }); await blocked.flush();
  assert.ok(blocked.status().error);
  assert.equal(game.playtest.report(blocked.status()).summary.players, 1);
  await rm(join(directory, 'not-a-directory'));
  assert.equal(await blocked.save(report), true); // A failed write does not poison the queue.
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'not-a-directory', `${report.sessionId}.json`), 'utf8')), report);
});
