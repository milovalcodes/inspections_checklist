/*
  CIMCO local transcription worker.
  The model runs in this browser worker. It is downloaded once and cached by
  the browser; audio samples and transcripts never leave the device.
*/
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
const MODEL_ID = "onnx-community/whisper-tiny.en";
let transcriber = null;
let loading = null;

function post(type, extra){ self.postMessage(Object.assign({type}, extra || {})); }
function message(err){ return err && err.message ? err.message : String(err || "Unknown error"); }

async function loadVoicePack(){
  if(transcriber) return transcriber;
  if(loading) return loading;
  loading = (async()=>{
    post("pack-progress", {text:"Opening the offline voice pack...", progress:2});
    const mod = await import(TRANSFORMERS_URL);
    const env = mod.env;
    env.useBrowserCache = true;
    env.allowRemoteModels = true;
    if(env.backends && env.backends.onnx && env.backends.onnx.wasm){
      env.backends.onnx.wasm.numThreads = 1;
    }
    transcriber = await mod.pipeline("automatic-speech-recognition", MODEL_ID, {
      device:"wasm",
      // Do not accept the browser library's q8 default here. Some mobile
      // ONNX runtimes cannot open that quantized Whisper decoder. The full
      // precision pack is downloaded once, cached locally, and works on a
      // wider range of phones (including iPhones).
      dtype:"fp32",
      progress_callback: info=>{
        const pct = typeof info.progress === "number" ? Math.max(3, Math.min(96, Math.round(info.progress))) : null;
        post("pack-progress", {text:"Downloading offline voice pack...", progress:pct});
      }
    });
    post("ready", {text:"Offline voice pack is ready on this device."});
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
