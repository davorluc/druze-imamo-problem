import { test, expect } from '@playwright/test';

test('six phones cooperate on a calibration with a second reader and lookout',async({browser,page:host},info)=>{
  const contexts=[];const phones=[];const errors=[];
  await host.goto('/tv');await host.getByLabel('Quick drill').check();
  await host.getByRole('button',{name:'Establish an operation'}).click();
  const code=await host.locator('.room-code').innerText();
  for(let i=0;i<6;i++) {
    const context=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});contexts.push(context);
    const phone=await context.newPage();phones.push(phone);phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(`/play?room=${code}`);await phone.getByLabel('YOUR CODENAME').fill(`Comrade ${i+1}`);
    await phone.getByRole('button',{name:'Join the resistance'}).click();await phone.getByRole('button',{name:'I’m ready'}).click();
  }
  await host.getByRole('button',{name:'Begin the operation'}).click();
  await expect(phones[0].locator('.intel-card')).toHaveCount(2);
  const gear=['Satchel charge','Captured radio','Sniper rifle','Wire cutters','Flare gun','Medkit'];
  for(let i=0;i<6;i++) {
    await phones[i].locator('.route-options button').nth(i===0?2:1).click();
    await phones[i].locator('.gear-options').getByRole('button',{name:gear[i]}).click();
    await phones[i].getByRole('button',{name:'Lock route & gear'}).click();
  }
  await expect(host.locator('.live-event')).toContainText('PATROL CHECK-IN');
  const assignments=await Promise.all(phones.map(p=>p.locator('.assignment-instruction p').innerText()));
  const reader=assignments.findIndex(t=>t.includes('MHz'));
  const verifier=assignments.findIndex(t=>t.includes('authentication code'));
  const lookout=assignments.findIndex(t=>t.includes('lookout'));
  const operator=assignments.findIndex(t=>t.includes('panel is live')||t.includes('radio is live'));
  expect(new Set([reader,verifier,lookout,operator]).size).toBe(4);
  expect(Math.min(reader,verifier,lookout,operator)).toBeGreaterThanOrEqual(0);
  const frequency=Number(assignments[reader].match(/([\d.]+) MHz/)[1]);
  const pin=assignments[verifier].match(/code: (\d+)/)[1];
  const op=phones[operator];
  const transmit=op.getByRole('button',{name:'Transmit identification'});
  const lookoutName=`Comrade ${lookout+1}`;
  await expect(host.locator('.event-assignments')).toContainText(`LOOKOUT${lookoutName}`);
  await expect(op.locator('.phone-event h1')).toBeInViewport({ratio:1});
  await expect(transmit).toBeInViewport({ratio:1});
  await expect(transmit).toBeDisabled();
  await expect(op.locator('.cover-status')).toContainText(`Waiting for ${lookoutName}`);
  await op.locator('#pin').fill(pin);
  await op.locator('#frequency').evaluate((input,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));
    input.dispatchEvent(new Event('input',{bubbles:true}));
  },Math.round(frequency*10));
  const hold=phones[lookout].locator('.hold-button');
  await expect(hold).toBeInViewport({ratio:1});
  const box=await hold.boundingBox();await phones[lookout].mouse.move(box.x+box.width/2,box.y+box.height/2);await phones[lookout].mouse.down();
  await expect(hold).toContainText('COVER SECURED');
  await phones[lookout].mouse.up();
  await expect(op.locator('.cover-status')).toContainText('Cover secured');
  await expect(transmit).toBeEnabled();
  await transmit.click();
  await expect(host.locator('.live-event')).toBeHidden();
  for(const screen of [host,op]) {
    const result=screen.locator('.encounter-result.cleared');
    await expect(result).toContainText('PATROL CHECK-IN');
    await expect(result).toBeInViewport({ratio:1});
  }
  await expect(host.locator('.field-log')).toContainText('SUCCESS · PATROL CHECK-IN');
  await expect(host.locator('.alert-heading strong')).toHaveText('0%');
  for(const p of phones) { await expect(p.getByRole('alert')).toHaveCount(0);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy(); }
  expect(errors).toEqual([]);
  await host.screenshot({path:info.outputPath('six-player-night.png'),fullPage:true});
  await expect(op.locator('.phone-idle')).toBeVisible();
  await expect(host.locator('.live-event')).toContainText('COURTYARD ALARM');
  for(const screen of [host,op]) {
    const result=screen.locator('.encounter-result.failed');
    await expect(result).toContainText('COURTYARD ALARM');
    await expect(result).toContainText('Time ran out.');
    await expect(result).toBeInViewport({ratio:1});
  }
  for(const c of contexts)await c.close();
});
