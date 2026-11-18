# Druže, imamo problem.

A playable, asymmetric co-op party-game MVP based on [`GDD.md`](./GDD.md). One TV/laptop hosts the operation; **4–6 players** join on their phones. No accounts, apps, database, or external game services.

## Run it

Requires **Node.js 22.12+** (Node 24 LTS recommended) and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173/tv** on the host computer. Keep both processes running; Vite proxies the game connection to port 3001.

### Join from phones

1. Connect the host and phones to the **same Wi-Fi**.
2. Create an operation on the host. The TV shows a four-letter code and QR code.
3. Scan the QR code, or open **http://HOST-LAN-IP:5173/play** and enter the code.
4. Enter codenames and tap **I’m ready**. The host can begin with 4–6 ready, connected comrades.

When hosting from `localhost`, the QR code automatically uses a detected LAN address instead. If your machine has multiple adapters/VPNs, open **“Phones can’t connect?”** under the QR code and select the correct address or paste a complete public base URL. The server prints LAN addresses at startup.

Guest Wi-Fi client isolation, VPN routing, or a firewall can block phone access. Allow TCP **5173** for development. `localhost` on a phone means the phone itself, not your host computer. Camera permissions are not requested by this game; scan using your phone’s normal camera.

### Production / single-port LAN server

```sh
npm run build
npm start
# http://localhost:3001/tv
# phones: http://HOST-LAN-IP:3001/play
```

Set `PORT` to change the server port:

```sh
PORT=8080 npm start
```

On a VPS, build and run a **single Node process** behind an HTTPS reverse proxy that forwards WebSockets and `/socket.io/`. All room state is in that process’s memory; multiple uncoordinated instances will not share rooms. Fonts and artwork are bundled locally; the game does not require internet access after installation.

## How to play

### Night 1 — The Town Garrison

Steal explosives and radio codes from the occupied garrison.

### Night 2 — Operation: Iron Viaduct

Reach the center pillar and destroy the railway bridge before the supply train arrives.

Each mission follows the server-owned state machine:

| Phase | Standard timing | What happens |
|---|---:|---|
| Lobby | Until host starts | 4–6 comrades enter and ready up |
| Briefing | 30 seconds | Read the objective and stakes on the TV |
| Day planning | Up to 180 seconds | Read private intel aloud, select one route and unique gear, then lock in |
| Night action | 150 seconds | Coordinate six scheduled encounters and secure the final objective |
| Debrief | 45 seconds after prep | Score, wounds, and outcome; automatically advance to the viaduct |
| Final report | Until dismissed | Newspaper ending, campaign score, and MVP stats |

Planning advances early when all loadouts are locked. At the deadline, unassigned gear/routes are drafted automatically; unattended choices may produce a bad plan. **The charge carrier must use the riverbed in both missions.**

The GDD’s explicit phase timers give roughly **13 minutes** with full planning clocks, rather than the separate 25–35 minute session estimate. This implementation prioritizes those explicit timers; the final newspaper stays open indefinitely. Tune `shared/content.js` if a longer session is desired.

### Talk, don’t screen-share

- **Manual & machine:** One player gets a randomized wiring instruction. Another selects a wire and arms the charge.
- **Blind calibration:** A radio operator tunes a frequency, or a marksman sets windage/elevation. A different phone has the target values.
- **Synchronized hold:** Everyone on the threatened route holds cover simultaneously for three seconds. Releasing or losing the phone connection resets that player’s hold.
- **Quick-time transmission:** One phone receives an approach direction. Read it aloud before the event expires; another player relays it on their signal panel.

At **5–6 players**, technical encounters add a second reader’s authentication code and a separate lookout who must secure cover before the operator submits. Intel scales to **3 clues each for 4 players**, **2 each for 5** (priorities 1–10), and **2 each for 6** (all 12).

### Gear and consequences

Gear is unique within a mission. Four core technical tools are the charge, radio, rifle, and cutters. A four-person squad can substitute a **single-use flare** for one technical tool, then deploy it during that missing-tool encounter. Flares cannot bypass the final objective. The **medkit** is available with 5–6 players and heals one wound per mission.

