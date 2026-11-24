import { PROFILES, KEY_ROWS, keyName, profileFor, soundFor, noteStats, validKeyCode, validateProfile } from './model.js';
import { SoundEngine } from './audio.js';
import { readSettings, saveSettings, readNote, saveNote, getSounds, putSound, deleteSound } from './store.js';

const $=id=>document.getElementById(id);
const settings=readSettings();
const engine=new SoundEngine();
const desktop=window.funnyboard;
const assets=new Map();
let selectedKey='KeyA', capturing=false, toastTimer, saveTimer, rhythmTimer, sessionStart=0, sessionKeys=0, previewToken=0;
let storageWarning=false, soundWarning=false;
const keyElements=new Map();
const pressed=new Set();
const allProfiles=()=>[...PROFILES,...settings.customProfiles];
const currentProfile=()=>profileFor(settings.profile,allProfiles());
const currentBinding=code=>soundFor(code,currentProfile(),settings.bindings);

function toast(message,error=false) {
  clearTimeout(toastTimer); $('toast').textContent=message; $('toast').classList.toggle('error',error); $('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,error?6500:3200);
}
function persist() {
  try {saveSettings(settings);} catch {if(!storageWarning){toast('Device storage is full. Export your profile to keep a copy.',true);storageWarning=true;}}
}
function audioError(error) {
  console.error('Audio error:',error);
  if(!soundWarning){toast('Audio could not start. Check your sound output, then try a sound preview.',true);soundWarning=true;}
}
async function play(code,binding=currentBinding(code),preview=false) {
  try {await engine.play(code,binding,{preview});} catch(error){audioError(error);}
}
function setMuted(muted,notify=true) {
  settings.muted=muted; engine.setMuted(muted);
  $('mute-button').setAttribute('aria-pressed',String(muted));
  $('mute-label').textContent=muted?'Sound is off':'Sound is on';
  $('mute-button').querySelector('use').setAttribute('href',muted?'#i-mute':'#i-volume');
  if(notify) desktop?.setMuted(muted);
  persist();
}
function setVolume(value) {
  settings.volume=Number(value);engine.setVolume(settings.volume/100);
  $('volume').value=String(settings.volume);$('volume-value').textContent=`${settings.volume}%`;
  $('volume').style.background=`linear-gradient(to right,#9da588 ${settings.volume}%,#e0e2d6 ${settings.volume}%)`;
  persist();
}
function renderKeyboard() {
  for(const [rowIndex,row] of KEY_ROWS.entries()) {
    const element=document.createElement('div');element.className='keyboard-row';
    for(const [code,label,width] of row) {
      const button=document.createElement('button');button.className='key';button.dataset.code=code;button.textContent=label;
      button.style.setProperty('--key-width',String(width));
      button.setAttribute('aria-label',`Customize ${keyName(code)} key`);button.setAttribute('aria-pressed','false');button.title=`${keyName(code)} · click to customize`;
      button.addEventListener('click',()=>{selectKey(code);void play(code,undefined,true);});
      keyElements.set(code,button);element.append(button);
    }
    element.dataset.row=String(rowIndex);$('keyboard').append(element);
  }
}
function selectKey(code) {
  if(!validKeyCode(code)) return;
  selectedKey=code;
  for(const [key,element] of keyElements) {element.classList.toggle('selected',key===code);element.setAttribute('aria-pressed',String(key===code));}
  const name=keyName(code);$('selected-key-name').textContent=name;
  $('selected-keycap').textContent=name==='Space'?'⎵':name;
  $('selected-keycap').classList.toggle('long-name',name.length>2);
  updateBindingUI();
}
function updateBindingUI() {
  const own=settings.bindings[`${settings.profile}:${selectedKey}`];
  const select=$('key-sound');select.querySelectorAll('option[data-upload]').forEach(option=>option.remove());
  if(own?.type==='upload') {
    const option=document.createElement('option');option.value='upload';option.dataset.upload='true';option.textContent=own.name;select.append(option);select.value='upload';
  } else select.value=own?.sound||'default';
  $('binding-type').textContent=own?'Custom sound':'Profile default';
  $('binding-filename').textContent=own?.type==='upload'?own.name:(own?'A sound of its very own.':'A little personality goes a long way.');
  $('binding-filename').title=own?.name||'';
  $('reset-key').hidden=!own;
  const count=Object.keys(settings.bindings).filter(key=>key.startsWith(`${settings.profile}:`)).length;
  $('binding-count').textContent=`${count} custom binding${count===1?'':'s'}`;
  for(const [code,element] of keyElements) element.classList.toggle('custom',Boolean(settings.bindings[`${settings.profile}:${code}`]));
}
function updateProfileUI() {
  const profile=currentProfile();
  $('profile-name').textContent=profile.name;$('profile-tag').textContent=profile.tag;
  $('profile-adjective').textContent=profile.adjective;$('active-profile-art').className=`profile-art ${profile.icon}`;
  $('keyboard-profile-label').textContent=profile.name.toUpperCase();
  updateBindingUI();
}
async function selectProfile(id) {
  if(!allProfiles().some(profile=>profile.id===id)) return;
  settings.profile=id;persist();updateProfileUI();$('profiles-dialog').close();
  toast(`${currentProfile().name}. Make yourself heard.`);
  void play('KeyA',undefined,true);
}
function makeArt(profile) {
  const art=document.createElement('div');art.className=`profile-art ${profile.icon}`;art.setAttribute('aria-hidden','true');
  for(const [classes,text] of [['art-key key-one','F'],['art-key key-two','B'],['art-spark','✳'],['art-caption','the sound of a good idea']]) {const item=document.createElement('span');item.className=classes;item.textContent=text;art.append(item);}
  return art;
}
function renderProfiles() {
  const grid=$('profile-grid');grid.replaceChildren();
  for(const profile of allProfiles()) {
    const card=document.createElement('article');card.className=`profile-option${profile.id===settings.profile?' current':''}`;card.append(makeArt(profile));
    const content=document.createElement('div');content.className='profile-option-content';
    const heading=document.createElement('h3');heading.textContent=profile.name;
    const description=document.createElement('p');description.textContent=profile.description;
    const actions=document.createElement('div');actions.className='profile-option-actions';
    const preview=document.createElement('button');preview.className='text-button';preview.append(icon('play'),document.createTextNode('Listen'));
    preview.addEventListener('click',()=>void previewSequence(profile));
    const choose=document.createElement('button');choose.className='text-button select-profile';
    choose.append(document.createTextNode(profile.id===settings.profile?'Selected':'Use profile'),icon(profile.id===settings.profile?'check':'arrow'));
    choose.setAttribute('aria-label',`Use ${profile.name} profile`);
    choose.addEventListener('click',()=>void selectProfile(profile.id));
    actions.append(preview,choose);content.append(heading,description,actions);card.append(content);grid.append(card);
  }
}
function icon(name) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`#i-${name}`);svg.append(use);return svg;
}
async function previewSequence(profile=currentProfile()) {
  const token=++previewToken;
  try {await engine.prepare();} catch(error){audioError(error);return;}
  for(const code of ['KeyF','KeyU','KeyN','Space','KeyN','KeyY','Enter']) {
    if(token!==previewToken) break;
    pressVisual(code);void play(code,soundFor(code,profile,settings.bindings),true);
    await new Promise(resolve=>setTimeout(resolve,140));releaseVisual(code);
  }
}
function pressVisual(code) {keyElements.get(code)?.classList.add('pressed');}
function releaseVisual(code) {keyElements.get(code)?.classList.remove('pressed');}
function animateTyping() {
  document.querySelector('.rhythm-mark').classList.add('active');clearTimeout(rhythmTimer);
  rhythmTimer=setTimeout(()=>{document.querySelector('.rhythm-mark').classList.remove('active');$('typing-prompt').lastChild.textContent=' In your own good time';},1200);
  $('typing-prompt').lastChild.textContent=' That’s a good rhythm';
}
function updateStats() {
  const {words,characters}=noteStats($('editor').value);$('word-count').textContent=words.toLocaleString();$('char-count').textContent=characters.toLocaleString();
  const elapsed=sessionStart?(Date.now()-sessionStart)/60000:0;
  $('wpm-count').textContent=elapsed>=0.1?String(Math.round(sessionKeys/5/elapsed)):'0';
}
function saveCurrentNote() {
  clearTimeout(saveTimer);
  try {saveNote($('editor').value);$('saved-status').lastChild.textContent=' Saved on this device';}
  catch {$('saved-status').lastChild.textContent=' Not saved — storage full';toast('Your note could not be saved. Download a copy using the arrow above.',true);}
}
async function uploadAudio(file) {
  if(!file) return;
  if(file.size>5*1024*1024) {toast('Choose an audio file smaller than 5 MB.',true);return;}
  if(!/^(audio\/|video\/ogg)/.test(file.type) && !/\.(wav|mp3|ogg|m4a|flac|aac|webm)$/i.test(file.name)){toast('Choose an audio file, such as WAV, MP3, or OGG.',true);return;}
  const button=$('upload-zone');button.disabled=true;
  const targetKey=selectedKey,targetProfile=settings.profile;
  try {
    const data=await file.arrayBuffer();const assetId=crypto.randomUUID();
    const buffer=await engine.addUpload(assetId,data);
    if(buffer.duration>3) {engine.buffers.delete(assetId);engine.raw.delete(assetId);toast('Keep key sounds short: choose a clip of 3 seconds or less.',true);return;}
    const asset={id:assetId,name:file.name,data,mime:file.type.startsWith('audio/')?file.type:'audio/wav'};
    await putSound(asset);assets.set(assetId,asset);
    const binding={type:'upload',assetId,name:file.name};settings.bindings[`${targetProfile}:${targetKey}`]=binding;
    persist();updateBindingUI();void play(targetKey,binding,true);toast(`Your sound is bound to ${keyName(targetKey)}.`);
    void cleanupUnusedAudio();
  } catch(error){console.error(error);toast('Could not read or save that sound. Try another short audio file.',true);}
  finally{button.disabled=false;$('audio-file').value='';}
}
async function cleanupUnusedAudio() {
  const used=new Set(Object.values(settings.bindings).filter(binding=>binding.type==='upload').map(binding=>binding.assetId));
  for(const [id] of assets) if(!used.has(id)){await deleteSound(id);assets.delete(id);engine.buffers.delete(id);engine.raw.delete(id);}
}
function download(blob,filename) {
  const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function exportNote() {
  download(new Blob([$('editor').value],{type:'text/plain;charset=utf-8'}),`FunnyBoard-${new Date().toISOString().slice(0,10)}.txt`);toast('Your words, ready to keep.');
}
function arrayBufferToDataURL(buffer,mime) {
  let binary='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
async function exportProfile() {
  try {
    const profile=currentProfile(),bindings={};
    for(const [id,binding] of Object.entries(settings.bindings)) {
      if(!id.startsWith(`${profile.id}:`)) continue;
      const code=id.slice(profile.id.length+1);
      if(binding.type==='preset')bindings[code]={...binding};
      else {
        const asset=assets.get(binding.assetId);if(!asset)throw new Error('Missing sound');
        bindings[code]={type:'upload',name:asset.name,data:arrayBufferToDataURL(asset.data,asset.mime)};
      }
    }
    const data={format:'funnyboard-profile',version:1,name:profile.name,sound:profile.sound,bindings};
    download(new Blob([JSON.stringify(data)],{type:'application/json'}),`${profile.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.funnyboard.json`);
    toast('Profile exported, custom sounds included.');
  } catch{toast('Could not export the profile. Please try again.',true);}
}
async function importProfile(file) {
  if(!file)return;
  const importedAssets=[];
  try {
    if(file.size>40_000_000)throw new Error('Choose a profile smaller than 40 MB.');
    const data=validateProfile(JSON.parse(await file.text()));
    const id=crypto.randomUUID(),base=profileFor(data.sound),bindings={};
    for(const [code,binding] of Object.entries(data.bindings)) {
      if(binding.type==='preset'){bindings[`${id}:${code}`]={type:'preset',sound:binding.sound};continue;}
      const [meta,encoded]=binding.data.split(',');const mime=meta.slice(5,-7);const binary=atob(encoded);
      const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
      const assetId=crypto.randomUUID();const audio=await engine.addUpload(assetId,bytes.buffer);
      importedAssets.push(assetId);
      if(audio.duration>3)throw new Error('A sound in this profile exceeds 3 seconds.');
      const asset={id:assetId,name:binding.name,data:bytes.buffer,mime};await putSound(asset);assets.set(assetId,asset);
      bindings[`${id}:${code}`]={type:'upload',assetId,name:binding.name};
    }
    settings.customProfiles.push({...base,id,name:data.name.trim(),tag:'YOUR OWN MIX',description:'A custom collection of sounds, made for your keyboard.',adjective:'A sound that’s all your own.'});
    Object.assign(settings.bindings,bindings);settings.profile=id;persist();updateProfileUI();renderProfiles();
    toast(`“${data.name.trim()}” is ready to play.`);
  } catch(error){
    for(const id of importedAssets){await deleteSound(id).catch(()=>{});assets.delete(id);engine.buffers.delete(id);engine.raw.delete(id);}
    toast(error instanceof SyntaxError?'That file is not a valid FunnyBoard profile.':error.message||'Could not import that profile.',true);
  } finally {$('profile-file').value='';}
}
function saveAsProfile(name) {
  const base=currentProfile(),id=crypto.randomUUID();
  settings.customProfiles.push({...base,id,name:name.trim(),tag:'YOUR OWN MIX',description:'A custom collection of sounds, made for your keyboard.',adjective:'A sound that’s all your own.'});
  for(const [key,binding] of Object.entries(settings.bindings))if(key.startsWith(`${base.id}:`)) settings.bindings[`${id}:${key.slice(base.id.length+1)}`]={...binding};
  settings.profile=id;persist();updateProfileUI();renderProfiles();$('name-dialog').close();toast('Your new profile is saved. Keep making it yours.');
}
function updateScopeUI() {
  const everywhere=settings.scope==='everywhere';
  $('scope-app').classList.toggle('selected',!everywhere);$('scope-app').setAttribute('aria-pressed',String(!everywhere));
  $('scope-everywhere').classList.toggle('selected',everywhere);$('scope-everywhere').setAttribute('aria-pressed',String(everywhere));
  $('scope-description').textContent=everywhere?'Playing in every app. Minimize FunnyBoard and carry on.':'A soundtrack for this little writing space.';
}
async function changeScope(scope) {
  if(!desktop && scope==='everywhere'){toast('Everywhere is available in the desktop app. Run FunnyBoard with npm start.',true);return;}
  const buttons=[$('scope-app'),$('scope-everywhere')];buttons.forEach(button=>button.disabled=true);
  try {
    if(scope==='everywhere')await engine.prepare();
    const result=desktop?await desktop.setScope(scope):{scope:'app'};
    settings.scope=result.scope;persist();updateScopeUI();
    if(result.error)toast(result.error,true);
    else if(scope==='everywhere')toast('Your keyboard has a soundtrack, in every app.');
  } catch(error){toast('Everywhere could not start. FunnyBoard-only sounds are still available.',true);}
  finally{buttons.forEach(button=>button.disabled=false);}
}
function stopCapture() {capturing=false;$('capture-key').classList.remove('capturing');$('capture-key').querySelector('span').textContent='Pick any key';}
function setupEvents() {
  $('mute-button').addEventListener('click',()=>{void engine.prepare().catch(audioError);setMuted(!settings.muted);});
  $('volume').addEventListener('input',event=>setVolume(event.target.value));
  $('volume').addEventListener('change',()=>void play(selectedKey,undefined,true));
  for(const id of ['profile-picker','browse-profiles'])$(id).addEventListener('click',()=>{renderProfiles();$('profiles-dialog').showModal();});
  $('preview-profile').addEventListener('click',()=>void previewSequence());
  $('preview-key').addEventListener('click',()=>void play(selectedKey,undefined,true));
  $('help-button').addEventListener('click',()=>$('help-dialog').showModal());
  document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
    dialog.addEventListener('close',()=>{previewToken++;});
  });
  $('key-sound').addEventListener('change',event=>{
    const value=event.target.value,key=`${settings.profile}:${selectedKey}`;
    if(value==='default')delete settings.bindings[key];else if(value!=='upload')settings.bindings[key]={type:'preset',sound:value};
    persist();updateBindingUI();void play(selectedKey,undefined,true);void cleanupUnusedAudio();
  });
  $('reset-key').addEventListener('click',()=>{delete settings.bindings[`${settings.profile}:${selectedKey}`];persist();updateBindingUI();void cleanupUnusedAudio();toast(`${keyName(selectedKey)} is back to the profile default.`);});
  $('upload-zone').addEventListener('click',()=>$('audio-file').click());
  $('audio-file').addEventListener('change',event=>void uploadAudio(event.target.files[0]));
  for(const name of ['dragenter','dragover'])$('upload-zone').addEventListener(name,event=>{event.preventDefault();$('upload-zone').classList.add('dragover');});
  for(const name of ['dragleave','drop'])$('upload-zone').addEventListener(name,event=>{event.preventDefault();$('upload-zone').classList.remove('dragover');});
  $('upload-zone').addEventListener('drop',event=>void uploadAudio(event.dataTransfer.files[0]));
  document.addEventListener('dragover',event=>event.preventDefault());document.addEventListener('drop',event=>event.preventDefault());
  $('capture-key').addEventListener('click',()=>{if(capturing){stopCapture();return;}capturing=true;$('capture-key').classList.add('capturing');$('capture-key').querySelector('span').textContent='Press a key… (Esc cancels)';});
  document.addEventListener('keydown',event=>{
    if(capturing){event.preventDefault();event.stopPropagation();if(event.code!=='Escape'){selectKey(event.code);void play(event.code,undefined,true);}stopCapture();return;}
    if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.code==='KeyM'){event.preventDefault();if(!event.repeat)setMuted(!settings.muted);return;}
    if(!event.code || event.repeat || pressed.has(event.code))return;
    pressed.add(event.code);pressVisual(event.code);void play(event.code);
    if(event.target===$('editor') && !event.ctrlKey && !event.metaKey && (event.key.length===1||event.code==='Enter')){if(!sessionStart)sessionStart=Date.now();sessionKeys++;animateTyping();}
    if(event.target===$('editor')&&event.code==='Tab'){event.preventDefault();const editor=$('editor');editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input',{bubbles:true}));}
  });
  document.addEventListener('keyup',event=>{pressed.delete(event.code);releaseVisual(event.code);});
  window.addEventListener('blur',()=>{pressed.clear();for(const [code] of keyElements)releaseVisual(code);stopCapture();saveCurrentNote();});
  $('editor').addEventListener('input',()=>{updateStats();$('saved-status').lastChild.textContent=' Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(saveCurrentNote,200);});
  window.addEventListener('beforeunload',saveCurrentNote);
  $('export-note').addEventListener('click',exportNote);
  $('clear-note').addEventListener('click',()=>{if($('editor').value)$('confirm-dialog').showModal();});
  $('cancel-clear').addEventListener('click',()=>$('confirm-dialog').close());
  $('confirm-clear').addEventListener('click',()=>{$('editor').value='';sessionStart=0;sessionKeys=0;saveCurrentNote();updateStats();$('confirm-dialog').close();$('editor').focus();});
  $('export-profile').addEventListener('click',()=>void exportProfile());
  $('import-profile').addEventListener('click',()=>$('profile-file').click());
  $('profile-file').addEventListener('change',event=>void importProfile(event.target.files[0]));
  $('save-profile').addEventListener('click',()=>{$('new-profile-name').value='';$('name-dialog').showModal();});
  $('profile-name-form').addEventListener('submit',event=>{event.preventDefault();const name=$('new-profile-name').value.trim();if(name)saveAsProfile(name);});
  $('scope-app').addEventListener('click',()=>void changeScope('app'));
  $('scope-everywhere').addEventListener('click',()=>void changeScope('everywhere'));
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();$('editor').focus();});
  desktop?.onKey(({code,down})=>{if(down){pressVisual(code);void play(code);}else releaseVisual(code);});
  desktop?.onMuted(muted=>setMuted(muted,false));
}

async function initialize() {
  renderKeyboard();setupEvents();
  $('editor').value=readNote();updateStats();
  if(!allProfiles().some(profile=>profile.id===settings.profile))settings.profile='wood';
  setVolume(settings.volume);setMuted(settings.muted);updateProfileUI();selectKey(selectedKey);
  if(!desktop){$('desktop-label').textContent='DESKTOP FEATURE';settings.scope='app';}
  updateScopeUI();
  try {
    for(const asset of await getSounds()){assets.set(asset.id,asset);engine.raw.set(asset.id,asset.data);}
    // Decode uploads on the first gesture, then keep buffers in memory for immediate playback.
    const prepareUploads=async()=>{try{await engine.prepare();await Promise.all([...assets.values()].map(asset=>engine.addUpload(asset.id,asset.data)));}catch(error){audioError(error);}};
    window.addEventListener('pointerdown',()=>void prepareUploads(),{once:true,capture:true});
    window.addEventListener('keydown',()=>void prepareUploads(),{once:true,capture:true});
    if(desktop){await prepareUploads();if(settings.scope==='everywhere')await changeScope('everywhere');}
  } catch {toast('Custom sound storage is unavailable. Built-in sounds still work.',true);}
  engine.ready.catch(audioError);
}
void initialize();
