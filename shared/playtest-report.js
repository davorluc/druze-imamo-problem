const cell = value => String(value ?? '—').replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
const seconds = ms => ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;

export function formatPlaytestReport(report) {
  const name = id => report.players.find(p => p.id === id)?.name ?? id ?? '—';
  const lines = [
    '# Druže — playtest report', '',
    `- Session: ${report.sessionId}`, `- Room: ${report.roomCode}`,
    `- Started: ${report.createdAt}`, `- Exported: ${report.generatedAt}`,
    `- Status: ${report.status}`, `- Timer speed: ${report.speed === 1 ? 'normal' : `${1 / report.speed}× drill`}`,
    `- Duration including lobby: ${seconds(report.durationMs)}`,
    `- Gameplay duration: ${seconds(report.gameplayDurationMs)}`, '',
    '## Summary', '',
    ...Object.entries(report.summary).map(([key, value]) => `- ${key}: ${value}`), '',
    '## Phase timings', '',
    '| Mission | Phase | Duration | Ongoing |', '| --- | --- | --- | --- |',
    ...report.phases.map(p => `| ${p.missionIndex + 1} | ${p.phase} | ${seconds(p.durationMs)} | ${p.ongoing ? 'yes' : 'no'} |`), '',
    '## Loadouts', '', '| Mission | Player | Route | Gear | Auto-drafted |', '| --- | --- | --- | --- | --- |',
    ...report.loadouts.map(p => `| ${p.missionIndex + 1} | ${cell(name(p.playerId))} | ${cell(p.route)} | ${cell(p.gear)} | ${p.automatic ? 'yes' : 'no'} |`), '',
    '## Encounters', '',
    '| Mission | Encounter | Operator | Outcome | Cause | First action | First submission | Resolution | Submissions | Wrong answers | Rejections | Alert after |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.encounters.map(e => `| ${e.missionIndex + 1} | ${cell(e.title)} | ${cell(name(e.operator))} | ${e.outcome} | ${e.cause ?? '—'} | ${seconds(e.firstActionMs)} | ${seconds(e.firstSubmissionMs)} | ${seconds(e.resolutionMs)} | ${e.submissions} | ${e.incorrectAnswers} | ${e.rejectedCommands} | ${e.alertAfter ?? '—'} |`), '',
    '## Avoided encounters', '',
    ...report.avoidedEncounters.map(e => `- Mission ${e.missionIndex + 1}: ${cell(e.title)} (${cell(e.route)} empty)`), '',
    '## Connections', '', '| Player | Disconnects | Rejoins | Disconnected time |', '| --- | --- | --- | --- |',
    ...report.players.map(p => `| ${cell(p.name)} | ${p.disconnects} | ${p.rejoins} | ${seconds(p.disconnectedMs)} |`), '',
    '## Mission results', '',
    ...report.results.map(r => `- Mission ${r.missionIndex + 1}: ${r.success ? 'SUCCESS' : 'FAILURE'}; score ${r.score}; cleared ${r.cleared}/${r.total}; alert ${r.alert}%; wounded ${r.wounded}`), '',
    '## Observer notes', '',
    ...report.notes.map(e => `- +${seconds(e.elapsedMs)} · Mission ${e.missionIndex + 1} / ${e.phase}: ${cell(e.text)}`), '',
    '## Interpretation and privacy', '',
    ...Object.values(report.definitions).map(text => `- ${text}`),
    `- Event retention: ${report.retention.recorded}/${report.retention.limit}; dropped: ${report.retention.dropped}.`,
    `- Disk logging: ${report.storage.enabled ? report.storage.error ? `ERROR: ${cell(report.storage.error)}` : 'enabled' : 'not configured'}.`,
    '- See the matching JSON report for the timestamped event timeline and role assignments.', '',
  ];
  return lines.join('\n');
}
