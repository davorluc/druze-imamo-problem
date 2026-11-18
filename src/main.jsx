import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { GEAR, MISSIONS, PLAYER_COLORS } from '../shared/content.js';
import './styles.css';

const socket = io({ autoConnect: false });
const phases = { LOBBY: 'Assemble the squad', BRIEFING: 'Mission briefing', DAY_PLANNING: 'Daytime planning', NIGHT_ACTION: 'Night operation', DEBRIEF: 'After-action report' };
const gearName = id => GEAR.find(g => g.id === id)?.name || 'Unassigned';
const routeName = id => MISSIONS[0].routes.find(r => r.id === id)?.name || 'Awaiting orders';
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

function Star({ className = '' }) { return <svg className={className} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="m20 2 5.6 11.5L38 15.3l-9 8.8L31.1 37 20 30.9 8.9 37 11 24.1 2 15.3l12.4-1.8Z" /></svg>; }
function Arrow() { return <span aria-hidden="true">↗</span>; }
function Label({ children }) { return <div className="eyebrow">{children}</div>; }
function Clock({ deadline, now, compact = false }) { return <span className={`clock ${compact ? 'compact' : ''} ${deadline - now < 15000 ? 'urgent' : ''}`}>{mmss(deadline - now)}</span>; }

function TacticalMap({ game, preview = false }) {
  const night = game?.phase === 'NIGHT_ACTION';
  const routes = game?.mission?.routes || MISSIONS[0].routes;
  const progress = night ? Math.min(1, Math.max(0, (game.serverNow - game.phaseStartedAt) / (150000 * game.speed))) : 0;
  return <div className={`tactical-map ${night ? 'night' : ''} ${preview ? 'preview-map' : ''}`}>
    <div className="map-topline"><span>FIELD SURVEY / SECTOR 07</span><span>1 : 12 500</span></div>
    <svg viewBox="0 0 800 570" role="img" aria-label="Tactical map showing the main road, forest ridge, and riverbed routes to the objective">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".15" /></pattern>
        <pattern id="woods" width="30" height="30" patternUnits="userSpaceOnUse"><path d="m15 5-6 11h12zm0 7-8 12h16" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".18" /></pattern>
      </defs>
      <rect width="800" height="570" fill="url(#grid)" />
      {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M ${-130 + i * 12} ${100 + i * 25} C 200 ${-180 + i * 25}, 230 ${300 + i * 20}, 450 ${170 + i * 22} S 700 ${-30 + i * 36}, 920 ${80 + i * 30}`} fill="none" stroke="currentColor" opacity=".12" />)}
      {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M ${240 + i * 14} 620 C 300 ${380 - i * 20}, 650 ${540 - i * 25}, 850 ${290 - i * 23}`} fill="none" stroke="currentColor" opacity=".13" />)}
      <path d="M200 90 540 70 600 250 335 310 140 200Z" fill="url(#woods)" />
      <path d="M 790 470 Q 560 410 565 320 T 370 250 T 140 160 T -10 70" fill="none" stroke="var(--river)" strokeWidth="32" opacity=".38" />
      <path d="M 790 470 Q 560 410 565 320 T 370 250 T 140 160 T -10 70" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2" />
      <path d="M-20 400 820 120" stroke="currentColor" strokeWidth="6" opacity=".35" />
      <path d="M-20 400 820 120" stroke="var(--map-bg)" strokeWidth="3" strokeDasharray="2 9" />
      <g className="buildings" opacity=".45" fill="none" stroke="currentColor">
        {[[560, 135], [610, 100], [640, 150], [610, 190], [550, 200], [670, 200], [690, 135]].map(([x,y],i) => <rect key={i} x={x} y={y} width={i % 2 ? 22 : 32} height="20" transform={`rotate(-18 ${x} ${y})`} />)}
      </g>
      <path className="route-path route-a" d="M100 470 C210 440 170 340 310 350 S470 340 620 220" />
      <path className="route-path route-b" d="M100 470 C95 310 220 170 350 150 S500 150 620 220" />
      <path className="route-path route-c" d="M100 470 C300 490 440 435 470 340 S560 285 620 220" />
      <g className="map-route-label"><rect x="201" y="346" width="110" height="25" rx="2" /><text x="212" y="363">A · MAIN ROAD</text><rect x="274" y="107" width="128" height="25" rx="2" /><text x="285" y="124">B · FOREST RIDGE</text><rect x="450" y="406" width="111" height="25" rx="2" /><text x="461" y="423">C · RIVERBED</text></g>
      {[[330, 330], [435, 173], [510, 320]].map(([x,y],i) => <g key={i} transform={`translate(${x} ${y})`} className="hazard"><path d="m0-15 15 15-15 15-15-15Z" /><text y="5" textAnchor="middle">?</text></g>)}
      <g transform="translate(620 220)" className="objective-marker"><circle r="32" /><circle r="24" /><path d="M-42 0H42M0-42V42" /><text y="-48" textAnchor="middle">{game?.mission?.target || 'GARRISON'}</text></g>
      <g transform="translate(100 470)" className="camp-marker"><circle r="10" /><text x="-35" y="34">BASE CAMP</text></g>
      <text x="100" y="230" className="terrain-text" transform="rotate(-24 100 230)">D R A G O V A   Š U M A</text>
      <text x="570" y="480" className="terrain-text" transform="rotate(18 570 480)">SOKOL RIVER</text>
      {(game?.players || []).map((p, i) => {
        const r = routes.findIndex(r => r.id === p.route);
        const mid = r === 0 ? [330, 350] : r === 1 ? [310, 170] : [440, 425];
        const start = [100 + i * 9, 470 + i * 4];
        const t = progress;
        const x = (1-t)*(1-t)*start[0]+2*(1-t)*t*mid[0]+t*t*620;
        const y = (1-t)*(1-t)*start[1]+2*(1-t)*t*mid[1]+t*t*220;
        return <g key={p.id} transform={`translate(${x} ${y})`} className="player-marker"><circle r="10" fill={p.color} /><text y="4" textAnchor="middle">{i+1}</text></g>;
      })}
      <g transform="translate(735 67)" className="compass"><path d="m0-22 8 32-8-5-8 5Z" /><text y="-31" textAnchor="middle">N</text></g>
      <g className="scale"><path d="M35 520v8h100v-8m-50 0v8" /><text x="35" y="547">0</text><text x="110" y="547">500 M</text></g>
    </svg>
    <div className="map-bottomline"><span><i /> {night ? 'LIVE FIELD POSITIONS' : 'RECONNAISSANCE · UNVERIFIED'}</span><span>43° 18′ N / 17° 42′ E</span></div>
    {night && <div className="radar-sweep" />}
  </div>;
}

