// 発音エンジン：CMU発音辞書 → カタカナ、英語の音声変化（連結・フラップ・脱落・同化・弱形）、
// スクリプトと文字起こしの照合。ブラウザでもNodeでも動く ES module。

const VOWELS = new Set(['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW']);
const isV = p => VOWELS.has(p);
const SHORT = new Set(['AE','AH','EH','IH','UH','AA']);

// 子音行（ア・イ・ウ・エ・オ段）
const ROW = {
  '':  ['ア','イ','ウ','エ','オ'],
  K:  ['カ','キ','ク','ケ','コ'], G: ['ガ','ギ','グ','ゲ','ゴ'],
  S:  ['サ','スィ','ス','セ','ソ'], Z: ['ザ','ズィ','ズ','ゼ','ゾ'],
  TH: ['サ','スィ','ス','セ','ソ'], DH: ['ザ','ズィ','ズ','ゼ','ゾ'],
  SH: ['シャ','シ','シュ','シェ','ショ'], ZH: ['ジャ','ジ','ジュ','ジェ','ジョ'],
  JH: ['ジャ','ジ','ジュ','ジェ','ジョ'], CH: ['チャ','チ','チュ','チェ','チョ'],
  T:  ['タ','ティ','トゥ','テ','ト'], D: ['ダ','ディ','ドゥ','デ','ド'],
  N:  ['ナ','ニ','ヌ','ネ','ノ'], HH: ['ハ','ヒ','フ','ヘ','ホ'],
  F:  ['ファ','フィ','フ','フェ','フォ'], V: ['ヴァ','ヴィ','ヴ','ヴェ','ヴォ'],
  B:  ['バ','ビ','ブ','ベ','ボ'], P: ['パ','ピ','プ','ペ','ポ'], M: ['マ','ミ','ム','メ','モ'],
  Y:  ['ヤ','イ','ユ','イェ','ヨ'], R: ['ラ','リ','ル','レ','ロ'], L: ['ラ','リ','ル','レ','ロ'],
  W:  ['ワ','ウィ','ウ','ウェ','ウォ'], FLAP: ['ラ','リ','ル','レ','ロ'],
  NG: ['ンガ','ンギ','ング','ンゲ','ンゴ'],
  TS: ['ツァ','ツィ','ツ','ツェ','ツォ'],
};
const ROW_NAIVE_V = ['バ','ビ','ブ','ベ','ボ'];
const SMALL_Y = ['ャ','','ュ','ェ','ョ'];
const COL = { a:0, i:1, u:2, e:3, o:4 };
// 母音 → [段, 後ろに付く文字]
const VK = {
  AA:['a',''], AE:['a',''], AH:['a',''], AO:['o','ー'], AW:['a','ウ'], AY:['a','イ'],
  EH:['e',''], ER:['a','ー'], EY:['e','イ'], IH:['i',''], IY:['i','ー'], OW:['o','ウ'],
  OY:['o','イ'], UH:['u',''], UW:['u','ー'],
};
function vowelInfo(v, s, naive) {
  let [c, rest] = VK[v];
  if (s === 0 && !naive) {
    if (v === 'ER' || v === 'IY' || v === 'UW' || v === 'AO') rest = '';
  }
  return [COL[c], rest];
}
const CODA = { K:'ク', G:'グ', P:'プ', B:'ブ', F:'フ', V:'ヴ', TH:'ス', DH:'ズ', S:'ス', Z:'ズ',
  SH:'シュ', ZH:'ジュ', JH:'ジ', CH:'チ', TS:'ツ', L:'ル', M:'ム', N:'ン', NG:'ング', HH:'', W:'', Y:'', T:'ト', D:'ド', FLAP:'ル' };
const GEM = new Set(['K','G','P','B','T','D','CH','JH','TS']); // 前に「ッ」が入りやすい子音

// ---------- 辞書 ----------
let DICT = null;
export function loadDictText(text) {
  DICT = new Map();
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) DICT.set(line.slice(0, tab), line.slice(tab + 1));
  }
  return DICT.size;
}
export function dictReady() { return !!DICT; }

const NUM = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve',
  'thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const TENS = { 30:'thirty', 40:'forty', 50:'fifty', 60:'sixty', 70:'seventy', 80:'eighty', 90:'ninety', 100:'hundred' };
