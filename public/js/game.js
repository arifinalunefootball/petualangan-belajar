/* ============ MESIN GAME (sisi siswa) ============ */
window.PBGame = (function () {
  const { h, toast, confetti, ringPercent, fmtDuration, esc } = window.PB;
  const api = window.PB.api;
  const shuffle = api.shuffle;

  const TYPE_LABEL = {
    mc: 'Pilihan Ganda', tf: 'Benar / Salah', fill: 'Isian Singkat',
    order: 'Urutan Langkah', match: 'Menjodohkan',
  };

  /**
   * Menjalankan sebuah game.
   * @param {HTMLElement} root
   * @param {object} data  {game, questions}
   * @param {object} user  siswa
   * @param {function} onExit
   */
  function play(root, data, user, onExit) {
    const game = data.game;
    const questions = (data.questions || []).slice();
    const settings = Object.assign({ timer: 0, showExplanation: true, shuffle: true, passScore: 70 }, game.settings || {});
    const startedAt = new Date().toISOString();

    let idx = 0, score = 0, streak = 0, bestStreak = 0, correctCount = 0, baseEarned = 0;
    const answers = [];
    let qStart = 0, timerId = null, timerLeft = 0;
    let locked = false;

    root.innerHTML = '';
    const wrap = h('div', { class: 'play-wrap' });
    root.appendChild(wrap);

    /* ------------------------------- INTRO ------------------------------- */
    function renderIntro() {
      wrap.innerHTML = '';
      wrap.appendChild(h('div', { class: 'play-body' },
        h('div', { class: 'qcard' },
          h('div', { class: 'qbox center' },
            h('div', { class: 'game-cover', style: { width: '92px', height: '92px', fontSize: '3rem', margin: '0 auto 1rem' } }, game.cover || '🎮'),
            h('h1', {}, game.title),
            h('p', { class: 'muted' }, game.desc || ''),
            h('div', { class: 'row', style: { justifyContent: 'center', margin: '.8rem 0 1.2rem' } },
              h('span', { class: 'chip chip-info' }, `${game.subjectIcon || '📘'} ${game.subjectName || 'Umum'}`),
              game.topicName ? h('span', { class: 'chip' }, '📌 ' + game.topicName) : null,
              h('span', { class: 'chip' }, `❓ ${questions.length} soal`),
              settings.timer ? h('span', { class: 'chip chip-warn' }, `⏱ ${settings.timer} dtk/soal`) : null,
            ),
            h('div', { class: 'card', style: { textAlign: 'left', background: 'rgba(255,255,255,.05)', marginBottom: '1.1rem' } },
              h('h3', {}, '🎯 Cara main'),
              h('ul', { class: 'list-plain small muted' },
                h('li', {}, '✅ Jawaban benar langsung dapat poin. Salah tidak mengurangi poin.'),
                h('li', {}, '🔥 Jawaban benar berturut-turut memberi bonus combo (+5 tiap tingkat).'),
                h('li', {}, '📤 Nilaimu otomatis tersimpan ke akun guru begitu selesai.'),
                h('li', {}, '⌨️ Bisa pakai keyboard: angka 1–4 untuk memilih, Enter untuk lanjut.'),
              ),
            ),
            h('div', { class: 'row', style: { justifyContent: 'center' } },
              h('button', { class: 'btn btn-ghost', onclick: () => onExit && onExit() }, '← Kembali'),
              h('button', { class: 'btn btn-lg btn-ok', onclick: () => { idx = 0; renderQuestion(); } }, '🚀 Mulai Main'),
            ),
          ),
        ),
      ));
    }

    /* ------------------------------- TOPBAR ------------------------------ */
    function topbar() {
      const timerEl = settings.timer ? h('div', { class: 'hud', id: 'hud-timer' }, '⏱ ', h('span', { id: 'tsec' }, settings.timer)) : null;
      const bar = h('div', { class: 'progress' }, h('i', { id: 'pbar', style: { width: '0%' } }));
      return h('div', { class: 'play-top' },
        h('button', { class: 'icon-btn', title: 'Keluar', onclick: () => quitConfirm() }, '✕'),
        h('div', { class: 'hud' }, h('span', {}, '👤'), h('span', {}, user ? user.name : 'Siswa')),
        h('div', { style: { flex: 1 } }, bar),
        h('div', { class: 'hud' }, '⭐ ', h('span', { id: 'hud-score' }, '0')),
        h('div', { class: 'hud hidden', id: 'hud-combo' }, '🔥 x', h('span', { id: 'hud-streak' }, '0')),
        timerEl,
      );
    }

    function quitConfirm() {
      if (!questions.length) return onExit && onExit();
      PB.confirm('Keluar dari game? Progres jawabanmu akan hilang.', () => onExit && onExit(), 'Ya, keluar');
    }

    /* ------------------------------ SOAL -------------------------------- */
    function renderQuestion() {
      if (idx >= questions.length) return renderResult();
      locked = false;
      const q = questions[idx];
      qStart = Date.now();

      if (wrap.querySelector('.play-top')) wrap.querySelector('.play-top').remove();
      wrap.innerHTML = '';
      wrap.appendChild(topbar());
      document.getElementById('pbar').style.width = ((idx) / questions.length * 100) + '%';

      const body = h('div', { class: 'play-body' });
      wrap.appendChild(body);
      const card = h('div', { class: 'qcard' });
      body.appendChild(card);

      const box = h('div', { class: 'qbox' });
      card.appendChild(box);
      box.appendChild(h('div', { class: 'row-between', style: { marginBottom: '.6rem' } },
        h('span', { class: 'qtype' }, `${TYPE_LABEL[q.type] || q.type} · Soal ${idx + 1} dari ${questions.length}`),
        h('span', { class: 'chip' }, `+${q.points || 10} poin`),
      ));
      box.appendChild(h('div', { class: 'qprompt' }, q.prompt || ''));

      const area = h('div', { class: 'qarea' });
      box.appendChild(area);

      if (q.type === 'mc') renderMC(area, q);
      else if (q.type === 'tf') renderTF(area, q);
      else if (q.type === 'fill') renderFill(area, q);
      else if (q.type === 'order') renderOrder(area, q);
      else if (q.type === 'match') renderMatch(area, q);
      else renderMC(area, q);

      const fb = h('div', { class: 'feedback hidden', id: 'fb' });
      box.appendChild(fb);

      if (settings.timer) startTimer(settings.timer, () => submit(null, true));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function startTimer(sec, onEnd) {
      clearInterval(timerId);
      timerLeft = sec;
      const el = document.getElementById('tsec');
      timerId = setInterval(() => {
        timerLeft--;
        if (el) el.textContent = Math.max(0, timerLeft);
        if (timerLeft <= 0) { clearInterval(timerId); if (!locked) onEnd(); }
      }, 1000);
    }

    /* pilihan ganda */
    function renderMC(area, q) {
      const opts = q.options || [];
      const grid = h('div', { class: 'opts' + (opts.length <= 2 ? ' two' : '') });
      area.appendChild(grid);
      opts.forEach((o, i) => {
        const b = h('button', { class: 'opt', onclick: () => submit(o, false, b) },
          h('span', { class: 'key' }, String(i + 1)),
          h('span', {}, o),
        );
        b.dataset.val = String(o);
        grid.appendChild(b);
      });
      grid.dataset.kind = 'mc';
    }

    /* benar salah */
    function renderTF(area, q) {
      const grid = h('div', { class: 'opts two' });
      area.appendChild(grid);
      [['benar', '✅ BENAR'], ['salah', '❌ SALAH']].forEach(([v, label]) => {
        const b = h('button', { class: 'opt', style: { justifyContent: 'center', fontSize: '1.05rem', padding: '1.1rem' }, onclick: () => submit(v, false, b) }, label);
        b.dataset.val = v;
        grid.appendChild(b);
      });
    }

    /* isian */
    function renderFill(area, q) {
      const inp = h('input', { class: 'inp', placeholder: 'Ketik jawabanmu di sini…', autocomplete: 'off' });
      const btn = h('button', { class: 'btn', onclick: () => submit(inp.value.trim() || null, false, null) }, 'Kirim Jawaban');
      area.appendChild(h('div', { class: 'row' }, inp, btn));
      setTimeout(() => inp.focus(), 80);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !locked) submit(inp.value.trim() || null, false, null); });
    }

    /* urutan */
    function renderOrder(area, q) {
      // server mengirim langkah sudah diacak (q.items); offline/preview memakai q.answer
      const items = (q.items && q.items.length ? q.items : (q.answer || [])).map((t) => String(t));
      const shuffled = api.offline || q.items ? shuffle(items) : shuffle(items);
      const list = h('div', { class: 'order-list' });
      area.appendChild(list);
      area.appendChild(h('p', { class: 'hint' }, 'Seret untuk mengurutkan, atau pakai tombol ▲ ▼. Urutan paling benar di paling atas.'));
      let dragEl = null;

      shuffled.forEach((text) => {
        const up = h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, onclick: () => move(item, -1) }, '▲');
        const down = h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, onclick: () => move(item, 1) }, '▼');
        const item = h('div', { class: 'order-item', draggable: 'true' },
          h('span', { class: 'no' }, '•'),
          h('span', { style: { flex: 1 } }, text),
          up, down,
        );
        item.dataset.text = text;
        item.addEventListener('dragstart', () => { dragEl = item; item.classList.add('drag'); });
        item.addEventListener('dragend', () => { dragEl = null; item.classList.remove('drag'); renumber(); });
        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!dragEl || dragEl === item) return;
          const rect = item.getBoundingClientRect();
          const after = (e.clientY - rect.top) > rect.height / 2;
          list.insertBefore(dragEl, after ? item.nextSibling : item);
        });
        list.appendChild(item);
      });
      function move(el, dir) {
        if (dir < 0 && el.previousElementSibling) list.insertBefore(el, el.previousElementSibling);
        else if (dir > 0 && el.nextElementSibling) list.insertBefore(el.nextElementSibling, el);
        renumber();
      }
      function renumber() {
        Array.from(list.children).forEach((c, i) => { c.querySelector('.no').textContent = i + 1; });
      }
      renumber();
      area.appendChild(h('button', { class: 'btn', style: { marginTop: '.8rem' }, onclick: () => {
        const given = Array.from(list.children).map((c) => c.dataset.text);
        submit(given, false, null);
      } }, '✔ Kunci Urutan'));
    }

    /* menjodohkan */
    function renderMatch(area, q) {
      // pasangan benar disembunyikan; siswa hanya melihat dua kolom terpisah
      const pairs = (q.answer || []).map((p) => ({ left: String(p.left), right: String(p.right) }));
      const lefts = (q.lefts && q.lefts.length ? q.lefts : pairs.map((p) => p.left)).map(String);
      const rights = (q.rights && q.rights.length ? q.rights : shuffle(pairs.map((p) => p.right))).map(String);
      if (!lefts.length) { area.appendChild(h('p', { class: 'muted' }, 'Soal belum lengkap.')); return; }
      const state = new Map(); // left -> right
      window.__lastMatchState = state;
      let selLeft = null;
      const done = new Set();

      const grid = h('div', { class: 'match-grid' });
      const colL = h('div', { class: 'match-col' });
      const colR = h('div', { class: 'match-col' });
      grid.appendChild(colL); grid.appendChild(colR);
      area.appendChild(grid);
      area.appendChild(h('p', { class: 'hint' }, 'Klik istilah di kiri, lalu klik pengertiannya di kanan.'));

      const lEls = new Map(), rEls = new Map();
      lefts.forEach((t) => {
        const el = h('div', { class: 'mcard', onclick: () => pickLeft(t) }, t);
        lEls.set(t, el); colL.appendChild(el);
      });
      rights.forEach((t) => {
        const el = h('div', { class: 'mcard', onclick: () => pickRight(t, el) }, t);
        rEls.set(t, el); colR.appendChild(el);
      });

      function pickLeft(t) {
        if (done.has(t)) return;
        selLeft = t;
        lEls.forEach((el, k) => el.classList.toggle('sel', k === t));
      }
      function pickRight(t, el) {
        if (!selLeft) { toast('Pilih dulu istilah di kolom kiri.', 'info'); return; }
        if (Array.from(state.values()).includes(t)) { toast('Pengertian itu sudah dipakai.', 'info'); return; }
        state.set(selLeft, t);
        lEls.get(selLeft).classList.remove('sel');
        lEls.get(selLeft).classList.add('done');
        el.classList.add('done');
        done.add(selLeft);
        selLeft = null;
        if (state.size === lefts.length) {
          const given = Array.from(state.entries()).map(([left, right]) => ({ left, right }));
          setTimeout(() => {
            // warna benar/salah muncul setelah server menilai (lewat reveal di submit)
            submit(given, false, null);
          }, 320);
        }
      }
    }

    /* ------------------------------ SUBMIT ------------------------------- */
    async function submit(given, timedOut, clicked) {
      if (locked) return;
      locked = true;
      clearInterval(timerId);
      const q = questions[idx];
      const seconds = Math.max(1, Math.round((Date.now() - qStart) / 1000));
      // nilai dicek di server (anti-contek); kunci & pembahasan baru dibuka setelah dijawab
      let chk = null;
      try { chk = await api.checkAnswer(game.id, q, given); } catch (e) { chk = null; }
      const correct = chk ? chk.correct : api.gradeAnswer(q, given);
      const reveal = chk ? { answer: chk.answer, explanation: chk.explanation || '' } : null;

      // tandai visual kartu menjodohkan bila kunci tersedia
      if (q.type === 'match' && reveal && Array.isArray(reveal.answer)) {
        const good = new Map(reveal.answer.map((x) => [norm(x.left), norm(x.right)]));
        const st = window.__lastMatchState || new Map();
        st.forEach((right, left) => {
          const ok = good.get(norm(left)) === norm(right);
          document.querySelectorAll('.mcard').forEach((c) => {
            const t = norm(c.textContent);
            if (t === norm(left) || t === norm(right)) c.classList.add(ok ? 'right' : 'wrong');
          });
        });
      }

      // tandai visual
      const opts = document.querySelectorAll('.opt');
      opts.forEach((b) => {
        b.disabled = true;
        const val = b.dataset.val;
        if (val != null) {
          const isAnswer = (q.type === 'mc' || q.type === 'tf') && reveal && norm(val) === norm(fmtAnswer(reveal.answer));
          if (isAnswer) b.classList.add('right');
          else if (clicked === b || (given != null && norm(val) === norm(String(given)))) b.classList.add('wrong');
          else b.classList.add('dim');
        }
      });

      let bonus = 0, timeBonus = 0;
      if (correct) {
        correctCount++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        bonus = Math.max(0, streak - 1) * 5;
        timeBonus = settings.timer ? Math.max(0, Math.round((settings.timer - Math.min(settings.timer, seconds)) / 2)) : 0;
        score += (q.points || 10) + bonus + timeBonus;
        baseEarned += (q.points || 10);
        confetti(streak >= 3 ? 45 : 22);
      } else {
        streak = 0;
      }

      answers.push({ questionId: q.id, given: given == null ? null : given, correct, seconds, points: correct ? (q.points || 10) + bonus + timeBonus : 0, reveal });

      const sc = document.getElementById('hud-score'); if (sc) sc.textContent = score;
      const combo = document.getElementById('hud-combo');
      if (combo) {
        combo.classList.toggle('hidden', streak < 2);
        document.getElementById('hud-streak').textContent = streak;
      }
      const pb = document.getElementById('pbar'); if (pb) pb.style.width = ((idx + 1) / questions.length * 100) + '%';

      const fb = document.getElementById('fb');
      if (fb) {
        fb.className = 'feedback ' + (correct ? 'fb-ok' : 'fb-bad');
        const lines = [];
        if (timedOut && given == null) lines.push(h('div', { style: { fontWeight: 900 } }, '⏰ Waktu habis!'));
        lines.push(h('div', { style: { fontWeight: 900, fontSize: '1.05rem', marginBottom: '.3rem' } }, correct ? `🎉 Benar! +${(q.points || 10) + bonus} poin` : '😅 Belum tepat'));
        if (!correct && reveal) lines.push(h('div', { class: 'small' }, 'Jawaban benar: ', h('b', {}, fmtAnswer(reveal.answer))));
        if (!correct && !reveal) lines.push(h('div', { class: 'small muted' }, 'Kunci & pembahasan bisa dilihat di halaman hasil setelah nilai terkirim.'));
        if (correct && bonus) lines.push(h('div', { class: 'small' }, `🔥 Bonus combo x${streak} : +${bonus} poin`));
        if (correct && timeBonus) lines.push(h('div', { class: 'small' }, `⚡ Bonus cepat : +${timeBonus} poin`));
        if (settings.showExplanation && reveal && reveal.explanation) lines.push(h('div', { class: 'small muted', style: { marginTop: '.45rem', whiteSpace: 'pre-wrap' } }, '💡 ' + reveal.explanation));
        fb.innerHTML = '';
        lines.forEach((l) => fb.appendChild(l));
        fb.classList.remove('hidden');
        fb.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '.8rem' } },
          h('button', { class: 'btn btn-ok', onclick: () => { idx++; renderQuestion(); } }, idx + 1 >= questions.length ? '🏁 Lihat Hasil' : 'Lanjut →'),
        ));
      }
      const nb = fb ? fb.querySelector('button') : null;
      if (nb) setTimeout(() => nb.focus(), 50);
    }

    function norm(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
    function fmtAnswer(a) {
      if (Array.isArray(a)) {
        if (a.length && typeof a[0] === 'object') return a.map((x) => `${x.left} = ${x.right}`).join('; ');
        return a.map((x, i) => `${i + 1}. ${x}`).join('  ');
      }
      return String(a);
    }

    /* ------------------------------ HASIL -------------------------------- */
    function renderResult() {
      clearInterval(timerId);
      wrap.innerHTML = '';
      const maxScore = questions.reduce((s, q) => s + (q.points || 10), 0);
      const pct = maxScore ? Math.round(baseEarned / maxScore * 1000) / 10 : 0; // tanpa bonus, sama dengan penilaian guru
      const stars = pct >= 90 ? '⭐⭐⭐' : pct >= 70 ? '⭐⭐' : pct >= 40 ? '⭐' : '💪';
      const msg = pct >= 90 ? 'Luar biasa! Kamu menguasai materi ini.' : pct >= 70 ? 'Kerja bagus! Sedikit lagi menuju sempurna.' : pct >= 40 ? 'Lumayan! Coba baca ulang materinya lalu main lagi.' : 'Jangan menyerah! Baca materi dulu, lalu tantang lagi gamenya.';

      const sending = h('div', { class: 'center muted', style: { marginTop: '1rem' } }, h('span', { class: 'spinner' }), ' Mengirim nilai ke akun guru…');

      wrap.appendChild(h('div', { class: 'play-body' },
        h('div', { class: 'qcard' },
          h('div', { class: 'result-hero' },
            h('div', { class: 'stars' }, stars),
            h('h1', {}, pct >= 70 ? 'Hebat, ' + (user ? user.name.split(' ')[0] : '') + '! 🎉' : 'Selesai! 🏁'),
            h('p', { style: { opacity: .9 } }, msg),
            h('div', { id: 'result-ring', html: ringPercent(Math.min(100, pct), 150), style: { margin: '.6rem auto' } }),
            h('div', { class: 'row', style: { justifyContent: 'center' } },
              h('span', { class: 'chip', id: 'result-correct' }, `✅ ${correctCount}/${questions.length} benar`),
              h('span', { class: 'chip', id: 'result-score' }, `⭐ ${score} poin`),
              h('span', { class: 'chip' }, `🔥 combo terbaik ${bestStreak}`),
              h('span', { class: 'chip' }, `⏱ ${fmtDuration(answers.reduce((s, a) => s + a.seconds, 0))}`),
            ),
          ),
          h('div', { id: 'result-extra', style: { marginTop: '1rem' } }, sending),
          h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1.1rem' } },
            h('button', { class: 'btn btn-ghost', onclick: () => onExit && onExit() }, '🏠 Ke Beranda'),
            h('button', { class: 'btn', onclick: () => { idx = 0; score = 0; streak = 0; bestStreak = 0; correctCount = 0; baseEarned = 0; answers.length = 0; renderQuestion(); } }, '🔁 Main Lagi'),
          ),
          h('div', { id: 'review-box', style: { marginTop: '1.2rem' } }),
        ),
      ));

      if (pct >= 70) confetti(140);

      api.submitAttempt({ gameId: game.id, answers: answers.map((a) => ({ questionId: a.questionId, given: a.given, seconds: a.seconds })), startedAt })
        .then((res) => {
          const extra = document.getElementById('result-extra');
          if (!extra) return;
          const off = res.attempt || {};
          const offPct = typeof off.percent === 'number' ? off.percent : pct;
          const ringBox = document.getElementById('result-ring');
          if (ringBox) ringBox.innerHTML = PB.ringPercent(Math.min(100, offPct), 150);
          const scoreEl = document.getElementById('result-score');
          if (scoreEl) scoreEl.textContent = (typeof off.score === 'number' ? off.score : score) + ' poin';
          extra.innerHTML = '';
          extra.appendChild(h('div', { class: 'card', style: { background: 'rgba(34,197,94,.14)', borderColor: 'rgba(34,197,94,.4)', textAlign: 'left' } },
            h('h3', {}, '📤 Tersimpan ke akun guru'),
            h('p', { class: 'small muted' }, `Guru ${res.teacherName || ''} sudah menerima nilaimu.`),
            res.attempt && res.attempt.rank ? h('p', { class: 'small', html: `🏅 Peringkat kamu di game ini: <b>#${res.attempt.rank}</b>` }) : null,
          ));
          const badges = (res.attempt && res.attempt.badges) || [];
          if (badges.length) {
            const bx = h('div', { class: 'center', style: { marginTop: '.6rem' } });
            badges.forEach((b) => bx.appendChild(h('span', { class: 'badge-pill' }, b)));
            extra.appendChild(bx);
          }
          // ulasan singkat
          const rb = document.getElementById('review-box');
          if (rb) {
            rb.innerHTML = '';
            rb.appendChild(h('div', { class: 'card', style: { background: 'rgba(255,255,255,.05)', textAlign: 'left' } },
              h('h3', {}, '📋 Ulasan jawabanmu'),
              h('div', {}, answers.map((a, i) => {
                const q = questions[i] || {};
                const rv = a.reveal;
                return h('div', { style: { padding: '.55rem 0', borderBottom: '1px dashed rgba(255,255,255,.14)' } },
                  h('div', { class: 'small' }, a.correct ? '✅ ' : '❌ ', h('b', {}, `Soal ${i + 1}: `), (q.prompt || '').slice(0, 110)),
                  !a.correct ? h('div', { class: 'tiny muted' }, 'Jawabanmu: ' + (a.given == null ? '—' : fmtAnswer(a.given)) + (rv ? ' · Benar: ' + fmtAnswer(rv.answer) : '')) : null,
                  rv && rv.explanation ? h('div', { class: 'tiny muted', style: { marginTop: '.2rem' } }, '💡 ' + rv.explanation) : null,
                );
              })),
            ));
          }
        })
        .catch((e) => {
          const extra = document.getElementById('result-extra');
          if (!extra) return;
          extra.innerHTML = '';
          extra.appendChild(h('div', { class: 'card', style: { background: 'rgba(239,68,68,.16)', borderColor: 'rgba(239,68,68,.5)', textAlign: 'left' } },
            h('h3', {}, '⚠️ Gagal mengirim nilai'),
            h('p', { class: 'small' }, String(e.message || e)),
            h('button', { class: 'btn btn-sm', onclick: () => location.reload() }, 'Coba lagi'),
          ));
        });
    }

    // keyboard
    document.addEventListener('keydown', keyHandler);
    function keyHandler(e) {
      if (!wrap.isConnected) { document.removeEventListener('keydown', keyHandler); return; }
      if (locked) {
        if (e.key === 'Enter') { const b = document.querySelector('#fb button'); if (b) b.click(); }
        return;
      }
      const opts = Array.from(document.querySelectorAll('.opt'));
      if (opts.length && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (opts[i]) opts[i].click();
      }
    }

    renderIntro();
    return { stop: () => { clearInterval(timerId); document.removeEventListener('keydown', keyHandler); } };
  }

  return { play, TYPE_LABEL };
})();
