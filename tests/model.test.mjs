import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {PROFILES,KEY_ROWS,keyName,profileFor,soundFor,noteStats,validateProfile} from '../src/model.js';
const require=createRequire(import.meta.url);
const {createKeyMap,toDomCode}=require('../desktop/keymap.cjs');

test('bindings are scoped to the selected profile, and fall back to its sound',()=>{
  const bindings={'wood:KeyA':{type:'preset',sound:'arcade'}};
  assert.equal(soundFor('KeyA',PROFILES[0],bindings).sound,'arcade');
  assert.equal(soundFor('KeyB',PROFILES[0],bindings).sound,'wood');
  assert.equal(soundFor('KeyA',PROFILES[1],bindings).sound,'creamy');
  assert.equal(profileFor('missing').id,'wood');
});
test('keyboard supports unique physical positions including modifier sides',()=>{
  const keys=KEY_ROWS.flat().map(([code])=>code);
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(keys.includes('Space')&&keys.includes('ShiftRight')&&keys.includes('F12'));
  assert.equal(keyName('ControlRight'),'Right Ctrl');
  const map=createKeyMap({A:30,1:2,Ctrl:29,CtrlRight:3613,NumpadEnter:3612});
  assert.equal(map.get(30),'KeyA');assert.equal(map.get(2),'Digit1');assert.equal(map.get(3613),'ControlRight');assert.equal(toDomCode('NumpadEnter'),'NumpadEnter');
  assert.equal(map.get(0x0E5D),'ContextMenu');assert.equal(map.get(0xEE4C),'Numpad5');
});
test('note counts handle empty text, whitespace, and multiple languages',()=>{
  assert.deepEqual(noteStats(' \n\t'),{words:0,characters:3});
  assert.equal(noteStats('Hello,\nмир!  こんにちは').words,3);
});
test('profile imports reject invalid structures, unknown presets, and unsafe audio',()=>{
  const base={format:'funnyboard-profile',version:1,name:'My sounds',sound:'wood',bindings:{KeyA:{type:'preset',sound:'arcade'}}};
  assert.equal(validateProfile(base).name,'My sounds');
  for(const data of [null,{}, {...base,name:''},{...base,sound:'missing'},{...base,bindings:[]},{...base,bindings:{KeyA:{type:'preset',sound:'bad'}}},{...base,bindings:{KeyA:{type:'upload',name:'bad.wav',data:'data:text/html;base64,abcd'}}},{...base,bindings:{'../outside':{type:'preset',sound:'wood'}}}])assert.throws(()=>validateProfile(data));
  assert.doesNotThrow(()=>validateProfile({...base,bindings:{Space:{type:'upload',name:'pop.wav',data:'data:audio/wav;base64,YWJjZA=='}}}));
});
test('all bundled sounds are valid, short PCM WAV files with audible samples',async()=>{
  for(const profile of PROFILES)for(const kind of ['key','space','enter']){
    const wav=await readFile(new URL(`../src/assets/sounds/${profile.sound}-${kind}.wav`,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(wav.readUInt32LE(24),44100);assert.ok(wav.length>4000&&wav.length<44100*2*3);
    assert.ok(wav.subarray(44).some(byte=>byte!==0));
  }
});
