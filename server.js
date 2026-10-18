/**
 * Petualangan Belajar — server utama
 * Jalankan: npm start  (default http://0.0.0.0:3000)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('./src/store');
const auth = require('./src/auth');
const engine = require('./src/ai-engine');
const ai = require('./src/ai-api');
const { seed } = require('./src/seed');
const sync = require('./src/cloud-sync');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/* --------------------------------- helpers -------------------------------- */
const db = () => store.load();
const now = () => new Date().toISOString();

function requireTeacher(req, res, next) {
  const u = auth.currentUser(req);
  if (!u) return res.status(401).json({ error: 'Silakan masuk dulu.' });
  if (u.role !== 'teacher') return res.status(403).json({ error: 'Hanya guru yang dapat mengakses menu ini.' });
  req.user = u;
  next();
}
function requireUser(req, res, next) {
  const u = auth.currentUser(req);
  if (!u) return res.status(401).json({ error: 'Silakan masuk dulu.' });
  req.user = u;
  next();
}
function log(action, detail, userId) {
  const d = db();
  d.logs.push({ id: store.uid('log'), action, detail, userId: userId || null, at: now() });
  if (d.logs.length > 500) d.logs = d.logs.slice(-500);
}

function gameWithQuestions(gameId) {
  const d = db();
  const game = d.games.find((g) => g.id === gameId);
  if (!game) return null;
  const questions = d.questions.filter((q) => q.gameId === gameId).sort((a, b) => (a.order || 0) - (b.order || 0));
  const subject = d.subjects.find((s) => s.id === game.subjectId);
  return { game: Object.assign({}, game, { subjectName: subject ? subject.name : '', subjectIcon: subject ? subject.icon : '📘' }), questions };
}

/** Versi soal untuk siswa: jawaban disembunyikan. */
function publicQuestion(q) {
  const { answer, explanation, material, ...rest } = q;
  const out = Object.assign({}, rest);
  if (q.type === 'mc' || q.type === 'tf') out.options = q.options;
  // urutan: teks langkah DIACAK server, urutan benar disembunyikan
  if (q.type === 'order') out.items = shuffleArr((q.answer || []).map(String));
  // menjodohkan: dua kolom terpisah, pasangan benar disembunyikan
  if (q.type === 'match') {
    out.lefts = shuffleArr((q.answer || []).map((x) => String(x.left)));
    out.rights = shuffleArr((q.answer || []).map((x) => String(x.right)));
  }
  return out;
}

function normalizeAnswer(v) {
  return engine.norm(v);
}

function gradeAnswer(q, given) {
  if (given == null) return false;
  if (q.type === 'mc' || q.type === 'tf') return normalizeAnswer(given) === normalizeAnswer(q.answer);
  if (q.type === 'fill') {
    const a = normalizeAnswer(q.answer);
    const g = normalizeAnswer(given);
    if (!a) return false;
    return g === a || a.split(' ').filter((w) => g.includes(w)).length >= Math.max(1, a.split(' ').length - 1);
  }
  if (q.type === 'order') {
    if (!Array.isArray(given)) return false;
    return given.length === q.answer.length && given.every((v, i) => normalizeAnswer(v) === normalizeAnswer(q.answer[i]));
  }
  if (q.type === 'match') {
    if (!Array.isArray(given)) return false;
    const map = new Map(given.map((g) => [normalizeAnswer(g.left), normalizeAnswer(g.right)]));
    return q.answer.every((p) => map.get(normalizeAnswer(p.left)) === normalizeAnswer(p.right));
  }
  return false;
}

/* --------------------------------- auth ----------------------------------- */
app.post('/api/auth/register', (req, res) => {
  const d = db();
  const { role, name, username, password, gradeLevel, school } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'Nama, username, dan password wajib diisi.' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Password minimal 4 karakter.' });
  const uname = String(username).trim().toLowerCase();
  if (d.users.some((u) => u.username === uname)) return res.status(400).json({ error: 'Username sudah dipakai.' });

  const user = {
    id: store.uid('usr'),
    role: role === 'student' ? 'student' : 'teacher',
    name: String(name).trim(),
    username: uname,
    pass: auth.hashPassword(password),
    gradeLevel: gradeLevel || 'sd',
    avatar: role === 'student' ? '🧑‍🎓' : '👩‍🏫',
    color: '#6366f1',
    school: school || '',
    points: 0,
    classIds: [],
    createdAt: now(),
  };
  d.users.push(user);

  // guru baru otomatis punya mapel contoh
  if (user.role === 'teacher') {
    const starter = [['Matematika', '🔢', '#3b82f6'], ['Bahasa Indonesia', '📖', '#6366f1'], ['IPA', '🔬', '#10b981']];
    starter.forEach(([n, icon, color]) => d.subjects.push({ id: store.uid('sub'), ownerId: user.id, name: n, jenjang: user.gradeLevel, icon, color, createdAt: now(), builtin: true }));
  }
  auth.createSession(user, res);
  log('register', `${user.role}: ${user.name}`, user.id);
  store.save();
  res.json({ ok: true, user: auth.publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const d = db();
  const { username, password } = req.body || {};
  const u = d.users.find((x) => x.username === String(username || '').trim().toLowerCase());
  if (!u || !auth.verifyPassword(password, u.pass)) return res.status(401).json({ error: 'Username atau password salah.' });
  auth.createSession(u, res);
  log('login', u.name, u.id);
  res.json({ ok: true, user: auth.publicUser(u) });
});

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = auth.currentUser(req);
  if (!u) return res.json({ user: null });
  const d = db();
  let extra = {};
  if (u.role === 'teacher') {
    extra = {
      counts: {
        games: d.games.filter((g) => g.ownerId === u.id).length,
        classes: d.classes.filter((c) => c.ownerId === u.id).length,
        subjects: d.subjects.filter((s) => s.ownerId === u.id).length,
        attempts: d.attempts.filter((a) => {
          const g = d.games.find((x) => x.id === a.gameId);
          return g && g.ownerId === u.id;
        }).length,
      },
    };
  } else {
    extra = {
      classes: (u.classIds || []).map((cid) => d.classes.find((c) => c.id === cid)).filter(Boolean),
      points: d.attempts.filter((a) => a.studentId === u.id).reduce((s, a) => s + (a.score || 0), 0),
    };
  }
  res.json({ user: auth.publicUser(u), ...extra, settings: publicSettings() });
});

