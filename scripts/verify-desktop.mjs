import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PROFILES} from '../src/model.js';

const userData=await mkdtemp(path.join(tmpdir(),'funnyboard-qa-'));
const executable=process.env.FUNNYBOARD_EXECUTABLE;
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let application;
try {
  application=await electron.launch({
    ...(executable?{executablePath:executable}:{}),
    args:[...(executable?[]:['.']),'--no-sandbox',`--user-data-dir=${userData}`],env,timeout:30000
  });
  const page=await application.firstWindow();await page.waitForLoadState('domcontentloaded');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('#profile-name')).toHaveText('Wooden mechanical');
  if(process.env.FUNNYBOARD_QA_PROFILE){
    await page.locator('#browse-profiles').click();
    await page.getByRole('button',{name:`Use ${process.env.FUNNYBOARD_QA_PROFILE} profile`,exact:true}).click();
    await expect(page.locator('#profile-name')).toHaveText(process.env.FUNNYBOARD_QA_PROFILE);
  }
  await page.screenshot({path:'/tmp/funnyboard-desktop.png',fullPage:true});
  await page.locator('#editor').pressSequentially('A little more joy in every keystroke.',{delay:30});
  await expect(page.locator('#word-count')).toHaveText('7');
  await page.locator('#mute-button').click();await page.locator('#mute-button').click();
  await page.evaluate(()=>{
    window.globalKeys=[];window.sourcesPlayed=0;
    window.funnyboard.onKey(key=>window.globalKeys.push(key));
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){window.sourcesPlayed++;return start.apply(this,args);};
  });
  await page.locator('#scope-everywhere').click();
  await expect(page.locator('#scope-everywhere')).toHaveAttribute('aria-pressed','true');
  const otherPagePromise=application.waitForEvent('window');
  await application.evaluate(async({BrowserWindow})=>{
    const other=new BrowserWindow({width:430,height:180,title:'FunnyBoard keyboard test',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    await other.loadURL('data:text/html,<title>FunnyBoard keyboard test</title><p>Temporary window for testing background key sounds.</p><input autofocus>');
    other.show();other.focus();
  });
  const otherPage=await otherPagePromise;await otherPage.locator('input').focus();
  // Inject actual X11/OS keys into our own temporary test window.
  await application.evaluate(async({BrowserWindow})=>{
    const target=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='FunnyBoard keyboard test');
    if(!target?.isFocused())throw new Error('Test window must be focused before key injection.');
  });
  execFileSync('python3',[path.resolve('scripts/test-x11-keys.py')]);
  // Other physical keys may arrive from an active desktop during this check.
  await expect.poll(()=>page.evaluate(()=>['KeyA','Space'].every(code=>window.globalKeys.some(key=>key.down&&key.code===code)))).toBe(true);
  const continuous=PROFILES.find(profile=>profile.name===process.env.FUNNYBOARD_QA_PROFILE)?.continuous;
  await expect.poll(()=>page.evaluate(()=>window.sourcesPlayed)).toBeGreaterThanOrEqual(continuous?1:2);
  await expect(page.locator('#editor')).toHaveValue('A little more joy in every keystroke.');
  // Muting must also suppress sounds from background key events.
  await page.evaluate(()=>document.getElementById('mute-button').click());
  await page.waitForTimeout(30);
  const mutedSources=await page.evaluate(()=>window.sourcesPlayed);
  const mutedKeys=await page.evaluate(()=>window.globalKeys.filter(key=>key.down).length);
  execFileSync('python3',[path.resolve('scripts/test-x11-keys.py')]);
  await expect.poll(()=>page.evaluate(()=>window.globalKeys.filter(key=>key.down).length)).toBeGreaterThanOrEqual(mutedKeys+2);
  expect(await page.evaluate(()=>window.sourcesPlayed)).toBe(mutedSources);
  await page.evaluate(()=>document.getElementById('mute-button').click());
  // Keep the auxiliary window until app shutdown; focus the app by its trusted URL.
  await application.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('funnyboard://app/'));w.show();w.focus();});
  await page.locator('#scope-app').click();await expect(page.locator('#scope-app')).toHaveAttribute('aria-pressed','true');
  await page.locator('#editor').fill('');await page.waitForTimeout(300);
  await page.screenshot({path:'/tmp/funnyboard-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
  console.log('Desktop QA passed: native window, typing, global key events, background audio, no captured text, and mode switching.');
} finally {if(application)await application.close();await rm(userData,{recursive:true,force:true});}
