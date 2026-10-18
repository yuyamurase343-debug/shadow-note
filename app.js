import * as P from './pron.js';

// ---------------- 小物 ----------------
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
};
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------------- 設定 ----------------
const DEFAULTS = { engine: 'local-base', openaiKey: '', autoPlay: true, autoStop: true, mode: 'shadow', rate: 1, ttsRate: 0.8, guide: false };
const settings = Object.assign({}, DEFAULTS, (() => { try { return JSON.parse(localStorage.getItem('sn-settings') || '{}'); } catch { return {}; } })());
const saveSettings = () => { try { localStorage.setItem('sn-settings', JSON.stringify(settings)); } catch {} };
const MODELS = { 'local-base': 'Xenova/whisper-base.en', 'local-tiny': 'Xenova/whisper-tiny.en' };

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
const dictReady = fetch('cmudict.txt').then(r => { if (!r.ok) throw new Error('辞書を読み込めませんでした'); return r.text(); }).then(P.loadDictText);
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
    if (m.type === 'progress') { progressCb && progressCb(m); return; }
    if (m.type === 'status') { progressCb && progressCb(m); return; }
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
    blob.arrayBuffer().then(ab => {
      const p = ac.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    }, rej);
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
async function transcribe(blob, onProgress) {
  if (settings.engine === 'openai') {
    if (!settings.openaiKey) throw new Error('設定で OpenAI の API キーを入力してください');
    onProgress && onProgress({ type: 'status', text: 'OpenAI に送信して文字起こし中…' });
    const ext = /mp4|m4a|aac/.test(blob.type) ? 'm4a' : /webm/.test(blob.type) ? 'webm' : /wav/.test(blob.type) ? 'wav' : 'm4a';
    const fd = new FormData();
    fd.append('file', blob, 'recording.' + ext);
    fd.append('model', 'whisper-1'); fd.append('language', 'en');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + settings.openaiKey }, body: fd });
    if (!r.ok) { const t = await r.text(); throw new Error(`OpenAI エラー (${r.status})：${t.slice(0, 160)}`); }
    return (await r.json()).text || '';
  }
  onProgress && onProgress({ type: 'status', text: '録音を読み込み中…' });
  const audio = await toPCM16k(blob);
  if (audio.length < 16000 * 0.5) throw new Error('録音が短すぎます。もう一度録音してください');
  progressCb = onProgress;
  try { return await askWorker({ type: 'transcribe', model: MODELS[settings.engine] || MODELS['local-base'], audio }); }
  finally { progressCb = null; }
}

