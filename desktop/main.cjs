const {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,protocol,net,session,systemPreferences}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createKeyMap}=require('./keymap.cjs');

app.setName('FunnyBoard');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{scheme:'funnyboard',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window,tray,hook,hookMap,quitting=false,scope='app',muted=false;
const heldKeys=new Set();

function showWindow(){window.show();window.focus();}
function updateTray(){
  if(!tray)return;
  tray.setToolTip(`FunnyBoard · ${muted?'Muted':scope==='everywhere'?'Sounds everywhere':'Sounds in FunnyBoard'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Open FunnyBoard',click:showWindow},
    {type:'separator'},
    {label:'Mute sounds',type:'checkbox',checked:muted,click:item=>{muted=item.checked;window.webContents.send('sound:muted',muted);updateTray();}},
    {label:scope==='everywhere'?'Playing everywhere':'Playing in FunnyBoard',enabled:false},
    {type:'separator'},
    {label:'Quit FunnyBoard',click:()=>{quitting=true;app.quit();}}
  ]));
}
function setScope(requested){
  if(!['app','everywhere'].includes(requested))return {scope,error:'Unknown sound mode.'};
  if(requested===scope)return {scope};
  if(requested==='app'){
    hook?.stop();heldKeys.clear();scope='app';updateTray();return {scope};
  }
  if(process.platform==='linux'&&(process.env.XDG_SESSION_TYPE==='wayland'||!process.env.DISPLAY))return {scope,error:'Everywhere needs an X11 desktop session on Linux. You can still type with sounds in FunnyBoard.'};
  if(process.platform==='darwin'&&!systemPreferences.isTrustedAccessibilityClient(true))return {scope,error:'Allow FunnyBoard in System Settings → Privacy & Security → Accessibility, then select Everywhere again.'};
  try {
    if(!hook){
      const {uIOhook,UiohookKey}=require('uiohook-napi');hook=uIOhook;hookMap=createKeyMap(UiohookKey);
      hook.on('keydown',event=>{
        if(scope!=='everywhere'||window.isFocused()||heldKeys.has(event.keycode))return;
        const code=hookMap.get(event.keycode)||`Native${event.keycode}`;
        heldKeys.add(event.keycode);window.webContents.send('sound:key',{code,down:true});
      });
      hook.on('keyup',event=>{
        const held=heldKeys.delete(event.keycode);if(!held||scope!=='everywhere')return;
        const code=hookMap.get(event.keycode)||`Native${event.keycode}`;window.webContents.send('sound:key',{code,down:false});
      });
    }
    hook.start();scope='everywhere';updateTray();return {scope};
  }catch(error){console.error('Could not enable Everywhere:',error.message);return {scope,error:'Everywhere is unavailable. On Linux, install libxtst6, libx11-6 and libxkbcommon0. FunnyBoard-only sounds still work.'};}
}
function validSender(event){return window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame?.url.startsWith('funnyboard://app/');}

if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window)showWindow();});
  app.whenReady().then(()=>{
    const root=path.resolve(__dirname,'../src');
    protocol.handle('funnyboard',request=>{
      const url=new URL(request.url);
      let filename;try{filename=decodeURIComponent(url.pathname);}catch{return new Response('Bad request',{status:400});}
      const file=path.resolve(root,`.${filename==='/'?'/index.html':filename}`);
      if(url.host!=='app'||!file.startsWith(root+path.sep))return new Response('Not found',{status:404});
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    window=new BrowserWindow({
      width:1330,height:1000,minWidth:760,minHeight:650,title:'FunnyBoard',backgroundColor:'#f6f4ef',
      icon:path.join(root,'assets/icon.png'),autoHideMenuBar:true,show:false,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,spellcheck:true}
    });
    Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:'FunnyBoard',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'quit'}]},{role:'editMenu'},{role:'windowMenu'}]):null);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('funnyboard://app/'))event.preventDefault();});
    window.once('ready-to-show',()=>window.show());
    window.on('blur',()=>heldKeys.clear());
    window.on('focus',()=>heldKeys.clear());
    window.on('close',event=>{if(!quitting&&scope==='everywhere'&&tray){event.preventDefault();window.hide();}else app.quit();});
    try {
      tray=new Tray(nativeImage.createFromPath(path.join(root,'assets/tray.png')));tray.on('click',showWindow);tray.on('double-click',showWindow);updateTray();
    } catch(error){console.warn('Tray unavailable:',error.message);}
    ipcMain.handle('sound:scope',(event,requested)=>validSender(event)?setScope(requested):{scope,error:'Untrusted request.'});
    ipcMain.handle('sound:muted',(event,value)=>{if(!validSender(event)||typeof value!=='boolean')return;muted=value;updateTray();});
    window.loadURL('funnyboard://app/index.html');
    if(process.env.FUNNYBOARD_DEBUG==='1')window.webContents.openDevTools({mode:'detach'});
  });
  app.on('before-quit',()=>{quitting=true;if(scope==='everywhere')hook?.stop();heldKeys.clear();});
  app.on('window-all-closed',()=>app.quit());
  app.on('activate',()=>{if(window&&!window.isDestroyed())showWindow();});
}