Encounters start at 10 / 35 / 60 / 85 / 110 / 135 seconds, with a 14-second action window. Road searchlights and river sentries are skipped if their route is empty. Missing equipment normally fails its encounter immediately; an unused flare leaves a bypass window open instead. Incorrect submissions add 5 alert; three incorrect submissions fail the encounter. Timeouts/failures add alert and wound a comrade. Wounded comrades **remain playable** so a failed early challenge cannot deadlock the squad.

A mission succeeds if the final objective is completed, alert is below 100%, and at least half of triggered encounters succeed. Score = 150 per cleared encounter + 500 for mission success + 5 per remaining alert point − 75 per untreated wound (minimum zero).

A successful prep raid reduces viaduct obstacle-failure penalties by 5. A failed prep raid starts the viaduct at 25% alert. Neither outcome prevents the second mission from being played.

### Keeping phone screens awake

Joined phone controllers automatically request a **Screen Wake Lock** from the lobby through both missions, releasing it when the player leaves or reaches the final report. The controller shows whether stay-awake is active. Returning from another app/tab reacquires it where supported; if the browser blocks or releases it, use **Retry screen stay-awake**.

**This API requires a secure context:** HTTPS (or localhost for development). Your phone visiting `http://HOST-LAN-IP:5173` is **not** a secure context, even on the same Wi-Fi. For a plain-HTTP LAN playtest, the controller shows a reminder to extend the phone’s screen timeout/Auto-Lock manually. For automatic stay-awake on physical phones, serve the game over HTTPS with a certificate those phones trust. An untrusted/self-signed certificate warning is not a reliable substitute.

Keep the controller **foregrounded**. Wake-lock does not prevent manual locking, switching apps, browser suspension, or network loss, and battery-saving/device policies can override it. It is best-effort, not a guarantee. There are no fake-video/audio keep-awake workarounds.

### Quick drill

Select **Quick drill** before creating a room for **5× faster timers**, including 0.6-second holds and 2.8-second encounter windows. This is intentionally brisk: use it for smoke tests, not a first playthrough.

Optional sound can be enabled with the music-note button. Browsers require a user gesture before playing synthesized field-radio cues; no copyrighted recordings are used.

## Playtest logs and metrics

Every **new operation** now records server-observed events automatically. Nothing is sent to an analytics service and no database is required. Earlier playtests cannot be reconstructed retroactively.

### During or after a playtest

On the **host screen**, open **“Playtest tools · logs & metrics”** below the main game area:

- **Refresh metrics** shows current encounter results, timeouts, incorrect answers, rejected commands, disconnects, and score. These are a snapshot, not a constantly updating dashboard.
- **Save timestamped note** attaches an observation to the current mission, phase, and active encounter. Example: “Reader understood the frequency but operator couldn’t find Transmit.” Notes are limited to 500 characters each and 100 per operation.
- **Download report (.md)** produces a human-readable summary with phase timings, loadouts, encounter response times, outcomes, and connection history.
- **Download data (.json)** includes the same metrics plus the complete retained, timestamped event timeline for deeper analysis.

Reports are **host-only** and available from the lobby onward, including incomplete sessions. Download before choosing “Back to command” or closing the host session if you want the browser copy. Phones cannot retrieve reports or submit observer notes.

### Automatic disk copies

The server writes these files outside the publicly served folder:

```text
playtests/<session-uuid>.jsonl   Append-only, ordered event log
playtests/<session-uuid>.json    Latest structured report checkpoint
playtests/<session-uuid>.md      Latest human-readable report checkpoint
```

The session UUID distinguishes repeated room codes. Reports checkpoint about every **5 seconds**, and also on export, saved notes, final mission resolution, room expiry, and graceful server shutdown. Writes are queued off the gameplay path. A hard crash/power failure may lose queued writes and the latest few seconds of report checkpoints; disk logs are not a game save or automatic game recovery system.

Change the storage directory with an absolute path if desired:

```sh
PLAYTEST_DIR=/path/to/playtests npm run dev
# or: PLAYTEST_DIR=/path/to/playtests npm start
```

