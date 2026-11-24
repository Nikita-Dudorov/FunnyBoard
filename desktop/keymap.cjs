// libuiohook reports physical positions. No text is translated or retained.
function toDomCode(name) {
  if(/^[A-Z]$/.test(name))return `Key${name}`;
  if(/^\d$/.test(name))return `Digit${name}`;
  return ({Ctrl:'ControlLeft',CtrlRight:'ControlRight',Alt:'AltLeft',Shift:'ShiftLeft',Meta:'MetaLeft',NumpadEnd:'Numpad1',NumpadArrowDown:'Numpad2',NumpadPageDown:'Numpad3',NumpadArrowLeft:'Numpad4',NumpadArrowRight:'Numpad6',NumpadHome:'Numpad7',NumpadArrowUp:'Numpad8',NumpadPageUp:'Numpad9',NumpadInsert:'Numpad0',NumpadDelete:'NumpadDecimal'})[name]||name;
}
function createKeyMap(keys) {
  const map=new Map(Object.entries(keys).map(([name,value])=>[value,toDomCode(name)]));
  // Additional libuiohook positions not included in the JS package's constants.
  for(const [value,code] of [[0x0E45,'Pause'],[0x0E46,'IntlBackslash'],[0x0E5D,'ContextMenu'],[0x0E0D,'NumpadEqual'],[0xEE4C,'Numpad5'],[0x0073,'IntlRo'],[0x007D,'IntlYen'],[0x007E,'NumpadComma'],[0xE022,'MediaPlayPause'],[0xE024,'MediaStop'],[0xE010,'MediaTrackPrevious'],[0xE019,'MediaTrackNext'],[0xE020,'AudioVolumeMute'],[0xE030,'AudioVolumeUp'],[0xE02E,'AudioVolumeDown']])map.set(value,code);
  return map;
}
module.exports={toDomCode,createKeyMap};
