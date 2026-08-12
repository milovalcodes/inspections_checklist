/*
  CIMCO local transcription worker.
  The model runs in this browser worker. It is downloaded once and cached by
  the browser; audio samples and transcripts never leave the device.
*/
// Start with the mature browser runtime. If a browser cannot start it, the
// current runtime is tried automatically before reporting a real failure.
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const FALLBACK_TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
const MODEL_ID = "onnx-community/whisper-tiny.en";
// Full precision Whisper tiny.en: encoder, merged decoder, and language files.
// Kept deliberately a little high so the on-screen total does not overshoot.
const VOICE_PACK_BYTES = 156 * 1024 * 1024;
let transcriber = null;
let loading = null;
const downloadedFiles = new Map();

function post(type, extra){ self.postMessage(Object.assign({type}, extra || {})); }
function message(err){ return err && err.message ? err.message : String(err || "Unknown error"); }
function bytes(value){
  if(!Number.isFinite(value) || value < 0) return "";
  if(value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1) + " MB";
  return Math.round(value / 1024) + " KB";
}
function downloadProgress(info){
  const loaded = Number(info && info.loaded);
  const total = Number(info && info.total);
  const file = String((info && (info.file || info.name)) || "voice-pack-file");
  if(Number.isFinite(loaded) && loaded >= 0){
    const previous = downloadedFiles.get(file) || {};
    downloadedFiles.set(file, {loaded:Math.max(previous.loaded || 0, loaded), total:Number.isFinite(total) && total > 0 ? total : previous.total || 0});
  }
  let received = 0;
  downloadedFiles.forEach(item=>{ received += item.loaded || 0; });
  const fallback = Number(info && info.progress);
  const progress = received > 0
    ? Math.max(1, Math.min(99, Math.round((received / VOICE_PACK_BYTES) * 100)))
    : (Number.isFinite(fallback) ? Math.max(1, Math.min(99, Math.round(fallback))) : null);
  const detail = received > 0
    ? bytes(Math.min(received, VOICE_PACK_BYTES)) + " of about " + bytes(VOICE_PACK_BYTES) + " downloaded"
    : "Starting the download...";
  post("pack-progress", {text:"Downloading offline voice pack...", progress, detail});
}
async function createTranscriber(url){
  const mod = await import(url);
  const env = mod.env;
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  if(env.backends && env.backends.onnx && env.backends.onnx.wasm){
    env.backends.onnx.wasm.numThreads = 1;
  }
  return mod.pipeline("automatic-speech-recognition", MODEL_ID, {
    device:"wasm",
    // Do not accept a quantized decoder here. Some mobile ONNX runtimes
    // cannot open it; the full-precision pack works on a wider range of
    // phones, including iPhones.
    dtype:"fp32",
    progress_callback:downloadProgress
  });
}

async function loadVoicePack(){
  if(transcriber) return transcriber;
  if(loading) return loading;
  loading = (async()=>{
    downloadedFiles.clear();
    post("pack-progress", {text:"Preparing offline voice pack...", progress:null, detail:"Checking the local voice engine"});
    try{
      transcriber = await createTranscriber(TRANSFORMERS_URL);
    }catch(firstError){
      post("pack-progress", {text:"Trying a compatible local voice engine...", progress:null, detail:"Your downloaded voice files will be reused."});
      transcriber = await createTranscriber(FALLBACK_TRANSFORMERS_URL);
    }
    post("ready", {text:"Offline voice pack is ready on this device.", detail:"Download complete · about " + bytes(VOICE_PACK_BYTES) + " saved for offline use"});
    return transcriber;
  })().finally(()=>{ loading=null; });
  return loading;
}

self.onmessage = async event=>{
  const data = event.data || {};
  try{
    if(data.type==="load"){
      await loadVoicePack();
      return;
    }
    if(data.type==="transcribe"){
      const asr = await loadVoicePack();
      const samples = new Float32Array(data.samples);
      post("transcribe-progress", {text:"Listening to the local audio..."});
      const result = await asr(samples, {
        language:"en",
        task:"transcribe",
        chunk_length_s:29,
        stride_length_s:4,
        return_timestamps:false
      });
      post("transcript", {text:(result && result.text) || ""});
      return;
    }
  }catch(err){
    post("error", {text:message(err)});
  }
};