function App() {
  const isPhone = location.pathname.startsWith('/play');
  const storageKey = isPhone ? 'druze-player' : 'druze-host';
  const session = useRef(null);
  const [game, setGame] = useState(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [name, setName] = useState('');
  const [fast, setFast] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const [sound, setSound] = useState(false);
  const audio = useRef(null);
  const lastEvent = useRef(null);
  const [joinOrigin, setJoinOrigin] = useState(location.origin);
  const [addresses, setAddresses] = useState([]);
  function request(event, data = {}) {
    return new Promise(resolve => {
      if (!socket.connected) { setError('Connection lost. Waiting for the field radio to reconnect…'); resolve(null); return; }
      socket.timeout(5000).emit(event, data, (err, result) => {
        if (err || !result?.ok) { setError(err ? 'No response from headquarters. Please try again.' : result.error); resolve(null); }
        else { setError(''); resolve(result); }
      });
    });
  }
  function saveSession(value) { session.current = value; sessionStorage.setItem(storageKey, JSON.stringify(value)); }
  function clearSession(message = '') { session.current = null; sessionStorage.removeItem(storageKey); setGame(null); setError(message); }
  useEffect(() => {
    try { session.current = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* invalid local session */ }
    let retry;
    let disposed = false;
    const onConnect = () => {
      if (disposed) return;
      clearTimeout(retry);
      setConnected(socket.connected);
      if (session.current && socket.connected) {
        socket.timeout(5000).emit(isPhone ? 'join' : 'resumeHost', session.current, (err, result) => {
          if (disposed) return;
          if (err) {
            setError('Signal interrupted while restoring your controller. Retrying…');
            retry = setTimeout(onConnect, 2000);
          } else if (!result?.ok) {
            clearSession(result?.error || 'Your session expired. Join or create an operation below.');
          } else setError('');
        });
      }
    };
    const onState = state => { offset.current = state.serverNow - Date.now(); setNow(state.serverNow); setGame(state); };
    socket.on('connect', onConnect);
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', onState);
    socket.on('removed', () => clearSession('You were removed from this squad by the host.'));
    socket.on('expired', () => clearSession('This room expired. Start a fresh operation.'));
    socket.on('superseded', () => clearSession('This controller is now open in another tab.'));
    socket.connect();
    const tick = setInterval(() => setNow(Date.now() + offset.current), 100);
    fetch('/api/network').then(r => r.json()).then(data => {
      setAddresses(data.addresses || []);
      if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && data.addresses?.length) setJoinOrigin(`${location.protocol}//${data.addresses[0]}:${location.port || (location.protocol === 'https:' ? '443' : '80')}`);
    }).catch(() => {});
    return () => { disposed = true; clearTimeout(retry); clearInterval(tick); socket.removeAllListeners(); socket.disconnect(); };
  }, []);
  useEffect(() => {
    if (sound && game?.event?.id && lastEvent.current !== game.event.id && audio.current) {
      const ctx = audio.current;
      [0, .15, .3].forEach(delay => { const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 580; gain.gain.setValueAtTime(.045, ctx.currentTime + delay); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + .12); osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + .13); });
    }
    lastEvent.current = game?.event?.id;
  }, [game?.event?.id, sound]);
  async function host() { setBusy(true); const r = await request('create', { fast }); if (r) { saveSession(r); history.replaceState(null, '', '/tv'); } setBusy(false); }
  async function join(e) { e.preventDefault(); setBusy(true); const r = await request('join', { code, name }); if (r) saveSession({ ...r, name }); setBusy(false); }
  async function leave() { await request('leave'); clearSession(); }
  function toggleSound() {
    if (!sound) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) { audio.current ||= new Context(); audio.current.resume(); }
    }
    setSound(!sound);
  }
  const joinUrl = `${joinOrigin}/play?room=${game?.code || ''}`;
  return <div className={`app ${isPhone ? 'phone-app' : ''} ${game?.phase === 'NIGHT_ACTION' ? 'night-mode' : ''}`}>
    <header className="topbar"><a className="brand" href="/" aria-label="Druže home"><Star /><span>DRUŽE<span className="brand-dot">.</span><small>RESISTANCE OPERATIONS</small></span></a><div className="topbar-right"><span className={`connection ${connected ? '' : 'offline'}`}><i />{connected ? 'FIELD RADIO ONLINE' : 'CONNECTING…'}</span>{game && <span className="room-tag">ROOM / <b>{game.code}</b></span>}<button className="icon-button" onClick={toggleSound} aria-label={sound ? 'Mute sound' : 'Enable sound'} title={sound ? 'Mute sound' : 'Enable sound'}>{sound ? '♪' : '♫̸'}</button></div></header>
    {!connected && game && <div className="connection-banner">Signal lost. Reconnecting automatically… The operation clock is still running.</div>}
    {error && <div role="alert" className="error-toast"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {!game ? isPhone ? <main className="join-page"><Label>ENCRYPTED FIELD CHANNEL / 1943</Label><h1>Your squad<br />needs you<span className="red">.</span></h1><p>Look up at the TV. Enter the operation code and choose your Partisan codename.</p><form onSubmit={join}><label htmlFor="room">OPERATION CODE</label><input id="room" className="code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0,4))} placeholder="ABCD" autoCapitalize="characters" maxLength={4} minLength={4} required autoComplete="off" /><label htmlFor="name">YOUR CODENAME</label><input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sokol" minLength={2} maxLength={18} required autoComplete="nickname" /><button className="button primary" disabled={!connected || busy}>{busy ? 'Establishing contact…' : 'Join the resistance'} <Arrow /></button></form><div className="field-note">4–6 COMRADES. ONE SHARED SCREEN.<br />Keep this phone with you. Your intel is yours alone.</div><a className="text-link" href="/tv">Looking for the host screen? →</a></main> : <Landing host={host} fast={fast} setFast={setFast} busy={busy || !connected} /> : isPhone ? <Phone game={game} request={request} now={now} leave={leave} /> : <Host game={game} request={request} now={now} joinUrl={joinUrl} joinOrigin={joinOrigin} setJoinOrigin={setJoinOrigin} addresses={addresses} leave={leave} />}
    {!isPhone && <footer className="footer"><span>YUGOSLAVIA, 1943 <span className="footer-divider">/</span> A COOPERATIVE RESISTANCE GAME</span><span>4–6 PLAYERS <span className="footer-divider">/</span> ONE MISSION. NO LONE HEROES.</span></footer>}
  </div>;
}

