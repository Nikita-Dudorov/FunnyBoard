const PRESET_NAMES = ['wood','creamy','typewriter','arcade','bubble'];

export class SoundEngine {
  constructor() {
    this.context=null; this.master=null; this.buffers=new Map(); this.raw=new Map(); this.pending=new Map();
    this.volume=0.65; this.muted=false; this.sources=new Set();
    this.ready = Promise.all(PRESET_NAMES.flatMap(name=>['key','space','enter'].map(kind=>
      fetch(new URL(`./assets/sounds/${name}-${kind}.wav`, import.meta.url)).then(r=>{if(!r.ok) throw new Error('Could not load built-in sounds'); return r.arrayBuffer();}).then(data=>this.raw.set(`${name}-${kind}`,data))
    )));
  }
  async unlock() {
    if(!this.context) {
      this.context=new AudioContext({latencyHint:'interactive'});
      this.master=this.context.createGain(); this.master.connect(this.context.destination); this.setVolume(this.volume);
    }
    if(this.context.state==='suspended') await this.context.resume();
    await this.ready;
  }
  setVolume(value) { this.volume=Math.max(0,Math.min(1,Number(value))); if(this.master) this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,0.008); }
  setMuted(muted) { this.muted=Boolean(muted); this.setVolume(this.volume); }
  async decode(id,data) {
    if(this.buffers.has(id)) return this.buffers.get(id);
    if(!this.pending.has(id)) this.pending.set(id,this.context.decodeAudioData(data.slice(0)).then(buffer=>{this.buffers.set(id,buffer);this.pending.delete(id);return buffer;}).catch(e=>{this.pending.delete(id);throw e;}));
    return this.pending.get(id);
  }
  async prepare() {
    await this.unlock();
    await Promise.all([...this.raw].map(([id,data])=>this.decode(id,data)));
  }
  async addUpload(id,data) { this.raw.set(id,data); await this.unlock(); return this.decode(id,data); }
  async play(code,binding,{preview=false}={}) {
    if(this.muted && !preview) return;
    await this.unlock();
    const kind=code==='Space'?'space':(/Enter/.test(code)?'enter':'key');
    const id=binding.type==='upload'?binding.assetId:`${binding.sound}-${kind}`;
    let buffer=this.buffers.get(id);
    if(!buffer && this.raw.has(id)) buffer=await this.decode(id,this.raw.get(id));
    if(!buffer) return;
    // Bound concurrency so long uploads cannot pile up while typing quickly.
    if(this.sources.size>=24) this.sources.values().next().value.stop();
    const source=this.context.createBufferSource(); source.buffer=buffer;
    const gain=this.context.createGain(); gain.gain.value=preview && this.muted ? this.volume : 1;
    if(binding.type!=='upload') source.playbackRate.value=0.96+((code.charCodeAt(code.length-1)||0)%9)*0.01;
    source.connect(gain); gain.connect(preview && this.muted?this.context.destination:this.master);
    this.sources.add(source); source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();};
    source.start();
  }
}
