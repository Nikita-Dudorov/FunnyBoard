export const MAX_PROFILE_AUDIO_BYTES=64*1024*1024;
export const MAX_PROFILE_AUDIO_SECONDS=300;
export const MAX_PROFILE_IMPORT_BYTES=128*1024*1024;
export const PROFILE_REFERENCE_KEYS_PER_SECOND=6;
export const PROFILE_LOUDNESS_OFFSET_DB=0;
export const PROFILE_PEAK_LIMIT_DBFS=-3;

export function profileNameFromFile(filename){return filename.replace(/\.[^.]+$/,'').trim().slice(0,60)||filename.trim().slice(0,60)||'New profile';}
export function audioDurationLabel(seconds){
  const minutes=Math.floor(seconds/60),rest=seconds%60;
  return [minutes?`${minutes} minute${minutes===1?'':'s'}`:'',rest?`${rest} second${rest===1?'':'s'}`:''].filter(Boolean).join(' ')||'0 seconds';
}
export function audioTimeLabel(seconds){return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}

export function audioBufferToWav(buffer){
  const channels=buffer.numberOfChannels,frames=buffer.length,bytes=44+frames*channels*2;
  if(channels<1||channels>2)throw new Error('Choose a mono or stereo audio file.');
  if(bytes>MAX_PROFILE_AUDIO_BYTES)throw new Error('The cropped audio is too large to save.');
  const output=new ArrayBuffer(bytes),view=new DataView(output);
  const write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,bytes-8,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);
  view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);
  write(36,'data');view.setUint32(40,bytes-44,true);
  const values=Array.from({length:channels},(_,channel)=>buffer.getChannelData(channel));
  let peak=0;
  for(const channel of values)for(const value of channel){if(!Number.isFinite(value))throw new Error('This audio could not be read.');peak=Math.max(peak,Math.abs(value));}
  // Decoded compressed audio can exceed the PCM range. Uniform attenuation
  // preserves its dynamics; automatic profile gain compensates afterwards.
  const scale=peak>1?(32767/32768)/peak:1;
  for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++){
    view.setInt16(44+(frame*channels+channel)*2,Math.max(-32768,Math.min(32767,Math.round(values[channel][frame]*scale*32768))),true);
  }
  return output;
}

export function audioFileMime(file) {
  if(file.type?.startsWith('audio/'))return file.type;
  return ({wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',aac:'audio/aac',webm:'audio/webm'})[file.name?.split('.').at(-1)?.toLowerCase()]||null;
}

export function profileVolumeGain(buffer,references) {
  if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>MAX_PROFILE_AUDIO_SECONDS)throw new Error(`Choose audio up to ${audioDurationLabel(MAX_PROFILE_AUDIO_SECONDS)} long.`);
  if(buffer.numberOfChannels<1||buffer.numberOfChannels>2)throw new Error('Choose a mono or stereo audio file.');
  let peak=0,sum=0,count=0;
  const blockSize=Math.max(1,Math.round(buffer.sampleRate*.02)),powers=[];
  for(let offset=0;offset<buffer.length;offset+=blockSize){
    let block=0;const end=Math.min(buffer.length,offset+blockSize);
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const values=buffer.getChannelData(channel);
      for(let i=offset;i<end;i++){const value=values[i];if(!Number.isFinite(value))throw new Error('This audio could not be read.');peak=Math.max(peak,Math.abs(value));block+=value*value;}
    }
    powers.push({power:block/((end-offset)*buffer.numberOfChannels),samples:(end-offset)*buffer.numberOfChannels});
  }
  if(peak<1e-6)throw new Error('This file is silent. Choose audio with an audible sound.');
  const gate=powers.reduce((max,block)=>Math.max(max,block.power),0)*.001;
  for(const block of powers)if(block.power>gate){sum+=block.power*block.samples;count+=block.samples;}
  const energies=references.map(reference=>{
    let total=0;
    for(let channel=0;channel<reference.numberOfChannels;channel++)for(const value of reference.getChannelData(channel))total+=value*value;
    return total/reference.sampleRate/reference.numberOfChannels;
  }).sort((a,b)=>a-b);
  const target=energies[Math.floor(energies.length/2)]*PROFILE_REFERENCE_KEYS_PER_SECOND*10**(PROFILE_LOUDNESS_OFFSET_DB/10);
  if(!target||!count)throw new Error('Could not balance this audio.');
  return Math.min(Math.sqrt(target/(sum/count)),10**(PROFILE_PEAK_LIMIT_DBFS/20)/peak);
}
