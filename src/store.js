const SETTINGS_KEY='funnyboard.settings.v1';
const NOTE_KEY='funnyboard.note.v1';
export const DEFAULT_SETTINGS={profile:'wood',volume:65,muted:false,scope:'app',bindings:{},customProfiles:[]};

export function readSettings() {
  try {
    const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');
    if(!saved || typeof saved!=='object') return structuredClone(DEFAULT_SETTINGS);
    return {...structuredClone(DEFAULT_SETTINGS),...saved,
      volume: Number.isFinite(saved.volume)?Math.max(0,Math.min(100,saved.volume)):65,
      muted: saved.muted===true, scope:saved.scope==='everywhere'?'everywhere':'app',
      bindings: saved.bindings && typeof saved.bindings==='object' && !Array.isArray(saved.bindings)?saved.bindings:{},
      customProfiles:Array.isArray(saved.customProfiles)?saved.customProfiles:[]};
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}
export function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); }
export function readNote() { try { return localStorage.getItem(NOTE_KEY)||''; } catch { return ''; } }
export function saveNote(text) { localStorage.setItem(NOTE_KEY,text); }

let database;
export async function openDatabase() {
  if(database) return database;
  database = await new Promise((resolve,reject)=>{
    const request=indexedDB.open('funnyboard-audio',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('sounds',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
  return database;
}
async function transact(mode,operation) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('sounds',mode); const request=operation(tx.objectStore('sounds')); let result;
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('Could not save audio.'));
  });
}
export const getSounds=()=>transact('readonly',store=>store.getAll());
export const putSound=sound=>transact('readwrite',store=>store.put(sound));
export const deleteSound=id=>transact('readwrite',store=>store.delete(id));
