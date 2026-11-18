import { randomUUID } from 'node:crypto';
import { mkdir, appendFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { formatPlaytestReport } from '../shared/playtest-report.js';

// Deliberately accepts only explicit engine events, never raw socket payloads or snapshots.
export class Playtest {
  constructor({ code, speed, now = Date.now, onRecord = () => {}, maxEvents = 10000 }) {
    this.id = randomUUID();
    this.code = code;
    this.speed = speed;
    this.now = now;
    this.createdAt = now();
    this.events = [];
    this.droppedEvents = 0;
    this.onRecord = onRecord;
    this.maxEvents = maxEvents;
    this.sequence = 0;
  }
  record(type, details = {}) {
    const event = { seq: ++this.sequence, at: this.now(), elapsedMs: this.now() - this.createdAt, type, ...details };
    if (this.events.length >= this.maxEvents) this.droppedEvents++;
    else this.events.push(event);
    this.onRecord(this.id, event);
  }
  report(storage = {}) {
    const events = this.events.map(e => ({ ...e }));
    const completed = events.find(e => e.type === 'mission_finished' && e.missionIndex === 1);
    const closed = events.find(e => e.type === 'session_closed');
    const end = completed?.at ?? closed?.at ?? this.now();
    const phaseEvents = events.filter(e => e.type === 'phase_entered');
    const phases = phaseEvents.map((e, i) => ({
      missionIndex: e.missionIndex, phase: e.phase, startedAt: e.at,
      endedAt: Math.min(phaseEvents[i + 1]?.at ?? end, end),
      durationMs: Math.max(0, Math.min(phaseEvents[i + 1]?.at ?? end, end) - e.at),
      ongoing: !phaseEvents[i + 1] && !completed && !closed,
    }));
    const encounters = events.filter(e => e.type === 'encounter_started').map(e => {
      const related = events.filter(x => x.eventId === e.eventId);
      const outcome = related.find(x => x.type === 'encounter_resolved');
      const actions = related.filter(x => x.type === 'action_submitted' || x.type === 'hold_changed' && x.down);
      const firstSubmission = related.find(x => x.type === 'action_submitted');
      return { ...e, outcome: outcome ? outcome.success ? 'success' : 'failure' : 'pending',
        reason: outcome?.reason ?? null, cause: outcome?.cause ?? null,
        resolvedAt: outcome?.at ?? null, resolutionMs: outcome ? outcome.at - e.at : null,
        firstActionMs: actions.length ? actions[0].at - e.at : null,
        firstSubmissionMs: firstSubmission ? firstSubmission.at - e.at : null,
        submissions: related.filter(x => x.type === 'action_submitted').length,
        incorrectAnswers: related.filter(x => x.type === 'answer_checked' && !x.correct).length,
        rejectedCommands: related.filter(x => x.type === 'command_rejected').length,
        alertAfter: outcome?.alertAfter ?? null, woundedPlayerId: outcome?.woundedPlayerId ?? null,
      };
    });
    const players = events.filter(e => e.type === 'player_joined').map(e => {
      const related = events.filter(x => x.playerId === e.playerId && x.at <= end);
      let disconnectedAt = null; let downtime = 0;
      for (const x of related.filter(x => x.at <= end)) {
        if (x.type === 'player_disconnected') disconnectedAt ??= x.at;
        if (x.type === 'player_rejoined' || x.type === 'player_removed') {
          if (disconnectedAt !== null) downtime += x.at - disconnectedAt;
          disconnectedAt = null;
        }
      }
      if (disconnectedAt !== null) downtime += Math.max(0, end - disconnectedAt);
      return { id: e.playerId, name: e.name,
        disconnects: related.filter(x => x.type === 'player_disconnected').length,
        rejoins: related.filter(x => x.type === 'player_rejoined').length,
        disconnectedMs: downtime,
        removed: related.some(x => x.type === 'player_removed'),
      };
    });
    const results = events.filter(e => e.type === 'mission_finished').map(e => ({ missionIndex: e.missionIndex, ...e.result }));
    return {
      schemaVersion: 1, sessionId: this.id, roomCode: this.code,
      createdAt: new Date(this.createdAt).toISOString(), generatedAt: new Date(this.now()).toISOString(),
      status: completed ? 'completed' : closed ? 'interrupted' : results.length || events.some(e => e.phase === 'BRIEFING') ? 'in_progress' : 'lobby',
      speed: this.speed, durationMs: Math.max(0, end - this.createdAt),
      gameplayDurationMs: Math.max(0, end - (phaseEvents.find(e => e.phase === 'BRIEFING')?.at ?? end)),
      storage, retention: { limit: this.maxEvents, recorded: events.length, dropped: this.droppedEvents },
      summary: { players: players.length, encounters: encounters.length,
        successes: encounters.filter(e => e.outcome === 'success').length,
        failures: encounters.filter(e => e.outcome === 'failure').length,
        timeouts: encounters.filter(e => e.cause === 'timeout' || e.cause === 'phase_ended').length,
        avoided: events.filter(e => e.type === 'encounter_avoided').length,
        incorrectAnswers: encounters.reduce((n, e) => n + e.incorrectAnswers, 0),
        rejectedCommands: events.filter(e => e.type === 'command_rejected').length,
        disconnects: players.reduce((n, p) => n + p.disconnects, 0),
        hostDisconnects: events.filter(e => e.type === 'host_connection' && !e.connected && e.at <= end).length,
        score: results.reduce((n, r) => n + r.score, 0),
      },
      players, phases, loadouts: events.filter(e => e.type === 'loadout_locked'), encounters,
      avoidedEncounters: events.filter(e => e.type === 'encounter_avoided'), results,
      notes: events.filter(e => e.type === 'observer_note'), events,
      definitions: {
        times: 'Event timestamps are Unix milliseconds; durations are real wall-clock milliseconds, not speed-adjusted. Gameplay duration excludes the lobby and ends at final mission resolution.',
        submissions: 'Encounter submissions count operator submissions and flare actions; holds are separate and medkit treatments are standalone support events. Incorrect authentication and other rejected actions are counted as rejected commands, not incorrect answers.',
        privacy: 'Contains player codenames and internal player IDs, but no tokens, IP addresses, private clues, randomized answers, PINs, or submitted answer values. Observer notes are free text: do not enter sensitive information.',
        limitations: 'Server-observed events only: cannot measure actual speech, reading, screen visibility, or diagnose why a player struggled. Interrupted sessions do not imply game failure. If retention.dropped > 0, metrics cover retained events only; the disk JSONL continues recording beyond the in-memory limit.',
      },
    };
  }
}

// Serialized writes keep each JSONL ordered and reports atomically replaced. Disk failure
// is visible to the host but never interrupts gameplay or blocks in-memory downloads.
export class PlaytestStore {
  constructor(directory = process.env.PLAYTEST_DIR || './playtests') {
    this.directory = resolve(directory);
    this.queue = Promise.resolve();
    this.error = null;
  }
  enqueue(task) {
    this.queue = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await task();
      return true;
    }).catch(error => { this.error = error.message; console.error('Playtest persistence failed:', error.message); return false; });
    return this.queue;
  }
  record(id, event) {
    return this.enqueue(() => appendFile(join(this.directory, `${id}.jsonl`), `${JSON.stringify(event)}\n`, { mode: 0o600 }));
  }
  save(report) {
    return this.enqueue(async () => {
      const file = join(this.directory, `${report.sessionId}.json`);
      await writeFile(`${file}.tmp`, JSON.stringify(report, null, 2), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
      const markdown = join(this.directory, `${report.sessionId}.md`);
      await writeFile(`${markdown}.tmp`, formatPlaytestReport(report), { mode: 0o600 });
      await rename(`${markdown}.tmp`, markdown);
    });
  }
  status() { return { enabled: true, error: this.error }; }
  flush() { return this.queue; }
}
