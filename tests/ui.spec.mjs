import {test,expect} from '@playwright/test';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {validateProfile} from '../src/model.js';

function audioFile({amplitude=.02,duration=4,sampleRate=8000,channels=2}={}){
  const frames=Math.round(duration*sampleRate),buffer=Buffer.alloc(44+frames*channels*2);
  buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(channels,22);buffer.writeUInt32LE(sampleRate,24);buffer.writeUInt32LE(sampleRate*channels*2,28);buffer.writeUInt16LE(channels*2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(buffer.length-44,40);
  for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++)buffer.writeInt16LE(Math.round(32767*amplitude*Math.sin(2*Math.PI*(channel?620:440)*frame/sampleRate)),44+(frame*channels+channel)*2);
  return buffer;
}
async function openAudioForm(page){await page.locator('#browse-profiles').click();await page.locator('#new-audio-profile').click();}
async function createFromAudio(page,name,buffer){
  await openAudioForm(page);await page.locator('#audio-profile-name').fill(name);
  await page.locator('#profile-audio-file').setInputFiles({name:'audio.wav',mimeType:'audio/wav',buffer});
  await expect(page.locator('#create-audio-profile-submit')).toBeEnabled();await page.locator('#create-audio-profile-submit').click();await expect(page.locator('#profile-name')).toHaveText(name);
}

test('one uploaded sample creates a normalized continuous profile and survives restart and cleanup',async({page})=>{
  await page.addInitScript(()=>{
    window.flowStarts=[];const original=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){window.flowStarts.push({duration:this.buffer.duration,offset:args[1]||0,channels:this.buffer.numberOfChannels});return original.apply(this,args);};
  });
  await page.goto('/');await createFromAudio(page,'Quiet Ocean',audioFile());
  const profile=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('funnyboard.settings.v1'));return s.customProfiles.find(p=>p.id===s.profile);});
  expect(profile.continuous).toBe(true);expect(profile.gain).toBeGreaterThan(1);
  await page.locator('#editor').pressSequentially('abcd',{delay:100});
  expect(await page.evaluate(()=>window.flowStarts.filter(s=>Math.abs(s.duration-4)<.001).length)).toBe(1);
  await page.locator('#key-sound').selectOption('wood');await page.locator('#reset-key').click();
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('Quiet Ocean');
  await page.locator('#editor').press('KeyA');await expect.poll(()=>page.evaluate(()=>window.flowStarts.some(s=>Math.abs(s.duration-4)<.001&&s.channels===2))).toBe(true);
  const ids=await page.evaluate(async()=>{const store=await import('/store.js');return store.getSoundIds();});expect(ids).toContain(profile.audioAssetId);
  await createFromAudio(page,'Loud Ocean',audioFile({amplitude:.8}));
  const loud=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('funnyboard.settings.v1'));return s.customProfiles.find(p=>p.id===s.profile);});
  expect(loud.gain).toBeLessThan(1);expect(profile.gain/loud.gain).toBeCloseTo(40,0);
});

test('continuous profile export/import keeps the full file and recomputes loudness',async({page})=>{
  const buffer=audioFile({amplitude:.01,duration:5});await page.goto('/');await createFromAudio(page,'My audio',buffer);
  await page.locator('#key-sound').selectOption('arcade');await page.locator('#browse-profiles').click();
  const promise=page.waitForEvent('download');await page.locator('#export-profile').click();const download=await promise;
  const filename=await download.path();const data=JSON.parse(await readFile(filename,'utf8'));
  expect(data.version).toBe(2);expect(Buffer.from(data.audio.data.split(',')[1],'base64').equals(buffer)).toBe(true);
  const initial=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('funnyboard.settings.v1'));return s.customProfiles.find(p=>p.id===s.profile);});
  await page.locator('#profile-file').setInputFiles(filename);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('funnyboard.settings.v1')).customProfiles.length)).toBe(2);
  const imported=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('funnyboard.settings.v1'));return s.customProfiles.find(p=>p.id===s.profile);});
  expect(imported.audioAssetId).not.toBe(initial.audioAssetId);expect(imported.gain).toBeCloseTo(initial.gain,5);
  await page.locator('#profiles-dialog .close-dialog').click();await expect(page.locator('#key-sound')).toHaveValue('arcade');
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('My audio');
});