function Landing({ host, fast, setFast, busy }) {
  return <main className="landing"><section className="landing-copy"><Label><span className="red">●</span> CLASSIFIED / PARTISAN COMMAND</Label><h1>Druže,<br />imamo<br /><span className="red">problem.</span></h1><div className="title-translation">COMRADE, WE HAVE A PROBLEM.</div><p className="intro">One screen. A handful of phones.<br />A plan that only works if you talk.</p><p className="description">Occupied Yugoslavia, 1943. Gather your squad, share your secret intel, and pull off an impossible raid. Nobody has the whole picture. Everybody has a part to play.</p><div className="landing-actions"><button className="button primary" onClick={host} disabled={busy}>Establish an operation <Arrow /></button><a className="button secondary" href="/play">Join with a code <span>→</span></a></div><label className="check-label"><input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} /> Quick drill <span>— 5× faster timers for testing</span></label><div className="requirements"><span><b>01</b> TV or laptop</span><span><b>04–06</b> Phones</span><span><b>00</b> Downloads</span></div></section><section className="landing-art"><div className="dossier-tab">OPERATIONS DOSSIER <span>№ 043 / IX</span></div><TacticalMap preview /><div className="dossier-caption"><div><Label>YOUR TWO-NIGHT CAMPAIGN</Label><h3>First the garrison.<br />Then the iron viaduct.</h3></div><div className="classified-stamp">TOP<br />SECRET</div></div><div className="tape tape-one" /><div className="tape tape-two" /></section><section className="how-strip"><div><span className="step-number">01 /</span><h3>Assemble</h3><p>Put this screen on the TV.<br />Your comrades join by phone.</p></div><div><span className="step-number">02 /</span><h3>Make a plan</h3><p>Trade intel. Divide the gear.<br />Choose your way in.</p></div><div><span className="step-number">03 /</span><h3>Trust your squad</h3><p>Your manual. Their machine.<br />One chance to get it right.</p></div><div className="strip-warning"><Star /><p>THE MOST IMPORTANT<br />CONTROLLER IS YOUR VOICE.</p></div></section></main>;
}

