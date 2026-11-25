import { MAX_PROFILE_AUDIO_BYTES, MAX_PROFILE_IMPORT_BYTES } from './profile-audio.js';

export const PROFILE_COLORS=Object.freeze(['#bb7849','#b4aa8c','#7e8e7b','#ac8fa8','#89a9ae','#8c7c9a','#5d85b5','#ca685e','#9ba94e','#d2a346']);
export function withProfileColors(profiles){return profiles.map((profile,index)=>({...profile,color:PROFILE_COLORS[index%PROFILE_COLORS.length]}));}

export const PROFILES = [
  { id: 'wood', name: 'Wooden mechanical', short: 'Wooden', adjective: 'Warm. Tactile. A little nostalgic.', description: 'A satisfying wooden thock with a crisp mechanical finish.', tag: 'THE ORIGINAL', color: '#bb7849', sound: 'wood', icon: 'wood' },
  { id: 'creamy', name: 'Creamy switches', short: 'Creamy', adjective: 'Soft landings. Smooth thoughts.', description: 'A soft, rounded pop for your next long writing session.', tag: 'SOFT & MELLOW', color: '#b4aa8c', sound: 'creamy', icon: 'cream' },
  { id: 'typewriter', name: 'Vintage typewriter', short: 'Typewriter', adjective: 'For words with a little history.', description: 'Crisp metal clacks, with a little bell on Enter.', tag: 'OLD SOUL', color: '#7e8e7b', sound: 'typewriter', icon: 'typewriter' },
  { id: 'arcade', name: 'Pocket arcade', short: 'Arcade', adjective: 'Small keys. High scores.', description: 'Playful electronic blips that turn typing into a game.', tag: 'JUST FOR FUN', color: '#ac8fa8', sound: 'arcade', icon: 'arcade' },
  { id: 'bubble', name: 'Bubble pop', short: 'Bubbles', adjective: 'One tiny pop at a time.', description: 'Light, bubbly little pops. Oddly hard to stop typing.', tag: 'LIGHT & PLAYFUL', color: '#89a9ae', sound: 'bubble', icon: 'bubble' },
  { id: 'durka', name: 'Durka', short: 'Durka', adjective: 'Find your flow.', description: 'A smooth, playful sound that flows with your typing.', tag: 'SMOOTH & PLAYFUL', color: '#8c7c9a', sound: 'durka', icon: 'durka', continuous: true }
];

export const KEY_ROWS = [
  [['Escape','esc',1], ...Array.from({length:12},(_,i)=>[`F${i+1}`,`F${i+1}`,1])],
  [['Backquote','`',1], ...'1234567890'.split('').map(n=>[`Digit${n}`,n,1]), ['Minus','−',1],['Equal','=',1],['Backspace','⌫',1.7]],
  [['Tab','tab',1.5], ...'QWERTYUIOP'.split('').map(n=>[`Key${n}`,n,1]), ['BracketLeft','[',1],['BracketRight',']',1],['Backslash','\\',1.2]],
  [['CapsLock','caps',1.8], ...'ASDFGHJKL'.split('').map(n=>[`Key${n}`,n,1]), ['Semicolon',';',1],['Quote',"'",1],['Enter','return ↵',1.9]],
  [['ShiftLeft','shift',2.2], ...'ZXCVBNM'.split('').map(n=>[`Key${n}`,n,1]), ['Comma',',',1],['Period','.',1],['Slash','/',1],['ShiftRight','shift',2.5]],
  [['ControlLeft','ctrl',1.3],['MetaLeft','super',1.3],['AltLeft','alt',1.3],['Space','',6.1],['AltRight','alt',1.3],['ArrowLeft','←',1],['ArrowUp','↑',1],['ArrowDown','↓',1],['ArrowRight','→',1]]
];

export function keyName(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',AltLeft:'Left Alt',AltRight:'Right Alt',MetaLeft:'Left Super',MetaRight:'Right Super',Backquote:'`',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Minus:'−',Equal:'='})[code] || code;
}

export function profileFor(id, profiles = PROFILES) { return profiles.find(p=>p.id===id) || PROFILES[0]; }
export function soundFor(code, profile, bindings) { return bindings[`${profile.id}:${code}`] || (profile.audioAssetId?{type:'flow',assetId:profile.audioAssetId,gain:profile.gain}:{type:'preset',sound:profile.sound}); }
export function noteStats(text) { return {words: text.trim() ? text.trim().split(/\s+/u).length : 0, characters: text.length}; }
export function validKeyCode(code) { return typeof code === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(code); }
export function validPreset(sound) { return PROFILES.some(p=>p.sound===sound); }

export function validateProfile(data) {
  if (!data || data.format!=='funnyboard-profile' || ![1,2].includes(data.version) || typeof data.name!=='string' || !data.name.trim() || data.name.length>60) throw new Error('This is not a valid FunnyBoard profile.');
  if(data.version===1&&!validPreset(data.sound))throw new Error('Unknown profile sound.');
  const validAudio=(audio,maxBytes)=>audio&&typeof audio.name==='string'&&audio.name.length<=255&&typeof audio.data==='string'&&/^data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(audio.data)&&audio.data.length<=Math.ceil(maxBytes/3)*4+100;
  if(data.version===2&&(data.continuous!==true||!validAudio(data.audio,MAX_PROFILE_AUDIO_BYTES)))throw new Error('Invalid profile audio.');
  if (!data.bindings || typeof data.bindings!=='object' || Array.isArray(data.bindings) || Object.keys(data.bindings).length>300) throw new Error('Invalid key bindings.');
  let bytes=data.version===2?data.audio.data.length:0;
  for(const [code,binding] of Object.entries(data.bindings)) {
    if(!validKeyCode(code) || !binding || !['preset','upload'].includes(binding.type)) throw new Error('Invalid key binding.');
    if(binding.type==='preset' && !validPreset(binding.sound)) throw new Error('Unknown sound in profile.');
    if(binding.type==='upload') {
      if(!validAudio(binding,5*1024*1024)) throw new Error('Invalid audio in profile.');
      bytes+=binding.data.length;
    }
  }
  if(bytes>MAX_PROFILE_IMPORT_BYTES) throw new Error(`This profile is too large (${MAX_PROFILE_IMPORT_BYTES/1024/1024} MB maximum).`);
  return data;
}