test('invalid and canceled profile uploads leave no saved profiles or audio',async({page})=>{
  await page.goto('/');await openAudioForm(page);
  await page.locator('#profile-audio-file').setInputFiles({name:'broken.wav',mimeType:'audio/wav',buffer:Buffer.from('invalid')});
  await expect(page.locator('#profile-audio-error')).toBeVisible();await expect(page.locator('#create-audio-profile-submit')).toBeDisabled();
  await page.locator('#profile-audio-file').setInputFiles({name:'silent.wav',mimeType:'audio/wav',buffer:audioFile({amplitude:0})});
  await expect(page.locator('#profile-audio-error')).toContainText('silent');
  await page.locator('#profile-audio-file').setInputFiles({name:'too-long.wav',mimeType:'audio/wav',buffer:audioFile({duration:301,channels:1})});
  await expect(page.locator('#profile-audio-crop')).toBeVisible();
  await expect(page.locator('#profile-audio-crop-message')).toContainText('5 minutes');
  await expect(page.locator('#create-audio-profile-submit')).toBeDisabled();
  await page.locator('#profile-audio-file').setInputFiles({name:'valid.wav',mimeType:'audio/wav',buffer:audioFile()});
  await expect(page.locator('#create-audio-profile-submit')).toBeEnabled();
  await page.locator('#audio-profile-dialog .close-dialog').click();
  const stored=await page.evaluate(async()=>{const store=await import('/store.js');return{ids:await store.getSoundIds(),profiles:JSON.parse(localStorage.getItem('funnyboard.settings.v1')).customProfiles};});
  expect(stored.ids).toEqual([]);expect(stored.profiles).toEqual([]);
});

test('filename prefills immediately and follows file changes without replacing custom names',async({page})=>{
  await page.goto('/');await openAudioForm(page);
  await page.locator('#profile-audio-file').setInputFiles({name:'Rainy.night.wav',mimeType:'audio/wav',buffer:audioFile()});
  await expect(page.locator('#audio-profile-name')).toHaveValue('Rainy.night');
  await page.locator('#profile-audio-file').setInputFiles({name:'Ocean.wav',mimeType:'audio/wav',buffer:audioFile()});
  await expect(page.locator('#audio-profile-name')).toHaveValue('Ocean');
  await page.locator('#audio-profile-name').fill('My own name');
  await page.locator('#profile-audio-file').setInputFiles({name:'Another.wav',mimeType:'audio/wav',buffer:audioFile()});
  await expect(page.locator('#audio-profile-name')).toHaveValue('My own name');
});

test('overlength audio offers cropping and saves an approved copy at the configured limit',async({page})=>{
  await page.goto('/');await openAudioForm(page);
  await page.locator('#profile-audio-file').setInputFiles({name:'Long audio.wav',mimeType:'audio/wav',buffer:audioFile({duration:301,channels:1})});
  await expect(page.locator('#audio-profile-name')).toHaveValue('Long audio');
  await expect(page.locator('#profile-audio-crop')).toBeVisible();
  await expect(page.locator('#create-audio-profile-submit')).toBeDisabled();
  expect(await page.evaluate(async()=>{const store=await import('/store.js');return (await store.getSoundIds()).length;})).toBe(0);
  await page.locator('#audio-profile-name').fill('Cropped mix');await page.locator('#profile-audio-crop-confirm').click();
  await expect(page.locator('#create-audio-profile-submit')).toBeEnabled({timeout:20000});
  await expect(page.locator('#audio-profile-name')).toHaveValue('Cropped mix');
  await expect(page.locator('#profile-audio-status')).toContainText('5:00');
  await page.locator('#create-audio-profile-submit').click();await expect(page.locator('#profile-name')).toHaveText('Cropped mix');
  const saved=await page.evaluate(async()=>{
    const store=await import('/store.js');const s=JSON.parse(localStorage.getItem('funnyboard.settings.v1')),p=s.customProfiles.find(p=>p.id===s.profile),a=await store.getSound(p.audioAssetId),v=new DataView(a.data);
    return{mime:a.mime,name:a.name,channels:v.getUint16(22,true),duration:(a.data.byteLength-44)/v.getUint32(28,true),gain:p.gain};
  });
  expect(saved.mime).toBe('audio/wav');expect(saved.name).toContain('cropped');expect(saved.duration).toBe(300);expect(saved.channels).toBe(1);expect(saved.gain).toBeGreaterThan(0);
  await page.locator('#browse-profiles').click();const promise=page.waitForEvent('download');await page.locator('#export-profile').click();const download=await promise;
  const backup=JSON.parse(await readFile(await download.path(),'utf8'));expect(validateProfile(backup).version).toBe(2);
  expect(Buffer.from(backup.audio.data.split(',')[1],'base64').length).toBeGreaterThan(25*1024*1024);
  await page.locator('#profiles-dialog .close-dialog').click();
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('Cropped mix');
});