// ---------------- ルーティング ----------------
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }
async function route() {
  cleanup.forEach(f => { try { f(); } catch {} }); cleanup = [];
  closeSheet();
  const h = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  try {
    if (h[0] === 'new') return await viewEdit(null);
    if (h[0] === 'edit') return await viewEdit(h[1]);
    if (h[0] === 'm') return await viewPractice(h[1]);
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
  const lastScore = {}; const count = {};
  for (const a of atts.sort((x, y) => x.createdAt - y.createdAt)) { count[a.materialId] = (count[a.materialId] || 0) + 1; if (a.score != null) lastScore[a.materialId] = a.score; }

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
        <div class="t"><span class="name">${esc(m.title || '無題')}</span>${lastScore[m.id] != null ? `<span class="score-tag">${lastScore[m.id]}</span>` : ''}</div>
        <div class="p">${esc((m.script || '').slice(0, 90))}</div>
        <div class="small muted">${m.hasAudio ? '音声あり' : '音声なし（読み上げ）'} ／ 練習 ${count[m.id] || 0} 回</div>
      </button>`).join('')}</div>`
      : `<div class="empty"><p>まずは教材を1つ登録しましょう。<br>英文のスクリプトと、あれば音声ファイルを入れます。</p><a class="btn primary" href="#/new">教材を追加</a></div>`}`;
  app.querySelectorAll('.mat').forEach(b => b.onclick = () => go('/m/' + b.dataset.id));
}

// ---------------- 教材の追加・編集 ----------------
async function viewEdit(id) {
  const m = id ? await DB.get('materials', id) : null;
  if (id && !m) throw new Error('教材が見つかりません');
  let newAudio = null, removeAudio = false;
  app.innerHTML = `
    <header class="bar"><a class="icon-btn" href="${m ? '#/m/' + m.id : '#/'}" aria-label="戻る">${ICON.back}</a><h1>${m ? '教材を編集' : '教材を追加'}</h1></header>
    <label class="f"><span>タイトル</span><input class="inp" id="title" value="${esc(m?.title || '')}" placeholder="例：Steve Jobs スピーチ 1"></label>
    <label class="f"><span>スクリプト（英文）</span><textarea class="inp" id="script" placeholder="音声の英文をそのまま貼り付けます" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(m?.script || '')}</textarea></label>
    <div class="f"><span class="small muted" style="display:block;margin-bottom:6px">お手本の音声（なくても読み上げ音声で練習できます）</span>
      <div class="filebox"><span class="name" id="fname">${m?.hasAudio ? esc(m.audioName || '音声ファイル') : '未選択'}</span>
      <label class="btn">ファイルを選ぶ<input type="file" id="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.aac" hidden></label>
      ${m?.hasAudio ? '<button class="btn danger" id="rmaudio">音声を外す</button>' : ''}</div></div>
    <div style="height:18px"></div>
    <button class="btn primary block" id="save">保存</button>
    ${m ? '<div style="height:28px"></div><button class="btn danger block" id="del">この教材と練習記録を削除</button>' : ''}`;
  $('#file').onchange = e => { newAudio = e.target.files[0] || null; removeAudio = false; $('#fname').textContent = newAudio ? newAudio.name : '未選択'; };
  if ($('#rmaudio')) $('#rmaudio').onclick = () => { removeAudio = true; newAudio = null; $('#fname').textContent = '未選択'; };
  $('#save').onclick = async () => {
    const script = $('#script').value.trim();
    if (!script) { toast('スクリプトを入力してください'); return; }
    const rec = m ? { ...m } : { id: uid(), createdAt: Date.now() };
    rec.title = $('#title').value.trim() || script.split(/\s+/).slice(0, 5).join(' ');
    rec.script = script;
    if (newAudio) { rec.audio = newAudio; rec.audioName = newAudio.name; rec.hasAudio = true; }
    else if (removeAudio) { delete rec.audio; delete rec.audioName; rec.hasAudio = false; }
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
  el.querySelectorAll('.kana').forEach(k => { if (!el.classList.contains('guide')) k.hidden = true; });
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

// ---------------- 練習画面 ----------------
const MODE_HINT = {
  listen: 'スクリプトを見ずに聞き、聞き取れない所を確認します。',
  overlap: 'スクリプトを見ながら、お手本と同時に声を重ねて読みます。',
  shadow: 'スクリプトを隠し、お手本の少し後を追いかけて声に出します。',
};
async function viewPractice(id) {
  const m = await DB.get('materials', id);
  if (!m) throw new Error('教材が見つかりません');
  await dictReady;
  const an = analyze(m.script);
  const atts = (await DB.byMaterial(id)).sort((a, b) => b.createdAt - a.createdAt);
  let url = null;
  if (m.hasAudio && m.audio) { url = URL.createObjectURL(m.audio); onLeave(() => URL.revokeObjectURL(url)); }
  const RATES = [0.6, 0.75, 0.9, 1, 1.2];
  app.innerHTML = `
    <header class="bar"><a class="icon-btn" href="#/" aria-label="戻る">${ICON.back}</a><h1>${esc(m.title)}</h1>
      <a class="icon-btn" href="#/edit/${m.id}" aria-label="編集">${ICON.edit}</a></header>
    ${url ? `<audio id="au" src="${url}" preload="auto"></audio>` : ''}
    <div class="player">
      <button class="play" id="pp" aria-label="再生">${ICON.play}</button>
      ${url ? '<input type="range" class="seek" id="seek" min="0" max="1000" value="0" aria-label="再生位置">' : '<span class="small muted">音声なし：読み上げ音声で再生します</span>'}
      <span class="time" id="tm">${url ? '0:00 / 0:00' : ''}</span>
    </div>
    <div class="row"><div class="chips" id="rates">${RATES.map(r => `<button class="chip" data-r="${r}" aria-pressed="${settings.rate === r}">×${r}</button>`).join('')}</div>
      ${url ? '<button class="chip" id="back5" style="margin-left:auto">5秒戻る</button>' : ''}</div>
    <div class="seg" id="modes">
      <button data-m="listen">リスニング</button><button data-m="overlap">オーバーラップ</button><button data-m="shadow">シャドーイング</button></div>
    <p class="mode-hint" id="mhint"></p>
    <div class="note-head"><h2>スクリプト</h2>
      <button class="chip" id="tg-script"></button><button class="chip" id="tg-guide" aria-pressed="${settings.guide}">発音ガイド</button></div>
    <div class="note"><div class="script" id="sc">${scriptHTML(an)}</div></div>
    <p class="small muted" style="margin:8px 2px 0">語をタップすると発音のコツが見られます。</p>
    ${atts.length ? `<h2 class="section-title">練習の記録</h2><div class="hist">${atts.slice(0, 30).map(a => `
      <button data-a="${a.id}"><span class="d">${new Date(a.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        <span class="m">${a.mode === 'overlap' ? 'オーバーラッピング' : 'シャドーイング'} ／ ${fmt(a.duration)}</span></span>
        <span class="score-tag">${a.score != null ? a.score : a.status === 'error' ? '—' : '…'}</span></button>`).join('')}</div>` : ''}
    <div class="dock"><div class="dock-in">
      <button class="rec" id="rec" aria-label="録音を開始"><span></span></button>
      <div class="dock-text"><b id="rec-title">録音してチェック</b><small id="rec-sub">イヤホンを付けると、お手本の音が録音に入りません</small></div>
    </div></div>`;

  const sc = $('#sc'); bindScript(sc, an); setGuide(sc, settings.guide);
  const au = $('#au');
  let scriptShown = true;
  const tgS = $('#tg-script');
  const showScript = on => { scriptShown = on; sc.classList.toggle('hidden', !on); tgS.textContent = on ? 'スクリプトを隠す' : 'スクリプトを表示'; };
  tgS.onclick = () => showScript(!scriptShown);
  $('#tg-guide').onclick = e => { settings.guide = !settings.guide; saveSettings(); e.currentTarget.setAttribute('aria-pressed', settings.guide); setGuide(sc, settings.guide); };

  const setMode = mode => {
    settings.mode = mode; saveSettings();
    $('#modes').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    $('#mhint').textContent = MODE_HINT[mode];
    showScript(mode === 'overlap');
    $('.dock').hidden = mode === 'listen';
  };
  $('#modes').querySelectorAll('button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  setMode(settings.mode);

  // 再生
  let ttsPlaying = false;
  const setPP = playing => { $('#pp').innerHTML = playing ? ICON.pause : ICON.play; $('#pp').setAttribute('aria-label', playing ? '一時停止' : '再生'); };
  const stopNative = () => { if (au) au.pause(); if (ttsPlaying) { speechSynthesis.cancel(); ttsPlaying = false; setPP(false); } };
  const playNative = (fromStart, onend) => {
    if (au) {
      if (fromStart) au.currentTime = 0;
      au.playbackRate = settings.rate;
      au.onended = () => { setPP(false); onend && onend(); };
      au.play().catch(() => toast('音声を再生できませんでした'));
    } else {
      ttsPlaying = true; setPP(true);
      speak(m.script, settings.rate * 0.95, () => { ttsPlaying = false; setPP(false); onend && onend(); });
    }
  };
  $('#pp').onclick = () => {
    if (au) { if (au.paused) playNative(false); else au.pause(); }
    else { if (ttsPlaying) stopNative(); else playNative(true); }
  };
  if (au) {
    au.onplay = () => setPP(true); au.onpause = () => setPP(false);
    const upd = () => { $('#tm').textContent = `${fmt(au.currentTime)} / ${fmt(au.duration)}`; if (au.duration) $('#seek').value = Math.round(au.currentTime / au.duration * 1000); };
    au.ontimeupdate = upd; au.onloadedmetadata = upd;
    $('#seek').oninput = e => { if (au.duration) au.currentTime = e.target.value / 1000 * au.duration; };
    $('#back5').onclick = () => { au.currentTime = Math.max(0, au.currentTime - 5); };
  }
  $('#rates').querySelectorAll('.chip').forEach(c => c.onclick = () => {
    settings.rate = +c.dataset.r; saveSettings();
    $('#rates').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    if (au) au.playbackRate = settings.rate;
  });
  app.querySelectorAll('.hist button').forEach(b => b.onclick = () => go('/r/' + b.dataset.a));

  // 録音
  let rec = null, stream = null, chunks = [], t0 = 0, timer = null, stopT = null;
  const recBtn = $('#rec');
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const stopAll = () => { clearTimeout(stopT); clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  onLeave(() => { stopNative(); if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } stopAll(); });

  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('このブラウザでは録音できません', 4000); return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { toast('マイクの使用を許可してください（設定 → Safari → マイク）', 5000); return; }
    chunks = [];
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = finishRec;
    rec.start(1000);
    t0 = Date.now();
    recBtn.classList.add('on'); recBtn.setAttribute('aria-label', '録音を停止');
    $('#rec-title').textContent = '録音中 0:00';
    $('#rec-sub').textContent = settings.autoStop ? 'お手本が終わると自動で止まります' : 'もう一度押すと止まります';
    timer = setInterval(() => { $('#rec-title').textContent = '録音中 ' + fmt((Date.now() - t0) / 1000); }, 500);
    if (settings.mode === 'shadow') showScript(false);
    if (settings.autoPlay) playNative(true, () => { if (settings.autoStop) stopT = setTimeout(stopRec, 1500); });
  }
  function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); stopNative(); }
  async function finishRec() {
    const duration = (Date.now() - t0) / 1000;
    stopAll();
    recBtn.classList.remove('on');
    const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' });
    const a = { id: uid(), materialId: m.id, createdAt: Date.now(), duration, mode: settings.mode, blob, status: 'processing', engine: settings.engine };
    await DB.put('attempts', a);
    await DB.put('materials', { ...m, lastAt: Date.now() });
    go('/r/' + a.id);
  }
  recBtn.onclick = () => { if (rec && rec.state === 'recording') stopRec(); else startRec(); };
}

// ---------------- 結果画面 ----------------
async function viewResult(aid) {
  const a = await DB.get('attempts', aid);
  if (!a) throw new Error('練習記録が見つかりません');
  const m = await DB.get('materials', a.materialId);
  if (!m) throw new Error('教材が見つかりません');
  await dictReady;
  const an = analyze(m.script);
  const myUrl = URL.createObjectURL(a.blob); onLeave(() => URL.revokeObjectURL(myUrl));
  let alive = true; onLeave(() => { alive = false; });

  const head = `<header class="bar"><a class="icon-btn" href="#/m/${m.id}" aria-label="戻る">${ICON.back}</a><h1>${esc(m.title)}</h1></header>`;
  const run = async () => {
    app.innerHTML = head + `<div class="waiting"><b id="st">準備中…</b><div class="bar-prog" hidden id="pg"><i></i></div>
      <p class="small muted" id="st2">${settings.engine === 'openai' ? '' : '初回は文字起こし用のモデル（約' + (settings.engine === 'local-tiny' ? '40' : '80') + 'MB）をダウンロードします。2回目以降はオフラインでも動きます。'}</p></div>`;
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
    } catch (e) {
      a.status = 'error'; a.error = e.message;
    }
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
    app.innerHTML = head + `
      <div class="result-top">
        <div class="big-score">${marks.score}<small>点</small></div>
        <div class="result-sum">赤字の所 <b>${badGroups.size}</b> か所<br>
          <span class="small">${new Date(a.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ／ ${a.mode === 'overlap' ? 'オーバーラッピング' : 'シャドーイング'}</span></div>
      </div>
      <div class="row" style="margin:14px 0 4px">
        <button class="btn" id="mine">自分の録音を聞く</button>
        ${m.hasAudio ? '<button class="btn" id="model">お手本を聞く</button>' : ''}
      </div>
      <audio id="myau" src="${myUrl}" preload="auto"></audio>
      <div class="note-head"><h2>添削</h2><button class="chip" id="tg-guide" aria-pressed="${settings.guide}">発音ガイド</button></div>
      <div class="note"><div class="script" id="sc">${scriptHTML(an, marks)}</div></div>
      <div class="legend"><span><i style="text-decoration:underline">red</i> 別の語に聞こえた</span><span><i style="text-decoration:line-through">red</i> 聞き取れなかった</span><span>赤い所をタップすると発音のコツ</span></div>
      <details class="heard"><summary>認識された文を見る</summary><p>${esc(a.text || '（何も認識されませんでした）')}</p></details>
      <div style="height:24px"></div>
      <button class="btn primary block" id="again">もう一度練習する</button>
      <div style="height:10px"></div>
      <button class="btn danger block" id="delatt">この記録を削除</button>`;
    const sc = $('#sc'); bindScript(sc, an, marks); setGuide(sc, settings.guide);
    $('#tg-guide').onclick = e => { settings.guide = !settings.guide; saveSettings(); e.currentTarget.setAttribute('aria-pressed', settings.guide); setGuide(sc, settings.guide); };
    const myau = $('#myau');
    let modelAu = null;
    if (m.hasAudio && m.audio) { const u = URL.createObjectURL(m.audio); onLeave(() => URL.revokeObjectURL(u)); modelAu = new Audio(u); }
    onLeave(() => { myau.pause(); modelAu && modelAu.pause(); });
    $('#mine').onclick = () => { modelAu && modelAu.pause(); if (myau.paused) { myau.currentTime = 0; myau.play(); } else myau.pause(); };
    if ($('#model')) $('#model').onclick = () => { myau.pause(); if (modelAu.paused) { modelAu.currentTime = 0; modelAu.playbackRate = settings.rate; modelAu.play(); } else modelAu.pause(); };
    $('#again').onclick = () => go('/m/' + m.id);
    $('#delatt').onclick = async () => { if (!confirm('この練習記録を削除しますか？')) return; await DB.del('attempts', a.id); go('/m/' + m.id); };
    if (a.score !== marks.score) { a.score = marks.score; DB.put('attempts', a); }
  };
  if (a.status === 'done') show(); else run();
}

// ---------------- 設定 ----------------
function viewSettings() {
  const eng = settings.engine;
  app.innerHTML = `
    <header class="bar"><a class="icon-btn" href="#/" aria-label="戻る">${ICON.back}</a><h1>設定</h1></header>
    <h2 class="section-title">文字起こし</h2>
    <div class="radio-list">
      <label><input type="radio" name="eng" value="local-base" ${eng === 'local-base' ? 'checked' : ''}><div>iPhone内で処理（標準）<small>約80MBのモデルを一度だけダウンロード。録音は端末の外に出ません。</small></div></label>
      <label><input type="radio" name="eng" value="local-tiny" ${eng === 'local-tiny' ? 'checked' : ''}><div>iPhone内で処理（軽量）<small>約40MB。速いが、聞き間違いが少し増えます。</small></div></label>
      <label><input type="radio" name="eng" value="openai" ${eng === 'openai' ? 'checked' : ''}><div>OpenAI の Whisper API<small>精度が高く速い。録音がOpenAIに送信され、利用料がかかります。</small></div></label>
    </div>
    <label class="f" id="keybox" style="margin-top:12px" ${eng === 'openai' ? '' : 'hidden'}><span>OpenAI API キー（この端末にだけ保存）</span>
      <input class="inp" id="key" type="password" autocomplete="off" value="${esc(settings.openaiKey)}" placeholder="sk-..."></label>
    <button class="btn" id="preload" ${eng === 'openai' ? 'hidden' : ''}>モデルを今ダウンロードしておく</button>
    <p class="small muted" id="preload-st"></p>
    <h2 class="section-title">録音</h2>
    <div class="set-row"><div>録音と同時にお手本を再生<small>オフにすると、録音だけ始まります</small></div><input type="checkbox" class="switch" id="ap" ${settings.autoPlay ? 'checked' : ''}></div>
    <div class="set-row"><div>お手本が終わったら録音を止める</div><input type="checkbox" class="switch" id="as" ${settings.autoStop ? 'checked' : ''}></div>
    <h2 class="section-title">データ</h2>
    <p class="small muted" id="usage">教材と録音はこの iPhone の中だけに保存されます。</p>
    <button class="btn danger" id="wipe">すべてのデータを削除</button>`;
  app.querySelectorAll('input[name=eng]').forEach(r => r.onchange = () => {
    settings.engine = r.value; saveSettings();
    $('#keybox').hidden = r.value !== 'openai'; $('#preload').hidden = r.value === 'openai';
  });
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
