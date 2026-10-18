import * as P from './pron.js';

// ---------------- 小物 ----------------
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = s => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const when = t => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="fill"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="fill"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  rew: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" stroke="none" fill="currentColor">3</text></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" font-weight="700" stroke="none" fill="currentColor">3</text></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M14 17l-5-5 5-5"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5"/></svg>',
};
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------- 設定 ----------------
const DEFAULTS = { engine: 'local-base', openaiKey: '', autoPlay: true, autoStop: true, rate: 1, ttsRate: 0.8, guide: false, partLen: 30, textMode: 'en' };
const settings = Object.assign({}, DEFAULTS, (() => { try { return JSON.parse(localStorage.getItem('sn-settings') || '{}'); } catch { return {}; } })());
const saveSettings = () => { try { localStorage.setItem('sn-settings', JSON.stringify(settings)); } catch {} };
const MODELS = { 'local-base': 'Xenova/whisper-base.en', 'local-tiny': 'Xenova/whisper-tiny.en' };
const RATES = [0.6, 0.75, 0.9, 1, 1.2];

// ---------------- IndexedDB ----------------
let _db;
function db() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const r = indexedDB.open('shadow-note', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('materials', { keyPath: 'id' });
      d.createObjectStore('attempts', { keyPath: 'id' }).createIndex('materialId', 'materialId');
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return _db;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store);
    let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const DB = {
  all: s => tx(s, 'readonly', st => st.getAll()),
  get: (s, id) => tx(s, 'readonly', st => st.get(id)),
  put: (s, v) => tx(s, 'readwrite', st => st.put(v)),
  del: (s, id) => tx(s, 'readwrite', st => st.delete(id)),
  byMaterial: id => tx('attempts', 'readonly', st => st.index('materialId').getAll(id)),
};

// ---------------- 発音辞書 ----------------
const dictReady = fetch('cmudict.txt').then(r => { if (!r.ok) throw new Error('発音辞書を読み込めませんでした'); return r.text(); }).then(P.loadDictText);
const analysisCache = new Map();
function analyze(text) {
  if (!analysisCache.has(text)) analysisCache.set(text, P.analyzeScript(text));
  return analysisCache.get(text);
}

// ---------------- 読み上げ ----------------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
  voice = vs.find(v => /Samantha|Ava|Allison|Alex/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate, onend) {
  if (!('speechSynthesis' in window)) { toast('この端末では読み上げを使えません'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; if (voice) u.voice = voice; u.rate = rate;
  if (onend) u.onend = onend;
  speechSynthesis.speak(u);
}

// ---------------- 文字起こし ----------------
let worker = null; const pending = new Map(); let progressCb = null;
function getWorker() {
  if (worker) return worker;
  worker = new Worker('worker.js', { type: 'module' });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress' || m.type === 'status') { progressCb && progressCb(m); return; }
    const p = pending.get(m.id); if (!p) return;
    pending.delete(m.id);
    if (m.type === 'error') p.rej(new Error(m.message)); else p.res(m.text ?? true);
  };
  worker.onerror = e => { for (const p of pending.values()) p.rej(new Error(e.message || '文字起こしエンジンを起動できませんでした')); pending.clear(); worker = null; };
  return worker;
}
function askWorker(msg) {
  return new Promise((res, rej) => { const id = uid(); pending.set(id, { res, rej }); getWorker().postMessage({ ...msg, id }, msg.audio ? [msg.audio.buffer] : []); });
}
async function toPCM16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const buf = await new Promise((res, rej) => {
    blob.arrayBuffer().then(ab => { const p = ac.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }, rej);
  });
  ac.close && ac.close();
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
  const ratio = sr / 16000, outLen = Math.floor(len / ratio), out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.floor(i * ratio), e = Math.min(len, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = s; j < e; j++) sum += mono[j];
    out[i] = sum / Math.max(1, e - s);
  }
  return out;
}
const blobExt = blob => /mp4|m4a|aac/.test(blob.type) ? 'm4a' : /webm/.test(blob.type) ? 'webm' : /wav/.test(blob.type) ? 'wav' : /mpeg|mp3/.test(blob.type) ? 'mp3' : 'm4a';
async function openaiTranscribe(blob, timed) {
  if (!settings.openaiKey) throw new Error('設定で OpenAI の API キーを入力してください');
  const fd = new FormData();
  fd.append('file', blob, 'audio.' + blobExt(blob));
  fd.append('model', 'whisper-1'); fd.append('language', 'en');
  if (timed) { fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word'); }
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + settings.openaiKey }, body: fd });
  if (!r.ok) { const t = await r.text(); throw new Error(`OpenAI エラー (${r.status})：${t.slice(0, 160)}`); }
  return r.json();
}
// 録音の文字起こし（テキストだけ）
async function transcribe(blob, onProgress) {
  if (settings.engine === 'openai') {
    onProgress && onProgress({ type: 'status', text: 'OpenAI で文字起こし中…' });
    return (await openaiTranscribe(blob, false)).text || '';
  }
  onProgress && onProgress({ type: 'status', text: '録音を読み込み中…' });
  const audio = await toPCM16k(blob);
  if (audio.length < 16000 * 0.5) throw new Error('録音が短すぎます。もう一度録音してください');
  progressCb = onProgress;
  try { return await askWorker({ type: 'transcribe', model: MODELS[settings.engine] || MODELS['local-base'], audio }); }
  finally { progressCb = null; }
}
// お手本音声の文字起こし（時刻つきの語の列）
async function transcribeTimed(blob, onProgress) {
  if (settings.engine === 'openai') {
    onProgress && onProgress({ type: 'status', text: 'OpenAI で音声の位置を調べています…' });
    const j = await openaiTranscribe(blob, true);
    return { words: (j.words || []).map(w => ({ w: w.word, t: w.start })), duration: j.duration };
  }
  onProgress && onProgress({ type: 'status', text: '音声を読み込み中…' });
  const audio = await toPCM16k(blob);
  const duration = audio.length / 16000;
  progressCb = onProgress;
  onProgress && onProgress({ type: 'status', text: `音声（${fmt(duration)}）を聞き取っています…` });
  let out;
  try { out = await askWorker({ type: 'transcribe', model: MODELS[settings.engine] || MODELS['local-base'], audio, timestamps: true }); }
  finally { progressCb = null; }
  const words = [];
  for (const c of out.chunks || []) {
    const ws = c.text.trim().split(/\s+/).filter(Boolean);
    const s = c.ts?.[0] ?? 0, e = c.ts?.[1] ?? Math.min(duration, s + ws.length * 0.4);
    ws.forEach((w, i) => words.push({ w, t: s + (e - s) * i / ws.length }));
  }
  return { words, duration };
}