function Host({ game, request, now, joinUrl, joinOrigin, setJoinOrigin, addresses, leave }) {
  const lobby = game.phase === 'LOBBY';
  const night = game.phase === 'NIGHT_ACTION';
  const debrief = game.phase === 'DEBRIEF';
  const ready = game.players.length >= 4 && game.players.every(p => p.ready && p.connected);
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }
  return <main className="host-page"><div className="operation-heading"><div><Label>OPERATION {String(game.missionIndex + 1).padStart(2,'0')} / {phases[game.phase].toUpperCase()}</Label><h1>{lobby ? 'No comrade left behind.' : debrief ? 'The morning after.' : game.mission.title}</h1></div>{!lobby && !debrief && <div className="phase-clock"><Label>{night ? 'UNTIL DAWN' : 'TIME REMAINING'}</Label><Clock deadline={game.deadline} now={now} /></div>}{lobby && <span className="status-stamp">RECRUITING</span>}</div>
    {lobby ? <div className="lobby-layout"><section className="lobby-map"><TacticalMap game={game} /><div className="mission-teaser"><span className="file-number">01 → 02</span><div><Label>THE CAMPAIGN</Label><h3>The Town Garrison <span>→</span> Iron Viaduct</h3><p>Steal the charges. Break the supply line. Make it home.</p></div></div></section><aside className="lobby-sidebar"><div className="join-card"><div><Label>JOIN THE OPERATION</Label><div className="room-code">{game.code}</div><div className="join-address">{new URL(joinUrl).host}/play</div><button className="text-link" onClick={copy}>{copied ? 'Link copied ✓' : 'Copy invite link ↗'}</button></div><div className="qr-wrap"><QRCodeSVG value={joinUrl} size={116} bgColor="#f0eadc" fgColor="#202922" level="M" /><span>SCAN TO JOIN</span></div></div><details className="network-settings"><summary>Phones can’t connect? Check network address</summary><p>All devices must be on the same Wi-Fi. Choose your LAN address, or enter your public URL.</p>{addresses.length > 1 && <select aria-label="LAN address" onChange={e => setJoinOrigin(`${location.protocol}//${e.target.value}:${location.port || '80'}`)}>{addresses.map(ip => <option key={ip}>{ip}</option>)}</select>}<input aria-label="Join base URL" value={joinOrigin} onChange={e => { try { const url = new URL(e.target.value); if (['http:', 'https:'].includes(url.protocol)) setJoinOrigin(url.origin); } catch { /* keep valid origin */ } }} /><p>Guest Wi-Fi / VPN isolation may block phones. Use the printed LAN URL, not localhost.</p></details><div className="squad-heading"><Label>SQUAD ROSTER</Label><span>{game.players.length} / 6</span></div><div className="roster">{Array.from({ length: 6 }, (_,i) => { const p = game.players[i]; return <div className={`roster-slot ${p ? 'occupied' : ''}`} key={p?.id || i}><span className="roster-number" style={p ? { color: p.color } : {}}>{String(i+1).padStart(2,'0')}</span>{p ? <><strong>{p.name}</strong><span className={`ready-tag ${p.ready && p.connected ? 'yes' : ''}`}>{!p.connected ? 'OFFLINE' : p.ready ? 'READY' : 'STANDING BY'}</span><button className="remove-player" aria-label={`Remove ${p.name}`} onClick={() => request('remove', { id: p.id })}>×</button></> : <span>Awaiting comrade…</span>}</div>; })}</div><button className="button primary start-button" disabled={!ready} onClick={() => request('start')}>Begin the operation <Arrow /></button><p className="under-button">{ready ? 'All comrades accounted for. Ready when you are.' : 'Waiting for 4–6 comrades to ready up on their phones.'}</p><button className="text-link muted" onClick={leave}>Close this host screen</button></aside></div> : debrief ? <Debrief game={game} now={now} leave={leave} /> : <><div className="stage-strip">{['BRIEFING','DAY_PLANNING','NIGHT_ACTION','DEBRIEF'].map((p,i) => <span className={game.phase === p ? 'active' : ''} key={p}><b>0{i+1}</b> {phases[p]}</span>)}</div><div className="operation-layout"><section><TacticalMap game={game} /><div className="map-legend">{game.mission.routes.map(r => <span key={r.id}><b>{r.label}</b> {r.name} <small>{r.speed}</small></span>)}</div></section><aside className="operations-sidebar">{game.phase === 'BRIEFING' ? <><Label>COMMAND DISPATCH / {game.mission.date}</Label><h2>{game.mission.subtitle}</h2><p className="brief-objective">{game.mission.objective}</p><div className="paper-note"><Label>WHAT’S AT STAKE</Label><p>{game.mission.stakes}</p></div>{game.missionIndex === 1 && <div className={`campaign-bonus ${game.results[0]?.success ? 'good' : 'bad'}`}>{game.results[0]?.success ? '✓ Stolen supplies: obstacle penalties reduced by 5.' : '⚠ Garrison alerted: starting alert +25.'}</div>}<div className="field-note">Intel arrives on your phones at daybreak. Read it aloud. Agree on routes and carry different gear.</div></> : game.phase === 'DAY_PLANNING' ? <><Label>PLAN TOGETHER. COMMIT INDIVIDUALLY.</Label><h2>Who’s taking<br />which way in?</h2><p>Share the intel on your phones. Each comrade picks one route and one unique item. The night starts when everybody locks in.</p><div className="gear-grid">{game.gearPool.map(g => { const p = game.players.find(p => p.gear === g.id); return <div className={`gear-tile ${p ? 'claimed' : ''}`} key={g.id}><span>{g.icon}</span><div><strong>{g.name}</strong><small>{p?.name || 'Available'}</small></div></div>; })}</div><SquadStatus game={game} /></> : <><div className="alert-heading"><Label>ENEMY ALERT</Label><strong className={game.alert >= 70 ? 'red' : ''}>{game.alert}<small>%</small></strong></div><div className="alert-bar"><div style={{ width: `${game.alert}%` }} /></div>{game.event ? <div className="live-event"><Label><span className="live-dot" /> OBSTACLE IN PROGRESS</Label><h2>{game.event.title}</h2><p>{game.event.prompt}</p><Clock deadline={game.event.deadline} now={now} compact /><div className="event-assignments">{[{ id: game.event.operator, label: game.event.type === 'hold' ? 'COORDINATION' : 'OPERATOR' }, { id: game.event.reader, label: 'INTEL READER' }, ...(game.event.verifier ? [{ id: game.event.verifier, label: 'VERIFIER' }] : [])].filter(x => game.event.type !== 'hold' || x.label === 'COORDINATION').map(x => <div key={x.label}><Label>{x.label}</Label><strong>{game.players.find(p => p.id === x.id)?.name}</strong></div>)}</div><p className="whisper">Talk to each other. The answer is not on this screen.</p></div> : <div className="quiet-field"><span>⌖</span><h2>Move quietly.</h2><p>Watch your phones. The next obstacle could arrive at any moment.</p></div>}<SquadStatus game={game} /><div className="field-log"><Label>FIELD LOG</Label>{game.log.slice(0,3).map((entry,i) => <p key={`${entry.at}-${i}`} className={entry.text.startsWith('FAILED') ? 'red' : ''}>{entry.text}</p>)}</div></>}</aside></div></>}
    {game.speed < 1 && <div className="drill-tag">QUICK DRILL · 5× TIMERS · HOLD FOR 0.6s</div>}
  </main>;
}

