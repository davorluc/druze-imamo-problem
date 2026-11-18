import { randomInt, randomUUID } from 'node:crypto';
import { MISSIONS, GEAR, PHASE_SECONDS, COLORS, PLAYER_COLORS } from '../shared/content.js';

const choose = (xs) => xs[randomInt(xs.length)];
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export class Game {
  constructor(code, { speed = 1, now = Date.now } = {}) {
    this.code = code;
    this.hostToken = randomUUID();
    this.speed = speed;
    this.now = now;
    this.phase = 'LOBBY';
    this.missionIndex = 0;
    this.players = [];
    this.results = [];
    this.alert = 0;
    this.event = null;
    this.eventsDone = [];
    this.log = [];
    this.updatedAt = now();
    this.hostConnected = false;
  }
  get mission() { return MISSIONS[this.missionIndex]; }
  get duration() { return PHASE_SECONDS[this.phase] * 1000 * this.speed; }
  get gearPool() { return GEAR.filter(g => g.id !== 'medkit' || this.players.length >= 5); }
  join(name, token) {
    const existing = this.players.find(p => p.token === token);
    if (existing) { existing.connected = true; return existing; }
    requireThat(this.phase === 'LOBBY', 'This operation has already started. Rejoin from your original browser.');
    requireThat(this.players.length < 6, 'This squad is full (6 comrades maximum).');
    requireThat(typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 18, 'Use a codename of 2–18 characters.');
    requireThat(!this.players.some(p => p.name.toLowerCase() === name.trim().toLowerCase()), 'That codename is already in use.');
    const player = { id: randomUUID(), token: randomUUID(), name: name.trim(), connected: true, ready: false, route: null, gear: null, locked: false, wounded: false, used: false, contributions: 0, clues: [], color: PLAYER_COLORS.find(color => !this.players.some(p => p.color === color)) };
    this.players.push(player);
    return player;
  }
  disconnect(id) {
    const p = this.players.find(p => p.id === id);
    if (p) { p.connected = false; if (this.event?.holds) delete this.event.holds[id]; }
  }
  remove(id) {
    requireThat(this.phase === 'LOBBY', 'The roster is locked during an operation.');
    this.players = this.players.filter(p => p.id !== id);
  }
  start() {
    requireThat(this.phase === 'LOBBY', 'The operation is already in progress.');
    requireThat(this.players.length >= 4 && this.players.length <= 6 && this.players.every(p => p.connected && p.ready), 'You need 4–6 connected, ready comrades.');
    this.enter('BRIEFING');
  }
  enter(phase) {
    this.phase = phase;
    this.startedAt = this.now();
    this.deadline = this.startedAt + this.duration;
    if (phase === 'BRIEFING') {
      this.alert = this.missionIndex && !this.results[0]?.success ? 25 : 0;
      this.event = null;
      this.eventsDone = [];
      this.log = [];
      const clueCount = this.players.length === 5 ? 10 : 12;
      this.players.forEach((p, i) => {
        p.route = null; p.gear = null; p.locked = false; p.wounded = false; p.used = false;
        p.clues = this.mission.clues.slice(0, clueCount).filter((_, j) => j % this.players.length === i);
      });
    }
    if (phase === 'NIGHT_ACTION') {
      for (const p of this.players) {
        p.route ||= this.mission.routes[this.players.indexOf(p) % 3].id;
        if (!p.gear) p.gear = this.gearPool.find(g => !this.players.some(other => other.gear === g.id))?.id;
        p.locked = true;
      }
      this.addLog('Nightfall. Keep your voices low and your phones close.');
    }
    if (phase === 'DEBRIEF') this.finishMission();
  }
  advance() {
    if (this.phase === 'BRIEFING') this.enter('DAY_PLANNING');
    else if (this.phase === 'DAY_PLANNING') this.enter('NIGHT_ACTION');
    else if (this.phase === 'NIGHT_ACTION') { if (this.event) this.resolveEvent(false); this.enter('DEBRIEF'); }
    else if (this.phase === 'DEBRIEF' && this.missionIndex === 0) { this.missionIndex = 1; this.enter('BRIEFING'); }
  }
  plan(id, { route, gear, lock }) {
    requireThat(this.phase === 'DAY_PLANNING', 'Planning is not open.');
    const p = this.players.find(p => p.id === id);
    requireThat(p && !p.locked, 'Your loadout is already locked.');
    requireThat(this.mission.routes.some(r => r.id === route), 'Choose a route.');
    requireThat(this.gearPool.some(g => g.id === gear), 'Choose a gear item.');
    requireThat(!this.players.some(other => other.id !== id && other.gear === gear), 'Another comrade has taken that item. Choose another.');
    p.route = route; p.gear = gear; p.locked = Boolean(lock);
    if (this.players.every(p => p.locked)) this.enter('NIGHT_ACTION');
  }
  tick() {
    const now = this.now();
    if (this.phase === 'LOBBY' || (this.phase === 'DEBRIEF' && this.missionIndex === 1)) return;
    if (this.phase === 'NIGHT_ACTION') {
      if (this.event) {
        const e = this.event;
        if (e.participants?.length && e.participants.every(id => e.holds[id] !== undefined && now - e.holds[id] >= 3000 * this.speed && e.holds[id] + 3000 * this.speed <= e.deadline)) {
          if (e.spec.type === 'hold') this.resolveEvent(true);
          else e.lookoutDone = true;
        }
        if (this.event && now >= this.event.deadline) this.resolveEvent(false);
      }
      const elapsed = (now - this.startedAt) / (1000 * this.speed);
      const next = this.mission.obstacles.find(o => !this.eventsDone.includes(o.id) && o.at <= elapsed);
      if (!this.event && next) this.createEvent(next);
    }
    if (now >= this.deadline) this.advance();
  }
  addLog(text) { this.log.unshift({ text, at: this.now() }); this.log = this.log.slice(0, 8); }
  createEvent(spec) {
    this.eventsDone.push(spec.id);
    if (spec.route && !this.players.some(p => p.route === spec.route)) { this.addLog(`${spec.title}: route clear. Obstacle avoided.`); return; }
    const operator = this.players.find(p => p.gear === spec.gear) || choose(this.players);
    const others = this.players.filter(p => p.id !== operator.id);
    const reader = choose(others);
    const extra = this.players.length >= 5 && ['radio', 'wire', 'sniper'].includes(spec.type);
    const verifier = extra ? others.find(p => p.id !== reader.id) : null;
    const lookout = extra ? others.find(p => p.id !== reader.id && p.id !== verifier.id) : null;
    const event = {
      id: randomUUID(), spec, operator: operator.id, reader: reader.id, verifier: verifier?.id,
      participants: spec.type === 'hold' ? this.players.filter(p => !spec.route || p.route === spec.route).map(p => p.id) : lookout ? [lookout.id] : [],
      holds: {}, lookoutDone: false, deadline: this.now() + 14000 * this.speed,
      missingGear: Boolean(spec.gear && !this.players.some(p => p.gear === spec.gear)),
      target: spec.type === 'wire' ? choose(COLORS) : spec.type === 'radio' ? randomInt(400, 501) : { x: randomInt(1, 10), y: randomInt(1, 10) },
      pin: String(randomInt(100, 1000)), attempts: 0,
      warning: choose(['NORTH', 'EAST', 'SOUTH', 'WEST']),
    };
    if (spec.type === 'interrupt') {
      event.reader = choose(this.players).id;
      event.operator = choose(this.players.filter(p => p.id !== event.reader)).id;
    }
    this.event = event;
    this.addLog(spec.title);
    if (event.missingGear && (spec.final || !this.players.some(p => p.gear === 'flare_gun' && !p.used))) this.resolveEvent(false, 'Required gear was left behind.');
    else if (spec.requiredRoute && operator.route !== spec.requiredRoute) this.resolveEvent(false, 'The charge carrier did not take the riverbed.');
  }
  act(id, data) {
    const p = this.players.find(p => p.id === id);
    requireThat(p && this.phase === 'NIGHT_ACTION', 'No active field operation.');
    if (data.kind === 'medkit') {
      requireThat(p.gear === 'medkit' && !p.used, 'No field treatment remaining.');
      const target = this.players.find(x => x.id === data.target && x.wounded);
      requireThat(target, 'Select a wounded comrade.');
      target.wounded = false; p.used = true; p.contributions++; this.addLog(`${p.name} treated ${target.name}.`); return;
    }
    const e = this.event;
    requireThat(e && data.eventId === e.id, 'That obstacle has already ended.');
    requireThat(this.now() < e.deadline, 'Too late. The obstacle window has closed.');
    if (data.kind === 'flare') {
      requireThat(p.gear === 'flare_gun' && !p.used && !e.spec.final, 'The flare is unavailable for this obstacle.');
      p.used = true; p.contributions++; this.alert = Math.max(0, this.alert - 5); this.resolveEvent(true, 'Emergency flare deployed.'); return;
    }
    if (data.kind === 'hold') {
      requireThat(e.participants.includes(id), 'You are not assigned to this hold.');
      if (data.down && !e.holds[id]) e.holds[id] = this.now();
      if (!data.down) delete e.holds[id];
      return;
    }
    requireThat(!e.missingGear, 'Required equipment is missing. Ask the flare carrier for an emergency bypass.');
    requireThat(id === e.operator, 'Relay your instructions to the assigned operator.');
    if (e.participants.length && e.spec.type !== 'hold') requireThat(e.lookoutDone, 'Wait for your lookout to hold cover for 3 seconds.');
    if (e.verifier) requireThat(String(data.pin) === e.pin, 'Verification code incorrect. Ask your second reader.');
    let correct = false;
    if (e.spec.type === 'wire') correct = data.value === e.target;
    if (e.spec.type === 'radio') correct = Number(data.value) === e.target;
    if (e.spec.type === 'sniper') correct = Number(data.x) === e.target.x && Number(data.y) === e.target.y;
    if (e.spec.type === 'interrupt') correct = data.value === e.warning;
    if (correct) {
      new Set([e.operator, e.reader, e.verifier, ...e.participants].filter(Boolean)).forEach(pid => this.players.find(p => p.id === pid).contributions++);
      this.resolveEvent(true);
    } else {
      e.attempts++; this.alert = Math.min(100, this.alert + 5);
      if (e.attempts >= 3) this.resolveEvent(false, 'Three incorrect attempts.');
      else throw new Error(`Incorrect. ${3 - e.attempts} attempts left. Ask your reader!`);
    }
  }
  resolveEvent(success, reason = '') {
    const e = this.event;
    if (!e) return;
    if (success && e.spec.type === 'hold') e.participants.forEach(id => this.players.find(p => p.id === id).contributions++);
    if (!success) {
      const discount = this.missionIndex === 1 && this.results[0]?.success ? 5 : 0;
      this.alert = Math.min(100, this.alert + Math.max(0, e.spec.penalty - discount));
      const victim = this.players.find(p => p.id === e.operator && !p.wounded) || this.players.find(p => !p.wounded);
      if (victim) victim.wounded = true;
    }
    this.log.unshift({ text: `${success ? 'SUCCESS' : 'FAILED'} · ${e.spec.title}${reason ? ` — ${reason}` : ''}`, at: this.now() });
    this.log = this.log.slice(0, 8);
    this.outcomes ||= [];
    this.outcomes.push({ mission: this.missionIndex, id: e.spec.id, success });
    this.event = null;
  }
  finishMission() {
    const outcomes = (this.outcomes || []).filter(o => o.mission === this.missionIndex);
    const cleared = outcomes.filter(o => o.success).length;
    const wounded = this.players.filter(p => p.wounded).length;
    const objective = outcomes.some(o => o.id === 'objective' && o.success);
    const success = objective && this.alert < 100 && cleared >= Math.ceil(outcomes.length / 2);
    const score = Math.max(0, cleared * 150 + (success ? 500 : 0) + (100 - this.alert) * 5 - wounded * 75);
    this.results[this.missionIndex] = { success, score, alert: this.alert, wounded, cleared, total: outcomes.length, objective };
    if (this.missionIndex === 1) this.deadline = null;
  }
  snapshot(playerId = null) {
    const p = this.players.find(p => p.id === playerId);
    const e = this.event;
    let assignment = null;
    if (p && e) {
      assignment = { role: 'support', instruction: 'Listen to your squad. Relay instructions aloud and watch the shared screen.' };
      if (e.reader === p.id) {
        assignment = { role: 'reader', instruction: e.spec.type === 'wire' ? `Cut the ${String(e.target).toUpperCase()} wire, then arm the detonator.` : e.spec.type === 'radio' ? `Tune to ${(e.target / 10).toFixed(1)} MHz.` : e.spec.type === 'sniper' ? `Windage ${e.target.x}. Elevation ${e.target.y}.` : `Enemy approach: ${e.warning}. Tell the signal operator now!` };
      }
      if (e.verifier === p.id) assignment = { role: 'verifier', instruction: `Second authentication code: ${e.pin}. Read this to the operator.` };
      if (e.operator === p.id) assignment = { role: 'operator', instruction: `Your ${e.spec.type === 'interrupt' ? 'signal panel' : GEAR.find(g => g.id === e.spec.gear)?.name || 'panel'} is live. Ask your reader for instructions.`, needsPin: Boolean(e.verifier) };
      if (e.participants.includes(p.id)) assignment = { role: 'hold', instruction: e.spec.type === 'hold' ? 'Take cover! Everyone on your route must hold together.' : 'You are the lookout. Hold cover for 3 seconds so the operator can work.' };
      if (e.missingGear) assignment = { role: 'support', instruction: 'Required equipment is missing. Flare carrier: deploy your emergency flare before time runs out!' };
    }
    return {
      code: this.code, phase: this.phase, missionIndex: this.missionIndex, mission: { ...this.mission, clues: undefined, obstacles: undefined },
      serverNow: this.now(), deadline: this.deadline, phaseStartedAt: this.startedAt, speed: this.speed,
      hostConnected: this.hostConnected, alert: this.alert, gearPool: this.gearPool,
      players: this.players.map(({ token, clues, ...safe }) => safe),
      me: p ? { ...this.players.map(({ token, ...safe }) => safe).find(x => x.id === p.id), assignment } : null,
      event: e ? { id: e.id, type: e.spec.type, title: e.spec.title, prompt: e.missingGear ? 'Required equipment missing. Deploy an emergency flare!' : e.spec.prompt, final: Boolean(e.spec.final), deadline: e.deadline, operator: e.operator, reader: e.reader, verifier: e.verifier, participants: e.participants, holds: Object.keys(e.holds), lookoutDone: e.lookoutDone, attempts: e.attempts } : null,
      log: this.log, results: this.results,
    };
  }
}