// ---------------- 分割と翻訳 ----------------
async function splitMaterial(m, onStatus) {
  let times = null, dur = null, how = 'text';
  if (m.hasAudio && m.audio) {
    try {
      const r = await transcribeTimed(m.audio, onStatus);
      dur = r.duration;
      const toks = P.tokenize(m.script);
      times = P.timeTokens(toks, r.words);
      how = 'audio';
    } catch (e) {
      console.warn(e);
      try { const a = new Audio(URL.createObjectURL(m.audio)); await new Promise(r => { a.onloadedmetadata = r; a.onerror = r; }); dur = isFinite(a.duration) ? a.duration : null; } catch {}
      toast('音声の位置合わせができなかったので、文の長さから区切りました', 4000);
    }
  }
  m.parts = P.makeParts(m.script, times, dur, settings.partLen);
  m.splitBy = how; m.splitLen = settings.partLen;
  await DB.put('materials', m);
  return m;
}
async function autoTranslate(m) {
  if (!settings.openaiKey) throw new Error('自動翻訳には設定で OpenAI の API キーが必要です');
  const sents = P.splitSentences(m.script);
  const body = {
    model: 'gpt-4o-mini', temperature: 0.2,
    messages: [
      { role: 'system', content: 'You translate English into natural Japanese for a language learner. Input is numbered English sentences. Output exactly the same number of lines, each "N. <Japanese translation>", one line per input sentence, nothing else.' },
      { role: 'user', content: sents.map((s, i) => `${i + 1}. ${s}`).join('\n') },
    ],
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + settings.openaiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI エラー (${r.status})`);
  const txt = (await r.json()).choices?.[0]?.message?.content || '';
  const lines = txt.split('\n').map(l => l.replace(/^\s*\d+[.)．]\s*/, '').trim()).filter(Boolean);
  m.ja = lines.join('\n');
  await DB.put('materials', m);
  return m;
}

// ---------------- ルーティング ----------------
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }
async function route() {
  cleanup.forEach(f => { try { f(); } catch {} }); cleanup = [];
  closeSheet();
  document.body.classList.remove('player-page');
  const h = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  try {
    if (h[0] === 'new') return await viewEdit(null);
    if (h[0] === 'edit') return await viewEdit(h[1]);
    if (h[0] === 'm' && h[2] != null) return await viewPart(h[1], +h[2]);
    if (h[0] === 'm') return await viewParts(h[1]);
    if (h[0] === 'r') return await viewResult(h[1]);
    if (h[0] === 'settings') return viewSettings();
    return await viewHome();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<header class="bar"><a class="icon-btn" href="#/" aria-label="戻る">${ICON.back}</a><h1>エラー</h1></header><p>${esc(e.message)}</p>`;
  }
}
window.addEventListener('hashchange', route);
const go = h => { location.hash = h; };

// ---------------- ホーム ----------------
async function viewHome() {
  const [mats, atts] = await Promise.all([DB.all('materials'), DB.all('attempts')]);
  mats.sort((a, b) => (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt));
  const today = dayKey(Date.now());
  const todays = atts.filter(a => dayKey(a.createdAt) === today);
  const mins = Math.round(todays.reduce((s, a) => s + (a.duration || 0), 0) / 60);
  const days = new Set(atts.map(a => dayKey(a.createdAt)));
  let streak = 0; const d = new Date(); if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  const count = {}; for (const a of atts) count[a.materialId] = (count[a.materialId] || 0) + 1;

  app.innerHTML = `
    <header class="bar"><span class="brand" style="flex:1">シャドーノート</span>
      <a class="icon-btn" href="#/settings" aria-label="設定">${ICON.gear}</a>
      <a class="icon-btn" href="#/new" aria-label="教材を追加">${ICON.plus}</a></header>
    <div class="today">
      <div><b>${streak}</b><span>日連続</span></div>
      <div><b>${todays.length}</b><span>回 今日</span></div>
      <div><b>${mins}</b><span>分 今日</span></div>
    </div>
    ${mats.length ? `<div class="list">${mats.map(m => `
      <button class="mat" data-id="${m.id}">
        <div class="t"><span class="name">${esc(m.title || '無題')}</span></div>
        <div class="p">${esc((m.script || '').slice(0, 90))}</div>
        <div class="small muted">${m.parts ? m.parts.length + ' パート' : '未分割'} ／ ${m.hasAudio ? '音声あり' : '読み上げ音声'} ／ 練習 ${count[m.id] || 0} 回</div>
      </button>`).join('')}</div>`
      : `<div class="empty"><p>まずは教材を1つ登録しましょう。<br>英文のスクリプトと音声ファイルを入れると、約${settings.partLen}秒ずつのパートに自動で分けます。</p><a class="btn primary" href="#/new">教材を追加</a></div>`}`;
  app.querySelectorAll('.mat').forEach(b => b.onclick = () => go('/m/' + b.dataset.id));
}

