import {test,expect} from '@playwright/test';
import path from 'node:path';

test('typing plays decoded wooden sounds; note, volume and mute persist',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.played=0;
    const original=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){window.played++;return original.apply(this,args);};
  });
  await page.goto('/');await page.locator('#editor').pressSequentially('Hello, wooden world!',{delay:50});
  await expect(page.locator('#word-count')).toHaveText('3');
  await expect.poll(()=>page.evaluate(()=>window.played)).toBeGreaterThan(10);
  await page.locator('#volume').fill('37');await page.locator('#mute-button').click();
  await page.reload();await expect(page.locator('#editor')).toHaveValue('Hello, wooden world!');
  await expect(page.locator('#volume')).toHaveValue('37');await expect(page.locator('#mute-label')).toHaveText('Sound is off');
  expect(errors).toEqual([]);
});
test('profiles switch, key sounds are isolated, uploads persist and can be reset',async({page})=>{
  await page.goto('/');await page.locator('[data-code="KeyQ"]').click();await page.locator('#key-sound').selectOption('arcade');
  await expect(page.locator('#binding-count')).toHaveText('1 custom binding');
  await page.locator('#browse-profiles').click();await page.getByRole('button',{name:'Use Creamy switches profile',exact:true}).click();
  await expect(page.locator('#key-sound')).toHaveValue('default');
  await page.locator('#audio-file').setInputFiles(path.resolve('src/assets/sounds/bubble-key.wav'));
  await expect(page.locator('#binding-filename')).toHaveText('bubble-key.wav');
  await page.reload();await page.locator('[data-code="KeyQ"]').click();
  await expect(page.locator('#key-sound')).toHaveValue('upload');
  await page.locator('#reset-key').click();await expect(page.locator('#key-sound')).toHaveValue('default');
  await page.locator('#profile-picker').click();await page.getByRole('button',{name:'Use Wooden mechanical profile',exact:true}).click();
  await expect(page.locator('#key-sound')).toHaveValue('arcade');
});
test('notes download without data loss and clear requires confirmation',async({page})=>{
  await page.goto('/');await page.locator('#editor').fill('These are my words.\nИ мои слова.');
  const promise=page.waitForEvent('download');await page.locator('#export-note').click();const download=await promise;
  expect(download.suggestedFilename()).toMatch(/^FunnyBoard-.*\.txt$/);
  const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe('These are my words.\nИ мои слова.');
  await page.locator('#clear-note').click();await page.locator('#cancel-clear').click();await expect(page.locator('#editor')).not.toHaveValue('');
  await page.locator('#clear-note').click();await page.locator('#confirm-clear').click();await page.reload();await expect(page.locator('#editor')).toHaveValue('');
});
test('a profile exports and imports with embedded custom audio',async({page})=>{
  await page.goto('/');await page.locator('#audio-file').setInputFiles(path.resolve('src/assets/sounds/wood-key.wav'));
  await expect(page.locator('#key-sound')).toHaveValue('upload');
  await page.locator('#browse-profiles').click();
  const promise=page.waitForEvent('download');await page.locator('#export-profile').click();const download=await promise;
  const profilePath=await download.path();
  await page.locator('#profile-file').setInputFiles(profilePath);
  await expect(page.locator('#profile-tag')).toHaveText('YOUR OWN MIX');
  await expect(page.locator('#binding-filename')).toHaveText('wood-key.wav');
  await page.locator('#save-profile').click();await page.locator('#new-profile-name').fill('My cozy keys');await page.locator('#profile-name-form button').click();
  await expect(page.locator('#profile-name')).toHaveText('My cozy keys');
});
test('capture supports keys outside the drawing and browser explains desktop mode',async({page})=>{
  await page.goto('/');await page.locator('#capture-key').click();await page.keyboard.press('Delete');
  await expect(page.locator('#selected-key-name')).toHaveText('Delete');await page.locator('#key-sound').selectOption('typewriter');
  await expect(page.locator('#binding-count')).toHaveText('1 custom binding');
  await page.locator('#scope-everywhere').click();await expect(page.locator('#toast')).toContainText('desktop app');
  await expect(page.locator('#scope-app')).toHaveAttribute('aria-pressed','true');
});
test('mobile layout fits the viewport and dialogs remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#profile-picker').click();await expect(page.locator('#profiles-dialog')).toBeVisible();
  expect(await page.locator('#profiles-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'/tmp/funnyboard-mobile.png',fullPage:true});
});
