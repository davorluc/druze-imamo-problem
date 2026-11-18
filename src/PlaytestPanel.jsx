import React, { useState } from 'react';
import { formatPlaytestReport } from '../shared/playtest-report.js';

export function PlaytestPanel({ request, storage }) {
  const [report, setReport] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function refresh() {
    setBusy(true);
    const result = await request('exportPlaytest');
    if (result) setReport(result.report);
    setBusy(false);
    return result?.report;
  }
  async function download(format) {
    const latest = await refresh();
    if (!latest) return;
    const content = format === 'json' ? JSON.stringify(latest, null, 2) : formatPlaytestReport(latest);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = `druze-${latest.roomCode}-${latest.sessionId}.${format}`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveNote(e) {
    e.preventDefault(); setBusy(true); setSaved(false);
    const result = await request('playtestNote', { text: note });
    if (result) { setNote(''); setSaved(true); await refresh(); }
    setBusy(false);
  }
  return <details className="playtest-panel" onToggle={e => { if (e.currentTarget.open && !report) refresh(); }}>
    <summary>Playtest tools · logs & metrics{storage?.error ? ' · DISK LOGGING ERROR' : ''}</summary>
    <p>Server-side recording is automatic. Download a report before leaving, or find the logs in the server’s playtests folder. No answer values or private intel are recorded.</p>
    {storage?.error && <p role="alert" className="red">Disk logging failed: {storage.error}. Download a report now; the in-memory log will not survive a restart.</p>}
    <div className="playtest-actions"><button className="button secondary" disabled={busy} onClick={refresh}>Refresh metrics</button><button className="button secondary" disabled={busy} onClick={() => download('md')}>Download report (.md)</button><button className="button secondary" disabled={busy} onClick={() => download('json')}>Download data (.json)</button></div>
    {report && <><div className="eyebrow">{report.status.toUpperCase()} / {report.speed === 1 ? 'NORMAL TIMERS' : 'QUICK DRILL'} / METRICS AS OF {new Date(report.generatedAt).toLocaleTimeString()}</div><div className="playtest-metrics">{[['Encounters', report.summary.encounters], ['Cleared', report.summary.successes], ['Failures', report.summary.failures], ['Timeouts', report.summary.timeouts], ['Wrong answers', report.summary.incorrectAnswers], ['Rejected commands', report.summary.rejectedCommands], ['Disconnects', report.summary.disconnects], ['Score', report.summary.score]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>{report.retention.dropped > 0 && <p className="red">Event limit reached. {report.retention.dropped} events omitted; metrics are incomplete.</p>}<p>{report.notes.length} observer notes saved. Reports include phase timings, loadouts, response times, failure causes, connection history, and a timestamped event timeline.</p></>}
    <form onSubmit={saveNote}><label htmlFor="playtest-note">OBSERVER NOTE · NO SENSITIVE INFORMATION</label><textarea id="playtest-note" value={note} maxLength={500} rows={2} placeholder="e.g. Radio operator couldn’t find the transmit button" onChange={e => { setNote(e.target.value); setSaved(false); }} /><button className="button secondary" disabled={busy || !note.trim()}>Save timestamped note</button>{saved && <span role="status"> Note saved.</span>}</form>
  </details>;
}
