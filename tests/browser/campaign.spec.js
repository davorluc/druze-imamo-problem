import { test, expect } from '@playwright/test';

async function setRange(locator, value) {
  await locator.evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('landing and join pages are responsive and room errors are actionable', async ({ page }, info) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Establish an operation'})).toBeEnabled();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:info.outputPath('landing.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:info.outputPath('landing-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.goto('/play?room=ZZZZ');
  await page.getByLabel('YOUR CODENAME').fill('Sokol');
  await page.getByRole('button',{name:'Join the resistance'}).click();
  await expect(page.getByRole('alert')).toContainText('No operation with that code');
  await page.getByRole('button',{name:'Dismiss error'}).click();
  await page.screenshot({path:info.outputPath('phone-join.png'),fullPage:true});
});

test('four real phone browsers win both missions via private instructions and live controls', async ({ browser, page: host }, info) => {
  const contexts=[];const phones=[];const errors=[];
  host.on('pageerror',e=>errors.push(e.message));
  await host.setViewportSize({width:1440,height:1000});
  await host.goto('/tv');
  await host.getByLabel('Quick drill').check();
  await host.getByRole('button',{name:'Establish an operation'}).click();
  await expect(host.locator('.room-code')).toHaveText(/^[A-Z]{4}$/);
  const code=await host.locator('.room-code').innerText();
  for(let i=0;i<4;i++) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
    const phone=await context.newPage();phones.push(phone);
    phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(`/play?room=${code}`);
    await phone.getByLabel('YOUR CODENAME').fill(['Sokol','Iskra','Vuk','Mila'][i]);
    await phone.getByRole('button',{name:'Join the resistance'}).click();
    await expect(phone.getByRole('heading',{name:'You’re in.'})).toBeVisible();
    await phone.getByRole('button',{name:'I’m ready'}).click();
  }
  await phones[0].reload();
  await expect(phones[0].getByRole('button',{name:'Ready for orders'})).toBeVisible();
  await host.reload();
  await expect(host.getByRole('button',{name:'Begin the operation'})).toBeEnabled();
  await host.screenshot({path:info.outputPath('lobby.png'),fullPage:true});
  await host.getByRole('button',{name:'Begin the operation'}).click();
  for(let mission=0;mission<2;mission++) {
    await expect(phones[0].getByRole('heading',{name:'Your piece of the puzzle.'})).toBeVisible({timeout:20000});
    if(mission===0) {
      expect(await phones[0].locator('.sticky-action').evaluate(el=>getComputedStyle(el).position)).toBe('static');
      await phones[0].screenshot({path:info.outputPath('phone-intel.png'),fullPage:true});
    }
    const gears=['Satchel charge','Captured radio','Sniper rifle','Wire cutters'];
    for(let i=0;i<4;i++) {
      await phones[i].locator('.route-options').getByRole('button',{name:i===0?'C Riverbed':i===1?'A Main road':'B Forest ridge',exact:false}).click();
      await phones[i].locator('.gear-options').getByRole('button',{name:gears[i],exact:false}).click();
      await phones[i].getByRole('button',{name:'Lock route & gear'}).click();
    }
    const eventIds=new Set();
    // Six encounters per mission. Read only the rendered private instructions, never server internals.
    while(eventIds.size<6) {
      await expect(host.locator('.live-event')).toBeVisible({timeout:10000});
      const title=await host.locator('.live-event h2').innerText();
      if(eventIds.has(title)) { await host.waitForTimeout(80); continue; }
      eventIds.add(title);
      const holdIndex=await Promise.all(phones.map(p=>p.locator('.role-hold').count()));
      if(holdIndex.some(Boolean)) {
        const holder=phones[holdIndex.findIndex(Boolean)];
        const button=holder.locator('.hold-button');
        await button.scrollIntoViewIfNeeded();
        const box=await button.boundingBox();await holder.mouse.move(box.x+box.width/2,box.y+box.height/2);await holder.mouse.down();
        await expect(host.locator('.live-event')).toBeHidden();
        await holder.mouse.up();
      } else {
        const roleIndices=await Promise.all(phones.map(p=>p.locator('.role-operator').count()));
        const operator=phones[roleIndices.findIndex(Boolean)];
        const readers=await Promise.all(phones.map(p=>p.locator('.role-reader .assignment-instruction p').allTextContents()));
        const instruction=readers.flat()[0];
        if(title.includes('CHECK-IN')||title.includes('HQ CALLING')) {
          const frequency=Number(instruction.match(/([\d.]+) MHz/)[1]);
          await setRange(operator.locator('#frequency'),Math.round(frequency*10));
          await operator.getByRole('button',{name:'Transmit identification'}).click();
        } else if(title.includes('SENTRY')||title.includes('GUN NEST')) {
          const [,x,y]=instruction.match(/Windage (\d). Elevation (\d)/);
          await setRange(operator.locator('#windage'),Number(x));await setRange(operator.locator('#elevation'),Number(y));
          await operator.getByRole('button',{name:'Take the shot'}).click();
        } else if(title.includes('ORDERS')||title.includes('SIGNAL')) {
          const direction=instruction.match(/(NORTH|EAST|SOUTH|WEST)/)[1];
          await operator.getByRole('button',{name:direction,exact:true}).click();
        } else {
          const color=instruction.match(/(RED|BLUE|YELLOW|GREEN)/)[1].toLowerCase();
          await operator.getByRole('button',{name:`Select ${color} wire`,exact:true}).click();
          await operator.getByRole('button',{name:'Arm detonator'}).click();
        }
        if(mission===0 && eventIds.size===1) await host.screenshot({path:info.outputPath('night-map.png'),fullPage:true});
      }
      await expect(host.locator('.live-event')).toBeHidden();
      await expect(host.locator('.alert-heading strong')).toHaveText('0%');
      for(const phone of phones) await expect(phone.getByRole('alert')).toHaveCount(0);
    }
    await expect(host.locator('.newspaper h2')).toHaveText(mission===0?'GARRISON RAID A SUCCESS.':'THE LINE IS BROKEN.',{timeout:10000});
    if(mission===1) {
      await host.screenshot({path:info.outputPath('victory.png'),fullPage:true});
      await expect(host.locator('.mvp-line')).toContainText('Campaign score:');
      await expect(phones[0].getByRole('button',{name:'Leave operation'})).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
  for(const context of contexts) await context.close();
});
