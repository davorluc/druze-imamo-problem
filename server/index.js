import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { Game } from './engine.js';
import { PlaytestStore } from './playtest.js';

const app = express();
const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 8192 });
const rooms = new Map();
const playtests = new PlaytestStore();
const checkpoints = new Map();
function checkpoint(game, force = false) {
  const previous = checkpoints.get(game.playtest.id);
  if (!force && previous && Date.now() - previous.at < 5000) return;
  const attempt = { at: Date.now(), savedAt: previous?.savedAt ?? null };
  checkpoints.set(game.playtest.id, attempt);
  playtests.save(game.playtest.report(playtests.status())).then(saved => { if (saved) attempt.savedAt = Date.now(); });
}
const port = Number(process.env.PORT || 3001);
const lan = Object.values(networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal).map(x => x.address);
app.get('/api/network', (_req, res) => res.json({ addresses: lan, port }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size }));
app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
app.get('/{*path}', (_req, res) => res.sendFile(fileURLToPath(new URL('../dist/index.html', import.meta.url))));

function broadcast(game) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.code === game.code) socket.emit('state', { ...game.snapshot(socket.data.playerId), ...(socket.data.host ? { playtestStorage: playtests.status() } : {}) });
  }
}
function roomFor(socket) {
  const game = rooms.get(socket.data.code);
  if (!game) throw new Error('Room not found. Create or join a new operation.');
  return game;
}
function hostOnly(socket, game) { if (!socket.data.host || socket.data.hostToken !== game.hostToken) throw new Error('Only the host can do that.'); }
function detach(socket, reason = 'left') {
  const game = rooms.get(socket.data.code);
  if (game && !stopping) {
    if (socket.data.host) game.setHostConnected(false, reason);
    if (socket.data.playerId) game.disconnect(socket.data.playerId, reason);
    broadcast(game);
  }
  socket.data = {};
}

io.on('connection', socket => {
  let requests = [];
  function on(name, handler) {
    socket.on(name, (data, ack) => {
      if (typeof ack !== 'function') return;
      let allowed = false;
      try {
        requests = requests.filter(t => t > Date.now() - 1000);
        if (requests.length >= 35) throw new Error('Too many requests. Take a breath.');
        requests.push(Date.now());
        allowed = true;
        const result = handler(data || {}) || {};
        const game = rooms.get(socket.data.code);
        if (game) { game.updatedAt = Date.now(); broadcast(game); }
        ack({ ok: true, ...result });
      } catch (error) {
        const game = rooms.get(socket.data.code);
        if (game) {
          if (allowed && ['ready', 'start', 'plan', 'act'].includes(name)) {
            const eventId = name === 'act' && game.playtest.events.some(e => e.type === 'encounter_started' && e.eventId === data?.eventId) ? data.eventId : null;
            game.record('command_rejected', { command: name, playerId: socket.data.playerId ?? null, eventId, reason: error.message });
          }
          broadcast(game);
        }
        ack({ ok: false, error: error.message });
      }
    });
  }
  on('create', ({ fast }) => {
    if (rooms.size >= 100) throw new Error('The operation board is full. Try again later.');
    detach(socket);
    let code;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    do { code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
    const game = new Game(code, { speed: fast === true ? 0.2 : 1, onRecord: (id, event) => { playtests.record(id, event); } });
    rooms.set(code, game);
    socket.data = { code, host: true, hostToken: game.hostToken };
    game.setHostConnected(true);
    return { code, token: game.hostToken };
  });
  on('resumeHost', ({ code, token }) => {
    const game = rooms.get(String(code).toUpperCase());
    if (!game || token !== game.hostToken) throw new Error('Host session expired. Create a new operation.');
    detach(socket);
    for (const other of io.sockets.sockets.values()) if (other.id !== socket.id && other.data.host && other.data.code === game.code) { other.emit('superseded'); other.data = {}; }
    socket.data = { code: game.code, host: true, hostToken: token };
    game.setHostConnected(true, 'resumed');
    return { code: game.code, token };
  });
  on('join', ({ code, name, token }) => {
    const game = rooms.get(String(code).trim().toUpperCase());
    if (!game) throw new Error('No operation with that code. Check the TV and try again.');
    if (socket.data.code) detach(socket);
    const player = game.join(name, token);
    for (const other of io.sockets.sockets.values()) if (other.id !== socket.id && other.data.playerId === player.id) { other.emit('superseded'); other.data = {}; }
    socket.data = { code: game.code, playerId: player.id };
    return { code: game.code, token: player.token, playerId: player.id };
  });
  on('ready', ({ ready }) => {
    const game = roomFor(socket);
    if (game.phase !== 'LOBBY') throw new Error('The operation has already started.');
    const p = game.players.find(p => p.id === socket.data.playerId);
    if (!p) throw new Error('Join on a phone first.');
    p.ready = Boolean(ready);
    game.record('player_ready', { playerId: p.id, ready: p.ready });
  });
  on('start', () => { const game = roomFor(socket); hostOnly(socket, game); game.start(); });
  on('remove', ({ id }) => {
    const game = roomFor(socket); hostOnly(socket, game); game.remove(id);
    for (const other of io.sockets.sockets.values()) if (other.data.playerId === id) { other.emit('removed'); other.data = {}; }
  });
  on('plan', data => roomFor(socket).plan(socket.data.playerId, data));
  on('act', data => roomFor(socket).act(socket.data.playerId, data));
  on('exportPlaytest', () => {
    const game = roomFor(socket); hostOnly(socket, game);
    checkpoint(game, true);
    return { report: game.playtest.report(playtests.status()) };
  });
  on('playtestNote', ({ text }) => {
    const game = roomFor(socket); hostOnly(socket, game);
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 500) throw new Error('Write a note of 1–500 characters.');
    if (game.playtest.events.length >= game.playtest.maxEvents) throw new Error('The in-memory event limit was reached. Observer notes are closed; inspect the disk JSONL log.');
    if (game.playtest.events.filter(e => e.type === 'observer_note').length >= 100) throw new Error('This session already has 100 observer notes.');
    game.record('observer_note', { text: text.trim(), eventId: game.event?.id ?? null });
    checkpoint(game, true);
  });
  on('leave', () => { detach(socket); });
  socket.on('disconnect', reason => detach(socket, reason));
});
const timer = setInterval(() => {
  for (const [code, game] of rooms) {
    if (Date.now() - game.updatedAt > 2 * 60 * 60 * 1000) {
      for (const socket of io.sockets.sockets.values()) if (socket.data.code === code) { socket.emit('expired'); socket.data = {}; }
      game.record('session_closed', { reason: 'room_expired' });
      checkpoint(game, true); checkpoints.delete(game.playtest.id);
      rooms.delete(code); continue;
    }
    const finalBefore = game.results.length === 2;
    game.tick(); broadcast(game);
    checkpoint(game, !finalBefore && game.results.length === 2);
  }
}, 200);
server.listen(port, '0.0.0.0', () => {
  console.log(`\nDRUŽE, IMAMO PROBLEM · http://localhost:${port}`);
  lan.forEach(ip => console.log(`LAN: http://${ip}:${port}`));
  console.log('Development UI: http://localhost:5173\n');
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  for (const game of rooms.values()) {
    game.record('session_closed', { reason: 'server_shutdown' });
    checkpoint(game, true);
  }
  io.close(); server.close();
  await playtests.flush();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
