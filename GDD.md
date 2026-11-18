# DRUZE, IMAMO PROBLEM - MVP Specs

## 1. High-Level Concept
* **Genre:** Cooperative Asymmetric Party Game (Jackbox meets *Spaceteam* & *GTA Heists*)
* **Setting:** WWII Occupied Yugoslavia (1943)
* **Players:** 4 to 6 Players (Scalable)
* **Session Length:** ~25–35 Minutes (1 Prep Mission + 1 Climax Raid)
* **Platform:** Web-based (1 Shared Host Screen on TV + 4–6 Mobile Browser Controllers)

---

## 2. MVP Scope & Boundaries
To ship a playable prototype quickly, the MVP will strip out meta-progression, accounts, and complex animations in favor of rock-solid core gameplay.

### Included in MVP:
* **Lobby System:** 4-letter room code + QR code join flow (no login required).
* **1 Complete Mini-Campaign:** 
  * *Mission 1 (Prep):* **The Town Garrison** (Steal explosives and radio codes).
  * *Mission 2 (Climax):* **Operation: Iron Viaduct** (Blow up the railway bridge).
* **Core Day/Night Loop:** 3-minute Daytime Planning phase + 2.5-minute Nighttime Action phase per mission.
* **4 Reusable Phone Mini-Games:** Radio Tuner, Wire/Detonator Panel, Coordinate Spotter, and Simultaneous Trigger.
* **Dynamic Scaling:** Automatic clue distribution and obstacle scaling for 4, 5, or 6 players.

### Cut from MVP (Post-MVP Backlog):
* Procedural mission generator (hardcode the 2 MVP missions first).
* Soundtracks/Voice acting (use basic royalty-free SFX: sirens, Morse code, explosions).
* Save states or reconnection recovery (if a phone refreshes mid-round, basic rejoin only).

---

## 3. Core Game Loop & State Machine

The game server manages a strict finite state machine broadcast to all clients via WebSockets:

1. **`LOBBY`**: TV displays QR code and room code. Players enter a Partisan codename on their phones. Host clicks "Start" when 4–6 players are ready.
2. **`BRIEFING` (30s)**: TV displays mission objective, stakes, and terrain map.
3. **`DAY_PLANNING` (180s)**: 
   * TV displays the tactical blueprint with 3 routes (`Route A`, `Route B`, `Route C`), `[?]` hazard markers, and a shared Gear Pool.
   * Server deals total mission clues evenly across all connected phones.
   * Players verbally share intel and lock in **1 Route** + **1 Gear Item** on their phones.
   * *Auto-advances when all players lock in or timer hits `00:00`.*
4. **`NIGHT_ACTION` (150s)**:
   * TV switches to dark/tactical radar view. A master clock ticks toward the deadline.
   * Player icons advance along their chosen routes.
   * Every ~25 seconds, an **Obstacle Event** triggers based on route choices and Prep Mission outcomes.
   * Players solve asymmetric mini-games on their phones before the obstacle timer expires.
5. **`DEBRIEF` (45s)**:
   * TV calculates score based on objective completion, Alert Level, and player casualties.
   * *If Mission 1:* Applies bonuses/penalties to Mission 2 (e.g., unlocked gear or pre-triggered alarms).
   * *If Mission 2:* Displays final victory/defeat newspaper headline and MVP stats.

---

## 4. MVP Content Specification

### Gear Pool (Drafted during Day Phase)
Each item unlocks a specific UI widget on the holder's phone during Night Phase:
1. **`Satchel Charge`**: Displays 4 colored wires + Detonator switch.
2. **`Captured Radio`**: Displays MHz frequency slider + keypad.
3. **`Sniper Rifle`**: Displays Windage/Elevation dials + Fire button.
4. **`Wire Cutters`**: Displays snipping tool + continuity tester.
5. **`Flare Gun`**: Displays single-use emergency blind trigger.
6. **`Medkit`** *(5–6 Player Pool)*: Displays bandage/revive mini-game to clear "Wounded" status.

