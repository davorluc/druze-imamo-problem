import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { io } from 'socket.io-client';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Real transport coverage, separate from deterministic engine tests.
test('Socket.io validates host authority, roster capacity, private snapshots and token rejoin', { timeout: 15000 }, async t => {
  const probe=createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const directory=await mkdtemp(join(tmpdir(),'druze-socket-'));
  const process=spawn('node',['server/index.js'],{env:{...globalThis.process.env,PORT:String(port),PLAYTEST_DIR:directory},stdio:['ignore','pipe','pipe']});
  const clients=[];
  async function stop() {
    if(process.exitCode!==null) return;
    const exited=new Promise(resolve=>process.once('exit',resolve));
    process.kill('SIGTERM'); await exited;
  }
  t.after(async()=>{clients.forEach(c=>c.disconnect());await stop();await rm(directory,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Server did not start within 5 seconds')),5000);
    process.once('error',error=>{clearTimeout(timeout);reject(error);});
    process.stdout.on('data',data=>{if(data.toString().includes('DRUŽE')) {clearTimeout(timeout);resolve();}});
    process.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited: ${code}`));});
  });
  async function client() {
    const s=io(`http://127.0.0.1:${port}`,{transports:['websocket'],autoConnect:false,reconnection:false});
    clients.push(s);s.on('state',state=>{s.state=state;});
    await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);s.connect();});
    return s;
  }
  const send=(s,event,data={})=>s.timeout(3000).emitWithAck(event,data);
  const host=await client();const room=await send(host,'create',{fast:true});
  assert.equal(room.ok,true);assert.match(room.code,/^[A-Z]{4}$/);
  const phones=[];const credentials=[];
  for(let i=0;i<6;i++) {
    const phone=await client();phones.push(phone);
    const response=await send(phone,'join',{code:room.code,name:`Phone ${i+1}`});
    assert.equal(response.ok,true);credentials.push(response);
    assert.equal((await send(phone,'ready',{ready:true})).ok,true);
  }
  const stranger=await client();
  assert.match((await send(stranger,'join',{code:room.code,name:'Seventh'})).error,/full/);
  assert.match((await send(phones[0],'start')).error,/Only the host/);
  assert.match((await send(stranger,'resumeHost',{code:room.code,token:'wrong'})).error,/expired/);
  assert.equal((await send(host,'start')).ok,true);
  assert.equal(host.state.phase,'BRIEFING');assert.equal(host.state.me,null);
  assert.ok(host.state.players.every(p=>!p.token&&!p.clues));
  assert.equal(phones[0].state.me.clues.length,2);
  assert.equal(phones[0].state.mission.clues,undefined);
  assert.equal(phones[0].state.playtestStorage,undefined);
  assert.match((await send(phones[0],'exportPlaytest')).error,/Only the host/);
  assert.match((await send(phones[0],'playtestNote',{text:'Unauthorized'})).error,/Only the host/);
  assert.match((await send(host,'playtestNote',{text:' '})).error,/1–500/);
  assert.equal((await send(host,'playtestNote',{text:'Players understood the briefing'})).ok,true);
  assert.match((await send(stranger,'join',{code:room.code,name:'Latecomer'})).error,/already started/);
  const returning=await client();
  assert.equal((await send(returning,'join',{code:room.code,token:credentials[0].token})).ok,true);
  assert.equal(returning.state.me.id,credentials[0].playerId);
  assert.equal(returning.state.players.length,6);
  assert.match((await send(phones[0],'ready',{ready:true})).error,/Room not found/);
  const newHost=await client();
  assert.equal((await send(newHost,'resumeHost',{code:room.code,token:room.token})).ok,true);
  assert.equal(newHost.state.phase,'BRIEFING');assert.equal(newHost.state.me,null);
  assert.match((await send(host,'start')).error,/Room not found/);
  const before=(await send(newHost,'exportPlaytest')).report;
  await Promise.all(Array.from({length:60},()=>send(phones[1],'ready',{ready:true})));
  const report=(await send(newHost,'exportPlaytest')).report;
  assert.ok(report.summary.rejectedCommands-before.summary.rejectedCommands<=35);
  assert.equal(report.notes[0].text,'Players understood the briefing');
  assert.equal(report.summary.players,6);
  assert.ok(!JSON.stringify(report).includes(room.token));
  assert.equal(report.events.filter(e=>e.type==='command_rejected').every(e=>e.eventId===null),true);
  await stop();
  const persisted=JSON.parse(await readFile(join(directory,`${report.sessionId}.json`),'utf8'));
  const lines=(await readFile(join(directory,`${report.sessionId}.jsonl`),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(persisted.status,'interrupted');
  assert.equal(persisted.events.length,lines.length);
  assert.equal(lines.at(-1).type,'session_closed');
});