app.post('/api/me', requireUser, (req, res) => {
  const { name, avatar, color, gradeLevel } = req.body || {};
  const d = db();
  const u = d.users.find((x) => x.id === req.user.id);
  if (name) u.name = String(name).slice(0, 60);
  if (avatar) u.avatar = String(avatar).slice(0, 8);
  if (color) u.color = String(color).slice(0, 20);
  if (gradeLevel) u.gradeLevel = gradeLevel;
  store.save();
  res.json({ ok: true, user: auth.publicUser(u) });
});

function publicSettings() {
  const s = db().settings;
  return { schoolName: s.schoolName, aiMode: s.aiMode, aiModel: s.aiModel, aiProvider: s.aiProvider, aiBaseUrl: s.aiBaseUrl, aiKeySet: Boolean(s.aiApiKey) };
}

/* ------------------------------- pengaturan ------------------------------- */
app.get('/api/settings', requireTeacher, (req, res) => {
  const s = db().settings;
  res.json({ ...s, aiApiKey: s.aiApiKey ? '••••••••' + s.aiApiKey.slice(-4) : '' });
});

app.post('/api/settings', requireTeacher, (req, res) => {
  const d = db();
  const b = req.body || {};
  const s = d.settings;
  ['schoolName', 'aiMode', 'aiProvider', 'aiBaseUrl', 'aiModel'].forEach((k) => { if (b[k] != null) s[k] = String(b[k]); });
  if (b.aiApiKey != null && !String(b.aiApiKey).startsWith('••••')) s.aiApiKey = String(b.aiApiKey).trim();
  store.save();
  log('settings', 'pengaturan diubah', req.user.id);
  res.json({ ok: true });
});

/* --------------------------------- mapel ---------------------------------- */
app.get('/api/subjects', requireUser, (req, res) => {
  const d = db();
  const list = req.user.role === 'teacher'
    ? d.subjects.filter((s) => s.ownerId === req.user.id)
    : d.subjects;
  res.json(list.map((s) => Object.assign({}, s, {
    topics: d.topics.filter((t) => t.subjectId === s.id).sort((a, b) => a.order - b.order),
    games: d.games.filter((g) => g.subjectId === s.id).length,
  })));
});

app.post('/api/subjects', requireTeacher, (req, res) => {
  const d = db();
  const { name, jenjang, icon, color, topics } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nama mata pelajaran wajib diisi.' });
  const s = { id: store.uid('sub'), ownerId: req.user.id, name: String(name).trim(), jenjang: jenjang || req.user.gradeLevel, icon: icon || '📘', color: color || '#6366f1', createdAt: now() };
  d.subjects.push(s);
  (topics || []).filter(Boolean).forEach((t, i) => d.topics.push({ id: store.uid('top'), subjectId: s.id, name: String(t).trim(), order: i + 1 }));
  store.save();
  res.json({ ok: true, subject: s });
});

app.put('/api/subjects/:id', requireTeacher, (req, res) => {
  const d = db();
  const s = d.subjects.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!s) return res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' });
  const { name, icon, color, jenjang } = req.body || {};
  if (name) s.name = name;
  if (icon) s.icon = icon;
  if (color) s.color = color;
  if (jenjang) s.jenjang = jenjang;
  store.save();
  res.json({ ok: true, subject: s });
});

app.delete('/api/subjects/:id', requireTeacher, (req, res) => {
  const d = db();
  const s = d.subjects.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!s) return res.status(404).json({ error: 'Tidak ditemukan.' });
  const games = d.games.filter((g) => g.subjectId === s.id).map((g) => g.id);
  d.games = d.games.filter((g) => g.subjectId !== s.id);
  d.questions = d.questions.filter((q) => !games.includes(q.gameId));
  d.topics = d.topics.filter((t) => t.subjectId !== s.id);
  d.subjects = d.subjects.filter((x) => x.id !== s.id);
  store.save();
  res.json({ ok: true });
});

app.post('/api/subjects/:id/topics', requireTeacher, (req, res) => {
  const d = db();
  const s = d.subjects.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!s) return res.status(404).json({ error: 'Tidak ditemukan.' });
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nama materi/topik kosong.' });
  const t = { id: store.uid('top'), subjectId: s.id, name, order: d.topics.filter((x) => x.subjectId === s.id).length + 1 };
  d.topics.push(t);
  store.save();
  res.json({ ok: true, topic: t });
});