### Reusable Night Mini-Game Templates
To keep UI development lightweight, all Night Obstacles use one of four interaction patterns:
* **Pattern A (Manual & Machine):** Player 1's phone displays a randomized rule/code (*"Cut RED wire if Alert > 50%"*); Player 2's phone has the interactive wires/buttons.
* **Pattern B (Blind Calibration):** Player 1's phone has sliders/dials (*Radio Frequency* or *Sniper Scope*); Player 2's phone displays target values (*"44.2 MHz"*).
* **Pattern C (Synchronized Hold):** TV demands a coordinated action (*"Take Cover"* or *"Ambush"*). All players on a specific route must press and hold a button simultaneously for 3 seconds.
* **Pattern D (Quick-Time Interrupt):** A random phone flashes an incoming enemy transmission or hazard warning that must be read aloud immediately before it fades.

---

## 5. Scalability Rules (4 vs. 6 Players)

* **Intel Distribution:**
  * Missions contain 12 total clue strings ranked by priority (`1` to `12`).
  * **4 Players:** Clues `1–12` dealt (3 per player).
  * **5 Players:** Clues `1–10` dealt (2 per player; clues `11–12` are flavor/bonus).
  * **6 Players:** Clues `1–12` dealt (2 per player).
* **Obstacle Complexity:**
  * Each Obstacle defines a `base_tasks` array (for 4 players) and `extra_tasks` (appended if player count >= 5).
  * *Example:* Planting the bomb requires 1 Manual Reader + 1 Bomb Tech at 4 players, and adds a 2nd Manual Reader + 1 Lookout Hold-Button at 6 players.

---

## 6. Recommended Tech Stack

* **Frontend (TV Host & Mobile Controllers):** React or Vue (single codebase with `/tv` and `/play` routes). Use Tailwind CSS for rapid WWII dossier/blueprint styling.
* **Backend / Real-Time Sync:** Node.js + Express + `Socket.io` (ideal for room management and low-latency state broadcasts).
* **State Storage:** In-memory JavaScript objects/Maps on the server (no database needed for MVP).
* **Hosting:** Local Wi-Fi / LAN for living room testing, or a single lightweight VPS/Render/Railway instance for easy mobile access via HTTPS.

---

## 7. Sample Mission JSON Schema

Use this data structure to drive your game engine without hardcoding mission logic:

```json
{
  "missionId": "iron_viaduct",
  "title": "Operation: Iron Viaduct",
  "nightDurationSeconds": 150,
  "routes": [
    { "id": "road", "name": "Main Road", "speed": "fast" },
    { "id": "ridge", "name": "Forest Ridge", "speed": "slow" },
    { "id": "river", "name": "Sokol Riverbed", "speed": "medium" }
  ],
  "gearPool": ["satchel_charge", "captured_radio", "sniper_rifle", "wire_cutters", "flare_gun", "medkit"],
  "clues": [
    { "priority": 1, "text": "The Center Pillar can only be reached from the Riverbed." },
    { "priority": 2, "text": "A machine gun on the Forest Ridge covers the Riverbed." },
    { "priority": 3, "text": "Searchlights sweep the Main Road every 30 seconds." },
    { "priority": 4, "text": "Enemy HQ expects a radio check-in at 02:15." }
  ],
  "obstacles": [
    {
      "id": "mg_nest",
      "triggerTimeSeconds": 30,
      "durationSeconds": 20,
      "condition": { "routeOccupied": "river" },
      "tvPrompt": "MG NEST SPOTS RIVER TEAM!",
      "requiredGear": ["sniper_rifle", "flare_gun"],
      "miniGameType": "BLIND_CALIBRATION",
      "penalty": { "alertIncrease": 30, "woundRoute": "river" }
    }
  ]
}
```

---