function numWord(n) {
  if (!/^\d+$/.test(n)) return null;
  const v = +n;
  if (v <= 20) return NUM[v];
  if (TENS[v]) return TENS[v];
  return null;
}

export function normWord(w) {
  return w.toLowerCase().replace(/[’‘`´]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/^'+|'+$/g, '');
}

function parsePhones(str) {
  return str.trim().split(/\s+/).map(x => {
    const m = x.match(/^([A-Z]+)(\d)?$/);
    return { p: m[1], s: m[2] !== undefined ? +m[2] : null };
  });
}
export function lookup(norm) {
  if (!DICT || !norm) return null;
  const n = numWord(norm); if (n) norm = n;
  let r = DICT.get(norm);
  if (r) return parsePhones(r);
  if (norm.endsWith("'s")) { r = DICT.get(norm.slice(0, -2)); if (r) return [...parsePhones(r), { p: 'Z', s: null }]; }
  if (norm.includes('-')) {
    const parts = norm.split('-').map(x => DICT.get(x));
    if (parts.every(Boolean)) return parts.flatMap(parsePhones);
  }
  return null;
}
const keyOf = ph => ph.map(x => x.p).join(' ');

// ---------- 定型フレーズ（音がまとまって変わるもの）----------
const PHRASES = [
  { w:['have','to'], kana:'ハフタ', note:'have の v が次の t につられて「フ」の音に。to は弱く「タ」。ひと息で「ハフタ」。' },
  { w:['has','to'], kana:'ハスタ', note:'has の s と to がくっつき、to は弱く「タ」。' },
  { w:['had','to'], kana:'ハッタ', note:'had の d は発音せずつまるだけ。to は弱く「タ」。' },
  { w:['want','to'], kana:'ワナ', note:'t が消えて n とつながり、wanna「ワナ」のように聞こえる。' },
  { w:['wants','to'], kana:'ワンツタ', note:'to は弱く「タ」。' },
  { w:['going','to'], kana:'ガナ', note:'「〜するつもり」の going to は gonna「ガナ」と崩れやすい。' },
  { w:['got','to'], kana:'ガラ', note:'gotta「ガラ」。t が軽い「ラ」行の音になる。' },
  { w:['kind','of'], kana:'カインダ', note:'kinda「カインダ」。of は「ア」程度に弱まる。' },
  { w:['sort','of'], kana:'ソーラ', note:'sorta「ソーラ」。t がラ行に、of は「ア」。' },
  { w:['a','lot','of'], kana:'アララ', note:'a lotta「アララ」。lot の t がラ行に、of は「ア」。' },
  { w:['lots','of'], kana:'ラッツァ', note:'of は「ア」になり、ts とつながって「ツァ」。' },
  { w:['out','of'], kana:'アウラ', note:'outta「アウラ」。t がラ行に、of は「ア」。' },
  { w:['a','bit','of'], kana:'アビラ', note:'bit の t がラ行に、of は「ア」。' },
  { w:['a','little'], kana:'アリル', note:'little の tt は軽い「ラ」行の音、最後の l はほぼ「ル」で止める。' },
  { w:['give','me'], kana:'ギミ', note:'gimme「ギミ」。v はほぼ消える。' },
  { w:['let','me'], kana:'レミ', note:'lemme「レミ」。t はつまるだけでほぼ消える。' },
  { w:["don't",'know'], kana:'ドンノウ', note:"don't の t は消え、n が続いて「ドンノウ」。" },
  { w:["don't",'you'], kana:'ドンチュ', note:'t + you が混ざって「チュ」。' },
  { w:['would','you'], kana:'ウッジュ', note:'d + you が混ざって「ジュ」（同化）。' },
  { w:['could','you'], kana:'クッジュ', note:'d + you が混ざって「ジュ」（同化）。' },
  { w:['should','you'], kana:'シュッジュ', note:'d + you が混ざって「ジュ」（同化）。' },
  { w:['what','are','you'], kana:'ワラユ', note:'what の t がラ行に、are は弱く、「ワラユ」とひと息で。' },
  { w:['what','do','you'], kana:'ワダユ', note:'do と you が弱まり「ワダユ」。' },
  { w:['used','to'], kana:'ユースタ', note:'used の d は消え、「ユース」+ 弱い「タ」。' },
  { w:['supposed','to'], kana:'サポウスタ', note:'d は消え、to は弱く「タ」。' },
  { w:['ought','to'], kana:'オータ', note:'t が重なるので一つだけ。to は弱く「タ」。' },
  { w:['should','have'], kana:'シュダ', note:'have は弱く「ア」程度（should\'ve）。d とつながって「シュダ」。' },
  { w:['would','have'], kana:'ウダ', note:'have は弱く「ア」程度（would\'ve）。' },
  { w:['could','have'], kana:'クダ', note:'have は弱く「ア」程度（could\'ve）。' },
  { w:['must','have'], kana:'マスタ', note:'have は弱く「ア」程度（must\'ve）。' },
  { w:['might','have'], kana:'マイタ', note:'have は弱く「ア」程度（might\'ve）。' },
];
PHRASES.sort((a, b) => b.w.length - a.w.length);

// ---------- 弱形（機能語）----------
function weakForm(norm, prev, next) {
  const nextV = next && next.ph && isV(next.ph[0].p);
  const prevC = prev && prev.ph && !isV(prev.ph[prev.ph.length - 1].p);
  switch (norm) {
    case 'to':   return { ph: nextV ? 'T UW0' : 'T AH0', note: 'to は弱く短く「タ」（母音の前は「トゥ」）。' };
    case 'for':  return { ph: 'F ER0', note: 'for は弱く「ファ」。' };
    case 'of':   return { ph: nextV ? 'AH0 V' : 'AH0', note: 'of は弱く「ア（ヴ）」。前の子音とつながる。' };
    case 'and':  return { ph: 'AH0 N', note: 'and は弱く「アン」、d はほぼ発音しない。' };
    case 'a':    return { ph: 'AH0' };
    case 'an':   return { ph: 'AH0 N' };
    case 'the':  return { ph: nextV ? 'DH IY0' : 'DH AH0' };
    case 'them': return prevC ? { ph: 'EH0 M', note: 'them は th が落ちて「エム」。前の語とつながる。' } : { ph: 'DH EH0 M' };
    case 'him':  return prevC ? { ph: 'IH0 M', note: 'him は h が落ちて「イム」。前の語とつながる。' } : null;
    case 'her':  return prevC ? { ph: 'ER0', note: 'her は h が落ちて「ア」。前の語とつながる。' } : null;
    case 'his':  return prevC ? { ph: 'IH0 Z', note: 'his は h が落ちて「イズ」。' } : null;
    case 'your': return { ph: 'Y ER0', note: 'your は弱く「ヤ」。' };
    case 'you':  return { ph: 'Y UW0' };
    case 'can':  return next && prev ? { ph: 'K N', note: '肯定の can は弱く「クン」。強く「キャン」と言うと can\'t と間違われやすい。' } : null;
    case 'at':   return { ph: 'AH0 T' };
    case 'as':   return { ph: 'AH0 Z' };
    case 'was':  return { ph: 'W AH0 Z' };
    case 'are':  return next ? { ph: 'ER0' } : null;
    case 'or':   return { ph: 'ER0' };
    case 'from': return { ph: 'F R AH0 M' };
    case 'but':  return { ph: 'B AH0 T' };
    case 'am':   return { ph: 'AH0 M' };
  }
  return null;
}

// ---------- トークン化 ----------
export function tokenize(text) {
  const toks = [];
  const re = /\S+/g; let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const norm = normWord(raw);
    if (!norm) { if (toks.length) toks[toks.length - 1].brk = true; continue; }
    const brk = /[.,!?;:…"”)\]—–]$/.test(raw) || /[.!?]["”']?$/.test(raw);
    toks.push({ i: toks.length, raw, norm, start: m.index, end: m.index + raw.length, brk });
  }
  return toks;
}

// ---------- 単語ごとのカタカナ（カタカナ英語読み = よくある間違い）----------
function syllabify(ph, naive) {
  // ph: [{p,s,t}] → [{k, t}]  t = 母音の属するトークン
  ph = ph.slice();
  for (let i = 0; i < ph.length - 1; i++)
    if (ph[i].p === 'T' && ph[i + 1].p === 'S' && ph[i].t === ph[i + 1].t) { ph[i] = { ...ph[i], p: 'TS' }; ph.splice(i + 1, 1); }
  const out = [];
  for (let i = 0; i < ph.length; i++) {
    const c = ph[i];
    if (c.p === 'Q') { out.push({ k: 'ッ', t: c.t }); continue; }
    if (isV(c.p)) {
      const [col, rest] = vowelInfo(c.p, c.s, naive);
      out.push({ k: ROW[''][col] + rest, t: c.t, vt: c.t });
      continue;
    }
    const n1 = ph[i + 1], n2 = ph[i + 2];
    // 子音+y+母音（キュー など）、 K/G + AE は キャ/ギャ
    if (n1 && n1.p === 'Y' && n2 && isV(n2.p) && c.p !== 'Y') {
      const [col, rest] = vowelInfo(n2.p, n2.s, naive);
      let base = (naive && c.p === 'V' ? ROW_NAIVE_V : ROW[c.p])[1];
      base = (base.length === 2 && base[1] === 'ィ') ? base[0] + SMALL_Y[col] : base + SMALL_Y[col];
      out.push({ k: base + rest, t: c.t, vt: n2.t });
      i += 2; continue;
    }
    if (n1 && isV(n1.p)) {
      let [col, rest] = vowelInfo(n1.p, n1.s, naive);
      let k;
      if ((c.p === 'K' || c.p === 'G') && n1.p === 'AE') k = ROW[c.p][1] + 'ャ';
      else if (c.p === 'W' && (n1.p === 'UH' || n1.p === 'UW')) k = 'ウ';
      else if (c.p === 'Y' && (n1.p === 'IH' || n1.p === 'IY')) k = 'イ';
      else if (c.p === 'HH' && (n1.p === 'UH' || n1.p === 'UW')) k = 'フ';
      else k = (naive && c.p === 'V' ? ROW_NAIVE_V : ROW[c.p])[col];
      const pv = ph[i - 1];
      if (c.p === 'TS' && pv && SHORT.has(pv.p)) k = 'ッ' + k;
      out.push({ k: k + rest, t: c.t, vt: n1.t });
      i++; continue;
    }
    // 母音が続かない子音
    const prev = ph[i - 1];
    const wordFinal = !n1 || n1.t !== c.t;
    let k;
    if (c.p === 'R') {
      if (prev && isV(prev.p)) k = (['AA','AO','ER'].includes(prev.p)) ? 'ー' : 'ア';
      else k = 'ル';
    } else if (c.p === 'T' || c.p === 'D') {
      if (naive) k = c.p === 'T' ? 'ト' : 'ド';
      else if (prev && isV(prev.p) && wordFinal) k = '';           // 「ッ」で止める（下で付ける）
      else if (wordFinal) k = c.p === 'T' ? '(ト)' : '(ド)';
      else k = c.p === 'T' ? 'ト' : 'ド';
      if (n1 && n1.p === 'W' && n1.t === c.t) k = c.p === 'T' ? 'トゥ' : 'ドゥ';
    } else if (c.p === 'NG' && !naive && wordFinal) {
      k = 'ン';
    } else if (c.p === 'V') {
      k = naive ? 'ブ' : 'ヴ';
    } else k = CODA[c.p] ?? '';
    // 短母音 + 語末の破裂音 → ッ
    if (wordFinal && GEM.has(c.p) && prev && SHORT.has(prev.p)) k = 'ッ' + k;
    else if (!naive && wordFinal && (c.p === 'T' || c.p === 'D') && prev && isV(prev.p)) k = 'ッ';
    out.push({ k, t: c.t });
  }
  return out;
}
const clean = s => s.replace(/ー{2,}/g, 'ー').replace(/ッ{2,}/g, 'ッ').replace(/ッー/g, 'ッ');

export function naiveKana(norm) {
  const ph = lookup(norm);
  if (!ph) return null;
  return clean(syllabify(ph.map(x => ({ ...x, t: 0 })), true).map(x => x.k).join(''));
}

// ---------- スクリプト全体の解析 ----------
export function analyzeScript(text) {
  const toks = tokenize(text);
  for (const t of toks) t.ph = lookup(t.norm);
  // 定型フレーズ
  const units = []; // {from,to,kind:'phrase'|'stream'}
  for (let i = 0; i < toks.length; i++) {
    let hit = null;
    for (const P of PHRASES) {
      if (i + P.w.length > toks.length) continue;
      let ok = true;
      for (let j = 0; j < P.w.length; j++) {
        if (toks[i + j].norm !== P.w[j]) { ok = false; break; }
        if (j < P.w.length - 1 && toks[i + j].brk) { ok = false; break; }
      }
      if (ok) { hit = P; break; }
    }
    if (hit) { units.push({ from: i, to: i + hit.w.length - 1, phrase: hit }); i += hit.w.length - 1; }
  }
  const inPhrase = new Map();
  for (const u of units) for (let j = u.from; j <= u.to; j++) inPhrase.set(j, u);

  // 弱形
  const notes = []; // {type, a, b, text}
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (inPhrase.has(i) || !t.ph) continue;
    const prev = i > 0 && !toks[i - 1].brk && !inPhrase.has(i - 1) ? toks[i - 1] : null;
    const next = !t.brk && toks[i + 1] && !inPhrase.has(i + 1) ? toks[i + 1] : null;
    const wf = weakForm(t.norm, prev, next);
    if (wf) {
      t.ph = parsePhones(wf.ph);
      t.weak = true;
      if (wf.note) notes.push({ type: 'weak', a: i, b: i, text: wf.note });
    }
  }

  // 連続区間（句読点・フレーズ・辞書にない語で区切る）
  const parent = toks.map((_, i) => i);
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (const u of units) for (let j = u.from; j < u.to; j++) join(j, j + 1);

  const kanaOf = new Map(); // token idx → natural kana pieces
  let seg = [];
  const flush = () => {
    if (!seg.length) return;
    processSegment(seg, toks, notes, join, kanaOf);
    seg = [];
  };
  for (let i = 0; i < toks.length; i++) {
    if (inPhrase.has(i) || !toks[i].ph) { flush(); continue; }
    seg.push(i);
    if (toks[i].brk) flush();
  }
  flush();

  // グループ化
  const groupsMap = new Map();
  toks.forEach((t, i) => {
    const r = find(i);
    if (!groupsMap.has(r)) groupsMap.set(r, { id: groupsMap.size, from: i, to: i, notes: [] });
    const g = groupsMap.get(r); g.to = i; t.g = g.id;
  });
  const groups = [...groupsMap.values()];
  for (const g of groups) {
    const ws = toks.slice(g.from, g.to + 1);
    const ph = units.find(u => u.from === g.from && u.to === g.to);
    if (ph) {
      g.natural = ph.phrase.kana;
      g.notes.push(ph.phrase.note);
    } else {
      g.natural = clean(ws.map(t => t.ph ? (kanaOf.get(t.i) || '') : `(${t.raw.replace(/[^A-Za-z'-]/g, '')})`).join(''));
      // フレーズを含む複合グループ
      for (const u of units) if (u.from >= g.from && u.to <= g.to) g.notes.push(u.phrase.note);
    }
    g.naive = ws.map(t => naiveKana(t.norm) ?? t.raw).join(' ');
    g.words = ws.map(t => t.raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '')).join(' ');
    g.known = ws.every(t => !!lookup(t.norm));
  }
  // 混合グループ（フレーズ + 連結）
  for (const g of groups) {
    const ws = toks.slice(g.from, g.to + 1);
    if (ws.some(t => inPhrase.has(t.i)) && !units.find(u => u.from === g.from && u.to === g.to)) {
      let s = ''; let i = g.from;
      while (i <= g.to) {
        const u = inPhrase.get(i);
        if (u) { s += u.phrase.kana; i = u.to + 1; }
        else { s += kanaOf.get(i) || ''; i++; }
      }
      g.natural = clean(s);
    }
  }
  for (const n of notes) {
    const g = groups[toks[n.a].g];
    if (!g.notes.includes(n.text)) g.notes.push(n.text);
  }
  return { tokens: toks, groups };
}

function processSegment(idxs, toks, notes, join, kanaOf) {
  let ph = [];
  for (const i of idxs) for (const x of toks[i].ph) ph.push({ ...x, t: i });
  const w = i => toks[i].raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
  const lastOf = k => !ph[k + 1] || ph[k + 1].t !== ph[k].t;
  const firstOf = k => !ph[k - 1] || ph[k - 1].t !== ph[k].t;
  const addNote = (type, a, b, text) => { notes.push({ type, a, b, text }); join(a, b); };

  // 同化 t/d/s/z + y
  for (let k = 0; k < ph.length - 1; k++) {
    const c = ph[k], n = ph[k + 1];
    if (lastOf(k) && n.p === 'Y' && ph[k + 2] && isV(ph[k + 2].p)) {
      const to = { T: 'CH', D: 'JH', S: 'SH', Z: 'ZH' }[c.p];
      if (to) {
        c.p = to; ph.splice(k + 1, 1); ph[k + 1].s = 0;
        const kana = { CH: 'チュ', JH: 'ジュ', SH: 'シュ', ZH: 'ジュ' }[to];
        addNote('assim', c.t, ph[k + 1].t, `「${w(c.t)} ${w(ph[k + 1].t)}」：語末の音と y が混ざって「${kana}」に（同化）。`);
        c.t = ph[k + 1].t; // 音は次の語側へ
      }
    }
  }
  // 同じ・似た子音の連続
  const fam = p => ({ T: 'T', D: 'T', P: 'P', B: 'P', K: 'K', G: 'K', S: 'S', Z: 'S', F: 'F', V: 'F', CH: 'CH', JH: 'CH', TH: 'TH', DH: 'TH' }[p] || p);
  for (let k = 0; k < ph.length - 1; k++) {
    const c = ph[k], n = ph[k + 1];
    if (!lastOf(k) || isV(c.p) || isV(n.p) || c.p === 'Q') continue;
    if (fam(c.p) === fam(n.p) && !['R', 'L', 'Y', 'W', 'HH'].includes(c.p)) {
      const prevV = ph[k - 1] && isV(ph[k - 1].p);
      const a = c.t, b = n.t;
      if (GEM.has(c.p) && prevV) c.p = 'Q'; else { ph.splice(k, 1); k--; }
      addNote('gem', a, b, `「${w(a)} ${w(b)}」：同じ（似た）子音が続くので、前の音は発音せず一瞬ためるだけ。`);
    }
  }
  // nt の t 脱落（want it / twenty）
  for (let k = 1; k < ph.length - 1; k++) {
    const c = ph[k];
    if (c.p !== 'T' || ph[k - 1].p !== 'N' || !ph[k - 2] || !isV(ph[k - 2].p)) continue;
    const n = ph[k + 1];
    if (!isV(n.p)) continue;
    if (!(lastOf(k) || n.s === 0)) continue;
    ph.splice(k, 1);
    if (n.t !== c.t) addNote('ntdrop', c.t, n.t, `「${w(c.t)} ${w(n.t)}」：n の後ろの t がほぼ消えて、n が次の母音とつながる。`);
    else addNote('ntdrop', c.t, c.t, `「${w(c.t)}」：n の後ろの t がほぼ消える（例：twenty → トゥエニー）。`);
  }
  // フラップ
  for (let k = 1; k < ph.length - 1; k++) {
    const c = ph[k];
    if (c.p !== 'T' && c.p !== 'D') continue;
    if (firstOf(k)) continue;
    const p = ph[k - 1], n = ph[k + 1];
    const prevOk = isV(p.p) || (p.p === 'R' && ph[k - 2] && isV(ph[k - 2].p));
    if (!prevOk || !isV(n.p)) continue;
    if (!(lastOf(k) || n.s === 0)) continue;
    c.p = 'FLAP';
    if (n.t !== c.t) addNote('flap', c.t, n.t, `「${w(c.t)} ${w(n.t)}」：母音にはさまれた t / d が軽い「ラ」行の音になり、次の語とつながる（フラップ）。`);
    else addNote('flap', c.t, c.t, `「${w(c.t)}」：母音にはさまれた t / d が軽い「ラ」行の音になる（フラップ）。`);
  }

  const syl = syllabify(ph, false);
  // 連結の検出：子音のトークンと母音のトークンが違う
  for (const s of syl) {
    if (s.vt !== undefined && s.vt !== s.t) {
      const a = s.t, b = s.vt;
      const exists = notes.some(n => n.a === a && n.b === b);
      if (!exists) addNote('link', a, b, `「${w(a)} ${w(b)}」：前の語の最後の子音と次の語の母音がつながる（連結）。`);
      s.t = b; // 表示上は後ろの語に属させる
    }
  }
  for (const s of syl) kanaOf.set(s.t, (kanaOf.get(s.t) || '') + s.k);
}

// ---------- 照合 ----------
const CONTR = {
  "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'],
  "i've": ['i', 'have'], "you've": ['you', 'have'], "we've": ['we', 'have'], "they've": ['they', 'have'],
  "i'll": ['i', 'will'], "you'll": ['you', 'will'], "we'll": ['we', 'will'], "they'll": ['they', 'will'],
  "he'll": ['he', 'will'], "she'll": ['she', 'will'], "it'll": ['it', 'will'],
  "i'd": ['i', 'would'], "you'd": ['you', 'would'], "he'd": ['he', 'would'], "she'd": ['she', 'would'], "we'd": ['we', 'would'], "they'd": ['they', 'would'],
  "can't": ['can', 'not'], "cannot": ['can', 'not'], "won't": ['will', 'not'], "don't": ['do', 'not'], "doesn't": ['does', 'not'],
  "didn't": ['did', 'not'], "isn't": ['is', 'not'], "aren't": ['are', 'not'], "wasn't": ['was', 'not'], "weren't": ['were', 'not'],
  "haven't": ['have', 'not'], "hasn't": ['has', 'not'], "hadn't": ['had', 'not'], "wouldn't": ['would', 'not'],
  "couldn't": ['could', 'not'], "shouldn't": ['should', 'not'], "let's": ['let', 'us'],
  "gonna": ['going', 'to'], "wanna": ['want', 'to'], "gotta": ['got', 'to'], "kinda": ['kind', 'of'],
  "it's": ['it', 'is'], "that's": ['that', 'is'], "what's": ['what', 'is'], "there's": ['there', 'is'],
  "he's": ['he', 'is'], "she's": ['she', 'is'], "here's": ['here', 'is'], "where's": ['where', 'is'], "who's": ['who', 'is'],
  "ok": ['okay'],
};
function expand(norm) {
  if (CONTR[norm]) return CONTR[norm];
  const n = numWord(norm); if (n) return [n];
  if (norm.includes('-')) return norm.split('-').filter(Boolean);
  return [norm];
}
function lev(a, b) {
  const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function same(a, b) {
  if (a === b) return true;
  if (a.replace(/'/g, '') === b.replace(/'/g, '')) return true;
  const pa = lookup(a), pb = lookup(b);
  if (pa && pb && keyOf(pa) === keyOf(pb)) return true; // 同音（to / two など）
  if (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1) return true; // 綴りの揺れ
  return false;
}

export function alignTranscript(tokens, heardText) {
  const S = []; for (const t of tokens) for (const x of expand(t.norm)) S.push({ w: x, t: t.i });
  const H = []; for (const raw of heardText.split(/\s+/)) { const n = normWord(raw); if (n) for (const x of expand(n)) H.push(x); }
  const m = S.length, n = H.length;
  const d = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  const bt = Array.from({ length: m + 1 }, () => new Int8Array(n + 1));
  for (let i = 1; i <= m; i++) { d[i][0] = i; bt[i][0] = 1; }
  for (let j = 1; j <= n; j++) { d[0][j] = j; bt[0][j] = 2; }
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const eq = same(S[i - 1].w, H[j - 1]);
    let best = d[i - 1][j - 1] + (eq ? 0 : 1), b = eq ? 0 : 3;
    if (d[i - 1][j] + 1 < best) { best = d[i - 1][j] + 1; b = 1; }
    if (d[i][j - 1] + 1 < best) { best = d[i][j - 1] + 1; b = 2; }
    d[i][j] = best; bt[i][j] = b;
  }
  const res = tokens.map(() => ({ ok: 0, miss: 0, sub: 0, heard: [] }));
  let i = m, j = n;
  while (i > 0 || j > 0) {
    const b = bt[i][j];
    if (i > 0 && j > 0 && (b === 0 || b === 3)) {
      const r = res[S[i - 1].t];
      if (b === 0) r.ok++; else { r.sub++; r.heard.unshift(H[j - 1]); }
      i--; j--;
    } else if (i > 0 && (b === 1 || j === 0)) { res[S[i - 1].t].miss++; i--; }
    else j--;
  }
  const status = res.map(r => r.sub || r.miss ? (r.ok === 0 && r.sub === 0 ? 'miss' : 'sub') : 'ok');
  const okCount = status.filter(s => s === 'ok').length;
  return {
    status, heard: res.map(r => r.heard.join(' ')),
    score: tokens.length ? Math.round(okCount / tokens.length * 100) : 0,
  };
}