// ---------------- 教材の追加・編集 ----------------
async function viewEdit(id) {
  const m = id ? await DB.get('materials', id) : null;
  if (id && !m) throw new Error('教材が見つかりません');
  let newAudio = null, removeAudio = false;
  app.innerHTML = `
    <header class="bar"><a class="icon-btn" href="${m ? '#/m/' + m.id : '#/'}" aria-label="戻る">${ICON.back}</a><h1>${m ? '教材を編集' : '教材を追加'}</h1></header>
    <label class="f"><span>タイトル</span><input class="inp" id="title" value="${esc(m?.title || '')}" placeholder="例：Entrepreneurship Event"></label>
    <label class="f"><span>スクリプト（英文）</span><textarea class="inp" id="script" placeholder="音声の英文をそのまま貼り付けます" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(m?.script || '')}</textarea></label>
    <div class="f"><span class="small muted" style="display:block;margin-bottom:6px">お手本の音声（なくても読み上げ音声で練習できます）</span>
      <div class="filebox"><span class="name" id="fname">${m?.hasAudio ? esc(m.audioName || '音声ファイル') : '未選択'}</span>
      <label class="btn">ファイルを選ぶ<input type="file" id="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.aac" hidden></label>
      ${m?.hasAudio ? '<button class="btn danger" id="rmaudio">音声を外す</button>' : ''}</div></div>
    <label class="f"><span>日本語訳（任意）　1文ごとに改行か「。」で区切ると、英文と正確に対応します</span><textarea class="inp ja" id="ja" placeholder="訳を貼り付け。空欄なら、APIキーがあれば自動翻訳できます">${esc(m?.ja || '')}</textarea></label>
    <button class="btn primary block" id="save">${m ? '保存' : '保存してパートに分ける'}</button>
    ${m ? '<div style="height:28px"></div><button class="btn danger block" id="del">この教材と練習記録を削除</button>' : ''}`;
  $('#file').onchange = e => { newAudio = e.target.files[0] || null; removeAudio = false; $('#fname').textContent = newAudio ? newAudio.name : '未選択'; };
  if ($('#rmaudio')) $('#rmaudio').onclick = () => { removeAudio = true; newAudio = null; $('#fname').textContent = '未選択'; };
  $('#save').onclick = async () => {
    const script = $('#script').value.trim();
    if (!script) { toast('スクリプトを入力してください'); return; }
    const rec = m ? { ...m } : { id: uid(), createdAt: Date.now() };
    const changed = !m || m.script !== script || newAudio || removeAudio;
    rec.title = $('#title').value.trim() || script.split(/\s+/).slice(0, 5).join(' ');
    rec.script = script;
    rec.ja = $('#ja').value.trim();
    if (newAudio) { rec.audio = newAudio; rec.audioName = newAudio.name; rec.hasAudio = true; }
    else if (removeAudio) { delete rec.audio; delete rec.audioName; rec.hasAudio = false; }
    if (changed) delete rec.parts;
    $('#save').disabled = true;
    try { await DB.put('materials', rec); go('/m/' + rec.id); }
    catch (e) { $('#save').disabled = false; toast('保存できませんでした：' + e.message, 4000); }
  };
  if ($('#del')) $('#del').onclick = async () => {
    if (!confirm('この教材と練習記録をすべて削除します。よろしいですか？')) return;
    for (const a of await DB.byMaterial(m.id)) await DB.del('attempts', a.id);
    await DB.del('materials', m.id); go('/');
  };
}

// ---------------- パート一覧 ----------------
async function viewParts(id) {
  let m = await DB.get('materials', id);
  if (!m) throw new Error('教材が見つかりません');
  const head = `<header class="bar"><a class="icon-btn" href="#/" aria-label="戻る">${ICON.back}</a><h1>${esc(m.title)}</h1>
    <a class="icon-btn" href="#/edit/${m.id}" aria-label="編集">${ICON.edit}</a></header>`;
  let alive = true; onLeave(() => { alive = false; });
  if (!m.parts) {
    app.innerHTML = head + `<div class="waiting"><b id="st">パートに分けています…</b><div class="bar-prog" hidden id="pg"><i></i></div>
      <p class="small muted">音声を聞き取り、スクリプトと位置を合わせて約${settings.partLen}秒ずつに区切ります。音声の長さによっては数分かかります。${settings.engine === 'openai' ? '' : '初回は文字起こし用のモデル（約80MB）もダウンロードします。'}</p></div>`;
    const files = {};
    m = await splitMaterial(m, p => {
      if (!alive) return;
      if (p.type === 'progress') {
        files[p.file] = [p.loaded, p.total];
        const L = Object.values(files).reduce((s, x) => s + x[0], 0), T = Object.values(files).reduce((s, x) => s + x[1], 0);
        $('#st').textContent = `モデルをダウンロード中 ${Math.round(L / 1e6)} / ${Math.round(T / 1e6)} MB`;
        $('#pg').hidden = false; $('#pg i').style.width = (L / T * 100) + '%';
      } else { $('#st').textContent = p.text; $('#pg').hidden = true; }
    });
    if (!alive) return;
  }
  const atts = await DB.byMaterial(id);
  const last = {}, cnt = {};
  for (const a of atts.sort((x, y) => x.createdAt - y.createdAt)) { if (a.part == null) continue; cnt[a.part] = (cnt[a.part] || 0) + 1; if (a.score != null) last[a.part] = a.score; }
  const jaS = P.splitJa(m.ja);
  app.innerHTML = head + `
    <p class="small muted" style="margin:0 2px 8px">${m.parts.length} パート ／ ${m.splitBy === 'audio' ? '音声に合わせて区切り済み' : '文の長さから区切り済み'}${jaS.length ? ' ／ 日本語訳あり' : ''}</p>
    <div class="list">${m.parts.map((p, i) => `
      <button class="mat part" data-i="${i}">
        <div class="t"><span class="pnum">${i + 1}</span><span class="name small muted">${m.hasAudio ? `${fmt(p.start)} – ${fmt(p.end)}` : `約${Math.round(p.end - p.start)}秒`}${cnt[i] ? ` ／ ${cnt[i]}回` : ''}</span>${last[i] != null ? `<span class="score-tag">${last[i]}</span>` : ''}</div>
        <div class="p">${esc(p.text.slice(0, 110))}</div>
      </button>`).join('')}</div>
    <div class="row" style="margin-top:22px">
      <button class="btn" id="resplit">区切り直す</button>
      ${!jaS.length ? '<button class="btn" id="tr">日本語訳を自動で作る</button>' : ''}
    </div>`;
  app.querySelectorAll('.part').forEach(b => b.onclick = () => go(`/m/${m.id}/${b.dataset.i}`));
  $('#resplit').onclick = async () => { delete m.parts; await DB.put('materials', m); route(); };
  if ($('#tr')) $('#tr').onclick = async e => {
    e.currentTarget.disabled = true; e.currentTarget.textContent = '翻訳中…';
    try { await autoTranslate(m); toast('日本語訳を作りました'); route(); }
    catch (err) { toast(err.message, 4500); e.currentTarget.disabled = false; e.currentTarget.textContent = '日本語訳を自動で作る'; }
  };
}