function SquadStatus({ game }) { return <div className="squad-status">{game.players.map((p,i) => <div key={p.id}><span className="player-dot" style={{ background: p.color }}>{i+1}</span><strong>{p.name}{!p.connected && <small> · offline</small>}</strong><span>{p.wounded ? '✚ Wounded' : game.phase === 'DAY_PLANNING' ? p.locked ? '✓ Locked' : 'Planning' : routeName(p.route)}</span></div>)}</div>; }

function Debrief({ game, now, leave, phone = false }) {
  const result = game.results[game.missionIndex];
  const final = game.missionIndex === 1;
  if (!result) return null;
  const mvp = [...game.players].sort((a,b) => b.contributions-a.contributions)[0];
  return <section className={`debrief ${phone ? 'phone-debrief' : ''}`}><div className="newspaper"><div className="newspaper-top">THE FREE YUGOSLAV <span>RESISTANCE EDITION / SEPTEMBER 1943</span></div><Label>{final ? 'SPECIAL DISPATCH FROM THE SOKOL RIVER' : 'REPORT FROM KOVAČEVAC'}</Label><h2>{final ? result.success ? 'THE LINE IS BROKEN.' : 'THE TRAIN GETS THROUGH.' : result.success ? 'GARRISON RAID A SUCCESS.' : 'A COSTLY NIGHT AT THE GARRISON.'}</h2><p className="newspaper-deck">{final ? result.success ? 'Partisan squad destroys the iron viaduct. Enemy supplies will not reach the front.' : 'The bridge still stands. The resistance will remember those who tried.' : result.success ? 'Explosives and radio codes secured. The viaduct team will have an advantage tomorrow.' : 'The squad regroups. Enemy command is on alert; the next operation starts at +25 alert.'}</p><div className="score-grid"><div><strong>{result.score}</strong><Label>MISSION SCORE</Label></div><div><strong>{result.cleared}/{result.total}</strong><Label>OBSTACLES CLEARED</Label></div><div><strong>{result.alert}%</strong><Label>FINAL ALERT</Label></div><div><strong>{result.wounded}</strong><Label>WOUNDED</Label></div></div><p className="result-reason">{!result.objective ? 'The final objective was not secured.' : result.alert >= 100 ? 'The objective was reached, but full alert prevented extraction.' : !result.success ? 'Too few obstacles cleared to secure the operation.' : 'Objective secured. Squad extracted.'}</p>{final && <div className="mvp-line"><Star /><div><Label>COMRADE OF THE CAMPAIGN</Label><h3>{mvp?.name} <small>{mvp?.contributions} successful actions</small></h3><p>Campaign score: {game.results.reduce((sum,r) => sum+r.score,0)} · No one wins alone.</p></div></div>}</div>{final ? <button className="button primary" onClick={leave}>{phone ? 'Leave operation' : 'Back to command'} <Arrow /></button> : <div className="next-mission"><Label>UP NEXT / OPERATION: IRON VIADUCT</Label><p>Catch your breath. Next briefing in <Clock deadline={game.deadline} now={now} compact /></p></div>}</section>;
}

