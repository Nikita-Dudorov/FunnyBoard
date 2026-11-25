import { PROFILES } from './model.js';
import { profileVolumeGain, audioBufferToWav, MAX_PROFILE_AUDIO_SECONDS } from './profile-audio.js';
const PRESET_FILES = PROFILES.flatMap(profile=>(profile.continuous?['flow']:['key','space','enter']).map(kind=>`${profile.sound}-${kind}`));
const FLOW_HOLD_MS=400;
const FLOW_FADE_MS=70;

export class SoundEngine {
  constructor({loadUpload}={}) {
    this.context=null; this.master=null; this.buffers=new Map(); this.raw=new Map(); this.pending=new Map();
    this.volume=0.65; this.muted=false; this.sources=new Map();this.playRequest=0;this.previewEpoch=0;
    this.flow=null;this.flowOffsets=new Map();this.flowIdleTimer=null;this.flowStopTimer=null;
    this.loadUpload=loadUpload;this.uploadLoads=new Map();this.previewNode=null;this.previewGain=null;this.previewLevel=1;
    this.ready = Promise.all(PRESET_FILES.map(id=>
      fetch(new URL(`./assets/sounds/${id}.wav`, import.meta.url)).then(r=>{if(!r.ok) throw new Error('Could not load built-in sounds'); return r.arrayBuffer();}).then(data=>this.raw.set(id,data))
    ));
  }
  async unlock() {
    if(!this.context) {
      this.context=new AudioContext({latencyHint:'interactive'});
      this.master=this.context.createGain(); this.master.connect(this.context.destination); this.setVolume(this.volume);
    }
    if(this.context.state==='suspended') await this.context.resume();
    await this.ready;
  }
  setVolume(value) { this.volume=Math.max(0,Math.min(1,Number(value))); if(this.master) this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,0.008);if(this.previewGain)this.previewGain.gain.setTargetAtTime(this.volume*this.previewLevel,this.context.currentTime,.008); }
  setMuted(muted) { this.muted=Boolean(muted);this.setVolume(this.volume);if(this.muted)this.stopPlayback(); }
  stopShortSound(source,details){
    const now=this.context.currentTime,end=now+.008;
    details.gain.gain.cancelAndHoldAtTime(now);details.gain.gain.linearRampToValueAtTime(0,end);
    source.stop(end);this.sources.delete(source);
  }
  stopShortSounds(){for(const [source,details]of this.sources)this.stopShortSound(source,details);}
  cancelPreviews(){
    this.previewEpoch++;
    if(this.flow?.preview)this.stopFlow();
    for(const [source,details]of this.sources)if(details.preview)this.stopShortSound(source,details);
  }
  stopPlayback(){this.playRequest++;this.cancelPreviews();this.stopFlow();this.stopShortSounds();}
  stopFlow() {
    clearTimeout(this.flowIdleTimer);clearTimeout(this.flowStopTimer);
    const flow=this.flow;if(!flow)return;
    const now=this.context.currentTime,end=now+0.008;
    this.flowOffsets.set(flow.sound,(flow.offset+Math.max(0,end-flow.startedAt))%flow.source.buffer.duration);
    this.flow=null;
    flow.gain.gain.cancelAndHoldAtTime(now);flow.gain.gain.linearRampToValueAtTime(0,end);
    flow.source.stop(end);
  }
  playFlow(buffer,sound,preview,level=1) {
    this.stopShortSounds();
    const bypassMaster=preview&&this.muted;
    if(this.flow&&(this.flow.sound!==sound||this.flow.bypassMaster!==bypassMaster))this.stopFlow();
    clearTimeout(this.flowIdleTimer);clearTimeout(this.flowStopTimer);
    if(!this.flow){
      const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;
      const gain=this.context.createGain();gain.gain.value=0;
      source.connect(gain);gain.connect(bypassMaster?this.context.destination:this.master);
      const offset=(this.flowOffsets.get(sound)||0)%buffer.duration;
      const flow={source,gain,sound,offset,startedAt:this.context.currentTime,bypassMaster,preview};this.flow=flow;
      source.onended=()=>{source.disconnect();gain.disconnect();};
      source.start(flow.startedAt,offset);
    }
    const flow=this.flow,now=this.context.currentTime;
    flow.preview=preview;
    flow.gain.gain.cancelAndHoldAtTime(now);
    flow.gain.gain.linearRampToValueAtTime(level*(bypassMaster?this.volume:1),now+0.006);
    // A new press extends this same stream. After a pause, resume its cursor.
    this.flowIdleTimer=setTimeout(()=>{
      if(this.flow!==flow)return;
      const time=this.context.currentTime;
      flow.gain.gain.cancelAndHoldAtTime(time);
      flow.gain.gain.linearRampToValueAtTime(0,time+FLOW_FADE_MS/1000);
      this.flowStopTimer=setTimeout(()=>{if(this.flow===flow)this.stopFlow();},FLOW_FADE_MS+5);
    },FLOW_HOLD_MS);
  }
  async decode(id,data) {
    if(this.buffers.has(id)) return this.buffers.get(id);
    if(!this.pending.has(id)) this.pending.set(id,this.context.decodeAudioData(data.slice(0)).then(buffer=>{this.buffers.set(id,buffer);this.pending.delete(id);return buffer;}).catch(e=>{this.pending.delete(id);throw e;}));
    return this.pending.get(id);
  }
  async prepare() {
    await this.unlock();
    await Promise.all(PRESET_FILES.map(id=>this.decode(id,this.raw.get(id))));
  }
  async balanceProfile(buffer) {await this.prepare();return profileVolumeGain(buffer,PROFILES.filter(profile=>!profile.continuous).map(profile=>this.buffers.get(`${profile.sound}-key`)));}
  async setProfilePreview(element,level) {
    await this.unlock();
    if(!this.previewNode){this.previewNode=this.context.createMediaElementSource(element);this.previewGain=this.context.createGain();this.previewNode.connect(this.previewGain);this.previewGain.connect(this.context.destination);}
    this.previewLevel=level;this.previewGain.gain.value=this.volume*level;
  }
  releaseUpload(id) {this.raw.delete(id);this.buffers.delete(id);}
  async addUpload(id,data) { this.raw.set(id,data); await this.unlock(); return this.decode(id,data); }
  async cropUpload(id){
    const input=this.buffers.get(id);
    if(!input||input.numberOfChannels<1||input.numberOfChannels>2)throw new Error('Choose a mono or stereo audio file.');
    const sampleRate=Math.min(input.sampleRate,48000);
    const context=new OfflineAudioContext(input.numberOfChannels,Math.floor(Math.min(input.duration,MAX_PROFILE_AUDIO_SECONDS)*sampleRate),sampleRate);
    const source=context.createBufferSource();source.buffer=input;source.connect(context.destination);source.start();
    const rendered=await context.startRendering(),data=audioBufferToWav(rendered);
    this.raw.set(id,data);this.buffers.delete(id);
    const buffer=await this.decode(id,data);return{buffer,data};
  }
  async play(code,binding,{preview=false}={}) {
    if(!preview)this.cancelPreviews();
    const request=++this.playRequest,epoch=this.previewEpoch;
    if(this.muted && !preview) return;
    await this.unlock();
    if(request!==this.playRequest||(preview&&epoch!==this.previewEpoch))return;
    if(this.muted && !preview)return;
    const profile=binding.type==='preset'?PROFILES.find(profile=>profile.sound===binding.sound):null;
    const kind=code==='Space'?'space':(/Enter/.test(code)?'enter':'key');
    const uploaded=binding.type==='upload'||binding.type==='flow';
    const id=uploaded?binding.assetId:`${binding.sound}-${profile?.continuous?'flow':kind}`;
    let buffer=this.buffers.get(id);
    if(!buffer&&!this.raw.has(id)&&uploaded&&this.loadUpload){
      if(!this.uploadLoads.has(id))this.uploadLoads.set(id,Promise.resolve(this.loadUpload(id)).then(data=>{if(data)this.raw.set(id,data);}).finally(()=>this.uploadLoads.delete(id)));
      await this.uploadLoads.get(id);
    }
    if(!buffer && this.raw.has(id)) buffer=await this.decode(id,this.raw.get(id));
    // A late load must not add an old sound over a newer press or preview.
    if(request!==this.playRequest||(preview&&epoch!==this.previewEpoch))return;
    if(!buffer){if(uploaded)throw new Error('Saved audio is unavailable.');return;}
    if(this.muted&&!preview)return;
    if(profile?.continuous||binding.type==='flow'){this.playFlow(buffer,uploaded?id:binding.sound,preview,binding.type==='flow'&&Number.isFinite(binding.gain)?Math.max(0,Math.min(1e6,binding.gain)):1);return;}
    this.stopFlow();
    // Bound concurrency so long uploads cannot pile up while typing quickly.
    if(this.sources.size>=24){const [oldest,details]=this.sources.entries().next().value;this.stopShortSound(oldest,details);}
    const source=this.context.createBufferSource(); source.buffer=buffer;
    const gain=this.context.createGain(); gain.gain.value=preview && this.muted ? this.volume : 1;
    if(binding.type!=='upload') source.playbackRate.value=0.96+((code.charCodeAt(code.length-1)||0)%9)*0.01;
    source.connect(gain); gain.connect(preview && this.muted?this.context.destination:this.master);
    this.sources.set(source,{gain,preview}); source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};
    source.start();
  }
}
