export const MAX_PROFILE_AUDIO_BYTES=25*1024*1024;
export const MAX_PROFILE_AUDIO_SECONDS=300;
export const MAX_PROFILE_IMPORT_BYTES=64*1024*1024;

export function audioFileMime(file) {
  if(file.type?.startsWith('audio/'))return file.type;
  return ({wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',aac:'audio/aac',webm:'audio/webm'})[file.name?.split('.').at(-1)?.toLowerCase()]||null;
}

export function profileVolumeGain(buffer,references) {
  if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>MAX_PROFILE_AUDIO_SECONDS)throw new Error('Choose audio up to 5 minutes long.');
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
  const target=energies[Math.floor(energies.length/2)]*6;
  if(!target||!count)throw new Error('Could not balance this audio.');
  return Math.min(Math.sqrt(target/(sum/count)),10**(-3/20)/peak);
}