function Phone({ game, request, now, leave }) {
  const me = game.me;
  const [route, setRoute] = useState('');
  const [gear, setGear] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setRoute(''); setGear(''); }, [game.missionIndex]);
  if (!me) return <main className="phone-main"><p>Restoring your field controller…</p></main>;
  async function lock() { setSubmitting(true); await request('plan', { route, gear, lock: true }); setSubmitting(false); }
  return <main className="phone-main"><div className="phone-identity"><span className="identity-star" style={{ color: me.color }}><Star /></span><div><Label>COMRADE</Label><h2>{me.name}</h2></div><span className="identity-number">0{game.players.findIndex(p => p.id === me.id)+1}</span></div>
    {game.phase === 'LOBBY' ? <section className="phone-waiting"><div className="big-star"><Star /></div><Label>CONTACT ESTABLISHED</Label><h1>You’re in.</h1><p>The squad is assembling.<br />{game.players.length} of 6 comrades have answered.</p><button className={`button ${me.ready ? 'secondary' : 'primary'}`} onClick={() => request('ready', { ready: !me.ready })}>{me.ready ? '✓ Ready for orders' : 'I’m ready'} <Arrow /></button><p className="field-note">{me.ready ? 'Keep this screen open. Your host will launch the operation.' : 'Ready up when you can see the shared screen and hear your comrades.'}</p><button className="text-link muted" onClick={leave}>Disconnect controller</button></section> : game.phase === 'BRIEFING' ? <section className="phone-briefing"><Label>OPERATION 0{game.missionIndex+1} / BRIEFING</Label><h1>{game.mission.title}</h1><p>{game.mission.objective}</p><div className="paper-note"><Label>LOOK AT THE SHARED SCREEN</Label><p>Your private intel arrives when the briefing ends. Don’t make a plan without your squad.</p></div><Clock deadline={game.deadline} now={now} /></section> : game.phase === 'DAY_PLANNING' ? <section><div className="phone-section-heading"><Label>DAY PLANNING</Label><Clock deadline={game.deadline} now={now} compact /></div><h1>Your piece<br />of the puzzle.</h1><div className="intel-stack"><Label>PRIVATE INTEL / READ ALOUD</Label>{me.clues.map((clue,i) => <div className="intel-card" key={clue}><span>0{i+1}</span><p>{clue}</p></div>)}</div>{me.locked ? <div className="locked-loadout"><Label>LOADOUT LOCKED ✓</Label><h2>{routeName(me.route)}</h2><p>{gearName(me.gear)}</p><p className="field-note">Keep talking. Night falls when everybody is ready.</p></div> : <><Label>01 / CHOOSE YOUR ROUTE</Label><div className="route-options">{game.mission.routes.map(r => <button className={route === r.id ? 'selected' : ''} key={r.id} onClick={() => setRoute(r.id)}><b>{r.label}</b><span>{r.name}<small>{r.speed}</small></span><span>{route === r.id ? '●' : '○'}</span></button>)}</div><Label>02 / CLAIM YOUR GEAR</Label><div className="gear-options">{game.gearPool.map(g => { const owner = game.players.find(p => p.gear === g.id && p.id !== me.id); return <button key={g.id} disabled={Boolean(owner)} className={gear === g.id && !owner ? 'selected' : ''} onClick={() => setGear(g.id)}><span className="gear-icon">{g.icon}</span><span><b>{g.name}</b><small>{owner ? `Carried by ${owner.name}` : g.desc}</small></span><span>{gear === g.id && !owner ? '●' : '○'}</span></button>; })}</div><button className="button primary sticky-action" disabled={!route || !gear || submitting || game.players.some(p => p.id !== me.id && p.gear === gear)} onClick={lock}>Lock route & gear <span>✓</span></button><p className="field-note">Your choice is final. Unclaimed loadouts are assigned automatically at nightfall.</p></>}</section> : game.phase === 'NIGHT_ACTION' ? <section className="phone-night"><div className="phone-section-heading"><Label>NIGHT / {routeName(me.route)}</Label><Clock deadline={game.deadline} now={now} compact /></div><div className="phone-alert"><span>ENEMY ALERT</span><b>{game.alert}%</b></div>{me.wounded && <div className="wounded-notice">✚ You are wounded. You can still act. Ask the medic for treatment.</div>}<MiniGame key={game.event?.id || 'idle'} game={game} request={request} now={now} /><div className="phone-loadout"><Label>YOUR EQUIPMENT</Label><strong>{GEAR.find(g => g.id === me.gear)?.icon} {gearName(me.gear)}</strong>{me.gear === 'flare_gun' && <button className="button secondary" disabled={me.used || !game.event || game.event.final} onClick={() => request('act', { kind: 'flare', eventId: game.event.id })}>{me.used ? 'Flare spent' : 'Fire emergency flare'}</button>}{me.gear === 'medkit' && <div><p>One field treatment available. Select a wounded comrade.</p>{game.players.filter(p => p.wounded).map(p => <button className="button secondary" key={p.id} disabled={me.used} onClick={() => request('act', { kind: 'medkit', target: p.id })}>{me.used ? 'Treatment spent' : `Treat ${p.name}`}</button>)}</div>}</div><div className="field-log"><Label>LATEST FIELD REPORT</Label><p>{game.log[0]?.text}</p></div></section> : <Debrief game={game} now={now} leave={leave} phone />}
    {game.speed < 1 && <div className="drill-tag">QUICK DRILL · HOLD FOR 0.6s</div>}
  </main>;
}

