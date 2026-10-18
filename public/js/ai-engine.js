/* Mesin AI PB-AI (versi browser) — dihasilkan otomatis dari src/ai-engine.js. Jangan edit manual. */
/**
 * MESIN AI OFFLINE — "PB-AI"
 * Mengubah materi yang ditempel guru menjadi soal siap main.
 *
 * Cara kerja:
 *  1. Parsing materi  -> kalimat, butir (bullet), pasangan "istilah = definisi",
 *                        langkah berurutan, angka, nama, dan daftar.
 *  2. Pemahaman ringan -> tentukan jenis fakta (definisi / angka / nama / proses / daftar).
 *  3. Pembuatan soal   -> pilihan ganda, benar-salah, isian singkat, urutan, menjodohkan.
 *  4. Distractor cerdas -> ambil dari entitas sejenis di materi, atau variasi angka.
 *
 * Tidak butuh internet. Kalau guru memasang API key, hasil API dipakai (mode "api"),
 * mesin ini tetap menjadi cadangan.
 */

const STOP = new Set(('yang dan di ke dari pada untuk dengan adalah merupakan ini itu dalam atau serta agar supaya sehingga tidak bukan juga sudah telah akan oleh nya kamu kalian kita saya kami sebagai secara lebih paling dapat bisa harus haruslah yaitu yakni ialah contoh misalnya karena ketika saat jika bila maka setiap semua seluruh salah satu dua tiga beberapa nya lah pun kah tah'.split(' ')));

const NEGATIONS = ['tidak', 'bukan', 'belum', 'tanpa', 'jarang', 'mustahil'];
const PROCESS_HINT = /(langkah|tahap|proses|urutan|cara|langkah-langkah|tahapan|siklus|daur)/i;
const SEQUENCE_WORDS = ['pertama', 'kedua', 'ketiga', 'keempat', 'kelima', 'keenam', 'ketujuh', 'kedelapan', 'kesembilan', 'selanjutnya', 'kemudian', 'lalu', 'setelah itu', 'akhirnya', 'terakhir', 'mula-mula', 'selanjutnya'];

/* ---------------------------------- util ---------------------------------- */

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => shuffle(arr).slice(0, n);
const uniq = (arr) => Array.from(new Set(arr));
const strip = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const titleCase = (s) => String(s || '').replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

function truncateWords(s, n) {
  const w = String(s || '').split(/\s+/);
  if (w.length <= n) return w.join(' ');
  return w.slice(0, n).join(' ') + '…';
}

/* ------------------------------ parsing materi ----------------------------- */

function splitSentences(text) {
  return String(text)
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s\-*•\u2022\d+.)\]]+\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 12);
}

function isBullet(line) {
  return /^\s*(?:[-*•+>]|\d+[.)]|(?:[a-z])[.)])\s+/.test(line);
}

function isListItem(line) {
  return /^\s*(?:[-*•+>]|\d+[.)])\s*\S/.test(line);
}