app.delete('/api/topics/:id', requireTeacher, (req, res) => {
  const d = db();
  d.topics = d.topics.filter((t) => !(t.id === req.params.id));
  store.save();
  res.json({ ok: true });
});

/* --------------------------------- materi --------------------------------- */
app.get('/api/materials', requireUser, (req, res) => {
  const d = db();
  res.json(d.materials.filter((m) => req.user.role === 'teacher' ? m.ownerId === req.user.id : true));
});

app.post('/api/materials', requireTeacher, (req, res) => {
  const d = db();
  const { title, content, subjectId, jenjang } = req.body || {};
  if (!content || content.trim().length < 20) return res.status(400).json({ error: 'Isi materi minimal 20 karakter.' });
  const m = { id: store.uid('mat'), ownerId: req.user.id, subjectId: subjectId || null, title: title || 'Materi tanpa judul', content: String(content), jenjang: jenjang || req.user.gradeLevel, createdAt: now() };
  d.materials.unshift(m);
  store.save();
  res.json({ ok: true, material: m });
});

app.delete('/api/materials/:id', requireTeacher, (req, res) => {
  const d = db();
  d.materials = d.materials.filter((m) => m.id !== req.params.id);
  store.save();
  res.json({ ok: true });
});

/* --------------------------------- kelas ---------------------------------- */
function classesFor(teacherId) {
  const d = db();
  return d.classes.filter((c) => c.ownerId === teacherId).map((c) => Object.assign({}, c, {
    students: c.studentIds.map((sid) => d.users.find((u) => u.id === sid)).filter(Boolean).map((u) => ({
      id: u.id, name: u.name, username: u.username, avatar: u.avatar, color: u.color,
      points: d.attempts.filter((a) => a.studentId === u.id).reduce((s, a) => s + (a.score || 0), 0),
      attempts: d.attempts.filter((a) => a.studentId === u.id).length,
      avg: (() => { const arr = d.attempts.filter((a) => a.studentId === u.id); return arr.length ? Math.round(arr.reduce((s, a) => s + a.percent, 0) / arr.length) : 0; })(),
    })),
  }));
}

app.get('/api/classes', requireTeacher, (req, res) => res.json(classesFor(req.user.id)));

app.post('/api/classes', requireTeacher, (req, res) => {
  const d = db();
  const { name, jenjang } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nama kelas wajib diisi.' });
  let code = store.code(6);
  while (d.classes.some((c) => c.joinCode === code)) code = store.code(6);
  const c = { id: store.uid('cls'), ownerId: req.user.id, name: String(name).trim(), jenjang: jenjang || req.user.gradeLevel, joinCode: code, studentIds: [], createdAt: now() };
  d.classes.push(c);
  store.save();
  res.json({ ok: true, klass: c });
});

app.put('/api/classes/:id', requireTeacher, (req, res) => {
  const d = db();
  const c = d.classes.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  if (req.body.name) c.name = String(req.body.name);
  if (req.body.resetCode) { let code = store.code(6); while (d.classes.some((x) => x.joinCode === code)) code = store.code(6); c.joinCode = code; }
  store.save();
  res.json({ ok: true, klass: c });
});

app.delete('/api/classes/:id', requireTeacher, (req, res) => {
  const d = db();
  const c = d.classes.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Tidak ditemukan.' });
  c.studentIds.forEach((sid) => {
    const u = d.users.find((x) => x.id === sid);
    if (u) u.classIds = (u.classIds || []).filter((x) => x !== c.id);
  });
  d.classes = d.classes.filter((x) => x.id !== c.id);
  store.save();
  res.json({ ok: true });
});