The default `playtests/` directory is ignored by Git. **Files survive server restarts**, but there is no in-app archive browser yet: open the files directly after a restart. Back up reports you want to keep. There is no automatic disk retention/deletion; remove old session files manually.

### What the numbers mean

- Durations and response times use **real wall-clock milliseconds**. Drill speed is recorded separately, so do not compare drill reaction times directly with normal-timer runs.
- Gameplay duration excludes the lobby and stops at final mission resolution. Phase timing records actual durations, including early planning completion; final debrief dwell time is excluded after completion.
- First action is the first observed submission or hold press, not the time someone first read or understood the prompt. First submission excludes holds. Medkit treatments are standalone support events.
- Wrong answers count failed answer checks. An incorrect verifier PIN, acting before the lookout is ready, a stale encounter action, or another invalid command is a **rejected command**, not a wrong answer. A wrong answer can also generate a rejection response, so these counts are not mutually exclusive. Rate-limit rejections are not instrumented.
- Encounter failures distinguish **timeout**, **missing gear**, **wrong route**, **three incorrect attempts**, and phase-end expiry; successful flare bypasses are labeled separately. Empty-route obstacles are logged as avoided, not failed.
- Disconnect counts and downtime cover the play interval (through completion/closure). Rejoining while already connected is recorded as a controller takeover, not an outage. Host connection events are recorded separately.
- The in-memory/downloadable timeline retains up to **10,000 events** per operation. Reports explicitly flag dropped events and become incomplete beyond this limit; the disk JSONL continues recording. Observer notes are rejected once the memory limit is reached.
- Disk errors never stop gameplay. The host tools show a disk-logging error warning; download the in-memory report immediately. The warning remembers any write failure during the server’s lifetime because an earlier event may have been lost, even if subsequent writes succeed.

Logs contain player **codenames** and internal player IDs, but **not** reconnect/host tokens, IP addresses, private intel, randomized answers, PINs, or submitted answer values. Notes are free text: do not enter sensitive information. Treat exported files as playtest data rather than a public game artifact, and tell participants you are recording gameplay metrics. Metrics cannot establish whether someone was confused, distracted, speaking, or reading—use observer notes and player feedback for that.

## Verification

```sh
npm test                  # engine, regression, and real Socket.io transport tests
npm run build             # production frontend
npx playwright install chromium  # one-time browser setup
npm run test:e2e           # real browser multiplayer tests; ~2 minutes
```

The browser suite starts its own production server on port **3002**. It checks responsive layouts and join errors, completes both missions with four real phone-browser controllers, verifies basic phone/host reload, and exercises six-player calibration with independent operator, reader, verifier, and lookout. Screenshots and failure traces are written to `test-results/`.

## Structure

```text
shared/content.js     Mission definitions, routes, gear, intel, and phase durations
server/engine.js      Authoritative finite state machine and per-viewer snapshots
server/index.js       Express, Socket.io, rooms, role authorization, and room expiry
src/main.jsx          React host (/tv), phone (/play), and landing interfaces
src/styles.css        Responsive dossier / tactical-map visual system
tests/                Engine, transport, regression, and Playwright browser tests
```

The TV receives public squad state, never private clue cards or challenge answers. Each phone gets only its own intel and task assignment. Answers, equipment uniqueness, hold timing, and phase changes are validated on the server. Host controls require a server-issued host token.

## MVP boundaries

- In-memory rooms only; restarting the server clears every operation. Rooms expire after two hours without player/host commands.
- Basic same-tab refresh/network rejoin uses a session-storage token. This is **not** durable save/recovery, cross-device takeover, or a promise of seamless mobile background operation. Keep controllers open and foregrounded.
- Disconnected players keep their slots; the host can remove them in the lobby. After launch, the roster is locked and timers continue. A returning player must use their original browser tab/session.
- No accounts, matchmaking, persistent progression, procedural missions, voice chat, soundtrack, or voice acting.
- The map is a stylized tactical visualization, not a physics/navigation simulation. This is a cooperative party game, not a security boundary against teammates inspecting their own browser.
- Browser automation covers Chromium. Physical iOS/Android devices and your local Wi-Fi still need a real squad playtest for balance, readability across a room, and mobile background/sleep behavior.