function MiniGame({ game, request, now }) {
  const e = game.event;
  const assignment = game.me.assignment;
  const [value, setValue] = useState('');
  const [frequency, setFrequency] = useState(450);
  const [x, setX] = useState(5);
  const [y, setY] = useState(5);
  const [pin, setPin] = useState('');
  const [holding, setHolding] = useState(false);
  const [sending, setSending] = useState(false);
  const held = useRef(false);
  useEffect(() => {
    function release() { if (held.current && e) { held.current = false; setHolding(false); request('act', { kind: 'hold', down: false, eventId: e.id }); } }
    function visibility() { if (document.hidden) release(); }
    window.addEventListener('blur', release); document.addEventListener('visibilitychange', visibility);
    return () => { held.current = false; window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', visibility); };
  }, [e?.id]);
  async function submit(data) { setSending(true); await request('act', { kind: 'submit', eventId: e.id, pin, ...data }); setSending(false); }
  function hold(down) {
    held.current = down; setHolding(down); request('act', { kind: 'hold', eventId: e.id, down });
  }
  if (!e) return <div className="phone-idle"><div className="radar-icon">⌖</div><Label>KEEP MOVING</Label><h1>Stay sharp.</h1><p>No active obstacle. Watch this screen and listen to your squad.</p></div>;
  return <div className={`phone-event role-${assignment?.role}`}><div className="phone-section-heading"><Label>{assignment?.role === 'operator' ? 'YOUR PANEL IS LIVE' : assignment?.role?.toUpperCase()}</Label><Clock deadline={e.deadline} now={now} compact /></div><h1>{e.title}</h1><div className="assignment-instruction"><Label>{assignment?.role === 'reader' || assignment?.role === 'verifier' ? 'READ THIS ALOUD — DO NOT SHOW YOUR SCREEN' : 'YOUR ORDERS'}</Label><p>{assignment?.instruction}</p></div>
    {assignment?.role === 'operator' && <div className="machine-panel">{e.verifier && <><label htmlFor="pin">SECOND READER’S CODE</label><input id="pin" inputMode="numeric" maxLength={3} value={pin} onChange={ev => setPin(ev.target.value.replace(/\D/g,''))} placeholder="000" />{!e.lookoutDone && <p className="wounded-notice">Your lookout must hold cover before you can submit.</p>}</>}{e.type === 'wire' ? <><Label>SELECT A WIRE / THEN ARM</Label><div className="wire-panel">{['red','blue','yellow','green'].map(color => <button aria-label={`Select ${color} wire`} key={color} className={`wire ${color} ${value === color ? 'cut' : ''}`} onClick={() => setValue(color)}><span /><b>{color.toUpperCase()}</b><span>{value === color ? '✂' : '─'}</span></button>)}</div><button className="button danger" disabled={!value || sending} onClick={() => submit({ value })}>Arm detonator <span>⚡</span></button></> : e.type === 'radio' ? <><div className="frequency-display">{(frequency/10).toFixed(1)} <small>MHz</small></div><label htmlFor="frequency">TUNE FREQUENCY</label><input id="frequency" type="range" min="400" max="500" value={frequency} onChange={ev => setFrequency(Number(ev.target.value))} /><div className="range-labels"><span>40.0</span><span>50.0 MHz</span></div><div className="fine-tune"><button aria-label="Decrease frequency" onClick={() => setFrequency(Math.max(400,frequency-1))}>−</button><span>FINE TUNE / 0.1 MHz</span><button aria-label="Increase frequency" onClick={() => setFrequency(Math.min(500,frequency+1))}>+</button></div><button className="button primary" disabled={sending} onClick={() => submit({ value: frequency })}>Transmit identification <span>↗</span></button></> : e.type === 'sniper' ? <><div className="scope"><span>⌖</span><small>W {x} / E {y}</small></div><label htmlFor="windage">WINDAGE / {x}</label><input id="windage" type="range" min="1" max="9" value={x} onChange={ev => setX(Number(ev.target.value))} /><label htmlFor="elevation">ELEVATION / {y}</label><input id="elevation" type="range" min="1" max="9" value={y} onChange={ev => setY(Number(ev.target.value))} /><button className="button danger" disabled={sending} onClick={() => submit({ x, y })}>Take the shot <span>⌖</span></button></> : e.type === 'interrupt' ? <><Label>RELAY THE ENEMY APPROACH DIRECTION</Label><div className="direction-grid">{['NORTH','EAST','SOUTH','WEST'].map(direction => <button className="button secondary" key={direction} disabled={sending} onClick={() => submit({ value: direction })}>{direction}</button>)}</div></> : null}</div>}
    {assignment?.role === 'hold' && <><button className={`hold-button ${holding ? 'holding' : ''}`} style={{ '--hold-time': `${3 * game.speed}s` }} onPointerDown={ev => { ev.preventDefault(); ev.currentTarget.setPointerCapture(ev.pointerId); hold(true); }} onPointerUp={() => hold(false)} onPointerCancel={() => hold(false)} onKeyDown={ev => { if ([' ', 'Enter'].includes(ev.key) && !ev.repeat) { ev.preventDefault(); hold(true); } }} onKeyUp={ev => { if ([' ', 'Enter'].includes(ev.key)) { ev.preventDefault(); hold(false); } }}><span>{e.lookoutDone ? '✓ COVER SECURED' : holding ? 'STAY DOWN…' : 'PRESS & HOLD'}</span><small>{game.speed < 1 ? '0.6' : '3'} SECONDS TOGETHER</small></button><p className="field-note">{e.holds.length} / {e.participants.length} comrades holding. Releasing early resets your hold.</p></>}
    {['reader','verifier'].includes(assignment?.role) && <div className="reader-footer"><span>↗</span><p>Find <b>{game.players.find(p => p.id === e.operator)?.name}</b>. They have the controls. You have the answer.</p></div>}
    {assignment?.role === 'support' && <p className="field-note">Keep the channel clear. Encourage the operator and help relay the message.</p>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