/** Membersihkan tanda bullet/penomoran di awal teks. */
function cleanTerm(s) {
  return strip(String(s || ''))
    .replace(/^\s*(?:[-*•+>‣▪]|\d+[.)]|(?:[a-z])[.)])\s*/, '')
    .replace(/^["“”'']|["“”'']$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Mendeteksi pasangan "istilah -> definisi" pada satu baris/kalimat. */
function parsePair(line) {
  let m;
  // "Fotosintesis: proses pembentukan ..." / "Fotosintesis - proses ..."
  m = line.match(/^\s*[-*•+>‣▪]?\s*([A-ZÀ-Ý][\w\s'’\-/]{1,45}?)\s*[:=–—-]{1,2}\s+(.{8,})$/);
  if (m && !/^https?:/.test(line)) return { term: cleanTerm(m[1]), def: cleanTerm(m[2]) };
  // "X adalah Y" / "X yaitu Y" / "X merupakan Y"
  m = line.match(/^\s*[-*•+>‣▪]?\s*(.{3,60}?)\s+(?:adalah|ialah|yaitu|yakni|merupakan)\s+(.{8,})$/i);
  if (m) return { term: cleanTerm(m[1]), def: cleanTerm(m[2]) };
  // "X disebut Y"
  m = line.match(/^\s*[-*•+>‣▪]?\s*(.{3,60}?)\s+di(?:sebut|namai|kenal)\s+(?:dengan\s+|sebagai\s+)?(.{3,})$/i);
  if (m) return { term: cleanTerm(m[1]), def: cleanTerm(m[2]) };
  return null;
}

function keywords(text) {
  const freq = new Map();
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .forEach((w) => {
      if (w.length < 4 || STOP.has(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    });
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

/** Kelompokkan entitas sejenis: angka, orang/tempah, istilah. */
function extractEntities(text) {
  const numbers = uniq((String(text).match(/\b\d+(?:[.,]\d+)?\s*(?:%|persen|cm|km|kg|gram|meter|m|liter|tahun|abad|derajat|°C|°|kali|buah|buah-buahan)?\b/gi) || []).map((n) => n.trim()));
  const capitals = uniq((String(text).match(/\b[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ]{2,}){0,3}\b/g) || []).map((s) => strip(s)));
  return { numbers, capitals, keys: keywords(text) };
}

function parseMaterial(material, fallbackTopic) {
  const text = String(material || '');
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const pairs = [];
  const bullets = [];
  const ordered = [];
  const sentences = splitSentences(text);

  lines.forEach((line) => {
    if (!line.trim()) return;
    const p = parsePair(line);
    if (p && p.term.length <= 60) pairs.push({ term: p.term, def: p.def, source: line.trim() });
    if (isListItem(line)) bullets.push(strip(line));
    const om = line.match(/^\s*\d+[.)]\s*(.{6,})$/);
    if (om) ordered.push(strip(om[1]));
    else {
      const sm = line.match(/^\s*(?:[-*•]\s*)?(pertama|kedua|ketiga|keempat|kelima|keenam|selanjutnya|kemudian|lalu|setelah itu|akhirnya|terakhir|mula-mula)\b[,:\s]+(.{6,})$/i);
      if (sm) ordered.push(strip(sm[2]));
    }
  });

  // kalau tidak ada pasangan eksplisit, buat dari kalimat yang mengandung "adalah/merupakan"
  sentences.forEach((s) => {
    const p = parsePair(s);
    if (p && !pairs.some((x) => norm(x.term) === norm(p.term))) pairs.push({ term: p.term, def: p.def, source: s });
  });

  const ents = extractEntities(text);
  return {
    raw: text,
    topic: fallbackTopic || '',
    lines: lines.filter((l) => l.trim()),
    sentences,
    pairs: pairs.slice(0, 60),
    bullets: bullets.slice(0, 60),
    ordered,
    numbers: ents.numbers,
    capitals: ents.capitals,
    keys: ents.keys,
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

/* ------------------------------ distractor AI ------------------------------ */

function numberVariants(value) {
  const n = parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return [];
  const isFloat = !Number.isInteger(n);
  const cands = [];
  const deltas = isFloat ? [0.1, 0.2, -0.1, 0.5, -0.5, 1] : [1, 2, -1, -2, 5, 10, -5];
  deltas.forEach((d) => {
    const v = isFloat ? Math.round((n + d) * 100) / 100 : n + d;
    if (v >= 0) cands.push(String(v));
  });
  cands.push(String(isFloat ? Math.round(n * 2 * 10) / 10 : n * 2));
  if (n > 3) cands.push(String(isFloat ? Math.round((n / 2) * 10) / 10 : Math.floor(n / 2)));
  return uniq(cands.map((c) => c.replace('.0', '')).filter((c) => c !== String(n)));
}

function findSubjectPhrase(def) {
  // ambil frasa benda di awal definisi: "proses pembentukan makanan", "ilmu yang mempelajari..."
  let m = def.match(/^((?:proses|kegiatan|ilmu|alat|bagian|hewan|tumbuhan|zat|peristiwa|keadaan|sistem|kumpulan|hasil|upaya|benda|organ|sel|gaya|energi|besaran|satuan|gagasan|karya|bentuk|jenis|cara)\b[^,.:;]{0,70})/i);
  if (m) return strip(m[1]);
  m = def.match(/^([^,.:;]{6,70})/);
  return m ? strip(m[1]) : strip(def);
}

function buildDistractors(target, pool, parsed, n) {
  const out = [];
  const targetNorm = norm(target);

  // 1) entitas/istilah lain dari materi yang "sejenis"
  const candidates = [];
  (pool || []).forEach((c) => {
    const s = strip(c);
    if (!s || norm(s) === targetNorm) return;
    if (s.length > 60) return;
    candidates.push(s);
  });
  // 2) variasi angka bila target berupa angka
  const numMatch = target.match(/-?\d+(?:[.,]\d+)?/);
  if (numMatch) {
    numberVariants(numMatch[0]).forEach((v) => candidates.push(target.replace(numMatch[0], v)));
  }
  // 3) definisi lain di materi (untuk soal definisi)
  parsed.pairs.forEach((p) => {
    const s = findSubjectPhrase(p.def);
    if (norm(s) !== targetNorm && s.length > 5) candidates.push(s);
    if (norm(p.term) !== targetNorm) candidates.push(p.term);
  });

  const seen = new Set([targetNorm]);
  shuffle(candidates).forEach((c) => {
    if (out.length >= n) return;
    const k = norm(c);
    if (seen.has(k) || k.length < 2) return;
    seen.add(k);
    out.push(c);
  });

  // 4) bila masih kurang, pakai kata kunci materi / kata umum
  const generic = ['semua jawaban benar', 'tidak ada jawaban yang benar'];
  let gi = 0;
  while (out.length < n && gi < generic.length) {
    if (!seen.has(norm(generic[gi]))) out.push(generic[gi]);
    gi++;
  }
  let ki = 0;
  while (out.length < n && ki < parsed.keys.length) {
    const k = parsed.keys[ki++];
    if (!seen.has(k) && k.length > 3) {
      seen.add(k);
      out.push(titleCase(k));
    }
  }
  return out.slice(0, n);
}

/* ------------------------------- template soal ------------------------------ */

const T = {
  defQ: [
    (term) => `Apa yang dimaksud dengan ${term}?`,
    (term) => `Manakah pengertian yang tepat dari ${term}?`,
    (term) => `${term} adalah …`,
    (term) => `Pernyataan berikut yang benar tentang ${term} adalah …`,
  ],
  termQ: [
    (d) => `Istilah yang tepat untuk “${d}” adalah …`,
    (d) => `“${d}” merupakan pengertian dari …`,
    (d) => `Perhatikan pernyataan berikut!\n“${d}”\nPernyataan tersebut menjelaskan …`,
  ],
  numberQ: [
    (label) => `Berdasarkan materi, ${label} adalah …`,
    (label) => `${label} sebesar …`,
    (label) => `Nilai ${label} yang tepat adalah …`,
  ],
  tfQ: [
    (s) => `Benar atau salah:\n${s}`,
    (s) => `Tentukan pernyataan berikut benar atau salah!\n${s}`,
  ],
  fillQ: [
    (s) => `Lengkapi kalimat berikut!\n${s}`,
    (s) => `Isilah titik-titik pada pernyataan berikut!\n${s}`,
  ],
};

function clozeSentence(sentence, term) {
  const t = term.replace(/[.]+$/, '');
  const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (re.test(sentence)) return sentence.replace(re, '…');
  return null;
}

/** Membuat pernyataan salah (untuk soal benar/salah). */
function negated(statement) {
  let s = String(statement || '');
  // 1) bila sudah ada negasi -> hilangkan (jadi pernyataan positif yang salah konteksnya jarang dipakai)
  for (const neg of NEGATIONS) {
    const re = new RegExp(`\\b${neg}\\s+`, 'i');
    if (re.test(s)) return s.replace(re, '');
  }
  // 2) "X adalah Y" -> "X bukan Y"
  if (/\b(adalah|ialah|merupakan|yaitu|yakni)\b/i.test(s)) {
    return s.replace(/\b(adalah|ialah|merupakan|yaitu|yakni)\b/i, (m0) => (m0.toLowerCase() === 'adalah' ? 'bukan' : `tidak ${m0}`));
  }
  // 3) kata kerja -> dinegasikan
  const verbs = ['memiliki', 'menghasilkan', 'memerlukan', 'menyerap', 'mengeluarkan', 'terjadi', 'berfungsi', 'digunakan', 'dipakai', 'dapat', 'bisa', 'termasuk', 'menjadi', 'membentuk', 'mengangkut', 'membawa'];
  for (const v of verbs) {
    const re = new RegExp(`\\b${v}\\b`, 'i');
    if (re.test(s)) return s.replace(re, `tidak ${v}`);
  }
  // 4) angka -> ganti dengan angka lain
  const m = s.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (m) {
    const alt = numberVariants(m[1])[0];
    if (alt) return s.replace(m[1], alt);
  }
  // 5) tukar dengan istilah lain di materi (dipanggil dari luar bila perlu)
  return null;
}

/** Menyembunyikan satu kata penting di dalam definisi -> soal isian. */
function clozeDefinition(def, keys) {
  const words = String(def).split(/\s+/);
  if (words.length < 4) return null;
  const stopSet = new Set([...STOP, 'yang', 'dan', 'dari', 'pada', 'dengan', 'untuk', 'adalah', 'atau', 'di', 'ke', 'oleh', 'dalam', 'suatu', 'ini', 'itu']);
  let bestIdx = -1;
  for (let i = 0; i < words.length; i++) {
    const clean = words[i].toLowerCase().replace(/[^a-zà-ÿ]/g, '');
    if (clean.length < 5 || stopSet.has(clean)) continue;
    if (keys && keys.includes(clean)) { bestIdx = i; break; }
    if (bestIdx === -1) bestIdx = i;
  }
  if (bestIdx === -1) return null;
  const answer = words[bestIdx].replace(/[.,;:!?]$/, '');
  if (answer.length < 4) return null;
  const copy = words.slice();
  copy[bestIdx] = '…………';
  return { text: copy.join(' '), answer };
}

/* ------------------------------- bank aritmetika ---------------------------- */

function arithmeticBank(level, count, ops) {
  const out = [];
  const use = ops && ops.length ? ops : ['+', '-', '×', '÷'];
  const range = level === 'sd-kelas-1-2' ? [2, 10] : level === 'sd-kelas-3-4' ? [2, 25] : level === 'sd-kelas-5-6' ? [3, 60] : [4, 99];
  let guard = 0;
  while (out.length < count && guard < count * 40) {
    guard++;
    const op = pick(use);
    let a = rand(range[0], range[1]);
    let b = rand(range[0], range[1]);
    let prompt, answer;
    if (op === '+') { answer = a + b; prompt = `${a} + ${b} = …`; }
    else if (op === '-') { if (b > a) [a, b] = [b, a]; answer = a - b; prompt = `${a} − ${b} = …`; }
    else if (op === '×') { b = rand(2, level === 'sd-kelas-1-2' ? 5 : 12); answer = a * b; prompt = `${a} × ${b} = …`; }
    else { b = rand(2, level === 'sd-kelas-1-2' ? 5 : 12); answer = a; prompt = `${a * b} ÷ ${b} = …`; }
    if (out.some((q) => q.prompt === prompt)) continue;
    const variants = numberVariants(String(answer)).slice(0, 3);
    const options = shuffle([String(answer), ...variants].slice(0, 4));
    out.push({
      type: 'mc',
      prompt,
      options: options.length === 4 ? options : shuffle([String(answer), String(answer + 1), String(answer + 2), String(Math.max(0, answer - 1))]),
      answer: String(answer),
      points: 10,
      explanation: `${prompt.replace(' = …', '')} = ${answer}`,
      difficulty: 'mudah',
    });
  }
  return out;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wordProblemBank(level, count) {
  const names = ['Andi', 'Siti', 'Budi', 'Lani', 'Rina', 'Dayu', 'Udin', 'Melati', 'Arifin', 'Nurul'];
  const items = ['kelereng', 'buku tulis', 'pensil', 'apel', 'permen', 'ikan', 'botol air', 'stiker', 'bunga', 'kue'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = pick(names);
    const it = pick(items);
    const big = rand(12, 60);
    const small = rand(3, big - 1);
    const kind = pick(['kurang', 'tambah', 'kali', 'bagi']);
    let prompt, answer, expl;
    if (kind === 'kurang') {
      prompt = `${n} memiliki ${big} ${it}. Sebanyak ${small} ${it} diberikan kepada temannya. Berapa sisa ${it} ${n} sekarang?`;
      answer = big - small; expl = `${big} − ${small} = ${answer}`;
    } else if (kind === 'tambah') {
      prompt = `${n} mempunyai ${small} ${it}, lalu membeli lagi ${big - small} ${it}. Berapa jumlah ${it} ${n} seluruhnya?`;
      answer = big; expl = `${small} + ${big - small} = ${answer}`;
    } else if (kind === 'kali') {
      const packs = rand(3, 9);
      const each = rand(4, 12);
      prompt = `${n} membeli ${packs} kotak ${it}. Setiap kotak berisi ${each} ${it}. Berapa banyak ${it} yang dibeli ${n}?`;
      answer = packs * each; expl = `${packs} × ${each} = ${answer}`;
    } else {
      const each = rand(3, 9);
      const packs = rand(3, 9);
      prompt = `${n} ingin membagi ${each * packs} ${it} sama banyak ke dalam ${packs} kantong. Berapa isi setiap kantong?`;
      answer = each; expl = `${each * packs} ÷ ${packs} = ${each}`;
    }
    const variants = numberVariants(String(answer)).slice(0, 3);
    out.push({
      type: 'mc',
      prompt,
      options: shuffle(uniq([String(answer), ...variants]).slice(0, 4)),
      answer: String(answer),
      points: 15,
      explanation: expl,
      difficulty: 'sedang',
    });
  }
  return out;
}

/* -------------------------------- generator -------------------------------- */

function dedupe(list) {
  const seen = new Set();
  return list.filter((q) => {
    const k = norm(q.prompt) + '|' + norm(q.answer);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ensure4Options(q, parsed) {
  const correct = strip(q.answer);
  let opts = (q.options || []).filter((o) => o != null && String(o).trim() !== '');
  opts = uniq(opts.map((o) => strip(o)));
  if (!opts.some((o) => norm(o) === norm(correct))) opts.push(correct);

  // tambah pengecoh: dari daftar khusus soal ini, lalu dari materi
  const need = 4 - opts.length;
  if (need > 0) {
    const seen = new Set(opts.map(norm));
    (q.distractors || []).forEach((c) => {
      if (seen.size >= 4) return;
      const s = strip(c);
      if (!s || seen.has(norm(s)) || norm(s) === norm(correct)) return;
      seen.add(norm(s));
      opts.push(s);
    });
  }
  if (opts.length < 4) {
    buildDistractors(correct, opts, parsed, 4 - opts.length).forEach((d) => {
      if (opts.length < 4 && !opts.some((o) => norm(o) === norm(d))) opts.push(d);
    });
  }

  // samakan panjang opsi agar jawaban tidak bocor dari panjang teks
  const maxLen = Math.max(...opts.map((o) => o.length));
  if (maxLen > 70) opts = opts.map((o) => truncateWords(o, 12));

  const seenN = new Set();
  opts = opts.filter((o) => { const k = norm(o); if (seenN.has(k)) return false; seenN.add(k); return true; });
  opts = opts.slice(0, 4);
  q.options = shuffle(opts);
  // kunci harus persis sama dengan salah satu opsi yang ditampilkan
  q.answer = q.options.find((o) => norm(o) === norm(correct)) || correct;
  delete q.distractors;
  return q;
}

/**
 * Menghasilkan soal dari materi.
 * @param {object} opts
 *  material: string (materi mentah)
 *  topic: string
 *  count: number
 *  types: string[]  -> mc | tf | fill | order | match
 *  level: string    -> sd-kelas-1-2 | sd-kelas-3-4 | sd-kelas-5-6 | smp | sma
 *  arithmetic: bool -> tambahkan soal hitungan otomatis
 *  difficulty: mudah|sedang|sulit|campur
 */
function generateQuestions(opts = {}) {
  const {
    material = '',
    topic = '',
    count = 10,
    types = ['mc', 'tf', 'fill'],
    level = 'sd-kelas-3-4',
    arithmetic = false,
    difficulty = 'campur',
  } = opts;

  const parsed = parseMaterial(material, topic);
  const questions = [];
  const pool = uniq([...parsed.capitals, ...parsed.keys.slice(0, 25), ...parsed.pairs.map((p) => p.term)]);

  const want = (t) => types.includes(t);

  // --- A. Soal definisi / istilah -------------------------------------------
  const allDefs = parsed.pairs.map((p) => cleanTerm(p.def).replace(/\.$/, ''));
  const worst = allDefs.reduce((m, x) => Math.max(m, x.length), 0);
  const CUT = worst > 90 ? 9 : worst > 60 ? 12 : 16; // samakan panjang opsi agar adil
  if (want('mc') || want('tf') || want('fill') || want('match')) {
    parsed.pairs.forEach((pair) => {
      const term = cleanTerm(pair.term);
      const def = cleanTerm(pair.def).replace(/\.$/, '');
      if (def.length < 12 || term.length < 3 || term.length > 55) return;
      const termPool = parsed.pairs.map((p) => cleanTerm(p.term));
      const cleanSource = cleanTerm(pair.source);
      const defShort = truncateWords(def, CUT);
      const defPool = allDefs.map((x) => truncateWords(x, CUT));
      if (want('mc')) {
        questions.push(ensure4Options({
          type: 'mc',
          prompt: pick(T.defQ)(term),
          answer: defShort,
          options: [defShort],
          distractors: defPool,
          points: 10,
          explanation: `${term} adalah ${def}.`,
          material: cleanSource,
          difficulty: pickDifficulty(difficulty),
        }, parsed));

        // 2. Pilihan ganda: pengertian -> istilah
        questions.push(ensure4Options({
          type: 'mc',
          prompt: pick(T.termQ)(defShort),
          answer: term,
          options: [term],
          distractors: termPool,
          points: 10,
          explanation: `${term} adalah ${def}.`,
          material: cleanSource,
          difficulty: pickDifficulty(difficulty),
        }, parsed));

        // 3. Pilihan ganda: isi definisi (kata kunci disembunyikan)
        const cloze = clozeDefinition(def, parsed.keys);
        if (cloze) {
          questions.push(ensure4Options({
            type: 'mc',
            prompt: `${term}: ${cloze.text}`,
            answer: cloze.answer,
            options: [cloze.answer],
            distractors: parsed.keys.map((k) => titleCase(k)),
            points: 10,
            explanation: `${term} adalah ${def}.`,
            material: cleanSource,
            difficulty: pickDifficulty(difficulty),
          }, parsed));
        }
      }

      // 4. Benar / salah
      if (want('tf')) {
        const statement = `${term} adalah ${defShort}.`;
        questions.push({ type: 'tf', prompt: pick(T.tfQ)(statement), answer: 'benar', options: ['benar', 'salah'], points: 10, explanation: 'Pernyataan sesuai dengan materi.', material: cleanSource, difficulty: 'mudah' });
        const wrong = negated(statement);
        if (wrong) questions.push({ type: 'tf', prompt: pick(T.tfQ)(wrong), answer: 'salah', options: ['benar', 'salah'], points: 10, explanation: `Pernyataan yang benar: ${statement}`, material: cleanSource, difficulty: 'sedang' });
        // salah karena definisinya ditukar dengan istilah lain
        const otherDef = defPool.filter((x) => norm(x) !== norm(defShort));
        if (otherDef.length) {
          questions.push({ type: 'tf', prompt: pick(T.tfQ)(`${term} adalah ${pick(otherDef)}.`), answer: 'salah', options: ['benar', 'salah'], points: 10, explanation: `Pernyataan yang benar: ${term} adalah ${defShort}.`, material: cleanSource, difficulty: 'sulit' });
        }
      }

      // 5. Isian singkat (istilah disembunyikan)
      if (want('fill')) {
        const cloze = clozeSentence(`${term} adalah ${defShort}.`, term);
        if (cloze) questions.push({ type: 'fill', prompt: pick(T.fillQ)(cloze), answer: term, options: [], points: 15, explanation: `${term} adalah ${def}.`, material: cleanSource, difficulty: 'sedang' });
        const cloze2 = clozeDefinition(def, parsed.keys);
        if (cloze2) questions.push({ type: 'fill', prompt: pick(T.fillQ)(`${term}: ${cloze2.text}`), answer: cloze2.answer, options: [], points: 15, explanation: `${term} adalah ${def}.`, material: cleanSource, difficulty: 'sulit' });
      }
    });
  }

  // --- B. Soal fakta umum dari kalimat --------------------------------------
  if (want('mc') || want('tf') || want('fill')) {
    parsed.sentences.forEach((s) => {
      if (s.length < 25 || s.length > 220) return;
      if (parsed.pairs.some((p) => norm(p.source) === norm(s))) return;
      const num = s.match(/\b(\d+(?:[.,]\d+)?)\s*([a-zA-Z%°]+)?/);
      if (want('mc') && num) {
        const label = truncateWords(s.split(num[0])[0], 12) || topic;
        questions.push(ensure4Options({
          type: 'mc',
          prompt: pick(T.numberQ)(label.trim()),
          answer: (num[0] + (num[2] ? ' ' + num[2] : '')).trim(),
          options: [(num[0] + (num[2] ? ' ' + num[2] : '')).trim()],
          points: 10,
          explanation: s,
          material: s,
          difficulty: pickDifficulty(difficulty),
        }, parsed));
      }
      if (want('tf')) {
        questions.push({ type: 'tf', prompt: pick(T.tfQ)(s), answer: 'benar', options: ['benar', 'salah'], points: 10, explanation: 'Pernyataan sesuai materi.', material: s, difficulty: 'mudah' });
        const wrong = negated(s);
        if (wrong) questions.push({ type: 'tf', prompt: pick(T.tfQ)(truncateWords(wrong, 30)), answer: 'salah', options: ['benar', 'salah'], points: 10, explanation: `Yang benar: ${truncateWords(s, 30)}`, material: s, difficulty: 'sedang' });
      }
      if (want('fill')) {
        const key = parsed.keys.find((k) => new RegExp(`\\b${k}\\b`, 'i').test(s));
        if (key) {
          const cloze = clozeSentence(s, key);
          if (cloze) questions.push({ type: 'fill', prompt: pick(T.fillQ)(cloze), answer: key, options: [], points: 15, explanation: s, material: s, difficulty: 'sedang' });
        }
      }
    });
  }

  // --- C. Soal urutan (langkah/proses) --------------------------------------
  if (want('order') && parsed.ordered.length >= 3) {
    const steps = parsed.ordered.slice(0, 6).map((s) => truncateWords(s, 14));
    questions.push({
      type: 'order',
      prompt: `Susunlah langkah-langkah berikut menjadi urutan yang benar! (Topik: ${topic || 'materi'})`,
      answer: steps,
      options: [],
      points: 20,
      explanation: 'Urutan sesuai materi:\n' + steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      material: steps.join('\n'),
      difficulty: 'sedang',
    });
  }
  if (want('order') && PROCESS_HINT.test(parsed.raw) === false && parsed.pairs.length >= 3) {
    const items = parsed.pairs.slice(0, 4).map((p) => cleanTerm(p.term));
    questions.push({
      type: 'order',
      prompt: 'Susun istilah berikut sesuai urutan kemunculannya di dalam materi!',
      answer: items,
      options: [],
      points: 15,
      explanation: 'Urutan sesuai materi: ' + items.join(' → '),
      material: items.join('\n'),
      difficulty: 'mudah',
    });
  }

  // --- D. Soal menjodohkan ---------------------------------------------------
  if (want('match') && parsed.pairs.length >= 3) {
    const chosen = pickN(parsed.pairs, clamp(parsed.pairs.length, 3, 5));
    questions.push({
      type: 'match',
      prompt: 'Jodohkan setiap istilah dengan pengertiannya!',
      answer: chosen.map((c) => ({ left: cleanTerm(c.term), right: truncateWords(cleanTerm(c.def), 12) })),
      options: [],
      points: 25,
      explanation: chosen.map((c) => `${cleanTerm(c.term)} = ${truncateWords(cleanTerm(c.def), 12)}`).join('\n'),
      material: chosen.map((c) => cleanTerm(c.source)).join('\n'),
      difficulty: 'sedang',
    });
  }

  // --- E. Soal hitungan otomatis --------------------------------------------
  if (arithmetic || /matematika|hitung|bilangan|pecahan|aritmet/i.test(topic + ' ' + material.slice(0, 200))) {
    const need = arithmetic ? Math.ceil(count / 2) : 3;
    arithmeticBank(level, need).forEach((q) => questions.push(q));
    wordProblemBank(level, arithmetic ? 3 : 2).forEach((q) => questions.push(q));
  }

  // --- F. Soal pemahaman (kalimat -> benar/salah acak) ----------------------
  if (want('mc') && parsed.bullets.length >= 2) {
    parsed.bullets.forEach((b) => {
      const t = truncateWords(b, 16);
      if (t.length < 15) return;
      questions.push({
        type: 'tf',
        prompt: pick(T.tfQ)(t),
        answer: 'benar',
        options: ['benar', 'salah'],
        points: 10,
        explanation: b,
        material: b,
        difficulty: 'mudah',
      });
    });
  }

  let final = dedupe(questions);

  // prioritaskan variasi tipe
  const byType = {};
  final.forEach((q) => { (byType[q.type] = byType[q.type] || []).push(q); });
  const ordered = [];
  const typeOrder = types.filter((t) => byType[t] && byType[t].length);
  let i = 0;
  while (ordered.length < final.length && i < 200) {
    let added = false;
    typeOrder.forEach((t) => {
      if (ordered.length >= count) return;
      const q = (byType[t] || []).shift();
      if (q) { ordered.push(q); added = true; }
    });
    if (!added) break;
    i++;
  }
  final = ordered.length ? ordered : final.slice(0, count);
  final = final.slice(0, Math.max(count, 0));

  return final.map((q, idx) => Object.assign({ id: `q_${Date.now().toString(36)}${idx}`, order: idx + 1 }, q));
}

function pickDifficulty(d) {
  if (d === 'mudah') return 'mudah';
  if (d === 'sedang') return 'sedang';
  if (d === 'sulit') return 'sulit';
  return pick(['mudah', 'sedang', 'sulit']);
}

/* ------------------------- AI Rencana Pembelajaran ------------------------- */

function lessonPlan({ subject = '', topic = '', level = '', material = '' }) {
  const parsed = parseMaterial(material, topic);
  const keys = parsed.keys.slice(0, 6);
  const jenjang = /sd/i.test(level) ? 'SD' : /smp/i.test(level) ? 'SMP' : /sma|smk/i.test(level) ? 'SMA/SMK' : 'Umum';
  const tujuan = keys.length
    ? keys.slice(0, 4).map((k, i) => `${i + 1}. Siswa mampu menjelaskan konsep ${k} dengan bahasa sendiri.`)
    : [`1. Siswa mampu menjelaskan ${topic}.`, `2. Siswa mampu memberi contoh ${topic} dalam kehidupan sehari-hari.`];
  const aktivitas = [
    'Apersepsi (5 menit): guru menanyakan pengalaman siswa terkait topik.',
    `Eksplorasi (10 menit): siswa membaca rangkuman materi ${topic}.`,
    'Bermain game (15 menit): siswa mengerjakan tantangan pada platform ini.',
    'Refleksi (5 menit): membahas soal yang paling banyak salah.',
  ];
  const ringkasan = parsed.pairs.length
    ? parsed.pairs.slice(0, 6).map((p) => `• ${p.term}: ${truncateWords(strip(p.def), 18)}`).join('\n')
    : parsed.sentences.slice(0, 5).map((s) => `• ${truncateWords(s, 20)}`).join('\n');
  return {
    jenjang,
    tujuan,
    aktivitas,
    ringkasan,
    kataKunci: keys,
    saranGame: parsed.ordered.length >= 3 ? 'Cocok untuk soal tipe Urutan & Menjodohkan.' : 'Cocok untuk Pilihan Ganda, Benar/Salah, dan Isian Singkat.',
  };
}

/** Rangkuman hasil belajar dari data attempt (dipakai guru). */
function insightFromAttempts(attempts = []) {
  if (!attempts.length) return { ringkasan: 'Belum ada data pengerjaan siswa.', saran: [] };
  const avg = attempts.reduce((a, x) => a + (x.percent || 0), 0) / attempts.length;
  const best = attempts.reduce((a, b) => ((b.percent || 0) > (a.percent || 0) ? b : a));
  const lowest = attempts.reduce((a, b) => ((b.percent || 0) < (a.percent || 0) ? b : a));
  const wrongMap = new Map();
  attempts.forEach((a) => (a.answers || []).forEach((ans) => {
    if (!ans.correct && ans.prompt) {
      const k = truncateWords(ans.prompt, 14);
      wrongMap.set(k, (wrongMap.get(k) || 0) + 1);
    }
  }));
  const hard = Array.from(wrongMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  const saran = [];
  if (avg < 60) saran.push('Rata-rata kelas masih di bawah 60. Ulangi penjelasan konsep inti lalu mainkan ulang game dengan soal lebih mudah.');
  if (hard.length) saran.push(`Soal yang paling banyak salah: ${hard.join('; ')}. Bahas bersama di depan kelas.`);
  if (avg >= 85) saran.push('Nilai kelas sudah sangat baik. Tambahkan soal tingkat sulit atau adakan mode Kejar Waktu.');
  saran.push(`Apresiasi ${best.studentName} (${Math.round(best.percent)}%) sebagai motivasi kelas.`);
  if (lowest.studentName !== best.studentName) saran.push(`Berikan bimbingan khusus untuk ${lowest.studentName} (${Math.round(lowest.percent)}%).`);
  return {
    ringkasan: `Rata-rata kelas ${avg.toFixed(1)}% dari ${attempts.length} pengerjaan. Nilai tertinggi ${Math.round(best.percent)}% (${best.studentName}).`,
    saran,
  };
}

window.PB_AI = {
  generateQuestions,
  cleanTerm,
  parseMaterial,
  lessonPlan,
  insightFromAttempts,
  arithmeticBank,
  wordProblemBank,
  buildDistractors,
  norm,
};
