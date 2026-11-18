import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { io } from 'socket.io-client';

// Real transport coverage, separate from deterministic engine tests.
test('Socket.io validates host authority, roster capacity, private snapshots and token rejoin', { timeout: 15000 }, async t => {
  const probe=createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  const process=spawn('node',['server/index.js'],{env:{...globalThis.process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const clients=[];
  t.after(()=>{clients.forEach(c=>c.disconnect());process.kill('SIGTERM');});
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
});