app.post('/api/classes/:id/students', requireTeacher, (req, res) => {
  const d = db();
  const c = d.classes.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  const { name, username, password } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nama siswa wajib diisi.' });
  let uname = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
  if (!uname) uname = engine.norm(name).split(' ')[0] + Math.floor(Math.random() * 90 + 10);
  let n = 1;
  const base = uname;
  while (d.users.some((u) => u.username === uname)) uname = base + (++n);
  const pass = String(password || '123456');
  const avatars = ['🦁', '🐼', '🦋', '🐢', '🦄', '🐰', '🦊', '🐨', '🦉', '🐯'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
  const u = {
    id: store.uid('usr'), role: 'student', name: String(name).trim(), username: uname,
    pass: auth.hashPassword(pass), gradeLevel: c.jenjang, avatar: avatars[c.studentIds.length % avatars.length],
    color: colors[c.studentIds.length % colors.length], classIds: [c.id], points: 0, createdAt: now(),
  };
  d.users.push(u);
  c.studentIds.push(u.id);
  store.save();
  res.json({ ok: true, student: { id: u.id, name: u.name, username: u.username, password: pass, avatar: u.avatar, color: u.color } });
});

app.post('/api/classes/:id/import', requireTeacher, (req, res) => {
  const d = db();
  const c = d.classes.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  const names = String((req.body || {}).names || '').split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
  const pass = String((req.body || {}).password || '123456');
  const created = [];
  names.forEach((name) => {
    let uname = engine.norm(name).replace(/[^a-z0-9]/g, '').slice(0, 12) || 'siswa';
    let n = 1;
    while (d.users.some((u) => u.username === uname)) uname = engine.norm(name).replace(/[^a-z0-9]/g, '').slice(0, 10) + (++n);
    const u = {
      id: store.uid('usr'), role: 'student', name, username: uname, pass: auth.hashPassword(pass),
      gradeLevel: c.jenjang, avatar: '🧑‍🎓', color: '#6366f1', classIds: [c.id], points: 0, createdAt: now(),
    };
    d.users.push(u);
    c.studentIds.push(u.id);
    created.push({ name, username: uname, password: pass });
  });
  store.save();
  res.json({ ok: true, created });
});

app.delete('/api/classes/:id/students/:sid', requireTeacher, (req, res) => {
  const d = db();
  const c = d.classes.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Tidak ditemukan.' });
  c.studentIds = c.studentIds.filter((x) => x !== req.params.sid);
  store.save();
  res.json({ ok: true });
});

/** Siswa bergabung ke kelas pakai kode (dari akun siswa). */
app.post('/api/join-class', requireUser, (req, res) => {
  const d = db();
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const c = d.classes.find((x) => x.joinCode === code);
  if (!c) return res.status(404).json({ error: 'Kode kelas tidak ditemukan.' });
  const u = d.users.find((x) => x.id === req.user.id);
  if (!c.studentIds.includes(u.id)) c.studentIds.push(u.id);
  u.classIds = uniq([...(u.classIds || []), c.id]);
  store.save();
  res.json({ ok: true, klass: { id: c.id, name: c.name } });
});

function uniq(a) { return Array.from(new Set(a)); }

/* ---------------------------------- AI ------------------------------------ */
app.post('/api/ai/preview', requireTeacher, async (req, res) => {
  const b = req.body || {};
  const opts = {
    material: b.material || '',
    topic: b.topic || '',
    subject: b.subject || '',
    count: Math.min(Number(b.count) || 8, 30),
    types: Array.isArray(b.types) && b.types.length ? b.types : ['mc', 'tf', 'fill'],
    level: b.level || 'sd-kelas-3-4',
    arithmetic: Boolean(b.arithmetic),
    difficulty: b.difficulty || 'campur',
  };
  if (engine.parseMaterial(opts.material, opts.topic).words < 5 && !opts.arithmetic) {
    return res.status(400).json({ error: 'Materi masih terlalu pendek. Tempel minimal 1-2 kalimat materi, atau aktifkan "Soal hitungan otomatis".' });
  }
  try {
    const out = await ai.generate(opts, db().settings);
    res.json({ ok: true, questions: out.questions, engine: out.engine });
  } catch (e) {
    res.status(500).json({ error: 'Gagal membuat soal: ' + e.message });
  }
});

app.post('/api/ai/material', requireTeacher, async (req, res) => {
  const b = req.body || {};
  try {
    const out = await ai.generateMaterial({ topic: b.topic || '', subject: b.subject || '', level: b.level || 'sd-kelas-3-4' }, db().settings);
    res.json({ ok: true, text: out.text, source: out.source });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/ai/lesson-plan', requireTeacher, (req, res) => {
  const b = req.body || {};
  res.json({ ok: true, plan: engine.lessonPlan(b) });
});

app.post('/api/ai/test', requireTeacher, async (req, res) => {
  const s = db().settings;
  if (!s.aiApiKey) return res.json({ ok: false, message: 'API key belum diisi, mesin AI offline yang akan dipakai.' });
  try {
    const content = await ai.generate({ material: 'Air adalah senyawa kimia dengan rumus H2O. Titik didih air adalah 100 derajat Celcius.', topic: 'Air', count: 2, types: ['mc'], level: 'sd-kelas-3-4' }, s);
    res.json({ ok: content.engine.startsWith('api'), message: `Mesin yang dipakai: ${content.engine}`, sample: content.questions[0] || null });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});

/* --------------------------------- game ----------------------------------- */
app.get('/api/games', requireUser, (req, res) => {
  const d = db();
  let list;
  if (req.user.role === 'teacher') {
    list = d.games.filter((g) => g.ownerId === req.user.id);
  } else {
    const myClasses = req.user.classIds || [];
    list = d.games.filter((g) => g.status === 'published' && (g.classIds || []).some((c) => myClasses.includes(c)) || (g.status === 'published' && (!g.classIds || !g.classIds.length)));
  }
  res.json(list.map((g) => {
    const subject = d.subjects.find((s) => s.id === g.subjectId);
    const qs = d.questions.filter((q) => q.gameId === g.id);
    const attempts = d.attempts.filter((a) => a.gameId === g.id);
    const mine = req.user.role === 'student' ? attempts.filter((a) => a.studentId === req.user.id) : attempts;
    return {
      id: g.id, title: g.title, desc: g.desc, cover: g.cover, mode: g.mode, status: g.status,
      subjectId: g.subjectId, subjectName: subject ? subject.name : '', subjectIcon: subject ? subject.icon : '📘',
      subjectColor: subject ? subject.color : '#6366f1',
      topicName: g.topicName || '', classIds: g.classIds || [], shareCode: g.shareCode,
      questionCount: qs.length, attempts: mine.length,
      bestScore: mine.length ? Math.max(...mine.map((a) => a.percent)) : null,
      avg: mine.length ? Math.round(mine.reduce((s, a) => s + a.percent, 0) / mine.length) : null,
      createdAt: g.createdAt, updatedAt: g.updatedAt,
    };
  }));
});

app.get('/api/games/:id', requireTeacher, (req, res) => {
  const d = db();
  const full = gameWithQuestions(req.params.id);
  if (!full || full.game.ownerId !== req.user.id) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  full.game.attempts = d.attempts.filter((a) => a.gameId === full.game.id);
  full.game.topics = d.topics.filter((t) => t.subjectId === full.game.subjectId);
  res.json(full);
});

app.post('/api/games', requireTeacher, (req, res) => {
  const d = db();
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Judul game wajib diisi.' });
  let code = store.code(6);
  while (d.games.some((g) => g.shareCode === code)) code = store.code(6);
  const g = {
    id: store.uid('game'), ownerId: req.user.id, title: String(b.title).trim(),
    subjectId: b.subjectId || null, topicId: b.topicId || null, topicName: b.topicName || '',
    classIds: Array.isArray(b.classIds) ? b.classIds : [],
    desc: b.desc || '', mode: b.mode || 'klasik', cover: b.cover || '🎮',
    status: b.status || 'draft', shareCode: code,
    settings: Object.assign({ timer: 0, showExplanation: true, shuffle: true, passScore: 70, maxTry: 0 }, b.settings || {}),
    createdAt: now(), updatedAt: now(),
  };
  d.games.push(g);
  if (Array.isArray(b.questions)) b.questions.forEach((q, i) => d.questions.push(makeQuestion(g.id, q, i)));
  store.save();
  log('game-baru', g.title, req.user.id);
  res.json({ ok: true, game: g });
});

function makeQuestion(gameId, q, i) {
  return {
    id: store.uid('q'), gameId, order: i + 1,
    type: q.type || 'mc',
    prompt: String(q.prompt || ''),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    answer: q.answer,
    points: Number(q.points) || (q.type === 'match' ? 25 : q.type === 'order' ? 20 : q.type === 'fill' ? 15 : 10),
    explanation: q.explanation || '',
    material: q.material || '',
    difficulty: q.difficulty || 'sedang',
    hint: q.hint || '',
    source: q.source || 'manual',
  };
}

app.put('/api/games/:id', requireTeacher, (req, res) => {
  const d = db();
  const g = d.games.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  const b = req.body || {};
  ['title', 'desc', 'cover', 'mode', 'status', 'topicName', 'subjectId', 'topicId'].forEach((k) => { if (b[k] !== undefined) g[k] = b[k]; });
  if (b.classIds !== undefined) g.classIds = b.classIds;
  if (b.settings !== undefined) g.settings = Object.assign({}, g.settings, b.settings);
  if (Array.isArray(b.questions)) {
    d.questions = d.questions.filter((q) => q.gameId !== g.id);
    b.questions.forEach((q, i) => {
      if (q.id && d.questions.some((x) => x.id === q.id)) return;
      d.questions.push(makeQuestion(g.id, q, i));
    });
  }
  g.updatedAt = now();
  store.save();
  res.json({ ok: true, game: g });
});

app.post('/api/games/:id/questions', requireTeacher, (req, res) => {
  const d = db();
  const g = d.games.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  const list = Array.isArray(req.body.questions) ? req.body.questions : [req.body];
  const start = d.questions.filter((q) => q.gameId === g.id).length;
  const added = list.map((q, i) => { const made = makeQuestion(g.id, q, start + i); d.questions.push(made); return made; });
  g.updatedAt = now();
  store.save();
  res.json({ ok: true, added });
});

app.delete('/api/games/:id/questions/:qid', requireTeacher, (req, res) => {
  const d = db();
  d.questions = d.questions.filter((q) => !(q.gameId === req.params.id && q.id === req.params.qid));
  store.save();
  res.json({ ok: true });
});

app.delete('/api/games/:id', requireTeacher, (req, res) => {
  const d = db();
  const g = d.games.find((x) => x.id === req.params.id && x.ownerId === req.user.id);
  if (!g) return res.status(404).json({ error: 'Tidak ditemukan.' });
  d.games = d.games.filter((x) => x.id !== g.id);
  d.questions = d.questions.filter((q) => q.gameId !== g.id);
  d.attempts = d.attempts.filter((a) => a.gameId !== g.id);
  store.save();
  res.json({ ok: true });
});

/* --------------------------- siswa: ambil & main -------------------------- */
app.get('/api/play/:code', (req, res) => {
  const d = db();
  const code = String(req.params.code || '').trim().toUpperCase();
  const g = d.games.find((x) => x.shareCode === code || x.id === code);
  if (!g || g.status !== 'published') return res.status(404).json({ error: 'Kode game tidak ditemukan atau belum dipublikasikan.' });
  const qs = d.questions.filter((q) => q.gameId === g.id).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!qs.length) return res.status(400).json({ error: 'Game ini belum punya soal.' });
  const subject = d.subjects.find((s) => s.id === g.subjectId);
  const order = g.settings && g.settings.shuffle === false ? qs.map((q) => q.id) : shuffleArr(qs.map((q) => q.id));
  res.json({
    game: {
      id: g.id, title: g.title, desc: g.desc, cover: g.cover, mode: g.mode,
      subjectName: subject ? subject.name : '', subjectIcon: subject ? subject.icon : '📘', subjectColor: subject ? subject.color : '#6366f1',
      topicName: g.topicName || '', settings: g.settings || {},
    },
    questions: order.map((id) => qs.find((q) => q.id === id)).filter(Boolean).map((q, i) => {
      const p = publicQuestion(q);
      if (q.type === 'mc') p.options = shuffleArr(q.options.slice());
      return Object.assign(p, { index: i });
    }),
  });
});

function shuffleArr(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

/** Cek satu jawaban secara real-time (kunci + pembahasan dibuka SETELAH dijawab). */
app.post('/api/check', requireUser, (req, res) => {
  const d = db();
  const { gameId, questionId, given } = req.body || {};
  const q = d.questions.find((x) => x.id === questionId && x.gameId === gameId);
  if (!q) return res.status(404).json({ error: 'Soal tidak ditemukan.' });
  const correct = gradeAnswer(q, given);
  res.json({ ok: true, correct, answer: q.answer, explanation: q.explanation || '', points: q.points || 10 });
});

/** Mengirim hasil pengerjaan -> otomatis tersimpan ke akun guru. */
app.post('/api/attempts', (req, res) => {
  const d = db();
  const b = req.body || {};
  const u = auth.currentUser(req);
  const g = d.games.find((x) => x.id === b.gameId);
  if (!g) return res.status(404).json({ error: 'Game tidak ditemukan.' });
  const qs = d.questions.filter((q) => q.gameId === g.id);
  const byId = new Map(qs.map((q) => [q.id, q]));

  let student = u && u.role === 'student' ? u : null;
  if (!student && b.studentId) student = d.users.find((x) => x.id === b.studentId && x.role === 'student');
  if (!student) return res.status(401).json({ error: 'Siswa harus masuk sebelum mengumpulkan tugas.' });

  const timer = (g.settings && Number(g.settings.timer)) || 0;
  let streak = 0;
  const answers = (Array.isArray(b.answers) ? b.answers : []).filter((a) => byId.has(a.questionId)).map((a) => {
    const q = byId.get(a.questionId);
    const seconds = Math.max(0, Number(a.seconds) || 0);
    const correct = gradeAnswer(q, a.given);
    let pts = 0;
    if (correct) {
      streak += 1;
      const combo = Math.max(0, streak - 1) * 5;
      const timeBonus = timer ? Math.max(0, Math.round((timer - Math.min(timer, seconds)) / 2)) : 0;
      pts = (q.points || 10) + combo + timeBonus;
    } else {
      streak = 0;
    }
    return { questionId: q.id, prompt: q.prompt, type: q.type, given: a.given, correct, points: pts, seconds };
  });
  const maxScore = qs.reduce((s, q) => s + (q.points || 10), 0);
  const baseScore = answers.reduce((s, a) => s + (a.correct ? (byId.get(a.questionId).points || 10) : 0), 0);
  const score = answers.reduce((s, a) => s + a.points, 0); // termasuk bonus combo & waktu
  const correctCount = answers.filter((a) => a.correct).length;
  const percent = maxScore ? Math.round((baseScore / maxScore) * 1000) / 10 : 0; // nilai resmi tanpa bonus
  const subject = d.subjects.find((s) => s.id === g.subjectId);

  const attempt = {
    id: store.uid('att'),
    gameId: g.id, gameTitle: g.title,
    subjectId: g.subjectId, subjectName: subject ? subject.name : '-',
    ownerId: g.ownerId,
    studentId: student.id, studentName: student.name, studentAvatar: student.avatar,
    classId: (student.classIds || []).find((c) => (g.classIds || []).includes(c)) || (student.classIds || [])[0] || null,
    score, baseScore, maxScore, percent,
    correct: correctCount, total: qs.length,
    timeSpent: answers.reduce((s, a) => s + a.seconds, 0),
    answers,
    startedAt: b.startedAt || now(),
    finishedAt: now(),
    seen: false,
  };
  d.attempts.push(attempt);

  // poin siswa bertambah
  const su = d.users.find((x) => x.id === student.id);
  if (su) su.points = (su.points || 0) + score;

  // badge otomatis
  const badges = [];
  if (percent === 100) badges.push('🏆 Nilai Sempurna');
  if (percent >= 80) badges.push('🌟 Hebat');
  if (d.attempts.filter((a) => a.studentId === student.id).length === 1) badges.push('🚀 Langkah Pertama');
  badges.forEach((name) => d.badges.push({ id: store.uid('bdg'), studentId: student.id, name, at: now(), gameId: g.id }));

  log('mengerjakan', `${student.name} -> ${g.title} (${percent}%)`, student.id);
  store.save();

  const rank = d.attempts.filter((a) => a.gameId === g.id).sort((x, y) => y.score - x.score).findIndex((a) => a.id === attempt.id) + 1;
  res.json({ ok: true, attempt: { id: attempt.id, score, maxScore, percent, correct: correctCount, total: qs.length, rank, badges }, teacherName: (d.users.find((x) => x.id === g.ownerId) || {}).name });
});

/* --------------------------- riwayat & nilai siswa ------------------------ */
app.get('/api/my/attempts', requireUser, (req, res) => {
  const d = db();
  if (req.user.role !== 'student') return res.json([]);
  res.json(d.attempts.filter((a) => a.studentId === req.user.id).sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).map((a) => ({
    id: a.id, gameTitle: a.gameTitle, subjectName: a.subjectName, percent: a.percent, score: a.score, maxScore: a.maxScore,
    correct: a.correct, total: a.total, finishedAt: a.finishedAt, timeSpent: a.timeSpent,
  })));
});

app.get('/api/my/attempt/:id', requireUser, (req, res) => {
  const d = db();
  const a = d.attempts.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Tidak ditemukan.' });
  if (a.studentId !== req.user.id && req.user.role !== 'teacher') return res.status(403).json({ error: 'Bukan data kamu.' });
  const qs = d.questions.filter((q) => q.gameId === a.gameId);
  const byId = new Map(qs.map((q) => [q.id, q]));
  res.json({
    attempt: a,
    review: (a.answers || []).map((ans) => {
      const q = byId.get(ans.questionId);
      return { prompt: ans.prompt, type: ans.type, given: ans.given, correct: ans.correct, answer: q ? q.answer : null, explanation: q ? q.explanation : '', image: q ? (q.image || null) : null };
    }),
  });
});

/* ------------------------------ data guru --------------------------------- */
app.get('/api/teacher/attempts', requireTeacher, (req, res) => {
  const d = db();
  const myGameIds = new Set(d.games.filter((g) => g.ownerId === req.user.id).map((g) => g.id));
  let list = d.attempts.filter((a) => myGameIds.has(a.gameId) || a.ownerId === req.user.id);
  if (req.query.gameId) list = list.filter((a) => a.gameId === req.query.gameId);
  if (req.query.classId) list = list.filter((a) => a.classId === req.query.classId);
  if (req.query.studentId) list = list.filter((a) => a.studentId === req.query.studentId);
  list = list.slice().sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  list.forEach((a) => { if (!a.seen) a.seen = true; });
  store.save();
  res.json(list.map((a) => {
    const st = d.users.find((u) => u.id === a.studentId);
    const cls = d.classes.find((c) => c.id === a.classId);
    return Object.assign({}, a, { studentAvatar: st ? st.avatar : '🧑‍🎓', studentUsername: st ? st.username : '', className: cls ? cls.name : '-' });
  }));
});

app.get('/api/teacher/attempt/:id', requireTeacher, (req, res) => {
  const d = db();
  const a = d.attempts.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Tidak ditemukan.' });
  const qs = d.questions.filter((q) => q.gameId === a.gameId);
  const byId = new Map(qs.map((q) => [q.id, q]));
  res.json({
    attempt: a,
    review: (a.answers || []).map((ans) => {
      const q = byId.get(ans.questionId);
      return { prompt: ans.prompt, type: ans.type, given: ans.given, correct: ans.correct, answer: q ? q.answer : null, explanation: q ? q.explanation : '', seconds: ans.seconds, image: q ? (q.image || null) : null };
    }),
  });
});

app.get('/api/teacher/analytics', requireTeacher, (req, res) => {
  const d = db();
  const myGames = d.games.filter((g) => g.ownerId === req.user.id);
  const myGameIds = new Set(myGames.map((g) => g.id));
  const attempts = d.attempts.filter((a) => myGameIds.has(a.gameId));
  const classes = classesFor(req.user.id);

  const perGame = myGames.map((g) => {
    const list = attempts.filter((a) => a.gameId === g.id);
    return {
      id: g.id, title: g.title, cover: g.cover,
      attempts: list.length,
      students: new Set(list.map((a) => a.studentId)).size,
      avg: list.length ? Math.round(list.reduce((s, a) => s + a.percent, 0) / list.length) : 0,
      best: list.length ? Math.max(...list.map((a) => a.percent)) : 0,
    };
  });

  const perSubject = {};
  attempts.forEach((a) => {
    const k = a.subjectName || '-';
    perSubject[k] = perSubject[k] || { name: k, total: 0, sum: 0 };
    perSubject[k].total++;
    perSubject[k].sum += a.percent;
  });
  const subjects = Object.values(perSubject).map((s) => ({ name: s.name, count: s.total, avg: Math.round(s.sum / s.total) }));

  // analisis butir: soal tersulit
  const qStats = new Map();
  attempts.forEach((a) => (a.answers || []).forEach((ans) => {
    const k = ans.questionId;
    if (!k) return;
    qStats.set(k, qStats.get(k) || { questionId: k, prompt: ans.prompt, right: 0, wrong: 0 });
    const st = qStats.get(k);
    if (ans.correct) st.right++; else st.wrong++;
  }));
  const hardest = Array.from(qStats.values()).map((s) => Object.assign(s, { rate: s.right + s.wrong ? Math.round((s.right / (s.right + s.wrong)) * 100) : 0 })).sort((a, b) => a.rate - b.rate).slice(0, 5);

  const leaderboard = d.users.filter((u) => u.role === 'student' && (u.classIds || []).some((c) => classes.some((k) => k.id === c)))
    .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, color: u.color, points: attempts.filter((a) => a.studentId === u.id).reduce((s, a) => s + a.score, 0), avg: (() => { const arr = attempts.filter((a) => a.studentId === u.id); return arr.length ? Math.round(arr.reduce((s, a) => s + a.percent, 0) / arr.length) : 0; })(), plays: attempts.filter((a) => a.studentId === u.id).length }))
    .sort((a, b) => b.points - a.points);

  // 7 hari terakhir
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000);
    const key = dt.toISOString().slice(0, 10);
    days.push({ date: key, label: dt.toLocaleDateString('id-ID', { weekday: 'short' }), count: attempts.filter((a) => (a.finishedAt || '').slice(0, 10) === key).length, avg: (() => { const arr = attempts.filter((a) => (a.finishedAt || '').slice(0, 10) === key); return arr.length ? Math.round(arr.reduce((s, a) => s + a.percent, 0) / arr.length) : 0; })() });
  }

  res.json({
    totalStudents: d.users.filter((u) => u.role === 'student' && (u.classIds || []).some((c) => classes.some((k) => k.id === c))).length,
    totalAttempts: attempts.length,
    avgScore: attempts.length ? Math.round(attempts.reduce((s, a) => s + a.percent, 0) / attempts.length) : 0,
    totalGames: myGames.length,
    unread: attempts.filter((a) => !a.seen).length,
    perGame, subjects, hardest, leaderboard, days, classes,
    insight: engine.insightFromAttempts(attempts.slice(-40)),
  });
});

