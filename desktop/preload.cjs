const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('funnyboard',{
  setScope:scope=>ipcRenderer.invoke('sound:scope',scope),
  setMuted:muted=>ipcRenderer.invoke('sound:muted',muted),
  onKey:callback=>{const listener=(_event,key)=>callback(key);ipcRenderer.on('sound:key',listener);return()=>ipcRenderer.removeListener('sound:key',listener);},
  onMuted:callback=>{const listener=(_event,muted)=>callback(muted);ipcRenderer.on('sound:muted',listener);return()=>ipcRenderer.removeListener('sound:muted',listener);}
});