test('declining a crop can choose another file without saving the long audio',async({page})=>{
  await page.goto('/');await openAudioForm(page);
  await page.locator('#profile-audio-file').setInputFiles({name:'Long.wav',mimeType:'audio/wav',buffer:audioFile({duration:301,channels:1})});
  await expect(page.locator('#profile-audio-crop')).toBeVisible();
  const chooser=page.waitForEvent('filechooser');await page.locator('#profile-audio-crop-cancel').click();
  await (await chooser).setFiles({name:'Short.wav',mimeType:'audio/wav',buffer:audioFile()});
  await expect(page.locator('#profile-audio-crop')).toBeHidden();await expect(page.locator('#audio-profile-name')).toHaveValue('Short');
  await expect(page.locator('#create-audio-profile-submit')).toBeEnabled();
  expect(await page.evaluate(async()=>{const store=await import('/store.js');return(await store.getSoundIds()).length;})).toBe(0);
});

test('Durka keeps one continuous stream while typing, pauses and resumes its cursor',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.durkaStarts=[];window.durkaActive=0;
    const original=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      window.durkaStarts.push({duration:this.buffer.duration,channels:this.buffer.numberOfChannels,offset:args[1]||0,rate:this.playbackRate.value});
      window.durkaActive++;this.addEventListener('ended',()=>window.durkaActive--);
      return original.apply(this,args);
    };
  });
  await page.goto('/');await page.locator('#browse-profiles').click();
  await page.getByRole('button',{name:'Use Durka profile',exact:true}).click();
  await expect(page.locator('#profile-name')).toHaveText('Durka');
  await page.locator('#editor').pressSequentially('abcdefghij',{delay:100});
  await page.locator('#editor').press('Space');await page.locator('#editor').press('Enter');
  const wav=await readFile(path.resolve('src/assets/sounds/durka-flow.wav'));
  const duration=(wav.length-44)/(wav.readUInt32LE(24)*wav.readUInt16LE(22)*2);
  const starts=await page.evaluate(()=>window.durkaStarts);
  expect(starts).toHaveLength(1);expect(starts[0].duration).toBeCloseTo(duration,3);
  expect(starts[0].channels).toBe(2);expect(starts[0].rate).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.durkaActive)).toBe(0);
  await page.locator('#editor').press('KeyA');
  await expect.poll(()=>page.evaluate(()=>window.durkaStarts.length)).toBe(2);
  expect(await page.evaluate(()=>window.durkaStarts[1].offset)).toBeGreaterThan(0.5);
  await page.locator('#mute-button').click();
  await expect.poll(()=>page.evaluate(()=>window.durkaActive)).toBe(0);
  await page.locator('#mute-button').click();
  await page.locator('#key-sound').selectOption('wood');
  await expect(page.locator('#binding-type')).toHaveText('Custom sound');
  await expect.poll(()=>page.evaluate(()=>window.durkaActive)).toBe(0);
  await page.reload();await expect(page.locator('#profile-name')).toHaveText('Durka');
  await page.locator('#key-sound').selectOption('durka');await expect(page.locator('#binding-type')).toHaveText('Custom sound');
  expect(errors).toEqual([]);
});

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
  await page.locator('#new-audio-profile').click();
  await page.locator('#profile-audio-file').setInputFiles({name:'My long audio filename for a new profile.wav',mimeType:'audio/wav',buffer:audioFile()});
  await expect(page.locator('#create-audio-profile-submit')).toBeEnabled();
  expect(await page.locator('#audio-profile-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'/tmp/funnyboard-audio-profile-mobile.png',fullPage:true});
});