// ---------------- スクリプト描画 ----------------
function scriptHTML(an, marks) {
  const { tokens, groups } = an;
  return groups.map(g => {
    let bad = false;
    const ws = tokens.slice(g.from, g.to + 1).map(t => {
      const st = marks ? marks.status[t.i] : 'ok';
      if (st !== 'ok') bad = true;
      return `<span class="w${st === 'sub' ? ' bad' : st === 'miss' ? ' miss' : ''}">${esc(t.raw)}</span>`;
    }).join(' ');
    return `<span class="g${bad ? ' has-bad' : ''}" data-g="${g.id}" role="button" tabindex="0"><span class="ws">${ws}</span><span class="kana">${esc(g.natural)}</span></span>`;
  }).join(' ');
}
function bindScript(el, an, marks) {
  el.querySelectorAll('.g').forEach(n => {
    const open = () => openAdvice(an, an.groups[+n.dataset.g], marks);
    n.onclick = open; n.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}
function setGuide(el, on) {
  el.classList.toggle('guide', on);
  el.querySelectorAll('.kana').forEach(k => k.hidden = !on);
}

// ---------------- 発音アドバイス（シート）----------------
function phoneTips(words) {
  const tips = new Set();
  for (const w of words) {
    const ph = P.lookup(P.normWord(w)); if (!ph) continue;
    const ps = ph.map(x => x.p);
    if (ps.includes('TH') || ps.includes('DH')) tips.add('th は舌先を上の前歯に軽く当てて息を出す（「ス」「ズ」にしない）。');
    if (ps.includes('R')) tips.add('r は舌先をどこにも付けず、少し奥に引いて唇をすぼめる。');
    if (ps.includes('L')) tips.add('l は舌先を上の歯ぐきにしっかり付ける。');
    if (ps.includes('V')) tips.add('v は上の前歯を下唇に軽く当てて震わせる（「ブ」にしない）。');
    if (ps.includes('F')) tips.add('f は上の前歯を下唇に当てて息を出す（「フ」より摩擦を強く）。');
    if (ps.includes('AE')) tips.add('a（æ）は口を横に大きく開けて「ア」と「エ」の中間で。');
    if (ps.some((p, i) => p === 'ER' && ph[i].s)) tips.add('er は舌を奥に丸めたまま「アー」とこもらせる。');
    const last = ps[ps.length - 1];
    if (last && !['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'].includes(last)) tips.add('語末の子音のあとに「ウ」「オ」を付けない。');
  }
  return [...tips].slice(0, 3);
}
function openAdvice(an, g, marks) {
  const toks = an.tokens.slice(g.from, g.to + 1);
  const words = toks.map(t => t.raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ''));
  let verdict = '';
  if (marks) {
    const bad = toks.filter(t => marks.status[t.i] !== 'ok');
    verdict = bad.map(t => marks.status[t.i] === 'miss'
      ? `「${esc(t.raw.replace(/[^A-Za-z0-9'-]/g, ''))}」が聞き取れませんでした。`
      : `「${esc(t.raw.replace(/[^A-Za-z0-9'-]/g, ''))}」が「${esc(marks.heard[t.i])}」に聞こえました。`).join('<br>');
  }
  const same = g.naive.replace(/\s/g, '') === g.natural;
  const tips = [...g.notes];
  if (tips.length === 0 || marks) tips.push(...phoneTips(words));
  if (!tips.length) tips.push('目立った音の変化はありません。お手本のリズムと強弱をまねしましょう。');
  $('#sheet-body').innerHTML = `
    <p class="sh-words">${esc(words.join(' '))}</p>
    ${verdict ? `<p class="sh-verdict">${verdict}</p>` : ''}
    ${g.known ? `<dl class="compare">
      ${same ? '' : `<dt>カタカナ読み</dt><dd><span class="naive">${esc(g.naive)}</span></dd>`}
      <dt>${same ? '発音' : 'こう発音'}</dt><dd><span class="natural">${esc(g.natural)}</span></dd>
    </dl>` : `<p class="muted small">辞書にない単語を含むため、カタカナ表記を出せません。お手本をよく聞いてまねしましょう。</p>`}
    <ul class="tips">${[...new Set(tips)].map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="sh-actions">
      <button class="btn primary" id="say-slow">ゆっくり聞く</button>
      <button class="btn" id="say">普通の速さ</button>
      <button class="btn" id="close-sheet" style="margin-left:auto">閉じる</button>
    </div>`;
  const text = words.join(' ');
  $('#say-slow').onclick = () => speak(text, Math.min(settings.ttsRate, 0.6));
  $('#say').onclick = () => speak(text, 1);
  $('#close-sheet').onclick = closeSheet;
  $('#scrim').classList.add('open'); $('#sheet').classList.add('open');
}
function closeSheet() { $('#scrim').classList.remove('open'); $('#sheet').classList.remove('open'); }
$('#scrim').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// ---------------- パート練習画面 ----------------
async function viewPart(id, idx) {
  const m = await DB.get('materials', id);
  if (!m) throw new Error('教材が見つかりません');
  if (!m.parts) return go('/m/' + id);
  const part = m.parts[idx];
  if (!part) return go('/m/' + id);
  await dictReady;
  const an = analyze(part.text);
  const ja = P.jaForPart(P.splitJa(m.ja), part);
  const atts = (await DB.byMaterial(id)).filter(a => a.part === idx).sort((a, b) => b.createdAt - a.createdAt);
  let url = null;
  if (m.hasAudio && m.audio) { url = URL.createObjectURL(m.audio); onLeave(() => URL.revokeObjectURL(url)); }
  const S = part.start, E = part.end, LEN = Math.max(0.1, E - S);
  let mode = 'practice';
  document.body.classList.add('player-page');

  app.innerHTML = `
    <header class="pbar">
      <a class="icon-btn" href="#/m/${m.id}" aria-label="パート一覧に戻る">${ICON.close}</a>
      <div class="ptitle"><b>${esc(m.title)}</b><span>
        <button class="pnav" id="prev" ${idx === 0 ? 'disabled' : ''} aria-label="前のパート">${ICON.prev}</button>
        パート ${idx + 1} / ${m.parts.length}
        <button class="pnav" id="next" ${idx === m.parts.length - 1 ? 'disabled' : ''} aria-label="次のパート">${ICON.next}</button></span></div>
      <button class="tbtn" id="guide" aria-pressed="${settings.guide}" title="発音ガイド">カナ</button>
      <button class="tbtn" id="speed">×${settings.rate}</button>
    </header>
    <main class="pscroll">
      <div class="script big" id="sc">${scriptHTML(an)}</div>
      <div class="ja-text" id="jat" hidden>${ja ? esc(ja) : '<span class="muted">このパートの日本語訳はありません。教材の編集で訳を貼り付けるか、パート一覧の「日本語訳を自動で作る」を使ってください。</span>'}</div>
      <div class="hidden-msg" id="hid" hidden>スクリプトを隠しています。音だけを頼りに追いかけましょう。</div>
      ${atts.length ? `<h2 class="section-title">このパートの記録</h2><div class="hist">${atts.slice(0, 20).map(a => `
        <button data-a="${a.id}"><span class="d">${when(a.createdAt)} <span class="m">${fmt(a.duration)}</span></span>
        <span class="score-tag">${a.score != null ? a.score : a.status === 'error' ? '—' : '…'}</span></button>`).join('')}</div>` : ''}
    </main>
    <section class="pdock">
      <div class="modes" role="tablist">
        <button data-m="practice" aria-pressed="true">練習モード</button>
        <button data-m="record" aria-pressed="false">録音モード</button>
      </div>
      <div class="seekrow">
        <span id="tcur">0:00</span>
        <input type="range" class="seek" id="seek" min="0" max="1000" value="0" aria-label="再生位置" ${url ? '' : 'disabled'}>
        <span id="trem">-${fmt(LEN)}</span>
      </div>
      <div class="ctrls">
        <button class="ctl txt" id="tmode" aria-label="表示の切り替え"></button>
        <button class="ctl" id="rew" aria-label="3秒戻る" ${url ? '' : 'disabled'}>${ICON.rew}</button>
        <button class="main-btn" id="main" aria-label="再生">${ICON.play}</button>
        <button class="ctl" id="fwd" aria-label="3秒進む" ${url ? '' : 'disabled'}>${ICON.fwd}</button>
        <button class="ctl txt" id="ab" aria-label="区間リピート" ${url ? '' : 'disabled'}>AB</button>
      </div>
      <p class="dock-note" id="dnote"></p>
    </section>`;

  const sc = $('#sc'); bindScript(sc, an); setGuide(sc, settings.guide);
  $('#prev').onclick = () => go(`/m/${m.id}/${idx - 1}`);
  $('#next').onclick = () => go(`/m/${m.id}/${idx + 1}`);
  app.querySelectorAll('.hist button').forEach(b => b.onclick = () => go('/r/' + b.dataset.a));
  $('#guide').onclick = e => { settings.guide = !settings.guide; saveSettings(); e.currentTarget.setAttribute('aria-pressed', settings.guide); setGuide(sc, settings.guide); };

  // 表示（英文 / 日本語訳 / 隠す）
  const TM = { en: 'EN', ja: 'JA', hide: '—' };
  const applyText = () => {
    const t = settings.textMode;
    sc.hidden = t !== 'en'; $('#jat').hidden = t !== 'ja'; $('#hid').hidden = t !== 'hide';
    $('#guide').hidden = t !== 'en';
    $('#tmode').textContent = TM[t];
    $('#tmode').setAttribute('aria-label', t === 'en' ? '英文を表示中（タップで日本語訳）' : t === 'ja' ? '日本語訳を表示中（タップで隠す）' : '隠し中（タップで英文）');
    $('#tmode').classList.toggle('on', t !== 'hide');
  };
  $('#tmode').onclick = () => { settings.textMode = { en: 'ja', ja: 'hide', hide: 'en' }[settings.textMode] || 'en'; saveSettings(); applyText(); };
  applyText();

  // 再生
  const au = url ? new Audio(url) : null;
  if (au) au.preload = 'auto';
  let playing = false, ttsPlaying = false, raf = 0, A = null, B = null, onSegEnd = null;
  const setMainIcon = () => {
    const btn = $('#main');
    if (mode === 'record') { btn.className = 'main-btn rec' + (recording ? ' on' : ''); btn.innerHTML = '<span></span>'; btn.setAttribute('aria-label', recording ? '録音を停止' : '録音を開始'); return; }
    btn.className = 'main-btn'; btn.innerHTML = (playing || ttsPlaying) ? ICON.pause : ICON.play;
    btn.setAttribute('aria-label', (playing || ttsPlaying) ? '一時停止' : '再生');
  };
  const rel = () => au ? Math.min(LEN, Math.max(0, au.currentTime - S)) : 0;
  const paint = () => {
    const r = rel();
    $('#tcur').textContent = fmt(r); $('#trem').textContent = '-' + fmt(LEN - r);
    $('#seek').value = Math.round(r / LEN * 1000);
  };
  const tick = () => {
    if (!au || au.paused) return;
    const t = au.currentTime;
    if (A != null && B != null && t >= B) { au.currentTime = A; }
    else if (t >= E) {
      au.pause(); au.currentTime = E; paint();
      const cb = onSegEnd; onSegEnd = null; cb && cb();
      return;
    }
    paint(); raf = requestAnimationFrame(tick);
  };
  if (au) {
    au.onplay = () => { playing = true; setMainIcon(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    au.onpause = () => { playing = false; setMainIcon(); cancelAnimationFrame(raf); paint(); };
    au.onended = () => { const cb = onSegEnd; onSegEnd = null; cb && cb(); };
    au.onloadedmetadata = () => { if (au.currentTime < S || au.currentTime > E) au.currentTime = S; paint(); };
    $('#seek').oninput = e => { au.currentTime = S + e.target.value / 1000 * LEN; paint(); };
    $('#rew').onclick = () => { au.currentTime = Math.max(S, au.currentTime - 3); paint(); };
    $('#fwd').onclick = () => { au.currentTime = Math.min(E - 0.05, au.currentTime + 3); paint(); };
    $('#ab').onclick = () => {
      const b = $('#ab');
      if (A == null) { A = au.currentTime; b.textContent = 'A–'; b.classList.add('on'); toast('もう一度押すと B 地点を決めて繰り返します'); }
      else if (B == null) { B = Math.max(A + 0.5, au.currentTime); b.textContent = 'A–B'; au.currentTime = A; if (au.paused) startPlay(false); }
      else { A = B = null; b.textContent = 'AB'; b.classList.remove('on'); }
    };
  }
  const startPlay = (fromStart, cb) => {
    onSegEnd = cb || null;
    if (au) {
      if (fromStart || au.currentTime >= E - 0.05 || au.currentTime < S) au.currentTime = A != null && B != null && !fromStart ? A : S;
      au.playbackRate = settings.rate;
      au.play().catch(() => toast('音声を再生できませんでした'));
    } else {
      ttsPlaying = true; setMainIcon();
      speak(part.text, settings.rate * 0.95, () => { ttsPlaying = false; setMainIcon(); const c = onSegEnd; onSegEnd = null; c && c(); });
    }
  };
  const stopPlay = () => { onSegEnd = null; if (au) au.pause(); if (ttsPlaying) { speechSynthesis.cancel(); ttsPlaying = false; setMainIcon(); } };
  $('#speed').onclick = e => {
    const i = RATES.indexOf(settings.rate);
    settings.rate = RATES[(i + 1) % RATES.length]; saveSettings();
    e.currentTarget.textContent = '×' + settings.rate;
    if (au) au.playbackRate = settings.rate;
  };

  // モード
  const setMode = md => {
    if (recording) return;
    mode = md; stopPlay();
    app.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === md)));
    $('#dnote').textContent = md === 'record' ? '英文を隠すとシャドーイング、出したままならオーバーラッピング。イヤホン推奨。' : '語をタップすると発音のコツが見られます。';
    setMainIcon();
  };
  app.querySelectorAll('.modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));

  // 録音
  let rec = null, stream = null, chunks = [], t0 = 0, timer = null, stopT = null, recording = false;
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const stopAll = () => { clearTimeout(stopT); clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  onLeave(() => { stopPlay(); cancelAnimationFrame(raf); if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } stopAll(); });
  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('このブラウザでは録音できません', 4000); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { toast('マイクの使用を許可してください（設定 → Safari → マイク）', 5000); return; }
    chunks = [];
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = finishRec;
    rec.start(1000);
    t0 = Date.now(); recording = true; setMainIcon();
    A = B = null; if ($('#ab')) { $('#ab').textContent = 'AB'; $('#ab').classList.remove('on'); }
    ['rew', 'fwd', 'ab', 'tmode'].forEach(k => $('#' + k).disabled = true);
    $('#dnote').textContent = '録音中 0:00' + (settings.autoStop ? '　パートの終わりで自動で止まります' : '');
    timer = setInterval(() => { $('#dnote').textContent = '録音中 ' + fmt((Date.now() - t0) / 1000) + (settings.autoStop ? '　パートの終わりで自動で止まります' : ''); }, 500);
    if (settings.autoPlay) startPlay(true, () => { if (settings.autoStop) stopT = setTimeout(stopRec, 1200); });
  }
  function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); stopPlay(); }
  async function finishRec() {
    const duration = (Date.now() - t0) / 1000;
    stopAll(); recording = false;
    const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' });
    const a = { id: uid(), materialId: m.id, part: idx, refText: part.text, createdAt: Date.now(), duration, mode: settings.textMode === 'hide' ? 'shadow' : 'overlap', blob, status: 'processing', engine: settings.engine };
    await DB.put('attempts', a);
    await DB.put('materials', { ...m, lastAt: Date.now() });
    go('/r/' + a.id);
  }
  $('#main').onclick = () => {
    if (mode === 'record') { if (recording) stopRec(); else startRec(); return; }
    if (au) { if (au.paused) startPlay(false); else stopPlay(); }
    else { if (ttsPlaying) stopPlay(); else startPlay(true); }
  };
  setMode('practice');
  paint();
}