app.get('/api/teacher/export.csv', requireTeacher, (req, res) => {
  const d = db();
  const myGameIds = new Set(d.games.filter((g) => g.ownerId === req.user.id).map((g) => g.id));
  const attempts = d.attempts.filter((a) => myGameIds.has(a.gameId));
  const rows = [['Tanggal', 'Siswa', 'Kelas', 'Mata Pelajaran', 'Game', 'Benar', 'Total Soal', 'Nilai', 'Persen', 'Waktu (detik)']];
  attempts.forEach((a) => {
    const cls = d.classes.find((c) => c.id === a.classId);
    rows.push([
      (a.finishedAt || '').replace('T', ' ').slice(0, 19), a.studentName, cls ? cls.name : '-',
      a.subjectName || '-', a.gameTitle, a.correct, a.total, a.score + '/' + a.maxScore, a.percent, a.timeSpent,
    ]);
  });
  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nilai-siswa-${Date.now()}.csv"`);
  res.send(csv);
});

/* ------------------------------- ekspor HTML ------------------------------ */
app.get('/api/teacher/export-html', requireTeacher, (req, res) => {
  const d = db();
  const teacher = req.user;
  const snapshot = {
    exportedAt: now(),
    settings: Object.assign({}, d.settings, { aiApiKey: '' }),
    users: d.users.filter((u) => u.role === 'teacher' ? u.id === teacher.id : (u.classIds || []).some((c) => d.classes.some((k) => k.ownerId === teacher.id && k.id === c))),
    subjects: d.subjects.filter((s) => s.ownerId === teacher.id),
    topics: d.topics.filter((t) => d.subjects.some((s) => s.id === t.subjectId && s.ownerId === teacher.id)),
    classes: d.classes.filter((c) => c.ownerId === teacher.id),
    games: d.games.filter((g) => g.ownerId === teacher.id),
    questions: d.questions.filter((q) => d.games.some((g) => g.id === q.gameId && g.ownerId === teacher.id)),
    materials: d.materials.filter((m) => m.ownerId === teacher.id),
    attempts: d.attempts.filter((a) => d.games.some((g) => g.id === a.gameId && g.ownerId === teacher.id)),
    badges: d.badges,
    sessions: [], logs: [], meta: d.meta,
  };
  // hapus hash password -> mode offline pakai password polos tersimpan lokal
  snapshot.users = snapshot.users.map((u) => { const { pass, ...rest } = u; return Object.assign(rest, { offlinePass: u.username === teacher.username ? '' : '' }); });

  const pub = path.join(__dirname, 'public');
  const css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8');
  const js = ['js/qrcode.js', 'js/qr.js', 'js/ai-engine.js', 'js/util.js', 'js/game.js', 'js/app.js']
    .map((f) => `/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(pub, f), 'utf8'))
    .join('\n');
  const html = buildOfflineHtml(css, js, snapshot);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="petualangan-belajar-offline.html"`);
  res.send(html);
});

