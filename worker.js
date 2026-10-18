// 端末内 Whisper による文字起こし（Web Worker）
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr = null, loadedModel = null;

async function load(model) {
  if (asr && loadedModel === model) return asr;
  asr = null;
  asr = await pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
      }
    },
  });
  loadedModel = model;
  return asr;
}

self.onmessage = async (e) => {
  const { type, id, model, audio } = e.data;
  try {
    if (type === 'load') {
      await load(model);
      self.postMessage({ type: 'ready', id });
    } else if (type === 'transcribe') {
      const t = await load(model);
      self.postMessage({ type: 'status', id, text: '文字起こし中…' });
      const out = await t(audio, { chunk_length_s: 30, stride_length_s: 5 });
      const text = Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text;
      self.postMessage({ type: 'result', id, text: (text || '').trim() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
