/* Utilitas: API, DOM, format. Dipakai mode server maupun mode offline. */
window.PB = window.PB || {};

(function () {
  const OFFLINE = Boolean(window.PB_OFFLINE);
  const CLOUD = Boolean(window.PB_CLOUD && window.PB_CLOUD.rtdbUrl);
  const LS_KEY = 'pb_offline_db_v1';

  /* Penyimpanan aman: bila localStorage diblokir (mis. iframe sandbox / mode privat),
     otomatis pakai penyimpanan sementara di memori agar aplikasi tetap jalan. */
  const safeLS = (function () {
    try {
      const t = '__pb_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return window.localStorage;
    } catch (e) {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        _inMemory: true,
      };
    }
  })();

  /* ------------------------------- HTTP API ------------------------------- */
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error((data && data.error) || `Gagal (${res.status})`);
    return data;
  }

  /* ------------------------------ API offline ------------------------------ */
  function loadOffline() {
    try {
      const raw = safeLS.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const seedData = JSON.parse(JSON.stringify(window.PB_SEED || {}));
    safeLS.setItem(LS_KEY, JSON.stringify(seedData));
    return seedData;
  }
  function saveOffline(d) { safeLS.setItem(LS_KEY, JSON.stringify(d)); }
  let offlineDb = OFFLINE ? loadOffline() : null;
  let offlineSession = OFFLINE ? (safeLS.getItem('pb_offline_user') || null) : null;

  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const code = (n) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const nowIso = () => new Date().toISOString();

  function offlineUser() { return offlineDb.users.find((u) => u.id === offlineSession) || null; }

  function gradeAnswer(q, given) {
    const n = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (given == null) return false;
    if (q.type === 'mc' || q.type === 'tf') return n(given) === n(q.answer);
    if (q.type === 'fill') {
      const a = n(q.answer), g = n(given);
      if (!a) return false;
      if (g === a) return true;
      const words = a.split(' ');
      return words.filter((w) => g.includes(w)).length >= Math.max(1, words.length - 1);
    }
    if (q.type === 'order') return Array.isArray(given) && given.length === q.answer.length && given.every((v, i) => n(v) === n(q.answer[i]));
    if (q.type === 'match') {
      if (!Array.isArray(given)) return false;
      const m = new Map(given.map((g2) => [n(g2.left), n(g2.right)]));
      return q.answer.every((p) => m.get(n(p.left)) === n(p.right));
    }
    return false;
  }

  function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

  /* Generator soal offline ringan (cadangan bila AI server tidak tersedia) */
  function localGenerate(opts) {
    const lines = String(opts.material || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const pairs = [];
    lines.forEach((l) => {
      let m = l.match(/^\s*[-*•]?\s*(.{3,45}?)\s*[:=]\s+(.{8,})$/);
      if (!m) m = l.match(/^(.{3,50}?)\s+(?:adalah|yaitu|merupakan|ialah)\s+(.{8,})$/i);
      if (m) pairs.push({ term: m[1].replace(/^[-*•]\s*/, ''), def: m[2] });
    });
    const qs = [];
    pairs.slice(0, opts.count || 8).forEach((p, i) => {
      const def = p.def.replace(/[.]$/, '');
      const others = pairs.filter((x) => x.term !== p.term).map((x) => x.def.replace(/[.]$/, '').slice(0, 60));
      if ((opts.types || ['mc']).includes('mc')) {
        qs.push({ type: 'mc', prompt: `Apa yang dimaksud dengan ${p.term}?`, answer: def.slice(0, 80), options: shuffle([def.slice(0, 80), ...others].slice(0, 4)), points: 10, explanation: `${p.term} adalah ${p.def}`, difficulty: 'sedang' });
      }
      if ((opts.types || []).includes('tf')) {
        qs.push({ type: 'tf', prompt: `Benar atau salah: ${p.term} adalah ${def.slice(0, 70)}.`, answer: 'benar', options: ['benar', 'salah'], points: 10, explanation: p.def, difficulty: 'mudah' });
      }
    });
    return qs.slice(0, opts.count || 8).map((q, i) => Object.assign(q, { id: uid('q'), order: i + 1, source: 'offline-lokal' }));
  }

  /* --------------------------- API tersatukan ----------------------------- */
  const client = {
    offline: OFFLINE,
    gradeAnswer,
    shuffle,
    localGenerate,

    async me() {
      if (OFFLINE) {
        const u = offlineUser();
        return { user: u ? { id: u.id, role: u.role, name: u.name, username: u.username, avatar: u.avatar, color: u.color, gradeLevel: u.gradeLevel, classIds: u.classIds } : null, settings: offlineDb.settings };
      }
      return api('/api/me');
    },
    async login(username, password) {
      if (OFFLINE) {
        const u = offlineDb.users.find((x) => x.username === String(username).trim().toLowerCase());
        if (!u) throw new Error('Username tidak ditemukan.');
        offlineSession = u.id;
        safeLS.setItem('pb_offline_user', u.id);
        return { user: u };
      }
      return api('/api/auth/login', { method: 'POST', body: { username, password } });
    },
    async register(payload) {
      if (OFFLINE) {
        if (offlineDb.users.some((u) => u.username === payload.username.toLowerCase())) throw new Error('Username sudah dipakai.');
        const u = Object.assign({ id: uid('usr'), avatar: payload.role === 'teacher' ? '👩‍🏫' : '🧑‍🎓', color: '#6366f1', points: 0, classIds: [], createdAt: nowIso() }, payload, { username: payload.username.toLowerCase() });
        offlineDb.users.push(u);
        if (u.role === 'teacher') {
          ['Matematika', 'Bahasa Indonesia', 'IPA'].forEach((n) => offlineDb.subjects.push({ id: uid('sub'), ownerId: u.id, name: n, jenjang: 'sd', icon: '📘', color: '#6366f1' }));
        }
        saveOffline(offlineDb);
        offlineSession = u.id;
        safeLS.setItem('pb_offline_user', u.id);
        return { user: u };
      }
      return api('/api/auth/register', { method: 'POST', body: payload });
    },
    async logout() {
      if (OFFLINE) { offlineSession = null; safeLS.removeItem('pb_offline_user'); return { ok: true }; }
      return api('/api/auth/logout', { method: 'POST' });
    },

    async subjects() {
      if (OFFLINE) {
        const u = offlineUser();
        const list = u.role === 'teacher' ? offlineDb.subjects.filter((s) => s.ownerId === u.id) : offlineDb.subjects;
        return list.map((s) => Object.assign({}, s, { topics: offlineDb.topics.filter((t) => t.subjectId === s.id), games: offlineDb.games.filter((g) => g.subjectId === s.id).length }));
      }
      return api('/api/subjects');
    },
    async saveSubject(payload) {
      if (OFFLINE) {
        const u = offlineUser();
        const s = Object.assign({ id: uid('sub'), ownerId: u.id, createdAt: nowIso(), icon: '📘', color: '#6366f1', jenjang: 'sd' }, payload);
        offlineDb.subjects.push(s);
        (payload.topics || []).forEach((t, i) => offlineDb.topics.push({ id: uid('top'), subjectId: s.id, name: t, order: i + 1 }));
        saveOffline(offlineDb);
        return { subject: s };
      }
      return api('/api/subjects', { method: 'POST', body: payload });
    },
    async updateSubject(id, payload) {
      if (OFFLINE) { const s = offlineDb.subjects.find((x) => x.id === id); Object.assign(s, payload); saveOffline(offlineDb); return { subject: s }; }
      return api('/api/subjects/' + id, { method: 'PUT', body: payload });
    },
    async deleteSubject(id) {
      if (OFFLINE) {
        const games = offlineDb.games.filter((g) => g.subjectId === id).map((g) => g.id);
        offlineDb.games = offlineDb.games.filter((g) => g.subjectId !== id);
        offlineDb.questions = offlineDb.questions.filter((q) => !games.includes(q.gameId));
        offlineDb.topics = offlineDb.topics.filter((t) => t.subjectId !== id);
        offlineDb.subjects = offlineDb.subjects.filter((s) => s.id !== id);
        saveOffline(offlineDb); return { ok: true };
      }
      return api('/api/subjects/' + id, { method: 'DELETE' });
    },
    async addTopic(subjectId, name) {
      if (OFFLINE) {
        const t = { id: uid('top'), subjectId, name, order: offlineDb.topics.filter((x) => x.subjectId === subjectId).length + 1 };
        offlineDb.topics.push(t); saveOffline(offlineDb); return { topic: t };
      }
      return api(`/api/subjects/${subjectId}/topics`, { method: 'POST', body: { name } });
    },
    async deleteTopic(id) {
      if (OFFLINE) { offlineDb.topics = offlineDb.topics.filter((t) => t.id !== id); saveOffline(offlineDb); return { ok: true }; }
      return api('/api/topics/' + id, { method: 'DELETE' });
    },

    async materials() {
      if (OFFLINE) { const u = offlineUser(); return offlineDb.materials.filter((m) => u.role === 'teacher' ? m.ownerId === u.id : true); }
      return api('/api/materials');
    },
    async saveMaterial(payload) {
      if (OFFLINE) {
        const u = offlineUser();
        const m = Object.assign({ id: uid('mat'), ownerId: u.id, createdAt: nowIso(), jenjang: 'sd' }, payload);
        offlineDb.materials.unshift(m); saveOffline(offlineDb); return { material: m };
      }
      return api('/api/materials', { method: 'POST', body: payload });
    },
    async deleteMaterial(id) {
      if (OFFLINE) { offlineDb.materials = offlineDb.materials.filter((m) => m.id !== id); saveOffline(offlineDb); return { ok: true }; }
      return api('/api/materials/' + id, { method: 'DELETE' });
    },

    async classes() {
      if (OFFLINE) {
        const u = offlineUser();
        return offlineDb.classes.filter((c) => c.ownerId === u.id).map((c) => Object.assign({}, c, {
          students: c.studentIds.map((sid) => offlineDb.users.find((x) => x.id === sid)).filter(Boolean).map((s) => {
            const atts = offlineDb.attempts.filter((a) => a.studentId === s.id);
            return { id: s.id, name: s.name, username: s.username, avatar: s.avatar, color: s.color, attempts: atts.length, avg: atts.length ? Math.round(atts.reduce((x, a) => x + a.percent, 0) / atts.length) : 0, points: atts.reduce((x, a) => x + a.score, 0) };
          }),
        }));
      }
      return api('/api/classes');
    },
    async saveClass(payload) {
      if (OFFLINE) {
        const u = offlineUser();
        const c = { id: uid('cls'), ownerId: u.id, studentIds: [], createdAt: nowIso(), joinCode: code(6), jenjang: 'sd', name: payload.name };
        offlineDb.classes.push(c); saveOffline(offlineDb); return { klass: c };
      }
      return api('/api/classes', { method: 'POST', body: payload });
    },
    async updateClass(id, payload) {
      if (OFFLINE) { const c = offlineDb.classes.find((x) => x.id === id); Object.assign(c, payload); if (payload.resetCode) c.joinCode = code(6); saveOffline(offlineDb); return { klass: c }; }
      return api('/api/classes/' + id, { method: 'PUT', body: payload });
    },
    async deleteClass(id) {
      if (OFFLINE) {
        const c = offlineDb.classes.find((x) => x.id === id);
        if (c) c.studentIds.forEach((sid) => { const u = offlineDb.users.find((x) => x.id === sid); if (u) u.classIds = (u.classIds || []).filter((x) => x !== id); });
        offlineDb.classes = offlineDb.classes.filter((x) => x.id !== id); saveOffline(offlineDb); return { ok: true };
      }
      return api('/api/classes/' + id, { method: 'DELETE' });
    },
    async addStudent(classId, payload) {
      if (OFFLINE) {
        const c = offlineDb.classes.find((x) => x.id === classId);
        let uname = String(payload.username || payload.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        let n = 1; while (offlineDb.users.some((u) => u.username === uname)) uname = uname + (++n);
        const s = { id: uid('usr'), role: 'student', name: payload.name, username: uname, gradeLevel: c.jenjang, avatar: '🧑‍🎓', color: '#6366f1', classIds: [classId], points: 0, createdAt: nowIso() };
        offlineDb.users.push(s); c.studentIds.push(s.id); saveOffline(offlineDb);
        return { student: { id: s.id, name: s.name, username: s.username, password: payload.password || '123456' } };
      }
      return api(`/api/classes/${classId}/students`, { method: 'POST', body: payload });
    },
    async importStudents(classId, names, password) {
      if (OFFLINE) {
        const created = [];
        names.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean).forEach((nm) => {
          const r = client.addStudent(classId, { name: nm, password });
          created.push(nm);
        });
        return { created };
      }
      return api(`/api/classes/${classId}/import`, { method: 'POST', body: { names, password } });
    },
    async removeStudent(classId, sid) {
      if (OFFLINE) { const c = offlineDb.classes.find((x) => x.id === classId); if (c) c.studentIds = c.studentIds.filter((x) => x !== sid); saveOffline(offlineDb); return { ok: true }; }
      return api(`/api/classes/${classId}/students/${sid}`, { method: 'DELETE' });
    },
    async joinClass(joinCode) {
      if (OFFLINE) {
        const c = offlineDb.classes.find((x) => x.joinCode === joinCode.toUpperCase());
        if (!c) throw new Error('Kode kelas tidak ditemukan.');
        const u = offlineDb.users.find((x) => x.id === offlineSession);
        if (!c.studentIds.includes(u.id)) c.studentIds.push(u.id);
        u.classIds = Array.from(new Set([...(u.classIds || []), c.id]));
        saveOffline(offlineDb);
        return { klass: c };
      }
      return api('/api/join-class', { method: 'POST', body: { code: joinCode } });
    },

    async games() {
      if (OFFLINE) {
        const u = offlineUser();
        let list;
        if (u.role === 'teacher') list = offlineDb.games.filter((g) => g.ownerId === u.id);
        else {
          const mine = u.classIds || [];
          list = offlineDb.games.filter((g) => g.status === 'published' && ((g.classIds || []).some((c) => mine.includes(c)) || !(g.classIds || []).length));
        }
        return list.map((g) => {
          const s = offlineDb.subjects.find((x) => x.id === g.subjectId);
          const atts = offlineDb.attempts.filter((a) => a.gameId === g.id && (u.role === 'student' ? a.studentId === u.id : true));
          return {
            id: g.id, title: g.title, desc: g.desc, cover: g.cover, mode: g.mode, status: g.status, shareCode: g.shareCode,
            subjectName: s ? s.name : '', subjectIcon: s ? s.icon : '📘', subjectColor: s ? s.color : '#6366f1',
            topicName: g.topicName || '', classIds: g.classIds || [],
            questionCount: offlineDb.questions.filter((q) => q.gameId === g.id).length,
            attempts: atts.length, bestScore: atts.length ? Math.max(...atts.map((a) => a.percent)) : null,
            avg: atts.length ? Math.round(atts.reduce((x, a) => x + a.percent, 0) / atts.length) : null,
          };
        });
      }
      return api('/api/games');
    },
    async game(id) {
      if (OFFLINE) {
        const g = offlineDb.games.find((x) => x.id === id);
        const s = offlineDb.subjects.find((x) => x.id === g.subjectId);
        return {
          game: Object.assign({}, g, { subjectName: s ? s.name : '', subjectIcon: s ? s.icon : '📘', topics: offlineDb.topics.filter((t) => t.subjectId === g.subjectId), attempts: offlineDb.attempts.filter((a) => a.gameId === id) }),
          questions: offlineDb.questions.filter((q) => q.gameId === id).sort((a, b) => (a.order || 0) - (b.order || 0)),
        };
      }
      return api('/api/games/' + id);
    },
    async saveGame(payload) {
      if (OFFLINE) {
        const u = offlineUser();
        const g = Object.assign({ id: uid('game'), ownerId: u.id, createdAt: nowIso(), updatedAt: nowIso(), shareCode: code(6), status: 'draft', settings: { timer: 0, showExplanation: true, shuffle: true, passScore: 70 } }, payload);
        offlineDb.games.push(g);
        (payload.questions || []).forEach((q, i) => offlineDb.questions.push(Object.assign({ id: uid('q'), gameId: g.id, order: i + 1, points: 10 }, q)));
        saveOffline(offlineDb);
        return { game: g };
      }
      return api('/api/games', { method: 'POST', body: payload });
    },
    async updateGame(id, payload) {
      if (OFFLINE) {
        const g = offlineDb.games.find((x) => x.id === id);
        Object.assign(g, payload, { updatedAt: nowIso() });
        if (Array.isArray(payload.questions)) {
          offlineDb.questions = offlineDb.questions.filter((q) => q.gameId !== id);
          payload.questions.forEach((q, i) => offlineDb.questions.push(Object.assign({ id: uid('q'), gameId: id, order: i + 1 }, q)));
        }
        saveOffline(offlineDb);
        return { game: g };
      }
      return api('/api/games/' + id, { method: 'PUT', body: payload });
    },
    async deleteGame(id) {
      if (OFFLINE) {
        offlineDb.games = offlineDb.games.filter((g) => g.id !== id);
        offlineDb.questions = offlineDb.questions.filter((q) => q.gameId !== id);
        offlineDb.attempts = offlineDb.attempts.filter((a) => a.gameId !== id);
        saveOffline(offlineDb); return { ok: true };
      }
      return api('/api/games/' + id, { method: 'DELETE' });
    },

    async aiPreview(payload) {
      if (OFFLINE) {
        if (window.PB_AI) return { questions: window.PB_AI.generateQuestions(payload).map((q) => Object.assign({ source: 'offline' }, q)), engine: 'PB-AI offline (lengkap)' };
        return { questions: localGenerate(payload), engine: 'offline-lokal (mode 1 file HTML)' };
      }
      return api('/api/ai/preview', { method: 'POST', body: payload });
    },
    async lessonPlan(payload) {
      if (OFFLINE) return { plan: { jenjang: payload.level || '', tujuan: ['Siswa mampu menjelaskan ' + (payload.topic || 'materi')], aktivitas: ['Baca materi', 'Mainkan game', 'Refleksi'], ringkasan: String(payload.material || '').slice(0, 400), kataKunci: [], saranGame: 'Pilihan ganda & benar/salah' } };
      return api('/api/ai/lesson-plan', { method: 'POST', body: payload });
    },
    async settings() {
      if (OFFLINE) return Object.assign({}, offlineDb.settings, { aiApiKey: '' });
      return api('/api/settings');
    },
    async saveSettings(payload) {
      if (OFFLINE) { Object.assign(offlineDb.settings, payload); saveOffline(offlineDb); return { ok: true }; }
      return api('/api/settings', { method: 'POST', body: payload });
    },

    async play(joinCode) {
      if (OFFLINE) {
        const g = offlineDb.games.find((x) => x.shareCode === joinCode.toUpperCase() || x.id === joinCode);
        if (!g || g.status !== 'published') throw new Error('Kode game tidak ditemukan atau belum dipublikasikan.');
        const qs = shuffle(offlineDb.questions.filter((q) => q.gameId === g.id));
        if (!qs.length) throw new Error('Game ini belum punya soal.');
        const s = offlineDb.subjects.find((x) => x.id === g.subjectId);
        return {
          game: { id: g.id, title: g.title, desc: g.desc, cover: g.cover, mode: g.mode, subjectName: s ? s.name : '', subjectIcon: s ? s.icon : '📘', subjectColor: s ? s.color : '#6366f1', topicName: g.topicName || '', settings: g.settings || {} },
          questions: qs.map((q, i) => Object.assign({ index: i }, q)),
        };
      }
      return api('/api/play/' + joinCode);
    },
    async checkAnswer(gameId, q, given) {
      if (OFFLINE) {
        const correct = gradeAnswer(q, given);
        return { ok: true, correct, answer: q.answer, explanation: q.explanation || '', points: q.points || 10 };
      }
      return api('/api/check', { method: 'POST', body: { gameId, questionId: q.id, given } });
    },
    async submitAttempt(payload) {
      if (OFFLINE) {
        const u = offlineUser();
        const g = offlineDb.games.find((x) => x.id === payload.gameId);
        const qs = offlineDb.questions.filter((q) => q.gameId === g.id);
        const byId = new Map(qs.map((q) => [q.id, q]));
        const answers = (payload.answers || []).filter((a) => byId.has(a.questionId)).map((a) => {
          const q = byId.get(a.questionId);
          const correct = gradeAnswer(q, a.given);
          return { questionId: q.id, prompt: q.prompt, type: q.type, given: a.given, correct, points: correct ? (q.points || 10) : 0, seconds: a.seconds || 0 };
        });
        const maxScore = qs.reduce((s2, q) => s2 + (q.points || 10), 0);
        const baseScore = answers.reduce((s2, a) => s2 + (a.correct ? (byId.get(a.questionId).points || 10) : 0), 0);
        const score = answers.reduce((s2, a) => s2 + a.points, 0);
        const percent = maxScore ? Math.round((baseScore / maxScore) * 1000) / 10 : 0;
        const att = {
          id: uid('att'), gameId: g.id, gameTitle: g.title, subjectName: (offlineDb.subjects.find((s) => s.id === g.subjectId) || {}).name || '',
          ownerId: g.ownerId, studentId: u.id, studentName: u.name, studentAvatar: u.avatar,
          classId: (u.classIds || [])[0] || null, score, baseScore, maxScore, percent,
          correct: answers.filter((a) => a.correct).length, total: qs.length,
          timeSpent: answers.reduce((s2, a) => s2 + (a.seconds || 0), 0),
          answers, startedAt: payload.startedAt || nowIso(), finishedAt: nowIso(), seen: false,
        };
        offlineDb.attempts.push(att);
        u.points = (u.points || 0) + score;
        const badges = [];
        if (percent === 100) badges.push('🏆 Nilai Sempurna');
        if (percent >= 80) badges.push('🌟 Hebat');
        badges.forEach((n) => offlineDb.badges.push({ id: uid('bdg'), studentId: u.id, name: n, at: nowIso(), gameId: g.id }));
        saveOffline(offlineDb);
        const rank = offlineDb.attempts.filter((a) => a.gameId === g.id).sort((a, b) => b.score - a.score).findIndex((a) => a.id === att.id) + 1;
        return { attempt: { id: att.id, score, maxScore, percent, correct: att.correct, total: att.total, rank, badges }, teacherName: (offlineDb.users.find((x) => x.id === g.ownerId) || {}).name };
      }
      return api('/api/attempts', { method: 'POST', body: payload });
    },
    async myAttempts() {
      if (OFFLINE) {
        const u = offlineUser();
        return offlineDb.attempts.filter((a) => a.studentId === u.id).sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).map((a) => ({ id: a.id, gameTitle: a.gameTitle, subjectName: a.subjectName, percent: a.percent, score: a.score, maxScore: a.maxScore, correct: a.correct, total: a.total, finishedAt: a.finishedAt, timeSpent: a.timeSpent }));
      }
      return api('/api/my/attempts');
    },
    async attempt(id) {
      if (OFFLINE) {
        const a = offlineDb.attempts.find((x) => x.id === id);
        const byId = new Map(offlineDb.questions.filter((q) => q.gameId === a.gameId).map((q) => [q.id, q]));
        return { attempt: a, review: (a.answers || []).map((ans) => { const q = byId.get(ans.questionId); return { prompt: ans.prompt, type: ans.type, given: ans.given, correct: ans.correct, answer: q ? q.answer : null, explanation: q ? q.explanation : '' }; }) };
      }
      return api('/api/my/attempt/' + id);
    },
    async teacherAttempts(params = {}) {
      if (OFFLINE) {
        const u = offlineUser();
        const ids = new Set(offlineDb.games.filter((g) => g.ownerId === u.id).map((g) => g.id));
        let list = offlineDb.attempts.filter((a) => ids.has(a.gameId));
        if (params.gameId) list = list.filter((a) => a.gameId === params.gameId);
        if (params.classId) list = list.filter((a) => a.classId === params.classId);
        if (params.studentId) list = list.filter((a) => a.studentId === params.studentId);
        return list.sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).map((a) => {
          const st = offlineDb.users.find((x) => x.id === a.studentId);
          const cls = offlineDb.classes.find((c) => c.id === a.classId);
          return Object.assign({}, a, { studentAvatar: st ? st.avatar : '🧑‍🎓', className: cls ? cls.name : '-' });
        });
      }
      const qs = new URLSearchParams(params).toString();
      return api('/api/teacher/attempts' + (qs ? '?' + qs : ''));
    },
    async teacherAttempt(id) {
      if (OFFLINE) return client.attempt(id);
      return api('/api/teacher/attempt/' + id);
    },
    async analytics() {
      if (OFFLINE) {
        const u = offlineUser();
        const games = offlineDb.games.filter((g) => g.ownerId === u.id);
        const ids = new Set(games.map((g) => g.id));
        const attempts = offlineDb.attempts.filter((a) => ids.has(a.gameId));
        const classes = await client.classes();
        const perSubject = {};
        attempts.forEach((a) => { const k = a.subjectName || '-'; perSubject[k] = perSubject[k] || { name: k, total: 0, sum: 0 }; perSubject[k].total++; perSubject[k].sum += a.percent; });
        const leaderboard = offlineDb.users.filter((x) => x.role === 'student' && (x.classIds || []).some((c) => classes.some((k) => k.id === c)))
          .map((s) => { const arr = attempts.filter((a) => a.studentId === s.id); return { id: s.id, name: s.name, avatar: s.avatar, color: s.color, points: arr.reduce((x, a) => x + a.score, 0), avg: arr.length ? Math.round(arr.reduce((x, a) => x + a.percent, 0) / arr.length) : 0, plays: arr.length }; })
          .sort((a, b) => b.points - a.points);
        return {
          totalStudents: leaderboard.length, totalAttempts: attempts.length,
          avgScore: attempts.length ? Math.round(attempts.reduce((s, a) => s + a.percent, 0) / attempts.length) : 0,
          totalGames: games.length,
          perGame: games.map((g) => { const l = attempts.filter((a) => a.gameId === g.id); return { id: g.id, title: g.title, cover: g.cover, attempts: l.length, students: new Set(l.map((a) => a.studentId)).size, avg: l.length ? Math.round(l.reduce((s, a) => s + a.percent, 0) / l.length) : 0, best: l.length ? Math.max(...l.map((a) => a.percent)) : 0 }; }),
          subjects: Object.values(perSubject).map((s) => ({ name: s.name, count: s.total, avg: Math.round(s.sum / s.total) })),
          hardest: [], leaderboard, days: [], classes,
          insight: { ringkasan: attempts.length ? `Rata-rata kelas ${Math.round(attempts.reduce((s, a) => s + a.percent, 0) / attempts.length)}% dari ${attempts.length} pengerjaan.` : 'Belum ada data.', saran: [] },
        };
      }
      return api('/api/teacher/analytics');
    },
    async updateProfile(payload) {
      if (OFFLINE) { const u = offlineDb.users.find((x) => x.id === offlineSession); Object.assign(u, payload); saveOffline(offlineDb); return { user: u }; }
      return api('/api/me', { method: 'POST', body: payload });
    },
    resetOffline() {
      if (!OFFLINE) return;
      localStorage.removeItem(LS_KEY);
      safeLS.removeItem('pb_offline_user');
      location.reload();
    },
  };

  /* --------------------------------- DOM ---------------------------------- */
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v);
    });
    children.flat(9).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  };

  const fmtDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDateShort = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-');
  const relTime = (iso) => {
    if (!iso) return '-';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return m + ' menit lalu';
    const hh = Math.floor(m / 60);
    if (hh < 24) return hh + ' jam lalu';
    const dd = Math.floor(hh / 24);
    if (dd < 30) return dd + ' hari lalu';
    return fmtDate(iso);
  };
  const fmtDuration = (sec) => {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + ' dtk';
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return `${m} mnt ${s} dtk`;
    return `${Math.floor(m / 60)} jam ${m % 60} mnt`;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, type = 'info') {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts', class: 'toasts' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast toast-' + type }, h('span', { class: 'toast-ico' }, type === 'ok' ? '✅' : type === 'err' ? '⚠️' : '💡'), h('div', {}, msg));
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3800);
  }

  function modal({ title, body, footer, wide, onClose }) {
    const overlay = h('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
    const box = h('div', { class: 'modal' + (wide ? ' modal-wide' : '') });
    box.appendChild(h('div', { class: 'modal-head' }, h('h3', {}, title || ''), h('button', { class: 'icon-btn', onclick: () => close(), 'aria-label': 'Tutup' }, '✕')));
    const content = h('div', { class: 'modal-body' });
    if (typeof body === 'string') content.innerHTML = body; else if (body) content.appendChild(body);
    box.appendChild(content);
    if (footer) { const f = h('div', { class: 'modal-foot' }); if (typeof footer === 'string') f.innerHTML = footer; else footer.forEach((x) => f.appendChild(x)); box.appendChild(f); }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    function close() { overlay.classList.remove('show'); setTimeout(() => { overlay.remove(); if (onClose) onClose(); }, 200); }
    return { el: overlay, close, content, box };
  }

  function confirmDialog(message, onYes, label = 'Ya, lanjutkan') {
    const m = modal({
      title: 'Konfirmasi',
      body: h('p', { class: 'muted' }, message),
      footer: [
        h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'),
        h('button', { class: 'btn btn-danger', onclick: () => { m.close(); onYes(); } }, label),
      ],
    });
    return m;
  }

  function confetti(count = 90) {
    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
    const layer = h('div', { class: 'confetti-layer' });
    document.body.appendChild(layer);
    for (let i = 0; i < count; i++) {
      const c = h('div', { class: 'confetti' });
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.animationDuration = 2 + Math.random() * 1.8 + 's';
      c.style.width = c.style.height = 6 + Math.random() * 8 + 'px';
      c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      layer.appendChild(c);
    }
    setTimeout(() => layer.remove(), 4200);
  }

  function ringPercent(pct, size = 132) {
    const r = (size - 14) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
    const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="12"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"
        style="transition:stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)"/>
      <text x="50%" y="47%" text-anchor="middle" fill="#fff" font-size="${size / 4.4}" font-weight="800">${Math.round(pct)}%</text>
      <text x="50%" y="62%" text-anchor="middle" fill="rgba(255,255,255,.8)" font-size="${size / 11}" font-weight="600">NILAI</text>
    </svg>`;
    return svg;
  }

  /* =====================================================================
     MODE CLOUD — Firebase Realtime Database (REST) + hosting statis.
     Semua device membaca/menulis database yang sama secara terpusat.
     ===================================================================== */
  const cloudImpl = (function () {
    if (!CLOUD) return null;
    const RT = String(window.PB_CLOUD.rtdbUrl).replace(/\/$/, '');
    let cdb = null;
    let loading = null;
    let meId = safeLS.getItem('pb_cloud_user') || null;

    const rget = async (path) => {
      const r = await fetch(RT + '/' + path + '.json');
      if (!r.ok) throw new Error('Firebase ' + r.status + ' — periksa rules & URL di config.js');
      return r.json();
    };
    const rpatch = async (path, val) => {
      const r = await fetch(RT + '/' + path + '.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) });
      if (!r.ok) throw new Error('Firebase ' + r.status);
      return r.json();
    };
    const rput = async (path, val) => {
      const r = await fetch(RT + '/' + path + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(val) });
      if (!r.ok) throw new Error('Firebase ' + r.status);
      return r.json();
    };
    const rdel = async (path) => {
      const r = await fetch(RT + '/' + path + '.json', { method: 'DELETE' });
      if (!r.ok) throw new Error('Firebase ' + r.status);
      return true;
    };

    const EMPTY = () => ({ settings: { schoolName: 'Sekolah Petualangan Belajar', aiMode: 'offline' }, users: {}, subjects: {}, topics: {}, classes: {}, games: {}, questions: {}, materials: {}, attempts: {}, badges: {} });
    const arr = (m) => Object.values(m || {});

    async function ensure() {
      if (cdb) return cdb;
      if (loading) return loading;
      loading = (async () => {
        const raw = await rget('');
        cdb = raw && raw.users ? raw : EMPTY();
        return cdb;
      })();
      return loading;
    }
    async function shaPass(salt, pass) {
      const data = new TextEncoder().encode(salt + ':' + pass);
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    const pub = (u) => { if (!u) return null; const { pass, salt, ...rest } = u; return rest; };
    const me = () => cdb.users[meId] || null;
    const myGames = () => arr(cdb.games).filter((g) => g.ownerId === meId);
    const gamesForStudent = (u) => arr(cdb.games).filter((g) => g.status === 'published' && (((g.classIds || []).some((c) => (u.classIds || []).includes(c))) || !(g.classIds || []).length));
    const qOf = (gameId) => arr((cdb.questions || {})[gameId]).sort((a, b) => (a.order || 0) - (b.order || 0));
    const attemptsOfGame = (gid) => arr(cdb.attempts).filter((a) => a.gameId === gid);
    const classesOf = (tid) => arr(cdb.classes).filter((c) => c.ownerId === tid);
    const studentsOfClasses = (clsList) => arr(cdb.users).filter((u) => u.role === 'student' && (u.classIds || []).some((c) => clsList.some((k) => k.id === c)));

    function decorateClass(c) {
      return Object.assign({}, c, {
        students: (c.studentIds || []).map((sid) => cdb.users[sid]).filter(Boolean).map((s) => {
          const atts = arr(cdb.attempts).filter((a) => a.studentId === s.id);
          return { id: s.id, name: s.name, username: s.username, avatar: s.avatar, color: s.color, attempts: atts.length, avg: atts.length ? Math.round(atts.reduce((x, a) => x + a.percent, 0) / atts.length) : 0, points: atts.reduce((x, a) => x + a.score, 0) };
        }),
      });
    }
    function decorateGame(g, u) {
      const s = cdb.subjects[g.subjectId];
      const atts = attemptsOfGame(g.id);
      const mine = u && u.role === 'student' ? atts.filter((a) => a.studentId === u.id) : atts;
      return {
        id: g.id, title: g.title, desc: g.desc, cover: g.cover, mode: g.mode, status: g.status, shareCode: g.shareCode,
        subjectId: g.subjectId, subjectName: s ? s.name : '', subjectIcon: s ? s.icon : '📘', subjectColor: s ? s.color : '#6366f1',
        topicName: g.topicName || '', classIds: g.classIds || [],
        questionCount: qOf(g.id).length, attempts: mine.length,
        bestScore: mine.length ? Math.max(...mine.map((a) => a.percent)) : null,
        avg: mine.length ? Math.round(mine.reduce((x, a) => x + a.percent, 0) / mine.length) : null,
        createdAt: g.createdAt, updatedAt: g.updatedAt,
      };
    }

    /* ----- AI online (API gaya OpenAI) untuk mode cloud ----- */
    const AI_SYSTEM = `Kamu adalah asisten pembuat soal pendidikan Bahasa Indonesia.
Balas HANYA dengan JSON valid tanpa teks lain, tanpa markdown, sesuai skema:
{"questions":[{"type":"mc|tf|fill|order|match","prompt":"...","options":["..."],"answer":"...","points":10,"explanation":"...","difficulty":"mudah|sedang|sulit"}]}
Aturan:
- type "mc": options berisi 4 pilihan, answer = teks pilihan yang benar persis.
- type "tf": options ["benar","salah"], answer "benar" atau "salah".
- type "fill": options [], answer kata/frasa singkat untuk mengisi titik-titik.
- type "order": answer = array langkah yang sudah URUT BENAR.
- type "match": answer = array objek {"left":"istilah","right":"pengertian"}.
- Soal harus bersumber dari MATERI yang diberikan, bahasa sesuai jenjang siswa, tidak menyinggung SARA.`;
    const normS = (x) => String(x == null ? '' : x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    function extractJson(text) {
      if (!text) return null;
      let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const a = t.indexOf('{'); const b = t.lastIndexOf('}');
      if (a === -1 || b === -1) return null;
      t = t.slice(a, b + 1);
      try { return JSON.parse(t); } catch (e) {
        try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; }
      }
    }
    function normalizeQuestions(raw, opts) {
      if (!raw || !Array.isArray(raw.questions)) return [];
      const allowed = ['mc', 'tf', 'fill', 'order', 'match'];
      const out = [];
      raw.questions.forEach((q, i) => {
        if (!q || !allowed.includes(q.type) || !q.prompt) return;
        const item = { id: uid('qai'), order: out.length + 1, type: q.type, prompt: String(q.prompt), options: Array.isArray(q.options) ? q.options.map(String) : [], answer: q.answer, points: Number(q.points) || (q.type === 'match' ? 25 : q.type === 'order' ? 20 : 10), explanation: q.explanation || '', difficulty: ['mudah', 'sedang', 'sulit'].includes(q.difficulty) ? q.difficulty : 'sedang', source: 'api' };
        if (item.type === 'mc') {
          if (item.options.length < 2) return;
          const correct = String(item.answer);
          if (!item.options.some((o) => normS(o) === normS(correct))) return;
          item.options = item.options.slice(0, 4);
          item.answer = item.options.find((o) => normS(o) === normS(correct));
        }
        if (item.type === 'tf') { item.options = ['benar', 'salah']; item.answer = /benar|true|ya/i.test(String(item.answer)) ? 'benar' : 'salah'; }
        if (item.type === 'order' || item.type === 'match') { if (!Array.isArray(item.answer)) return; if (item.type === 'order' && item.answer.length < 3) return; }
        if (item.type === 'fill') { item.options = []; item.answer = String(item.answer); }
        out.push(item);
      });
      return out.slice(0, opts.count || 10);
    }
    async function cloudApiGenerate(st, key, opts) {
      const base = (st.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const levelText = { 'sd-kelas-1-2': 'SD kelas 1-2', 'sd-kelas-3-4': 'SD kelas 3-4', 'sd-kelas-5-6': 'SD kelas 5-6', smp: 'SMP', sma: 'SMA/SMK' }[opts.level] || 'siswa';
      const userPrompt = `Mata pelajaran: ${opts.subject || '-'}\nTopik/materi: ${opts.topic || '-'}\nJenjang: ${levelText}\nJumlah soal: ${opts.count}\nTipe soal yang diminta: ${(opts.types || []).join(', ')}\nTingkat kesulitan: ${opts.difficulty || 'campur'}\n\nMATERI:\n"""\n${String(opts.material || '').slice(0, 12000)}\n"""\n\nBuat soal berdasarkan materi di atas.`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const res = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model: st.aiModel || 'gpt-4o-mini', temperature: 0.6, messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: userPrompt }] }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('API ' + res.status);
        const data = await res.json();
        const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        return normalizeQuestions(extractJson(content), opts);
      } finally { clearTimeout(timer); }
    }

    const impl = {
      cloud: true,
      async me() {
        await ensure();
        const u = me();
        if (!u) return { user: null, settings: cdb.settings };
        if (u.role === 'teacher') {
          const cls = classesOf(u.id);
          return { user: pub(u), settings: cdb.settings, counts: { games: myGames().length, classes: cls.length, subjects: arr(cdb.subjects).filter((x) => x.ownerId === u.id).length, attempts: arr(cdb.attempts).filter((a) => myGames().some((g) => g.id === a.gameId)).length } };
        }
        return { user: pub(u), settings: cdb.settings, classes: (u.classIds || []).map((cid) => cdb.classes[cid]).filter(Boolean), points: arr(cdb.attempts).filter((a) => a.studentId === u.id).reduce((x, a) => x + (a.score || 0), 0) };
      },
      async login(username, password) {
        await ensure();
        const u = arr(cdb.users).find((x) => x.username === String(username).trim().toLowerCase());
        if (!u) throw new Error('Username tidak ditemukan.');
        const h = await shaPass(u.salt, password);
        if (h !== u.pass) throw new Error('Password salah.');
        meId = u.id; safeLS.setItem('pb_cloud_user', u.id);
        return { user: pub(u) };
      },
      async register(payload) {
        await ensure();
        const uname = String(payload.username || '').trim().toLowerCase();
        if (!uname || arr(cdb.users).some((x) => x.username === uname)) throw new Error('Username sudah dipakai.');
        const salt = crypto.getRandomValues(new Uint8Array(6)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '');
        const u = { id: uid('usr'), role: payload.role === 'teacher' ? 'teacher' : 'student', name: String(payload.name || '').trim(), username: uname, salt, pass: await shaPass(salt, payload.password), gradeLevel: payload.gradeLevel || 'sd', avatar: payload.role === 'teacher' ? '👩‍🏫' : '🧑‍🎓', color: '#6366f1', points: 0, classIds: [], createdAt: new Date().toISOString() };
        cdb.users[u.id] = u; await rpatch('users/' + u.id, u);
        meId = u.id; safeLS.setItem('pb_cloud_user', u.id);
        return { user: pub(u) };
      },
      async logout() { meId = null; safeLS.removeItem('pb_cloud_user'); return { ok: true }; },
      async isEmpty() { await ensure(); return !arr(cdb.users).length; },
      async seedDemo() {
        await ensure();
        await new Promise((res, rej) => {
          if (window.PB_CLOUD_SEED) return res();
          const sc = document.createElement('script');
          sc.src = '/js/seed-cloud.js'; sc.onload = res; sc.onerror = () => rej(new Error('Gagal memuat seed-cloud.js'));
          document.head.appendChild(sc);
        });
        const seed = JSON.parse(JSON.stringify(window.PB_CLOUD_SEED));
        cdb = seed;
        await rput('', seed);
        return { ok: true };
      },

      async subjects() {
        await ensure(); const u = me();
        const list = u.role === 'teacher' ? arr(cdb.subjects).filter((x) => x.ownerId === u.id) : arr(cdb.subjects);
        return list.map((x) => Object.assign({}, x, { topics: arr(cdb.topics).filter((t) => t.subjectId === x.id).sort((a, b) => a.order - b.order), games: arr(cdb.games).filter((g) => g.subjectId === x.id).length }));
      },
      async saveSubject(payload) {
        await ensure(); const u = me();
        const s = Object.assign({ id: uid('sub'), ownerId: u.id, createdAt: new Date().toISOString(), icon: '📘', color: '#6366f1', jenjang: 'sd' }, payload);
        cdb.subjects[s.id] = s; await rpatch('subjects/' + s.id, s);
        (payload.topics || []).forEach((t, i) => { const tp = { id: uid('top'), subjectId: s.id, name: t, order: i + 1 }; cdb.topics[tp.id] = tp; rpatch('topics/' + tp.id, tp); });
        return { subject: s };
      },
      async updateSubject(id, payload) { await ensure(); Object.assign(cdb.subjects[id], payload); await rpatch('subjects/' + id, payload); return { subject: cdb.subjects[id] }; },
      async deleteSubject(id) {
        await ensure();
        const gids = arr(cdb.games).filter((g) => g.subjectId === id).map((g) => g.id);
        gids.forEach((gid) => { delete cdb.games[gid]; rdel('games/' + gid); delete cdb.questions[gid]; rdel('questions/' + gid); });
        arr(cdb.topics).filter((t) => t.subjectId === id).forEach((t) => { delete cdb.topics[t.id]; rdel('topics/' + t.id); });
        delete cdb.subjects[id]; await rdel('subjects/' + id);
        return { ok: true };
      },
      async addTopic(subjectId, name) {
        await ensure();
        const t = { id: uid('top'), subjectId, name, order: arr(cdb.topics).filter((x) => x.subjectId === subjectId).length + 1 };
        cdb.topics[t.id] = t; await rpatch('topics/' + t.id, t); return { topic: t };
      },
      async deleteTopic(id) { await ensure(); delete cdb.topics[id]; await rdel('topics/' + id); return { ok: true }; },

      async materials() { await ensure(); const u = me(); return arr(cdb.materials).filter((m) => u.role === 'teacher' ? m.ownerId === u.id : true); },
      async saveMaterial(payload) {
        await ensure(); const u = me();
        const m = Object.assign({ id: uid('mat'), ownerId: u.id, createdAt: new Date().toISOString(), jenjang: 'sd' }, payload);
        cdb.materials[m.id] = m; await rpatch('materials/' + m.id, m); return { material: m };
      },
      async deleteMaterial(id) { await ensure(); delete cdb.materials[id]; await rdel('materials/' + id); return { ok: true }; },

      async classes() { await ensure(); return classesOf(meId).map(decorateClass); },
      async saveClass(payload) {
        await ensure(); const u = me();
        const c = { id: uid('cls'), ownerId: u.id, studentIds: [], createdAt: new Date().toISOString(), joinCode: code(6), jenjang: payload.jenjang || 'sd', name: payload.name };
        cdb.classes[c.id] = c; await rpatch('classes/' + c.id, c); return { klass: c };
      },
      async updateClass(id, payload) {
        await ensure();
        const c = cdb.classes[id];
        if (payload.resetCode) { c.joinCode = code(6); delete payload.resetCode; }
        Object.assign(c, payload); await rpatch('classes/' + id, c); return { klass: c };
      },
      async deleteClass(id) {
        await ensure();
        const c = cdb.classes[id];
        (c.studentIds || []).forEach((sid) => { const u = cdb.users[sid]; if (u) { u.classIds = (u.classIds || []).filter((x) => x !== id); rpatch('users/' + sid, { classIds: u.classIds }); } });
        delete cdb.classes[id]; await rdel('classes/' + id); return { ok: true };
      },
      async addStudent(classId, payload) {
        await ensure();
        const c = cdb.classes[classId];
        let uname = String(payload.username || payload.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        let n = 1; while (arr(cdb.users).some((x) => x.username === uname)) uname = uname.slice(0, 10) + (++n);
        const salt = crypto.getRandomValues(new Uint8Array(6)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '');
        const pass = payload.password || '123456';
        const avs = ['🦁', '🦊', '🐼', '🐢', '🦄', '🐰', '🦋', '🐨']; const cols = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
        const s = { id: uid('usr'), role: 'student', name: String(payload.name).trim(), username: uname, salt, pass: await shaPass(salt, pass), gradeLevel: c.jenjang, avatar: avs[(c.studentIds || []).length % avs.length], color: cols[(c.studentIds || []).length % cols.length], classIds: [classId], points: 0, createdAt: new Date().toISOString() };
        cdb.users[s.id] = s; c.studentIds = [...(c.studentIds || []), s.id];
        await rpatch('users/' + s.id, s); await rpatch('classes/' + classId, { studentIds: c.studentIds });
        return { student: { id: s.id, name: s.name, username: s.username, password: pass, avatar: s.avatar, color: s.color } };
      },
      async importStudents(classId, names, password) {
        const created = [];
        for (const nm of String(names).split(/[\n,;]/).map((x) => x.trim()).filter(Boolean)) {
          const r = await impl.addStudent(classId, { name: nm, password });
          created.push({ name: nm, username: r.student.username, password: r.student.password });
        }
        return { created };
      },
      async removeStudent(classId, sid) {
        await ensure();
        const c = cdb.classes[classId];
        c.studentIds = (c.studentIds || []).filter((x) => x !== sid);
        await rpatch('classes/' + classId, { studentIds: c.studentIds });
        return { ok: true };
      },
      async joinClass(joinCode) {
        await ensure();
        const c = arr(cdb.classes).find((x) => x.joinCode === String(joinCode).trim().toUpperCase());
        if (!c) throw new Error('Kode kelas tidak ditemukan.');
        const u = me();
        if (!(c.studentIds || []).includes(u.id)) { c.studentIds = [...(c.studentIds || []), u.id]; await rpatch('classes/' + c.id, { studentIds: c.studentIds }); }
        u.classIds = Array.from(new Set([...(u.classIds || []), c.id]));
        await rpatch('users/' + u.id, { classIds: u.classIds });
        return { klass: { id: c.id, name: c.name } };
      },

      async games() { await ensure(); const u = me(); const list = u.role === 'teacher' ? myGames() : gamesForStudent(u); return list.map((g) => decorateGame(g, u)); },
      async game(id) {
        await ensure();
        const g = cdb.games[id];
        const s = cdb.subjects[g.subjectId];
        return { game: Object.assign({}, g, { subjectName: s ? s.name : '', subjectIcon: s ? s.icon : '📘', topics: arr(cdb.topics).filter((t) => t.subjectId === g.subjectId), attempts: attemptsOfGame(id) }), questions: qOf(id) };
      },
      async saveGame(payload) {
        await ensure(); const u = me();
        const g = Object.assign({ id: uid('game'), ownerId: u.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), shareCode: code(6), status: 'draft', settings: { timer: 0, showExplanation: true, shuffle: true, passScore: 70 } }, payload);
        cdb.games[g.id] = g; cdb.questions[g.id] = {};
        (payload.questions || []).forEach((q, i) => { const qq = Object.assign({ id: uid('q'), gameId: g.id, order: i + 1, points: 10 }, q); cdb.questions[g.id][qq.id] = qq; });
        await rpatch('games/' + g.id, g); await rput('questions/' + g.id, cdb.questions[g.id]);
        return { game: g };
      },
      async updateGame(id, payload) {
        await ensure();
        const g = cdb.games[id];
        Object.assign(g, payload, { updatedAt: new Date().toISOString() });
        if (Array.isArray(payload.questions)) {
          cdb.questions[id] = {};
          payload.questions.forEach((q, i) => { const qq = Object.assign({ id: q.id && !q.id.startsWith('q_') ? uid('q') : (q.id || uid('q')), gameId: id, order: i + 1 }, q); cdb.questions[id][qq.id] = qq; });
          await rput('questions/' + id, cdb.questions[id]);
          delete payload.questions;
        }
        await rpatch('games/' + id, g);
        return { game: g };
      },
      async deleteGame(id) {
        await ensure();
        delete cdb.games[id]; delete cdb.questions[id];
        arr(cdb.attempts).filter((a) => a.gameId === id).forEach((a) => { delete cdb.attempts[a.id]; rdel('attempts/' + a.id); });
        await rdel('games/' + id); await rdel('questions/' + id);
        return { ok: true };
      },

      async aiPreview(payload) {
        const offlineGen = (label) => window.PB_AI
          ? { questions: window.PB_AI.generateQuestions(payload).map((q) => Object.assign({ source: 'offline' }, q)), engine: label }
          : { questions: localGenerate(payload), engine: label };
        const st = await impl.settings();
        const key = safeLS.getItem('pb_cloud_aikey') || '';
        const mode = st.aiMode || 'auto';
        if (key && mode !== 'offline') {
          try {
            const qs = await cloudApiGenerate(st, key, payload);
            if (qs && qs.length) return { questions: qs, engine: 'api (' + (st.aiModel || 'model') + ')' };
            return offlineGen('offline (respons API tidak valid)');
          } catch (e) {
            return offlineGen('offline (API gagal: ' + e.message + ')');
          }
        }
        return offlineGen(window.PB_AI ? 'PB-AI (mode cloud)' : 'AI bawaan lite (mode cloud)');
      },
      async lessonPlan(payload) {
        if (window.PB_AI) return { plan: window.PB_AI.lessonPlan(payload) };
        return { plan: { jenjang: payload.level || '', tujuan: ['Siswa mampu menjelaskan ' + (payload.topic || 'materi') + ' dengan bahasa sendiri.'], aktivitas: ['Apersepsi (5 menit)', 'Eksplorasi materi (10 menit)', 'Bermain game (15 menit)', 'Refleksi (5 menit)'], ringkasan: String(payload.material || '').slice(0, 400), kataKunci: [], saranGame: 'Pilihan ganda & benar/salah' } };
      },
      async settings() {
        await ensure();
        const s = Object.assign({}, cdb.settings);
        delete s.aiApiKey;
        s.aiKeySet = Boolean(safeLS.getItem('pb_cloud_aikey'));
        s.aiApiKey = '';
        return s;
      },
      async saveSettings(payload) {
        await ensure();
        const p = Object.assign({}, payload);
        if (p.aiApiKey !== undefined) {
          const k = String(p.aiApiKey || '').trim();
          if (k) safeLS.setItem('pb_cloud_aikey', k);
          delete p.aiApiKey;
        }
        Object.assign(cdb.settings, p);
        await rpatch('settings', p);
        return { ok: true };
      },

      async play(joinCode) {
        await ensure();
        const g = arr(cdb.games).find((x) => x.shareCode === String(joinCode).trim().toUpperCase() || x.id === joinCode);
        if (!g || g.status !== 'published') throw new Error('Kode game tidak ditemukan atau belum dipublikasikan.');
        const qs = qOf(g.id);
        if (!qs.length) throw new Error('Game ini belum punya soal.');
        const s = cdb.subjects[g.subjectId];
        return {
          game: { id: g.id, title: g.title, desc: g.desc, cover: g.cover, mode: g.mode, subjectName: s ? s.name : '', subjectIcon: s ? s.icon : '📘', subjectColor: s ? s.color : '#6366f1', topicName: g.topicName || '', settings: g.settings || {} },
          questions: shuffle(qs).map((q, i) => Object.assign({ index: i }, q)),
        };
      },
      async checkAnswer(gameId, q, given) {
        const correct = gradeAnswer(q, given);
        return { ok: true, correct, answer: q.answer, explanation: q.explanation || '', points: q.points || 10 };
      },
      async submitAttempt(payload) {
        await ensure();
        const u = me();
        const g = cdb.games[payload.gameId];
        const qs = qOf(g.id);
        const byId = new Map(qs.map((q) => [q.id, q]));
        const answers = (payload.answers || []).filter((a) => byId.has(a.questionId)).map((a) => {
          const q = byId.get(a.questionId);
          const correct = gradeAnswer(q, a.given);
          return { questionId: q.id, prompt: q.prompt, type: q.type, given: a.given, correct, points: correct ? (q.points || 10) : 0, seconds: a.seconds || 0 };
        });
        const maxScore = qs.reduce((x, q) => x + (q.points || 10), 0);
        const baseScore = answers.reduce((x, a) => x + (a.correct ? (byId.get(a.questionId).points || 10) : 0), 0);
        const score = answers.reduce((x, a) => x + a.points, 0);
        const percent = maxScore ? Math.round((baseScore / maxScore) * 1000) / 10 : 0;
        const att = {
          id: uid('att'), gameId: g.id, gameTitle: g.title, subjectName: (cdb.subjects[g.subjectId] || {}).name || '',
          ownerId: g.ownerId, studentId: u.id, studentName: u.name, studentAvatar: u.avatar,
          classId: (u.classIds || [])[0] || null, score, baseScore, maxScore, percent,
          correct: answers.filter((a) => a.correct).length, total: qs.length,
          timeSpent: answers.reduce((x, a) => x + (a.seconds || 0), 0),
          answers, startedAt: payload.startedAt || new Date().toISOString(), finishedAt: new Date().toISOString(), seen: false,
        };
        cdb.attempts[att.id] = att;
        u.points = (u.points || 0) + score;
        const badges = [];
        if (percent === 100) badges.push('🏆 Nilai Sempurna');
        if (percent >= 80) badges.push('🌟 Hebat');
        await rpatch('attempts/' + att.id, att);
        await rpatch('users/' + u.id, { points: u.points });
        for (const b of badges) { const bd = { id: uid('bdg'), studentId: u.id, name: b, at: new Date().toISOString(), gameId: g.id }; cdb.badges[bd.id] = bd; rpatch('badges/' + bd.id, bd); }
        const rank = attemptsOfGame(g.id).sort((a, b) => b.score - a.score).findIndex((a) => a.id === att.id) + 1;
        return { attempt: { id: att.id, score, maxScore, percent, correct: att.correct, total: att.total, rank, badges }, teacherName: (cdb.users[g.ownerId] || {}).name };
      },
      async myAttempts() {
        await ensure(); const u = me();
        return arr(cdb.attempts).filter((a) => a.studentId === u.id).sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).map((a) => ({ id: a.id, gameTitle: a.gameTitle, subjectName: a.subjectName, percent: a.percent, score: a.score, maxScore: a.maxScore, correct: a.correct, total: a.total, finishedAt: a.finishedAt, timeSpent: a.timeSpent }));
      },
      async attempt(id) {
        await ensure();
        const a = cdb.attempts[id];
        const byId = new Map(qOf(a.gameId).map((q) => [q.id, q]));
        return { attempt: a, review: (a.answers || []).map((ans) => { const q = byId.get(ans.questionId); return { prompt: ans.prompt, type: ans.type, given: ans.given, correct: ans.correct, answer: q ? q.answer : null, explanation: q ? q.explanation : '' }; }) };
      },
      async teacherAttempts(params = {}) {
        await ensure();
        const ids = new Set(myGames().map((g) => g.id));
        let list = arr(cdb.attempts).filter((a) => ids.has(a.gameId));
        if (params.gameId) list = list.filter((a) => a.gameId === params.gameId);
        if (params.classId) list = list.filter((a) => a.classId === params.classId);
        if (params.studentId) list = list.filter((a) => a.studentId === params.studentId);
        return list.sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).map((a) => {
          const st = cdb.users[a.studentId]; const cls = cdb.classes[a.classId];
          return Object.assign({}, a, { studentAvatar: st ? st.avatar : '🧑‍', className: cls ? cls.name : '-' });
        });
      },
      async teacherAttempt(id) { return impl.attempt(id); },
      async analytics() {
        await ensure();
        const games = myGames();
        const ids = new Set(games.map((g) => g.id));
        const attempts = arr(cdb.attempts).filter((a) => ids.has(a.gameId));
        const classes = classesOf(meId).map(decorateClass);
        const perSubject = {};
        attempts.forEach((a) => { const k = a.subjectName || '-'; perSubject[k] = perSubject[k] || { name: k, total: 0, sum: 0 }; perSubject[k].total++; perSubject[k].sum += a.percent; });
        const leaderboard = studentsOfClasses(classes).map((s) => {
          const at = attempts.filter((a) => a.studentId === s.id);
          return { id: s.id, name: s.name, avatar: s.avatar, color: s.color, points: at.reduce((x, a) => x + a.score, 0), avg: at.length ? Math.round(at.reduce((x, a) => x + a.percent, 0) / at.length) : 0, plays: at.length };
        }).sort((a, b) => b.points - a.points);
        const best = attempts.length ? attempts.reduce((a, b) => (b.percent > a.percent ? b : a)) : null;
        return {
          totalStudents: leaderboard.length, totalAttempts: attempts.length,
          avgScore: attempts.length ? Math.round(attempts.reduce((x, a) => x + a.percent, 0) / attempts.length) : 0,
          totalGames: games.length, unread: attempts.filter((a) => !a.seen).length,
          perGame: games.map((g) => { const l = attempts.filter((a) => a.gameId === g.id); return { id: g.id, title: g.title, cover: g.cover, attempts: l.length, students: new Set(l.map((a) => a.studentId)).size, avg: l.length ? Math.round(l.reduce((x, a) => x + a.percent, 0) / l.length) : 0, best: l.length ? Math.max(...l.map((a) => a.percent)) : 0 }; }),
          subjects: Object.values(perSubject).map((x) => ({ name: x.name, count: x.total, avg: Math.round(x.sum / x.total) })),
          hardest: [], leaderboard, days: [], classes,
          insight: { ringkasan: attempts.length ? `Rata-rata kelas ${Math.round(attempts.reduce((x, a) => x + a.percent, 0) / attempts.length)}% dari ${attempts.length} pengerjaan.` + (best ? ` Nilai tertinggi ${Math.round(best.percent)}% (${best.studentName}).` : '') : 'Belum ada data pengerjaan.', saran: attempts.length ? ['Bagikan kode game ke siswa untuk memulai.', 'Gunakan menu Buat Game AI untuk menambah variasi soal.'] : [] },
        };
      },
      async updateProfile(payload) {
        await ensure();
        const u = me();
        Object.assign(u, payload);
        await rpatch('users/' + u.id, payload);
        return { user: pub(u) };
      },
      resetOffline() { meId = null; safeLS.removeItem('pb_cloud_user'); location.reload(); },
    };
    return impl;
  })();

  client.cloud = CLOUD;
  client.clientSide = OFFLINE || CLOUD;
  if (CLOUD) Object.assign(client, cloudImpl);

  PB.api = client;
  PB.h = h;
  PB.fmtDate = fmtDate;
  PB.fmtDateShort = fmtDateShort;
  PB.relTime = relTime;
  PB.fmtDuration = fmtDuration;
  PB.esc = esc;
  PB.toast = toast;
  PB.modal = modal;
  PB.confirm = confirmDialog;
  PB.confetti = confetti;
  PB.ringPercent = ringPercent;
  PB.uid = uid;
  PB.code = code;
  PB.shuffle = shuffle;
})();