function buildOfflineHtml(css, js, snapshot) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Petualangan Belajar — Mode Offline</title>
<style>${css}</style>
</head><body>
<div id="app"></div>
<script>window.PB_OFFLINE=1;window.PB_SEED=${JSON.stringify(snapshot).replace(/<\/script>/gi, '<\\/script>')};</script>
<script>${js.replace(/<\/script>/gi, '<\\/script>')}</script>
</body></html>`;
}

/* ---------------------------------- reset --------------------------------- */
app.post('/api/admin/reset-demo', requireTeacher, (req, res) => {
  seed(true);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: now(), mode: process.env.PB_OFFLINE ? 'offline' : 'server' }));

/* --------------------------------- boot ----------------------------------- */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  // pulihkan data dari GitHub bila sync aktif (sebelum database dibaca)
  const syncInfo = await sync.pull().catch((e) => ({ restored: false, reason: e.message }));
  if (syncInfo && syncInfo.restored) console.log('[sync] database dipulihkan dari GitHub.');

  const seedResult = seed(false);
  if (!seedResult.skipped) {
    console.log('[seed] data contoh dibuat:', JSON.stringify({ games: seedResult.games, questions: seedResult.questions, attempts: seedResult.attempts }));
  }

  app.listen(PORT, HOST, () => {
    sync.start();
    console.log('');
  console.log('  🎮  Petualangan Belajar siap dimainkan!');
  console.log(`      Lokal   : http://localhost:${PORT}`);
  console.log(`      Jaringan: http://0.0.0.0:${PORT}  (buka IP komputer ini dari HP siswa)`);
    console.log('      Login guru demo : guru / guru123');
    console.log('      Login siswa demo: andi, siti, budi, lani, rina, dayu / 123456');
    console.log('');
  });
})();
