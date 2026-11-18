export const GEAR = [
  { id: 'satchel_charge', name: 'Satchel charge', icon: '▣', desc: 'Plant the final charge. Your squad has the wiring manual.' },
  { id: 'captured_radio', name: 'Captured radio', icon: '▤', desc: 'Spoof radio checks. Someone else knows the frequency.' },
  { id: 'sniper_rifle', name: 'Sniper rifle', icon: '⌖', desc: 'Silence the lookout. Ask your spotter for coordinates.' },
  { id: 'wire_cutters', name: 'Wire cutters', icon: '✂', desc: 'Disable alarms. Never cut without your reader.' },
  { id: 'flare_gun', name: 'Flare gun', icon: '✳', desc: 'One emergency flare per mission. Bypass a non-final obstacle.' },
  { id: 'medkit', name: 'Medkit', icon: '✚', desc: 'One field treatment per mission. Heal a wounded comrade.' },
];

const routes = [
  { id: 'road', name: 'Main road', label: 'A', speed: 'Fast / exposed', x: 34, y: 52 },
  { id: 'ridge', name: 'Forest ridge', label: 'B', speed: 'Slow / concealed', x: 52, y: 32 },
  { id: 'river', name: 'Riverbed', label: 'C', speed: 'Steady / vulnerable', x: 64, y: 65 },
];

export const MISSIONS = [
  {
    id: 'town_garrison', title: 'The Town Garrison', subtitle: 'First, steal the means.', location: 'KOVAČEVAC · OCCUPIED YUGOSLAVIA', date: '18 SEPTEMBER 1943',
    objective: 'Infiltrate the garrison. Steal the explosives and radio codes before the night patrol returns.',
    stakes: 'A clean extraction means more explosives and friendly radio codes at the viaduct. Failure means the bridge garrison will be waiting.',
    target: 'GARRISON', routes,
    clues: [
      'The satchel charge carrier must take the riverbed to reach the ammunition store unnoticed.',
      'A captured radio is needed to impersonate the night patrol.',
      'Wire cutters can disable the alarm circuit at the courtyard gate.',
      'A sniper on any route can eliminate the watchtower sentry.',
      'The main road is fast, but its searchlights demand a coordinated take-cover.',
      'The riverbed is watched by a machine-gun nest. Bring a sniper or an emergency flare.',
      'The final ammunition-store lock requires a satchel charge. Do not leave it behind.',
      'A flare can bypass one obstacle, but not the final objective.',
      'Read transmissions aloud immediately. Only one phone receives each warning.',
      'The wiring manual and the live panel are always on different phones.',
      'Treat wounded comrades before extraction to improve the final score.',
      'The garrison clock is three minutes slow. Trust your own watch.',
    ],
    obstacles: [
      { id: 'radio', at: 10, type: 'radio', title: 'PATROL CHECK-IN', prompt: 'The sentry wants tonight’s radio identification.', gear: 'captured_radio', penalty: 15 },
      { id: 'searchlight', at: 35, type: 'hold', title: 'SEARCHLIGHT SWEEP', prompt: 'Main road team: take cover together.', route: 'road', penalty: 18 },
      { id: 'wires', at: 60, type: 'wire', title: 'COURTYARD ALARM', prompt: 'Cut the alarm circuit before the gate opens.', gear: 'wire_cutters', penalty: 18 },
      { id: 'transmission', at: 85, type: 'interrupt', title: 'INTERCEPTED ORDERS', prompt: 'An urgent transmission is reaching one radio. Read it aloud!', penalty: 12 },
      { id: 'sniper', at: 110, type: 'sniper', title: 'WATCHTOWER SENTRY', prompt: 'The river team is pinned down. Spotter, guide your marksman.', gear: 'sniper_rifle', route: 'river', penalty: 20 },
      { id: 'objective', at: 135, type: 'wire', title: 'BREACH THE AMMUNITION STORE', prompt: 'Open the store, secure the charges, and get out.', gear: 'satchel_charge', requiredRoute: 'river', final: true, penalty: 25 },
    ],
  },
  {
    id: 'iron_viaduct', title: 'Operation: Iron Viaduct', subtitle: 'Tonight, the line goes silent.', location: 'SOKOL RIVER · OCCUPIED YUGOSLAVIA', date: '19 SEPTEMBER 1943',
    objective: 'Reach the center pillar of the iron viaduct. Plant the stolen charges and stop the supply train.',
    stakes: 'The train reaches the bridge at dawn. There is no second attempt. Your work at the garrison will decide the odds.',
    target: 'IRON VIADUCT', routes,
    clues: [
      'The center pillar can only be reached from the riverbed. Send the satchel charge there.',
      'A machine-gun nest on the forest ridge covers the riverbed.',
      'Searchlights sweep the main road. That team must take cover together.',
      'Enemy HQ expects a radio check-in. Bring the captured radio.',
      'A sniper can silence the machine-gun nest from any route.',
      'Wire cutters are needed for the bridge’s early-warning circuit.',
      'If the garrison raid failed, the bridge starts on heightened alert.',
      'The charge cannot be planted without a satchel charge carrier on the riverbed.',
      'A flare buys one free pass through a non-final obstacle.',
      'Five or six comrades means a second verification code and a lookout on technical jobs.',
      'A field medic can clear one wound before the final debrief.',
      'The supply train carries winter equipment. Stop it before the far bank.',
    ],
    obstacles: [
      { id: 'sniper', at: 10, type: 'sniper', title: 'MACHINE-GUN NEST', prompt: 'The ridge gun has the river team in its sights.', gear: 'sniper_rifle', route: 'river', penalty: 20 },
      { id: 'radio', at: 35, type: 'radio', title: 'ENEMY HQ CALLING', prompt: 'Match the frequency and transmit the stolen identification.', gear: 'captured_radio', penalty: 18 },
      { id: 'searchlight', at: 60, type: 'hold', title: 'SEARCHLIGHT SWEEP', prompt: 'Main road team: hold your breath. Take cover together.', route: 'road', penalty: 18 },
      { id: 'wires', at: 85, type: 'wire', title: 'BRIDGE ALARM CIRCUIT', prompt: 'Isolate the detonator from the enemy alarm.', gear: 'wire_cutters', penalty: 20 },
      { id: 'transmission', at: 110, type: 'interrupt', title: 'TRAIN DEPARTURE SIGNAL', prompt: 'One comrade has intercepted the train signal. Relay it now.', penalty: 12 },
      { id: 'objective', at: 135, type: 'wire', title: 'DETONATE THE CENTER PILLAR', prompt: 'Wire the charge. The train is almost here.', gear: 'satchel_charge', requiredRoute: 'river', final: true, penalty: 30 },
    ],
  },
];

export const PHASE_SECONDS = { BRIEFING: 30, DAY_PLANNING: 180, NIGHT_ACTION: 150, DEBRIEF: 45 };
export const COLORS = ['red', 'blue', 'yellow', 'green'];
export const PLAYER_COLORS = ['#e9b85b', '#93b6b0', '#de8d73', '#b4a4cf', '#b6bd83', '#87adc8'];