// ---------------- 結果画面 ----------------
async function viewResult(aid) {
  const a = await DB.get('attempts', aid);
  if (!a) throw new Error('練習記録が見つかりません');
  const m = await DB.get('materials', a.materialId);
  if (!m) throw new Error('教材が見つかりません');
  await dictReady;
  const ref = a.refText || m.script;
  const an = analyze(ref);
  const backTo = a.part != null ? `#/m/${m.id}/${a.part}` : `#/m/${m.id}`;
  const myUrl = URL.createObjectURL(a.blob); onLeave(() => URL.revokeObjectURL(myUrl));
  let alive = true; onLeave(() => { alive = false; });
  const partLabel = a.part != null ? `パート ${a.part + 1}` : '';

  const head = `<header class="bar"><a class="icon-btn" href="${backTo}" aria-label="戻る">${ICON.back}</a><h1>${esc(m.title)}${partLabel ? ' ／ ' + partLabel : ''}</h1></header>`;
  const run = async () => {
    app.innerHTML = head + `<div class="waiting"><b id="st">準備中…</b><div class="bar-prog" hidden id="pg"><i></i></div>
      <p class="small muted">${settings.engine === 'openai' ? '' : '初回は文字起こし用のモデル（約' + (settings.engine === 'local-tiny' ? '40' : '80') + 'MB）をダウンロードします。2回目以降はオフラインでも動きます。'}</p></div>`;
    const files = {};
    try {
      const text = await transcribe(a.blob, p => {
        if (!alive) return;
        if (p.type === 'progress') {
          files[p.file] = [p.loaded, p.total];
          const L = Object.values(files).reduce((s, x) => s + x[0], 0), T = Object.values(files).reduce((s, x) => s + x[1], 0);
          $('#st').textContent = `モデルをダウンロード中 ${Math.round(L / 1e6)} / ${Math.round(T / 1e6)} MB`;
          $('#pg').hidden = false; $('#pg i').style.width = (L / T * 100) + '%';
        } else if (p.type === 'status') { $('#st').textContent = p.text; $('#pg').hidden = true; }
      });
      a.text = text; a.status = 'done';
      a.score = P.alignTranscript(an.tokens, text).score;
    } catch (e) { a.status = 'error'; a.error = e.message; }
    await DB.put('attempts', a);
    if (alive) show();
  };
  const show = () => {
    if (a.status === 'error') {
      app.innerHTML = head + `<div class="waiting"><b>文字起こしできませんでした</b><p class="small muted">${esc(a.error)}</p>
        <button class="btn primary" id="retry">もう一度文字起こしする</button><audio controls src="${myUrl}"></audio></div>`;
      $('#retry').onclick = run; return;
    }
    const marks = P.alignTranscript(an.tokens, a.text || '');
    const badGroups = new Set(an.tokens.filter(t => marks.status[t.i] !== 'ok').map(t => t.g));
    const hasNext = a.part != null && m.parts && a.part < m.parts.length - 1;
    app.innerHTML = head + `
      <div class="result-top">
        <div class="big-score">${marks.score}<small>点</small></div>
        <div class="result-sum">赤字の所 <b>${badGroups.size}</b> か所<br>
          <span class="small">${when(a.createdAt)} ／ ${a.mode === 'overlap' ? 'オーバーラッピング' : 'シャドーイング'}</span></div>
      </div>
      <div class="row" style="margin:14px 0 4px">
        <button class="btn" id="mine">自分の録音を聞く</button>
        ${m.hasAudio ? '<button class="btn" id="model">お手本を聞く</button>' : ''}
      </div>
      <div class="note-head"><h2>添削</h2><button class="chip" id="tg-guide" aria-pressed="${settings.guide}">発音ガイド</button></div>
      <div class="note"><div class="script" id="sc">${scriptHTML(an, marks)}</div></div>
      <div class="legend"><span><i style="text-decoration:underline">red</i> 別の語に聞こえた</span><span><i style="text-decoration:line-through">red</i> 聞き取れなかった</span><span>赤い所をタップすると発音のコツ</span></div>
      <details class="heard"><summary>認識された文を見る</summary><p>${esc(a.text || '（何も認識されませんでした）')}</p></details>
      <div style="height:24px"></div>
      <button class="btn primary block" id="again">もう一度このパートを練習する</button>
      ${hasNext ? '<div style="height:10px"></div><button class="btn block" id="nextp">次のパートへ</button>' : ''}
      <div style="height:10px"></div>
      <button class="btn danger block" id="delatt">この記録を削除</button>`;
    const sc = $('#sc'); bindScript(sc, an, marks); setGuide(sc, settings.guide);
    $('#tg-guide').onclick = e => { settings.guide = !settings.guide; saveSettings(); e.currentTarget.setAttribute('aria-pressed', settings.guide); setGuide(sc, settings.guide); };
    const myau = new Audio(myUrl);
    let modelAu = null, modelRaf = 0;
    const part = a.part != null && m.parts ? m.parts[a.part] : null;
    if (m.hasAudio && m.audio) { const u = URL.createObjectURL(m.audio); onLeave(() => URL.revokeObjectURL(u)); modelAu = new Audio(u); }
    onLeave(() => { myau.pause(); modelAu && modelAu.pause(); cancelAnimationFrame(modelRaf); });
    $('#mine').onclick = () => { modelAu && modelAu.pause(); if (myau.paused) { myau.currentTime = 0; myau.play(); } else myau.pause(); };
    if ($('#model')) $('#model').onclick = () => {
      myau.pause();
      if (!modelAu.paused) { modelAu.pause(); return; }
      modelAu.currentTime = part ? part.start : 0; modelAu.playbackRate = settings.rate; modelAu.play();
      if (part) { const stop = () => { if (modelAu.paused) return; if (modelAu.currentTime >= part.end) modelAu.pause(); else modelRaf = requestAnimationFrame(stop); }; modelRaf = requestAnimationFrame(stop); }
    };
    $('#again').onclick = () => { location.hash = backTo; };
    if ($('#nextp')) $('#nextp').onclick = () => go(`/m/${m.id}/${a.part + 1}`);
    $('#delatt').onclick = async () => { if (!confirm('この練習記録を削除しますか？')) return; await DB.del('attempts', a.id); location.hash = backTo; };
    if (a.score !== marks.score) { a.score = marks.score; DB.put('attempts', a); }
  };
  if (a.status === 'done') show(); else run();
}

// ---------------- 設定 ----------------
function viewSettings() {
  const eng = settings.engine;
  app.innerHTML = `
    <header class="bar"><a class="icon-btn" href="#/" aria-label="戻る">${ICON.back}</a><h1>設定</h1></header>
    <h2 class="section-title">パートの長さ</h2>
    <div class="chips" id="plen">${[20, 30, 45, 60].map(s => `<button class="chip" data-s="${s}" aria-pressed="${settings.partLen === s}">約${s}秒</button>`).join('')}</div>
    <p class="small muted">新しく追加する教材と「区切り直す」に使われます。</p>
    <h2 class="section-title">文字起こし</h2>
    <div class="radio-list">
      <label><input type="radio" name="eng" value="local-base" ${eng === 'local-base' ? 'checked' : ''}><div>iPhone内で処理（標準）<small>約80MBのモデルを一度だけダウンロード。録音は端末の外に出ません。</small></div></label>
      <label><input type="radio" name="eng" value="local-tiny" ${eng === 'local-tiny' ? 'checked' : ''}><div>iPhone内で処理（軽量）<small>約40MB。速いが、聞き間違いが少し増えます。</small></div></label>
      <label><input type="radio" name="eng" value="openai" ${eng === 'openai' ? 'checked' : ''}><div>OpenAI の Whisper API<small>精度が高く速い。音声がOpenAIに送信され、利用料がかかります。</small></div></label>
    </div>
    <label class="f" style="margin-top:12px"><span>OpenAI API キー（この端末にだけ保存。OpenAIで文字起こしする場合と、日本語訳の自動作成に使います）</span>
      <input class="inp" id="key" type="password" autocomplete="off" value="${esc(settings.openaiKey)}" placeholder="sk-..."></label>
    <button class="btn" id="preload" ${eng === 'openai' ? 'hidden' : ''}>モデルを今ダウンロードしておく</button>
    <p class="small muted" id="preload-st"></p>
    <h2 class="section-title">録音</h2>
    <div class="set-row"><div>録音と同時にお手本を再生<small>オフにすると、録音だけ始まります</small></div><input type="checkbox" class="switch" id="ap" ${settings.autoPlay ? 'checked' : ''}></div>
    <div class="set-row"><div>パートの終わりで録音を止める</div><input type="checkbox" class="switch" id="as" ${settings.autoStop ? 'checked' : ''}></div>
    <h2 class="section-title">データ</h2>
    <p class="small muted" id="usage">教材と録音はこの iPhone の中だけに保存されます。</p>
    <button class="btn danger" id="wipe">すべてのデータを削除</button>`;
  $('#plen').querySelectorAll('.chip').forEach(c => c.onclick = () => {
    settings.partLen = +c.dataset.s; saveSettings();
    $('#plen').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
  });
  app.querySelectorAll('input[name=eng]').forEach(r => r.onchange = () => { settings.engine = r.value; saveSettings(); $('#preload').hidden = r.value === 'openai'; });
  $('#key').oninput = e => { settings.openaiKey = e.target.value.trim(); saveSettings(); };
  $('#ap').onchange = e => { settings.autoPlay = e.target.checked; saveSettings(); };
  $('#as').onchange = e => { settings.autoStop = e.target.checked; saveSettings(); };
  $('#preload').onclick = async () => {
    const st = $('#preload-st'); const files = {};
    $('#preload').disabled = true; st.textContent = '準備中…';
    progressCb = p => {
      if (p.type !== 'progress') return;
      files[p.file] = [p.loaded, p.total];
      const L = Object.values(files).reduce((s, x) => s + x[0], 0), T = Object.values(files).reduce((s, x) => s + x[1], 0);
      st.textContent = `ダウンロード中 ${Math.round(L / 1e6)} / ${Math.round(T / 1e6)} MB`;
    };
    try { await askWorker({ type: 'load', model: MODELS[settings.engine] }); st.textContent = 'ダウンロード済みです。オフラインでも文字起こしできます。'; }
    catch (e) { st.textContent = 'ダウンロードできませんでした：' + e.message; }
    finally { progressCb = null; $('#preload').disabled = false; }
  };
  if (navigator.storage?.estimate) navigator.storage.estimate().then(e => { $('#usage').textContent += ` 使用中：約 ${Math.round((e.usage || 0) / 1e6)} MB`; });
  $('#wipe').onclick = async () => {
    if (!confirm('すべての教材と練習記録を削除します。元に戻せません。')) return;
    for (const s of ['materials', 'attempts']) for (const x of await DB.all(s)) await DB.del(s, x.id);
    toast('削除しました'); go('/');
  };
}

// ---------------- 起動 ----------------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
dictReady.catch(e => toast(e.message, 5000));
route();
