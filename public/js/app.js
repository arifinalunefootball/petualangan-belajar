/* =========================================================
   PETUALANGAN BELAJAR — aplikasi utama (guru & siswa)
   ========================================================= */
(function () {
  const { h, toast, modal, confirm: confirmDlg, esc, fmtDate, fmtDateShort, relTime, fmtDuration } = window.PB;
  const api = window.PB.api;
  const OFFLINE = api.clientSide || api.offline;

  const app = document.getElementById('app');
  let ME = null;
  let route = '';
  let lastPlayStop = null;
  let RENDER = 0;

  /* ================================ ROUTER ================================ */
  function navigate(hash) {
    if (location.hash === '#' + hash) render();
    else location.hash = hash;
  }
  window.addEventListener('hashchange', render);

  async function boot() {
    try {
      const res = await api.me();
      ME = res.user;
    } catch (e) {
      ME = null;
      if (!api.clientSide) {
        try { await fetch('/api/health'); } catch (e2) {
          document.body.appendChild(h('div', { style: { position: 'fixed', inset: 'auto 12px 12px', zIndex: 999, padding: '12px 16px', borderRadius: '12px', background: '#fef3c7', border: '1px solid #f59e0b', color: '#78350f', fontSize: '.9rem', maxWidth: '520px', margin: '0 auto' } },
            h('b', {}, '⚠️ Data belum tersambung. '),
            'Buka ', h('code', {}, 'js/config.js'), ' dan isi ', h('code', {}, 'rtdbUrl'), ' dengan alamat Firebase kamu (lihat PANDUAN-DEPLOY.md — Rute D).'));
        }
      }
    }
    if (!location.hash) location.hash = ME ? (ME.role === 'teacher' ? '/guru' : '/siswa') : '/masuk';
    render();
  }

  function latestRender() { return RENDER; }

  async function render() {
    const my = ++RENDER;               // render baru membatalkan render lama
    const stale = () => my !== RENDER;
    if (lastPlayStop) { try { lastPlayStop(); } catch (e) {} lastPlayStop = null; }
    route = (location.hash || '#/').slice(1);
    app.innerHTML = '';
    window.scrollTo(0, 0);

    const parts = route.split('/').filter(Boolean);
    const page = parts[0] || '';

    if (!ME) {
      if (page === 'main' && parts[1]) return screenPlayByCode(parts[1]);
      return screenAuth(page === 'tentang' ? 'tentang' : 'masuk');
    }
    if (page === 'main' && parts[1]) {
      if (ME.role !== 'student') { toast('Mode main hanya untuk akun siswa. Masuk sebagai siswa dulu ya.', 'err'); return navigate('/guru'); }
      return screenPlay(parts[1]);
    }
    if (stale()) return;
    if (ME.role === 'teacher') return renderTeacher(page, parts.slice(1));
    return renderStudent(page, parts.slice(1));
  }

  /* ================================ SHELL ================================ */
  function shell(active, items, content) {
    const bar = h('div', { class: 'appbar' },
      h('div', { class: 'brand', onclick: () => navigate(ME.role === 'teacher' ? '/guru' : '/siswa') },
        h('div', { class: 'brand-logo' }, '🎮'),
        h('div', {}, 'Petualangan', h('span', { class: 'muted', style: { fontWeight: 600 } }, ' Belajar')),
      ),
      window.PB_OFFLINE ? h('span', { class: 'chip chip-warn', title: 'Versi 1 file HTML, data tersimpan di browser ini' }, '💾 Mode Offline') : api.cloud ? h('span', { class: 'chip chip-ok', title: 'Data tersimpan di Firebase — terpusat untuk semua device' }, '☁️ Mode Cloud') : h('span', { class: 'chip chip-ok', title: 'Data tersimpan di server' }, '🖥️ Server Aktif'),
      h('div', { class: 'spacer' }),
      h('div', { class: 'userpill', onclick: openProfile },
        h('div', { class: 'avatar', style: { background: ME.color || '#6366f1' } }, ME.avatar || '🙂'),
        h('div', { style: { lineHeight: 1.15 } },
          h('div', { style: { fontWeight: 800, fontSize: '.9rem' } }, ME.name),
          h('div', { class: 'tiny muted' }, ME.role === 'teacher' ? 'Guru' : 'Siswa'),
        ),
      ),
      h('button', { class: 'icon-btn', title: 'Keluar', onclick: doLogout }, '⎋'),
    );
    app.appendChild(bar);

    const shellEl = h('div', { class: 'shell' });
    const nav = h('nav', { class: 'sidenav' });
    items.forEach((it) => {
      if (!it) return;
      nav.appendChild(h('div', { class: 'navitem' + (active === it.key ? ' active' : ''), onclick: () => navigate(it.to) },
        h('span', { class: 'nav-ico' }, it.icon), h('span', {}, it.label),
        it.badge ? h('span', { class: 'badge-dot' }, String(it.badge)) : null,
      ));
    });
    shellEl.appendChild(nav);
    const main = h('main', { class: 'main' });
    shellEl.appendChild(main);
    app.appendChild(shellEl);
    if (typeof content === 'function') content(main); else if (content) main.appendChild(content);
    return main;
  }

  function goAfterLogin(isNew) {
    const target = ME.role === 'teacher' ? (isNew ? '/guru/buat' : '/guru') : '/siswa';
    if (location.hash === '#' + target) render();
    else location.hash = target; // hashchange akan memicu render()
  }

  function doLogout() {
    confirmDlg('Keluar dari akun ini?', async () => {
      await api.logout();
      ME = null;
      if (location.hash === '#/masuk') render(); else location.hash = '/masuk';
    }, 'Ya, keluar');
  }

  function openProfile() {
    const avatars = ['👩‍🏫', '👨‍🏫', '🧑‍🎓', '👧', '👦', '🦁', '🐼', '🦋', '🐢', '🦄', '🐰', '🦊', '🐨', '🦉', '🐯', '🚀', '🌟', '🎮'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
    const nameInp = h('input', { class: 'inp', value: ME.name });
    let avatar = ME.avatar || '🙂', color = ME.color || '#6366f1';
    const avRow = h('div', { class: 'row' });
    const clRow = h('div', { class: 'row' });
    avatars.forEach((a) => avRow.appendChild(h('button', { class: 'icon-btn', style: { fontSize: '1.2rem', border: a === avatar ? '2px solid #a78bfa' : '' }, onclick: (e) => { avatar = a; avRow.querySelectorAll('button').forEach((b) => b.style.border = ''); e.currentTarget.style.border = '2px solid #a78bfa'; } }, a)));
    colors.forEach((c) => clRow.appendChild(h('button', { class: 'icon-btn', style: { background: c, border: c === color ? '2px solid #fff' : '' }, onclick: (e) => { color = c; clRow.querySelectorAll('button').forEach((b) => b.style.border = ''); e.currentTarget.style.border = '2px solid #fff'; } }, '')));
    const m = modal({
      title: 'Profil saya',
      body: h('div', {},
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama tampilan'), nameInp),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Avatar'), avRow),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Warna'), clRow),
        OFFLINE ? h('div', { class: 'demo-box' }, 'Versi offline: data disimpan di browser ini. ', h('button', { class: 'btn btn-sm btn-danger', style: { marginLeft: '.4rem' }, onclick: () => api.resetOffline() }, 'Reset data')) : null,
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'),
        h('button', { class: 'btn', onclick: async () => { await api.updateProfile({ name: nameInp.value.trim(), avatar, color }); ME = Object.assign({}, ME, { name: nameInp.value.trim(), avatar, color }); m.close(); toast('Profil diperbarui', 'ok'); render(); } }, 'Simpan'),
      ],
    });
  }

  /* ================================ AUTH ================================ */
  function screenAuth(tab) {
    const wrap = h('div', { class: 'auth-wrap' });
    app.appendChild(wrap);

    if (tab === 'tentang' || (!OFFLINE && tab !== 'main')) {
      // tetap tampilkan login + info
    }

    const card = h('div', { class: 'card card-pad auth-card' });
    wrap.appendChild(card);

    card.appendChild(h('div', { class: 'center', style: { marginBottom: '1rem' } },
      h('div', { class: 'brand-logo', style: { width: '64px', height: '64px', fontSize: '2.2rem', margin: '0 auto .7rem' } }, '🎮'),
      h('h1', { style: { fontSize: '1.6rem' } }, 'Petualangan Belajar'),
      h('p', { class: 'muted small' }, 'Game pembelajaran buatan guru, nilai otomatis terkumpul ke akun guru.'),
    ));

    let mode = 'login';
    const tabs = h('div', { class: 'tabs' },
      h('div', { class: 'tab active', id: 'tab-login', onclick: () => setMode('login') }, 'Masuk'),
      h('div', { class: 'tab', id: 'tab-reg', onclick: () => setMode('reg') }, 'Daftar Akun'),
    );
    card.appendChild(tabs);

    const form = h('div', {});
    card.appendChild(form);

    const demo = h('div', { class: 'demo-box' },
      h('b', {}, '🔑 Akun demo siap coba'), h('br'),
      h('div', { class: 'small', style: { marginTop: '.35rem' } },
        'Guru: ', h('code', {}, 'guru'), ' / ', h('code', {}, 'guru123'), h('br'),
        'Siswa: ', h('code', {}, 'andi'), ' / ', h('code', {}, '123456'),
        h('div', { class: 'tiny muted', style: { marginTop: '.4rem' } }, 'Siswa lain: siti, budi, lani, rina, dayu (password 123456)'),
      ),
      h('div', { class: 'row', style: { marginTop: '.6rem' } },
        h('button', { class: 'btn btn-sm', onclick: () => quickLogin('guru', 'guru123') }, 'Masuk sebagai Guru'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => quickLogin('andi', '123456') }, 'Masuk sebagai Siswa'),
      ),
    );
    card.appendChild(demo);

    if (api.cloud) {
      const seedBox = h('div', { class: 'demo-box', style: { display: 'none' } },
        h('b', {}, '📦 Database cloud masih kosong'), h('br'),
        h('div', { class: 'small', style: { marginTop: '.35rem' } }, 'Muat data contoh (akun guru, siswa, 3 game siap main) ke Firebase?'),
        h('div', { class: 'row', style: { marginTop: '.6rem' } },
          h('button', { class: 'btn btn-sm', onclick: async (ev) => {
            const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Memuat...';
            try { await api.seedDemo(); toast('✅ Data contoh berhasil dimuat ke Firebase!', 'ok'); boot(); }
            catch (err) { toast('Gagal: ' + err.message, 'err'); btn.disabled = false; btn.textContent = 'Muat data contoh'; }
          } }, 'Muat data contoh'),
        ),
      );
      card.appendChild(seedBox);
      api.isEmpty().then((empty) => { if (empty) seedBox.style.display = ''; }).catch(() => {});
    }

    function setMode(m) {
      mode = m;
      document.getElementById('tab-login').classList.toggle('active', m === 'login');
      document.getElementById('tab-reg').classList.toggle('active', m === 'reg');
      form.innerHTML = '';
      if (m === 'login') {
        const u = h('input', { class: 'inp', placeholder: 'contoh: guru', autocomplete: 'username' });
        const p = h('input', { class: 'inp', type: 'password', placeholder: '••••••', autocomplete: 'current-password' });
        form.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Username'), u));
        form.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Password'), p));
        const btn = h('button', { class: 'btn btn-block btn-lg', onclick: () => doLogin(u.value, p.value, btn) }, 'Masuk');
        form.appendChild(btn);
        [u, p].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(u.value, p.value, btn); }));
        setTimeout(() => u.focus(), 60);
      } else {
        const role = h('select', { class: 'inp' },
          h('option', { value: 'teacher' }, '👩‍🏫 Saya Guru'),
          h('option', { value: 'student' }, '🧑‍🎓 Saya Siswa'),
        );
        const name = h('input', { class: 'inp', placeholder: 'Nama lengkap' });
        const uname = h('input', { class: 'inp', placeholder: 'username (huruf kecil, tanpa spasi)' });
        const pass = h('input', { class: 'inp', type: 'password', placeholder: 'minimal 4 karakter' });
        form.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Saya adalah'), role));
        form.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama lengkap'), name));
        form.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Username'), uname));
        form.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Password'), pass));
        const hint = h('div', { class: 'hint' }, 'Siswa baru bisa juga dibuatkan akun oleh guru dari menu Kelas.');
        form.appendChild(hint);
        const btn = h('button', { class: 'btn btn-block btn-lg', onclick: () => doRegister({ role: role.value, name: name.value, username: uname.value, password: pass.value }, btn) }, 'Daftar & Masuk');
        form.appendChild(btn);
      }
    }
    setMode('login');

    async function doLogin(u, p, btn) {
      if (!u || !p) return toast('Isi username dan password dulu.', 'err');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Memproses…';
      try {
        const res = await api.login(u, p);
        ME = res.user;
        toast('Selamat datang, ' + ME.name + '! 🎉', 'ok');
        goAfterLogin();
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false; btn.textContent = 'Masuk';
      }
    }
    async function quickLogin(u, p) {
      try {
        const res = await api.login(u, p);
        ME = res.user;
        goAfterLogin();
      } catch (e) { toast(e.message, 'err'); }
    }
    async function doRegister(payload, btn) {
      if (!payload.name || !payload.username || !payload.password) return toast('Lengkapi semua isian dulu.', 'err');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Membuat akun…';
      try {
        const res = await api.register(payload);
        ME = res.user;
        toast('Akun berhasil dibuat! 🎉', 'ok');
        goAfterLogin(true);
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false; btn.textContent = 'Daftar & Masuk';
      }
    }
  }

  /* ============================ HALAMAN SISWA ============================ */
  const STUDENT_NAV = [
    { key: 'siswa', to: '/siswa', icon: '🏠', label: 'Beranda' },
    { key: 'games', to: '/siswa/games', icon: '🎮', label: 'Game Saya' },
    { key: 'main', to: '/siswa/kode', icon: '🔑', label: 'Main Pakai Kode' },
    { key: 'nilai', to: '/siswa/nilai', icon: '📊', label: 'Nilai Saya' },
    { key: 'profil', to: '/siswa', icon: '🏅', label: 'Prestasi' },
  ];

  async function renderStudent(page, rest) {
    const nav = STUDENT_NAV.map((n) => Object.assign({}, n));
    if (page === '' || page === 'siswa') {
      if (rest[0] === 'nilai') return studentNilai(await shell('nilai', nav));
      if (rest[0] === 'games') return studentGames(await shell('games', nav));
      if (rest[0] === 'kode') return studentKode(await shell('main', nav));
      return studentHome(await shell('siswa', nav));
    }
    if (page === 'nilai') return studentNilai(await shell('nilai', nav));
    if (page === 'games') return studentGames(await shell('games', nav));
    if (page === 'kode') return studentKode(await shell('main', nav));
    return studentHome(await shell('siswa', nav));
  }

  async function studentHome(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head' },
      h('h1', {}, `Halo, ${ME.name.split(' ')[0]}! 👋`),
      h('p', { class: 'muted' }, 'Ayo selesaikan game dari gurumu. Setiap nilai otomatis terkirim ke akun guru.'),
    ));

    const [games, attempts] = await Promise.all([api.games().catch(() => []), api.myAttempts().catch(() => [])]);
    const totalPoints = attempts.reduce((s, a) => s + (a.score || 0), 0);
    const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + a.percent, 0) / attempts.length) : 0;

    main.appendChild(h('div', { class: 'grid g4', style: { marginBottom: '1.1rem' } },
      statCard('stat-1', '🎮', String(games.length), 'Game tersedia'),
      statCard('stat-2', '✅', String(attempts.length), 'Tugas selesai'),
      statCard('stat-3', '⭐', String(totalPoints), 'Total poin'),
      statCard('stat-4', '📈', avg + '%', 'Rata-rata nilai'),
    ));

    // join code cepat
    const codeInp = h('input', { class: 'inp', placeholder: 'Contoh: 6ACERIA', style: { textTransform: 'uppercase', maxWidth: '220px' } });
    main.appendChild(h('div', { class: 'card', style: { marginBottom: '1.1rem' } },
      h('div', { class: 'row-between' },
        h('div', {}, h('h3', {}, '🔑 Punya kode game dari guru?'), h('p', { class: 'muted small' }, 'Masukkan kode, langsung main tanpa cari di daftar.')),
        h('div', { class: 'row' }, codeInp, h('button', { class: 'btn', onclick: () => { const c = codeInp.value.trim(); if (!c) return toast('Ketik kode gamenya dulu.', 'err'); navigate('/main/' + c); } }, 'Main ▶')),
      ),
    ));

    // game tersedia
    main.appendChild(h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🎮 Game untuk kamu'), h('a', { class: 'btn btn-sm btn-ghost', onclick: () => navigate('/siswa/games') }, 'Lihat semua')));
    if (!games.length) {
      main.appendChild(emptyBox('🎒', 'Belum ada game', 'Minta guru mempublikasikan game untuk kelasmu, atau pakai kode game di atas.'));
    } else {
      const grid = h('div', { class: 'grid g3' });
      games.slice(0, 6).forEach((g) => grid.appendChild(studentGameCard(g)));
      main.appendChild(grid);
    }

    // aktivitas terakhir
    main.appendChild(h('div', { class: 'card-h', style: { marginTop: '1.4rem' } }, h('div', { class: 'card-title' }, '🕒 Aktivitas terakhir')));
    if (!attempts.length) main.appendChild(emptyBox('📝', 'Belum ada aktivitas', 'Mainkan game pertamamu!'));
    else {
      const rows = h('div', {});
      attempts.slice(0, 5).forEach((a) => {
        rows.appendChild(h('div', { class: 'rank-row' },
          h('div', { class: 'rank-no' }, a.percent >= 70 ? '🌟' : '📘'),
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontWeight: 800 } }, a.gameTitle),
            h('div', { class: 'tiny muted' }, `${a.subjectName || ''} · ${relTime(a.finishedAt)} · ${a.correct}/${a.total} benar`),
          ),
          h('div', { style: { textAlign: 'right' } },
            h('div', { style: { fontWeight: 900, fontSize: '1.1rem', color: a.percent >= 70 ? '#86efac' : a.percent >= 40 ? '#fde68a' : '#fecaca' } }, Math.round(a.percent) + '%'),
            h('div', { class: 'tiny muted' }, a.score + ' poin'),
          ),
        ));
      });
      main.appendChild(rows);
    }
  }

  function studentGameCard(g) {
    return h('div', { class: 'game-card' },
      h('div', { class: 'row' },
        h('div', { class: 'game-cover', style: { width: '52px', height: '52px', fontSize: '1.7rem' } }, g.cover || '🎮'),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { class: 'game-title' }, g.title),
          h('div', { class: 'tiny muted' }, `${g.subjectIcon || '📘'} ${g.subjectName || 'Umum'}${g.topicName ? ' · ' + g.topicName : ''}`),
        ),
      ),
      g.desc ? h('p', { class: 'small muted', style: { margin: 0 } }, g.desc) : null,
      h('div', { class: 'game-meta' },
        h('span', { class: 'chip' }, `❓ ${g.questionCount} soal`),
        g.attempts ? h('span', { class: 'chip chip-ok' }, `✅ nilai terbaik ${Math.round(g.bestScore)}%`) : h('span', { class: 'chip chip-warn' }, '⏳ belum dikerjakan'),
      ),
      h('div', { class: 'game-actions' },
        h('button', { class: 'btn btn-sm btn-ok', onclick: () => navigate('/main/' + g.shareCode) }, g.attempts ? '🔁 Main Lagi' : '▶ Mulai'),
      ),
    );
  }

  async function studentGames(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head' }, h('h1', {}, '🎮 Semua Game'), h('p', { class: 'muted' }, 'Game yang dipublikasikan gurumu untuk kelasmu.')));
    const games = await api.games().catch(() => []);
    if (!games.length) return main.appendChild(emptyBox('🎒', 'Belum ada game', 'Gurumu belum mempublikasikan game.'));
    const grid = h('div', { class: 'grid g3' });
    games.forEach((g) => grid.appendChild(studentGameCard(g)));
    main.appendChild(grid);
  }

  function studentKode(main) {
    main.appendChild(h('div', { class: 'page-head' }, h('h1', {}, '🔑 Main Pakai Kode')));
    const inp = h('input', { class: 'inp', placeholder: 'Ketik kode game / kode kelas', style: { textTransform: 'uppercase', fontSize: '1.4rem', letterSpacing: '.12em', textAlign: 'center', maxWidth: '340px' } });
    const joinCls = h('input', { class: 'inp', placeholder: 'Kode kelas dari guru', style: { textTransform: 'uppercase', maxWidth: '340px' } });
    main.appendChild(h('div', { class: 'card', style: { maxWidth: '520px' } },
      h('h3', {}, 'Masuk ke game'),
      h('div', { class: 'field' }, inp),
      h('button', { class: 'btn btn-block', onclick: () => { const c = inp.value.trim(); if (!c) return toast('Kode belum diisi.', 'err'); navigate('/main/' + c); } }, '🚀 Mulai Game'),
      h('div', { class: 'divider' }),
      h('h3', {}, 'Gabung kelas baru'),
      h('p', { class: 'muted small' }, 'Supaya game dari guru muncul di daftar kamu.'),
      h('div', { class: 'field' }, joinCls),
      h('button', { class: 'btn btn-ghost btn-block', onclick: async () => {
        const c = joinCls.value.trim();
        if (!c) return toast('Kode kelas belum diisi.', 'err');
        try { const r = await api.joinClass(c); toast('Berhasil gabung ke ' + r.klass.name, 'ok'); navigate('/siswa'); }
        catch (e) { toast(e.message, 'err'); }
      } }, 'Gabung Kelas'),
    ));
  }

  async function studentNilai(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head' }, h('h1', {}, '📊 Nilai & Tugas Saya'), h('p', { class: 'muted' }, 'Semua hasil kerjamu tersimpan otomatis di akun guru.')));
    const attempts = await api.myAttempts().catch(() => []);
    if (!attempts.length) return main.appendChild(emptyBox('📝', 'Belum ada nilai', 'Selesaikan satu game untuk melihat nilaimu di sini.'));
    const rows = h('div', {});
    attempts.forEach((a) => {
      rows.appendChild(h('div', { class: 'rank-row', style: { cursor: 'pointer' }, onclick: () => openAttemptDetail(a.id, false) },
        h('div', { class: 'rank-no' }, a.percent >= 70 ? '🌟' : a.percent >= 40 ? '📘' : '💪'),
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontWeight: 800 } }, a.gameTitle),
          h('div', { class: 'tiny muted' }, `${a.subjectName || ''} · ${fmtDate(a.finishedAt)} · ${fmtDuration(a.timeSpent)}`),
          h('div', { class: 'bar ' + (a.percent >= 70 ? '' : a.percent >= 40 ? 'warn' : 'bad'), style: { marginTop: '.35rem', maxWidth: '240px' } }, h('i', { style: { width: Math.min(100, a.percent) + '%' } })),
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div', { style: { fontWeight: 900, fontSize: '1.2rem' } }, Math.round(a.percent) + '%'),
          h('div', { class: 'tiny muted' }, `${a.correct}/${a.total} benar · ${a.score} poin`),
        ),
      ));
    });
    main.appendChild(h('div', { class: 'card' }, rows));
  }

  async function openAttemptDetail(id, teacherView) {
    const data = teacherView ? await api.teacherAttempt(id) : await api.attempt(id);
    const a = data.attempt;
    const body = h('div', {},
      h('div', { class: 'row-between', style: { marginBottom: '.8rem' } },
        h('div', {},
          h('h3', {}, a.gameTitle),
          h('div', { class: 'tiny muted' }, `${a.studentName} · ${a.subjectName || ''} · ${fmtDate(a.finishedAt)}`),
        ),
        h('div', { class: 'center' },
          h('div', { style: { fontSize: '1.8rem', fontWeight: 900, color: a.percent >= 70 ? '#86efac' : a.percent >= 40 ? '#fde68a' : '#fecaca' } }, Math.round(a.percent) + '%'),
          h('div', { class: 'tiny muted' }, `${a.correct}/${a.total} benar · ${fmtDuration(a.timeSpent)}`),
        ),
      ),
      h('div', { class: 'divider' }),
      h('div', { class: 'scroll-y' }, (data.review || []).map((r, i) => h('div', { style: { padding: '.6rem 0', borderBottom: '1px dashed rgba(255,255,255,.14)' } },
        h('div', { class: 'small' }, r.correct ? '✅ ' : '❌ ', h('b', {}, `Soal ${i + 1}: `), r.prompt),
        h('div', { class: 'tiny', style: { marginTop: '.25rem' } },
          'Jawaban: ', h('b', { style: { color: r.correct ? '#86efac' : '#fecaca' } }, fmtGiven(r.given)),
          r.correct ? null : h('span', {}, ' · Kunci: ', h('b', {}, fmtGiven(r.answer))),
        ),
        r.explanation ? h('div', { class: 'tiny muted', style: { marginTop: '.2rem' } }, '💡 ' + r.explanation) : null,
      ))),
    );
    modal({ title: 'Detail pengerjaan', body, wide: true });
  }

  function fmtGiven(v) {
    if (v == null) return '— (tidak dijawab)';
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object') return v.map((x) => `${x.left}=${x.right}`).join('; ');
      return v.map((x, i) => `${i + 1}. ${x}`).join(' → ');
    }
    return String(v);
  }

  /* ============================= HALAMAN GURU ============================= */
  let teacherNavCache = [];
  function teacherNav(unread) {
    teacherNavCache = [
      { key: 'dash', to: '/guru', icon: '📊', label: 'Dashboard' },
      { key: 'games', to: '/guru/games', icon: '🎮', label: 'Game Saya' },
      { key: 'buat', to: '/guru/buat', icon: '✨', label: 'Buat Game AI' },
      { key: 'kelas', to: '/guru/kelas', icon: '👥', label: 'Kelas & Siswa' },
      { key: 'hasil', to: '/guru/hasil', icon: '📥', label: 'Hasil Siswa', badge: unread || 0 },
      { key: 'mapel', to: '/guru/mapel', icon: '📚', label: 'Mapel & Materi' },
      { key: 'ai', to: '/guru/ai', icon: '🤖', label: 'Asisten AI' },
      { key: 'set', to: '/guru/pengaturan', icon: '⚙️', label: 'Pengaturan' },
    ];
    return teacherNavCache;
  }

  async function renderTeacher(page, rest) {
    let unread = 0;
    try {
      const an = await api.analytics();
      unread = an.unread || 0;
      window.__an = an;
    } catch (e) { /* ignore */ }
    const nav = teacherNav(unread);
    const sub = rest[0] || '';

    if (sub === 'games') {
      if (rest[1]) return teacherGameDetail(rest[1], await shell('games', nav));
      return teacherGames(await shell('games', nav));
    }
    if (sub === 'buat') return teacherCreate(await shell('buat', nav), rest[1]);
    if (sub === 'edit' && rest[1]) return teacherEditGame(rest[1], nav);
    if (sub === 'kelas') return teacherClasses(await shell('kelas', nav), rest[1]);
    if (sub === 'hasil') return teacherResults(await shell('hasil', nav), rest[1]);
    if (sub === 'mapel') return teacherSubjects(await shell('mapel', nav));
    if (sub === 'ai') return teacherAI(await shell('ai', nav));
    if (sub === 'pengaturan') return teacherSettings(await shell('set', nav));
    return teacherDashboard(await shell('dash', nav));
  }

  function statCard(cls, icon, num, label) {
    return h('div', { class: 'stat ' + cls },
      h('div', { class: 'ico' }, icon),
      h('div', { class: 'num' }, num),
      h('div', { class: 'muted small', style: { marginTop: '.3rem', fontWeight: 700 } }, label),
    );
  }
  function emptyBox(icon, title, desc) {
    return h('div', { class: 'card empty' }, h('div', { class: 'big' }, icon), h('h3', {}, title), h('p', { class: 'small' }, desc));
  }

  /* ------------------------------ DASHBOARD ------------------------------ */
  async function teacherDashboard(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', {}, h('h1', {}, 'Dashboard Guru'), h('p', { class: 'muted' }, 'Semua hasil kerja siswa otomatis masuk ke sini.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => exportCSV() }, '⬇️ Unduh CSV'),
        h('button', { class: 'btn btn-sm', onclick: () => navigate('/guru/buat') }, '✨ Buat Game Baru'),
      ),
    ));

    const a = window.__an || await api.analytics();
    main.appendChild(h('div', { class: 'grid g4', style: { marginBottom: '1.1rem' } },
      statCard('stat-1', '👥', String(a.totalStudents), 'Siswa terdaftar'),
      statCard('stat-2', '🎮', String(a.totalGames), 'Game dibuat'),
      statCard('stat-3', '📥', String(a.totalAttempts), 'Tugas masuk'),
      statCard('stat-4', '📈', (a.avgScore || 0) + '%', 'Rata-rata nilai'),
    ));

    const grid2 = h('div', { class: 'grid g2' });
    main.appendChild(grid2);

    // insight AI
    grid2.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🤖 Analisis AI'), h('span', { class: 'ai-badge' }, 'AI')),
      h('p', { class: 'small' }, a.insight.ringkasan),
      h('ul', { class: 'list-plain small muted' }, (a.insight.saran || []).map((s) => h('li', {}, '• ' + s))),
      h('button', { class: 'btn btn-sm btn-ghost', style: { marginTop: '.7rem' }, onclick: () => navigate('/guru/ai') }, 'Buka Asisten AI →'),
    ));

    // leaderboard
    const lb = h('div', {});
    (a.leaderboard || []).slice(0, 6).forEach((s, i) => {
      lb.appendChild(h('div', { class: 'rank-row rank-' + (i + 1) },
        h('div', { class: 'rank-no' }, String(i + 1)),
        h('div', { class: 'avatar', style: { background: s.color || '#6366f1' } }, s.avatar || '🧑‍🎓'),
        h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 800 } }, s.name), h('div', { class: 'tiny muted' }, `${s.plays} game · rata-rata ${s.avg}%`)),
        h('div', { style: { fontWeight: 900 } }, s.points + ' ⭐'),
      ));
    });
    grid2.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🏆 Papan Peringkat')),
      (a.leaderboard || []).length ? lb : emptyBox('🏅', 'Belum ada skor', 'Nilai siswa akan muncul di sini setelah mereka bermain.'),
    ));

    // tugas terbaru
    const recent = await api.teacherAttempts().catch(() => []);
    const rows = h('div', {});
    recent.slice(0, 8).forEach((at) => {
      rows.appendChild(h('div', { class: 'rank-row', style: { cursor: 'pointer' }, onclick: () => openAttemptDetail(at.id, true) },
        h('div', { class: 'avatar', style: { background: '#6366f1' } }, at.studentAvatar || '🧑‍🎓'),
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontWeight: 800 } }, at.studentName),
          h('div', { class: 'tiny muted' }, `${at.gameTitle} · ${relTime(at.finishedAt)}`),
        ),
        h('div', { style: { textAlign: 'right' } },
          h('div', { style: { fontWeight: 900, color: at.percent >= 70 ? '#86efac' : at.percent >= 40 ? '#fde68a' : '#fecaca' } }, Math.round(at.percent) + '%'),
          h('div', { class: 'tiny muted' }, at.correct + '/' + at.total),
        ),
      ));
    });
    main.appendChild(h('div', { class: 'card', style: { marginTop: '1.1rem' } },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '📥 Tugas baru masuk'), h('a', { class: 'btn btn-sm btn-ghost', onclick: () => navigate('/guru/hasil') }, 'Lihat semua')),
      recent.length ? rows : emptyBox('📭', 'Belum ada tugas masuk', 'Bagikan kode game ke siswa untuk mulai.'),
    ));

    // performa per game
    if ((a.perGame || []).length) {
      const pg = h('div', { class: 'grid g3', style: { marginTop: '1.1rem' } });
      a.perGame.forEach((g) => {
        pg.appendChild(h('div', { class: 'card' },
          h('div', { class: 'row' },
            h('div', { class: 'game-cover', style: { width: '44px', height: '44px', fontSize: '1.4rem' } }, g.cover || '🎮'),
            h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 800 } }, g.title), h('div', { class: 'tiny muted' }, `${g.students} siswa · ${g.attempts} pengerjaan`)),
          ),
          h('div', { style: { marginTop: '.6rem' } },
            h('div', { class: 'row-between tiny muted' }, h('span', {}, 'Rata-rata'), h('span', {}, g.avg + '%')),
            h('div', { class: 'bar ' + (g.avg >= 70 ? '' : g.avg >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: g.avg + '%' } })),
          ),
          h('div', { class: 'game-actions' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => navigate('/guru/games/' + g.id) }, 'Detail')),
        ));
      });
      main.appendChild(pg);
    }
  }

  async function exportCSV() {
    if (OFFLINE) {
      const rows = [['Tanggal', 'Siswa', 'Game', 'Benar', 'Total', 'Nilai', 'Persen']];
      let attempts;
      if (api.cloud) attempts = await api.teacherAttempts();
      else attempts = (JSON.parse(localStorage.getItem('pb_offline_db_v1')) || {}).attempts || [];
      attempts.forEach((a) => rows.push([a.finishedAt, a.studentName, a.gameTitle, a.correct, a.total, a.score + '/' + a.maxScore, a.percent]));
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a2 = document.createElement('a');
      a2.href = URL.createObjectURL(blob); a2.download = 'nilai-siswa.csv'; a2.click();
      return;
    }
    window.location.href = '/api/teacher/export.csv';
  }

  /* ------------------------------ GAME SAYA ------------------------------ */
  async function teacherGames(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', {}, h('h1', {}, '🎮 Game Saya'), h('p', { class: 'muted' }, 'Buat, ubah, dan bagikan game ke siswa.')),
      h('button', { class: 'btn', onclick: () => navigate('/guru/buat') }, '✨ Buat Game Baru'),
    ));
    const games = await api.games().catch(() => []);
    if (!games.length) return main.appendChild(emptyBox('🎮', 'Belum ada game', 'Klik "Buat Game Baru" — AI akan membantu menyusun soal dari materi kamu.'));
    const grid = h('div', { class: 'grid g3' });
    games.forEach((g) => {
      grid.appendChild(h('div', { class: 'game-card' + (g.status === 'draft' ? ' draft' : '') },
        g.status === 'draft' ? h('div', { class: 'ribbon' }, 'DRAF') : null,
        h('div', { class: 'row' },
          h('div', { class: 'game-cover' }, g.cover || '🎮'),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { class: 'game-title' }, g.title),
            h('div', { class: 'tiny muted' }, `${g.subjectIcon || '📘'} ${g.subjectName || 'Tanpa mapel'}${g.topicName ? ' · ' + g.topicName : ''}`),
          ),
        ),
        g.desc ? h('p', { class: 'small muted', style: { margin: 0 } }, g.desc.slice(0, 90)) : null,
        h('div', { class: 'game-meta' },
          h('span', { class: 'chip' }, `❓ ${g.questionCount} soal`),
          h('span', { class: 'chip chip-info' }, `🔑 ${g.shareCode}`),
          h('span', { class: 'chip ' + (g.status === 'published' ? 'chip-ok' : 'chip-warn') }, g.status === 'published' ? '● Terbit' : '○ Draf'),
        ),
        h('div', { class: 'tiny muted' }, g.attempts ? `📥 ${g.attempts} pengerjaan · rata-rata ${g.avg}%` : 'Belum ada yang mengerjakan'),
        h('div', { class: 'game-actions' },
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => navigate('/guru/games/' + g.id) }, '📊 Detail'),
          h('button', { class: 'btn btn-sm', onclick: () => navigate('/guru/edit/' + g.id) }, '✏️ Ubah'),
          h('button', { class: 'btn btn-sm btn-ok', onclick: () => shareGame(g) }, '📤 Bagikan'),
        ),
      ));
    });
    main.appendChild(grid);
  }

  function shareGame(g) {
    const url = location.origin + '/#/main/' + g.shareCode;
    const body = h('div', {},
      h('p', { class: 'muted small' }, 'Bagikan salah satu cara berikut ke siswa:'),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Kode game'), h('div', { class: 'row' },
        h('input', { class: 'inp', value: g.shareCode, readonly: 'readonly', style: { fontSize: '1.5rem', letterSpacing: '.2em', textAlign: 'center', fontWeight: 900, maxWidth: '220px' } }),
        h('button', { class: 'btn btn-sm', onclick: (e) => copyText(g.shareCode, e.currentTarget) }, '📋 Salin'),
      )),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Link langsung main'),
        h('div', { class: 'row' }, h('input', { class: 'inp', id: 'share-url', value: url, readonly: 'readonly' }), h('button', { class: 'btn btn-sm', onclick: (e) => copyText(url, e.currentTarget) }, '📋 Salin'))),
      g.status !== 'published' ? h('div', { class: 'demo-box' }, '⚠️ Game masih DRAF sehingga siswa belum bisa main. ', h('button', { class: 'btn btn-sm', onclick: async () => { await api.updateGame(g.id, { status: 'published' }); toast('Game dipublikasikan ✅', 'ok'); m.close(); render(); } }, 'Publikasikan sekarang')) : null,
      h('div', { class: 'divider' }),
      h('div', { class: 'center' },
        h('div', { class: 'tiny muted', style: { marginBottom: '.4rem' } }, 'QR Code (siswa bisa memindai dengan HP)'),
        h('div', { html: qrSVG(url), style: { display: 'inline-block', padding: '.7rem', background: '#fff', borderRadius: '14px' } }),
      ),
    );
    const m = modal({ title: '📤 Bagikan: ' + g.title, body, wide: false });
  }

  function copyText(t, btn) {
    navigator.clipboard.writeText(t).then(() => {
      const old = btn.textContent; btn.textContent = '✅ Tersalin';
      setTimeout(() => { btn.textContent = old; }, 1600);
    }).catch(() => toast('Salin manual: ' + t, 'info'));
  }

  /** QR code generator ringan (byte mode, versi otomatis, EC level M). */
  function qrSVG(text) {
    try {
      const m = QR.encode(text);
      const size = m.length, cell = 6, pad = 2;
      const w = (size + pad * 2) * cell;
      let rects = '';
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) rects += `<rect x="${(x + pad) * cell}" y="${(y + pad) * cell}" width="${cell}" height="${cell}"/>`;
      return `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${w}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
    } catch (e) { return '<div style="color:#111;font-size:12px">QR tidak tersedia</div>'; }
  }

  /* --------------------------- DETAIL GAME GURU --------------------------- */
  async function teacherGameDetail(id, main) {
    if (!main || main.__stale) return;
    const data = await api.game(id).catch(() => null);
    if (!data) return main.appendChild(emptyBox('❓', 'Game tidak ditemukan', ''));
    const g = data.game, qs = data.questions;
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', { class: 'row' },
        h('div', { class: 'game-cover' }, g.cover || '🎮'),
        h('div', {}, h('h1', {}, g.title), h('p', { class: 'muted' }, `${g.subjectName || 'Tanpa mapel'}${g.topicName ? ' · ' + g.topicName : ''} · ${qs.length} soal · kode ${g.shareCode}`)),
      ),
      h('div', { class: 'row no-print' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => shareGame(g) }, '📤 Bagikan'),
        h('button', { class: 'btn btn-sm', onclick: () => navigate('/guru/edit/' + g.id) }, '✏️ Ubah'),
        g.status === 'published'
          ? h('button', { class: 'btn btn-sm btn-warn', onclick: async () => { await api.updateGame(g.id, { status: 'draft' }); toast('Game dijadikan draf', 'ok'); render(); } }, 'Jadikan Draf')
          : h('button', { class: 'btn btn-sm btn-ok', onclick: async () => { await api.updateGame(g.id, { status: 'published' }); toast('Game terbit ✅', 'ok'); render(); } }, '🚀 Publikasikan'),
        h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDlg('Hapus game ini beserta soal dan nilainya?', async () => { await api.deleteGame(g.id); toast('Game dihapus', 'ok'); navigate('/guru/games'); }, 'Hapus') }, '🗑'),
      ),
    ));

    const atts = (g.attempts || []).sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    const avg = atts.length ? Math.round(atts.reduce((s, a) => s + a.percent, 0) / atts.length) : 0;
    main.appendChild(h('div', { class: 'grid g4', style: { marginBottom: '1.1rem' } },
      statCard('stat-1', '📥', String(atts.length), 'Pengerjaan'),
      statCard('stat-2', '👥', String(new Set(atts.map((a) => a.studentId)).size), 'Siswa ikut'),
      statCard('stat-3', '📈', avg + '%', 'Rata-rata'),
      statCard('stat-4', '🏆', atts.length ? Math.round(Math.max(...atts.map((a) => a.percent))) + '%' : '-', 'Nilai tertinggi'),
    ));

    const grid2 = h('div', { class: 'grid g2' });
    main.appendChild(grid2);

    // daftar nilai
    const tbl = h('div', { class: 'tablewrap' },
      h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Siswa', 'Kelas', 'Waktu', 'Benar', 'Nilai', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, atts.slice(0, 40).map((a) => h('tr', { style: { cursor: 'pointer' }, onclick: () => openAttemptDetail(a.id, true) },
          h('td', {}, h('div', { class: 'row' }, h('span', {}, a.studentAvatar || '🧑‍🎓'), h('b', {}, a.studentName))),
          h('td', { class: 'muted' }, a.className || '-'),
          h('td', { class: 'muted tiny' }, relTime(a.finishedAt)),
          h('td', {}, `${a.correct}/${a.total}`),
          h('td', {}, h('div', { class: 'row' }, h('b', {}, Math.round(a.percent) + '%'), h('div', { class: 'bar ' + (a.percent >= 70 ? '' : a.percent >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: Math.min(100, a.percent) + '%' } })))),
          h('td', {}, h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => { e.stopPropagation(); openAttemptDetail(a.id, true); } }, 'Lihat')),
        ))),
      ),
    );
    grid2.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '📥 Nilai siswa')),
      atts.length ? tbl : emptyBox('📭', 'Belum ada yang mengerjakan', 'Bagikan kode ' + g.shareCode + ' ke siswa.'),
    ));

    // analisis butir
    const qstat = qs.map((q) => {
      let right = 0, wrong = 0;
      atts.forEach((a) => (a.answers || []).forEach((ans) => {
        if (ans.questionId !== q.id) return;
        if (ans.correct) right++; else wrong++;
      }));
      return { q, right, wrong, rate: right + wrong ? Math.round(right / (right + wrong) * 100) : null };
    }).filter((x) => x.rate !== null).sort((a, b) => a.rate - b.rate);
    grid2.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🎯 Soal tersulit'), h('span', { class: 'ai-badge' }, 'analisis')),
      qstat.length ? h('div', {}, qstat.slice(0, 6).map((x) => h('div', { style: { marginBottom: '.7rem' } },
        h('div', { class: 'row-between small' }, h('span', {}, truncate(x.q.prompt, 60)), h('b', { style: { color: x.rate < 50 ? '#fecaca' : '#bbf7d0' } }, x.rate + '% benar')),
        h('div', { class: 'bar ' + (x.rate >= 70 ? '' : x.rate >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: x.rate + '%' } })),
        h('div', { class: 'tiny muted', style: { marginTop: '.2rem' } }, `${x.right} benar · ${x.wrong} salah · ${window.PBGame.TYPE_LABEL[x.q.type] || x.q.type}`),
      ))) : h('p', { class: 'muted small' }, 'Belum ada data untuk dianalisis.'),
      qstat.length && qstat[0].rate < 60 ? h('div', { class: 'demo-box', style: { marginTop: '.8rem' } }, '🤖 Saran AI: bahas ulang soal pertama di kelas, kemungkinan konsepnya belum dipahami. Kamu juga bisa mengganti soal ini di menu Ubah.') : null,
    ));

    // daftar soal
    main.appendChild(h('div', { class: 'card', style: { marginTop: '1.1rem' } },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, `📝 Daftar soal (${qs.length})`), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => navigate('/guru/edit/' + g.id) }, '✏️ Ubah soal')),
      h('div', { class: 'scroll-y' }, qs.map((q, i) => h('div', { class: 'qitem' },
        h('div', { class: 'qitem-head' },
          h('span', { class: 'chip' }, `#${i + 1}`),
          h('span', { class: 'chip chip-info' }, window.PBGame.TYPE_LABEL[q.type] || q.type),
          h('span', { class: 'chip' }, q.points + ' poin'),
          q.source === 'api' ? h('span', { class: 'chip chip-ai' }, '🤖 AI API') : q.source === 'offline' ? h('span', { class: 'chip chip-ai' }, '✨ AI Offline') : h('span', { class: 'chip' }, '✍️ Manual'),
          h('div', { class: 'spacer' }),
          h('span', { class: 'chip' }, q.difficulty || 'sedang'),
        ),
        h('div', { class: 'small', style: { whiteSpace: 'pre-wrap', fontWeight: 700 } }, q.prompt),
        q.type === 'mc' || q.type === 'tf' ? h('div', { style: { marginTop: '.5rem' } }, (q.options || []).map((o) => h('div', { class: 'tiny', style: { padding: '.2rem 0' } }, String(o) === String(q.answer) ? '✅ ' : '▫️ ', o))) : null,
        q.type === 'fill' ? h('div', { class: 'tiny', style: { marginTop: '.4rem' } }, '✅ Kunci: ', h('b', {}, String(q.answer))) : null,
        q.type === 'order' ? h('div', { class: 'tiny', style: { marginTop: '.4rem', whiteSpace: 'pre-wrap' } }, '✅ Urutan:\n' + (q.answer || []).map((x, k) => `${k + 1}. ${x}`).join('\n')) : null,
        q.type === 'match' ? h('div', { class: 'tiny', style: { marginTop: '.4rem' } }, (q.answer || []).map((p) => h('div', {}, '✅ ' + p.left + ' = ' + p.right))) : null,
        q.explanation ? h('div', { class: 'tiny muted', style: { marginTop: '.4rem' } }, '💡 ' + q.explanation) : null,
      ))),
    ));
  }

  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  /* ========================= WIZARD BUAT GAME (AI) ========================= */
  async function teacherCreate(main, editId) {
    const S = {
      step: 0,
      title: '', subjectId: '', topicName: '', desc: '', cover: '🎮',
      material: '', level: ME.gradeLevel === 'smp' ? 'smp' : ME.gradeLevel === 'sma' ? 'sma' : 'sd-kelas-3-4',
      types: ['mc', 'tf', 'fill'], count: 10, difficulty: 'campur', arithmetic: false,
      questions: [], classIds: [], settings: { timer: 0, showExplanation: true, shuffle: true, passScore: 70 },
      status: 'published', engineInfo: '',
    };
    let subjects = [];
    let classes = [];
    let materials = [];

    const container = h('div', {});
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', {}, h('h1', {}, editId ? '✏️ Ubah Game' : '✨ Buat Game dengan AI'), h('p', { class: 'muted' }, 'Tempel materi → AI menyusun soal → terbitkan ke kelas.')),
      h('span', { class: 'ai-badge' }, '🤖 PB-AI Generator'),
    ));
    main.appendChild(container);

    (async () => {
      [subjects, classes, materials] = await Promise.all([api.subjects().catch(() => []), api.classes().catch(() => []), api.materials().catch(() => [])]);
      if (editId) {
        const d = await api.game(editId).catch(() => null);
        if (d) {
          Object.assign(S, {
            title: d.game.title, subjectId: d.game.subjectId || '', topicName: d.game.topicName || '', desc: d.game.desc || '',
            cover: d.game.cover || '🎮', classIds: d.game.classIds || [], questions: d.questions.map((q) => Object.assign({}, q)),
            settings: Object.assign(S.settings, d.game.settings || {}), status: d.game.status || 'draft',
          });
          S.editId = editId;
          S.step = 2;
        }
      }
      draw();
    })();

    const STEPS = ['1. Identitas', '2. Materi', '3. Soal AI', '4. Terbitkan'];
    function draw() {
      container.innerHTML = '';
      container.appendChild(h('div', { class: 'steps' }, STEPS.map((s, i) => h('div', { class: 'step' + (i === S.step ? ' active' : i < S.step ? ' done' : ''), onclick: () => { if (i <= S.step || i === S.step + 1) { S.step = i; draw(); } } }, i < S.step ? '✓ ' : '', s))));
      const card = h('div', { class: 'card card-pad' });
      container.appendChild(card);
      if (S.step === 0) stepIdentity(card);
      if (S.step === 1) stepMaterial(card);
      if (S.step === 2) stepQuestions(card);
      if (S.step === 3) stepPublish(card);
    }

    function navButtons(card, { back = true, next = true, nextLabel = 'Lanjut →', onNext, disabled } = {}) {
      const row = h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '1.2rem' } });
      row.appendChild(back ? h('button', { class: 'btn btn-ghost', onclick: () => { S.step = Math.max(0, S.step - 1); draw(); } }, '← Kembali') : h('div', {}));
      if (next) row.appendChild(h('button', { class: 'btn btn-lg', disabled: disabled || false, onclick: onNext }, nextLabel));
      card.appendChild(row);
    }

    /* langkah 1 */
    function stepIdentity(card) {
      card.appendChild(h('h2', {}, '🎯 Identitas game'));
      card.appendChild(h('p', { class: 'muted small' }, 'Judul dan mata pelajaran. Mapel baru bisa ditambahkan langsung di sini.'));
      const title = h('input', { class: 'inp', value: S.title, placeholder: 'Contoh: Petualangan Fotosintesis' });
      const subSel = h('select', { class: 'inp' }, h('option', { value: '' }, '— pilih mata pelajaran —'),
        subjects.map((s) => h('option', { value: s.id, selected: s.id === S.subjectId }, `${s.icon} ${s.name} (${s.jenjang || ''})`)));
      const topic = h('input', { class: 'inp', value: S.topicName, placeholder: 'Contoh: Fotosintesis / Pecahan / Proklamasi 1945' });
      const desc = h('input', { class: 'inp', value: S.desc, placeholder: 'Deskripsi singkat (opsional)' });
      const covers = ['🎮', '🌱', '🔢', '🇮🇩', '🐸', '🔤', '🧪', '🌍', '🚀', '🎨', '🎵', '⚽', '🦖', '💡', '🧮', '🗺️'];
      const coverRow = h('div', { class: 'row' });
      covers.forEach((c) => coverRow.appendChild(h('button', { class: 'icon-btn', style: { fontSize: '1.3rem', border: c === S.cover ? '2px solid #a78bfa' : '' }, onclick: (e) => { S.cover = c; coverRow.querySelectorAll('button').forEach((b) => b.style.border = ''); e.currentTarget.style.border = '2px solid #a78bfa'; } }, c)));
      const levelSel = h('select', { class: 'inp' },
        ['sd-kelas-1-2|SD kelas 1–2', 'sd-kelas-3-4|SD kelas 3–4', 'sd-kelas-5-6|SD kelas 5–6', 'smp|SMP', 'sma|SMA/SMK'].map((o) => {
          const [v, l] = o.split('|');
          return h('option', { value: v, selected: v === S.level }, l);
        }));

      card.appendChild(h('div', { class: 'grid g2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Judul game *'), title),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Mata pelajaran *'),
          h('div', { class: 'row' }, subSel, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => addSubjectDialog(() => { api.subjects().then((s) => { subjects = s; draw(); }); }) }, '＋ Mapel baru'))),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Topik / materi'), topic),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Jenjang (menentukan tingkat kesulitan AI)'), levelSel),
      ));
      card.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Deskripsi'), desc));
      card.appendChild(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Ikon sampul'), coverRow));

      navButtons(card, {
        back: false,
        onNext: async () => {
          if (!title.value.trim()) return toast('Judul wajib diisi.', 'err');
          S.title = title.value.trim(); S.subjectId = subSel.value; S.topicName = topic.value.trim();
          S.desc = desc.value.trim(); S.level = levelSel.value;
          if (!S.subjectId) return toast('Pilih mata pelajaran dulu (atau buat yang baru).', 'err');
          S.step = 1; draw();
        },
      });
    }

    /* langkah 2 */
    function stepMaterial(card) {
      card.appendChild(h('h2', {}, '📖 Sumber materi'));
      card.appendChild(h('p', { class: 'muted small' }, 'Tempel materi dari buku/notes. AI akan membaca lalu menyusun soal dari isinya. Semakin rapi (pakai tanda "–" atau "X: pengertian"), semakin bagus soalnya.'));

      const ta = h('textarea', { class: 'inp', style: { minHeight: '230px' }, placeholder: 'Contoh:\nFotosintesis adalah proses pembuatan makanan oleh tumbuhan hijau.\n- Klorofil: zat hijau daun yang menyerap cahaya matahari.\n- Bahan fotosintesis: karbon dioksida, air, dan cahaya.\n- Hasil fotosintesis: glukosa dan oksigen.' }, S.material);
      card.appendChild(h('div', { class: 'field' }, ta));

      if (materials.length) {
        const sel = h('select', { class: 'inp' }, h('option', { value: '' }, '— muat materi tersimpan —'), materials.map((m) => h('option', { value: m.id }, m.title)));
        card.appendChild(h('div', { class: 'row' }, sel, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { const m = materials.find((x) => x.id === sel.value); if (!m) return toast('Pilih materi dulu.', 'err'); ta.value = m.content; S.material = m.content; if (!S.topicName) S.topicName = m.title; toast('Materi dimuat ✅', 'ok'); } }, 'Muat')));
      }

      card.appendChild(h('div', { class: 'row', style: { marginTop: '.8rem' } },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ta.value = CONTOH.ipa; S.material = ta.value; } }, 'Contoh materi IPA'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ta.value = CONTOH.sejarah; S.material = ta.value; } }, 'Contoh IPS'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { ta.value = CONTOH.english; S.material = ta.value; } }, 'Contoh B. Inggris'),
        h('button', { class: 'btn btn-sm btn-ok', onclick: async (ev) => {
          const tp = S.topicName || S.title || '';
          if (!tp.trim()) return toast('Isi dulu judul/topik game di langkah 1.', 'err');
          const btn = ev.currentTarget; btn.disabled = true; btn.textContent = '🪄 Menulis materi…';
          try {
            const r = await api.generateMaterial({ topic: tp, level: S.level, subject: (subjects.find((x) => x.id === S.subjectId) || {}).name || '' });
            ta.value = r.text; S.material = r.text;
            toast('🪄 Materi otomatis siap (' + r.source + ')', 'ok');
          } catch (e) { toast(e.message, 'err'); }
          btn.disabled = false; btn.textContent = '🪄 Materi otomatis (AI)';
        } }, '🪄 Materi otomatis (AI)'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
          if (!ta.value.trim()) return toast('Isi materi dulu.', 'err');
          await api.saveMaterial({ title: S.topicName || S.title, content: ta.value, subjectId: S.subjectId, jenjang: S.level });
          toast('Materi tersimpan ke bank materi ✅', 'ok');
          materials = await api.materials().catch(() => []);
        } }, '💾 Simpan materi ini'),
      ));

      const arit = h('input', { type: 'checkbox', checked: S.arithmetic });
      card.appendChild(h('div', { class: 'divider' }));
      card.appendChild(h('label', { class: 'check' + (S.arithmetic ? ' on' : '') }, arit, h('span', {}, '➕ Tambahkan soal hitungan otomatis (cocok untuk Matematika)')));
      arit.addEventListener('change', () => { S.arithmetic = arit.checked; arit.parentElement.classList.toggle('on', arit.checked); });
      card.appendChild(h('p', { class: 'hint' }, 'Bila aktif, AI membuat soal aritmetika + soal cerita sesuai jenjang, selain soal dari materi.'));

      navButtons(card, {
        nextLabel: '✨ Buat Soal dengan AI',
        onNext: async () => {
          S.material = ta.value;
          if (S.material.trim().length < 20 && !S.arithmetic) return toast('Materi terlalu pendek. Tempel minimal 1–2 kalimat, atau aktifkan soal hitungan otomatis.', 'err');
          S.step = 2; draw();
          runAI();
        },
      });
    }

    async function runAI() {
      const box = container.querySelector('.card');
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'center', style: { padding: '2.4rem 1rem' } },
        h('div', { style: { fontSize: '3rem' } }, '🤖'),
        h('h3', {}, 'AI sedang membaca materi kamu…'),
        h('p', { class: 'muted small' }, 'Menganalisis kalimat, istilah, definisi, angka, dan langkah-langkah untuk menyusun soal.'),
        h('div', { class: 'spinner', style: { margin: '1rem auto', width: '28px', height: '28px' } }),
      ));
      try {
        const res = await api.aiPreview({
          material: S.material, topic: S.topicName || S.title,
          subject: (subjects.find((s) => s.id === S.subjectId) || {}).name || '',
          count: S.count, types: S.types, level: S.level, arithmetic: S.arithmetic, difficulty: S.difficulty,
        });
        S.questions = res.questions.map((q, i) => Object.assign({ id: PB.uid('q'), order: i + 1 }, q));
        S.engineInfo = res.engine || '';
        toast(`AI membuat ${S.questions.length} soal ✅ (${S.engineInfo})`, 'ok');
      } catch (e) {
        toast(e.message, 'err');
        S.questions = S.questions.length ? S.questions : api.localGenerate({ material: S.material, topic: S.topicName, count: S.count, types: S.types });
      }
      box.innerHTML = '';
      stepQuestions(box);
    }

    /* langkah 3 */
    function stepQuestions(card) {
      card.appendChild(h('div', { class: 'row-between', style: { marginBottom: '.4rem' } },
        h('h2', {}, '🧩 Soal hasil AI'),
        h('div', { class: 'row' },
          S.engineInfo ? h('span', { class: 'chip chip-ai' }, '🤖 ' + S.engineInfo) : null,
          h('span', { class: 'chip' }, S.questions.length + ' soal'),
        ),
      ));
      card.appendChild(h('p', { class: 'muted small' }, 'Semua soal bisa diedit, dihapus, ditambah manual, atau dibuat ulang. Klik lingkaran untuk menandai jawaban benar.'));

      // panel kontrol AI
      const ctrl = h('div', { class: 'card', style: { background: 'rgba(168,85,247,.12)', marginBottom: '1rem' } });
      const typeBoxes = {};
      [['mc', 'Pilihan Ganda'], ['tf', 'Benar/Salah'], ['fill', 'Isian'], ['order', 'Urutan'], ['match', 'Menjodohkan']].forEach(([v, l]) => {
        const cb = h('input', { type: 'checkbox', checked: S.types.includes(v) });
        typeBoxes[v] = cb;
        cb.addEventListener('change', () => { S.types = cb.checked ? [...S.types, v] : S.types.filter((x) => x !== v); cb.parentElement.classList.toggle('on', cb.checked); });
        ctrl.appendChild(h('label', { class: 'check' + (S.types.includes(v) ? ' on' : ''), style: { display: 'inline-flex', margin: '.2rem' } }, cb, l));
      });
      const countSel = h('select', { class: 'inp', style: { maxWidth: '120px' } }, [5, 8, 10, 15, 20].map((n) => h('option', { value: n, selected: n === S.count }, n + ' soal')));
      const diffSel = h('select', { class: 'inp', style: { maxWidth: '140px' } }, ['campur|Campuran', 'mudah|Mudah', 'sedang|Sedang', 'sulit|Sulit'].map((o) => { const [v, l] = o.split('|'); return h('option', { value: v, selected: v === S.difficulty }, l); }));
      ctrl.appendChild(h('div', { class: 'row', style: { marginTop: '.7rem' } },
        h('label', { class: 'lbl', style: { margin: 0 } }, 'Jumlah'), countSel,
        h('label', { class: 'lbl', style: { margin: 0 } }, 'Kesulitan'), diffSel,
        h('button', { class: 'btn btn-sm', onclick: () => { S.count = Number(countSel.value); S.difficulty = diffSel.value; runAI(); } }, '🔄 Buat Ulang dengan AI'),
      ));
      card.appendChild(ctrl);

      const list = h('div', { class: 'scroll-y', style: { maxHeight: '58vh' } });
      card.appendChild(list);
      renderQList(list);

      card.appendChild(h('div', { class: 'row', style: { marginTop: '.8rem' } },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => addManualQuestion(list) }, '✍️ Tambah soal manual'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => importQuestionsModal(list) }, '📋 Tempel soal dari teks'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => previewModal() }, '👁 Pratinjau seperti siswa'),
      ));

      navButtons(card, {
        nextLabel: 'Lanjut: Publikasi →',
        onNext: () => {
          if (!S.questions.length) return toast('Belum ada soal. Buat dengan AI atau tambah manual.', 'err');
          const bad = S.questions.findIndex((q) => !q.prompt || !q.prompt.trim());
          if (bad >= 0) return toast(`Soal nomor ${bad + 1} belum punya pertanyaan.`, 'err');
          S.step = 3; draw();
        },
      });
    }

    function renderQList(list) {
      list.innerHTML = '';
      if (!S.questions.length) {
        list.appendChild(emptyBox('🧩', 'Belum ada soal', 'Klik "Buat Ulang dengan AI" atau tambah manual.'));
        return;
      }
      S.questions.forEach((q, i) => list.appendChild(qEditor(q, i, list)));
    }

    function qEditor(q, i, list) {
      const box = h('div', { class: 'qitem' });
      box.appendChild(h('div', { class: 'qitem-head' },
        h('span', { class: 'chip' }, `#${i + 1}`),
        h('select', { class: 'inp', style: { width: 'auto', padding: '.3rem .5rem', fontSize: '.82rem' }, onchange: (e) => { changeType(q, e.target.value, box, list); } },
          Object.entries(window.PBGame.TYPE_LABEL).map(([v, l]) => h('option', { value: v, selected: v === q.type }, l))),
        h('input', { class: 'inp', type: 'number', min: 5, max: 50, step: 5, value: q.points || 10, style: { width: '80px', padding: '.3rem .5rem', fontSize: '.82rem' }, onchange: (e) => { q.points = Number(e.target.value) || 10; }, title: 'Poin' }),
        h('div', { class: 'spacer' }),
        h('button', { class: 'icon-btn', title: 'Naik', onclick: () => move(i, -1, list) }, '▲'),
        h('button', { class: 'icon-btn', title: 'Turun', onclick: () => move(i, 1, list) }, '▼'),
        h('button', { class: 'icon-btn', title: 'Hapus', onclick: () => { S.questions.splice(i, 1); renderQList(list); } }, '🗑'),
      ));
      const promptTa = h('textarea', { class: 'inp', style: { minHeight: '62px' }, oninput: (e) => { q.prompt = e.target.value; } }, q.prompt || '');
      box.appendChild(promptTa);

      if (q.type === 'mc') {
        const opts = q.options && q.options.length ? q.options.slice(0, 4) : ['', '', '', ''];
        while (opts.length < 4) opts.push('');
        q.options = opts;
        const wrap = h('div', {});
        opts.forEach((o, k) => {
          const inp = h('input', { class: 'inp', value: o, placeholder: 'Pilihan ' + (k + 1), oninput: (e) => { q.options[k] = e.target.value; } });
          const radio = h('div', { class: 'radio' + (String(q.answer) === String(o) && o ? ' on' : ''), title: 'Tandai sebagai jawaban benar', onclick: () => { q.answer = q.options[k]; wrap.querySelectorAll('.radio').forEach((r) => r.classList.remove('on')); radio.classList.add('on'); } });
          wrap.appendChild(h('div', { class: 'qopt-row' }, radio, inp));
        });
        box.appendChild(wrap);
      } else if (q.type === 'tf') {
        q.options = ['benar', 'salah'];
        const row = h('div', { class: 'row' });
        ['benar', 'salah'].forEach((v) => {
          const b = h('button', { class: 'btn btn-sm ' + (String(q.answer).toLowerCase() === v ? 'btn-ok' : 'btn-ghost'), onclick: () => { q.answer = v; row.querySelectorAll('button').forEach((x, k2) => { x.className = 'btn btn-sm ' + ((['benar', 'salah'][k2] === v) ? 'btn-ok' : 'btn-ghost'); }); } }, v === 'benar' ? '✅ Benar' : '❌ Salah');
          row.appendChild(b);
        });
        box.appendChild(row);
      } else if (q.type === 'fill') {
        q.options = [];
        box.appendChild(h('div', { class: 'field', style: { marginTop: '.5rem' } }, h('label', { class: 'lbl small' }, 'Kunci jawaban (isian siswa dinilai mirip)'), h('input', { class: 'inp', value: q.answer || '', oninput: (e) => { q.answer = e.target.value; } })));
      } else if (q.type === 'order') {
        const arr = Array.isArray(q.answer) ? q.answer.slice() : [];
        q.answer = arr;
        const ol = h('div', { class: 'order-list' });
        const repaint = () => { ol.innerHTML = ''; arr.forEach((t, k) => ol.appendChild(h('div', { class: 'order-item' }, h('span', { class: 'no' }, String(k + 1)), h('span', { style: { flex: 1 } }, t), h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, onclick: () => { if (k > 0) { [arr[k - 1], arr[k]] = [arr[k], arr[k - 1]]; repaint(); } } }, '▲'), h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, onclick: () => { if (k < arr.length - 1) { [arr[k + 1], arr[k]] = [arr[k], arr[k + 1]]; repaint(); } } }, '▼'), h('button', { class: 'icon-btn', style: { width: '30px', height: '30px' }, onclick: () => { arr.splice(k, 1); repaint(); } }, '🗑')))); };
        repaint();
        box.appendChild(ol);
        const addInp = h('input', { class: 'inp', placeholder: 'Tambah langkah lalu Enter' });
        addInp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && addInp.value.trim()) { arr.push(addInp.value.trim()); addInp.value = ''; repaint(); } });
        box.appendChild(h('div', { class: 'row', style: { marginTop: '.5rem' } }, addInp, h('button', { class: 'btn btn-sm', onclick: () => { if (addInp.value.trim()) { arr.push(addInp.value.trim()); addInp.value = ''; repaint(); } } }, '＋')));
      } else if (q.type === 'match') {
        const arr = Array.isArray(q.answer) ? q.answer.map((p) => ({ left: p.left, right: p.right })) : [];
        q.answer = arr;
        const ml = h('div', {});
        const repaint = () => {
          ml.innerHTML = '';
          arr.forEach((p, k) => ml.appendChild(h('div', { class: 'qopt-row' },
            h('input', { class: 'inp', value: p.left, placeholder: 'Istilah', oninput: (e) => { p.left = e.target.value; } }),
            h('span', {}, '↔'),
            h('input', { class: 'inp', value: p.right, placeholder: 'Pengertian', oninput: (e) => { p.right = e.target.value; } }),
            h('button', { class: 'icon-btn', onclick: () => { arr.splice(k, 1); repaint(); } }, '🗑'))));
        };
        repaint();
        box.appendChild(ml);
        box.appendChild(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { arr.push({ left: '', right: '' }); repaint(); } }, '＋ Tambah pasangan'));
      }

      const expTa = h('input', { class: 'inp', style: { marginTop: '.5rem' }, value: q.explanation || '', placeholder: '💡 Pembahasan / penjelasan (ditampilkan ke siswa setelah menjawab)', oninput: (e) => { q.explanation = e.target.value; } });
      box.appendChild(expTa);
      return box;
    }

    function changeType(q, type, box, list) {
      q.type = type;
      if (type === 'mc') { q.options = (q.options && q.options.length ? q.options : ['', '', '', '']).slice(0, 4); while (q.options.length < 4) q.options.push(''); }
      if (type === 'tf') { q.options = ['benar', 'salah']; if (!['benar', 'salah'].includes(String(q.answer).toLowerCase())) q.answer = 'benar'; }
      if (type === 'fill') { q.options = []; if (Array.isArray(q.answer)) q.answer = String(q.answer[0] || ''); }
      if (type === 'order') { q.answer = Array.isArray(q.answer) ? q.answer.map(String) : String(q.answer || '').split('\n').filter(Boolean); q.options = []; }
      if (type === 'match') { q.answer = Array.isArray(q.answer) ? q.answer : []; q.options = []; }
      renderQList(list);
    }

    function move(i, dir, list) {
      const j = i + dir;
      if (j < 0 || j >= S.questions.length) return;
      [S.questions[i], S.questions[j]] = [S.questions[j], S.questions[i]];
      renderQList(list);
    }

    function addManualQuestion(list) {
      S.questions.push({ id: PB.uid('q'), type: 'mc', prompt: '', options: ['', '', '', ''], answer: '', points: 10, explanation: '', difficulty: 'sedang', source: 'manual' });
      renderQList(list);
      setTimeout(() => { const els = list.querySelectorAll('textarea'); if (els.length) els[els.length - 1].focus(); }, 50);
    }

    function importQuestionsModal(list) {
      const ta = h('textarea', { class: 'inp', style: { minHeight: '200px' }, placeholder: 'Format 1 (pilihan ganda):\nSoal: Ibu kota Indonesia adalah?\nA. Jakarta\nB. Surabaya\nC. Bandung\nD. Medan\nJawaban: A\n\nFormat 2 (benar/salah):\nSoal: Air mendidih pada 100 derajat Celcius.\nJawaban: benar' });
      const m = modal({
        title: '📋 Tempel soal dari teks', wide: true,
        body: h('div', {}, h('p', { class: 'muted small' }, 'Tempel soal dari Word/WhatsApp. Sistem otomatis mengenali pola "Soal: … A. … Jawaban: …".'), ta),
        footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'), h('button', { class: 'btn', onclick: () => { const added = parsePasted(ta.value); if (!added) return toast('Format tidak dikenali.', 'err'); S.questions = S.questions.concat(added); toast(`${added.length} soal ditambahkan ✅`, 'ok'); m.close(); renderQList(list); } }, 'Tambahkan')],
      });
    }

    function parsePasted(text) {
      const blocks = String(text).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      const out = [];
      blocks.forEach((b) => {
        const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
        const qLine = lines.find((l) => /^(soal|pertanyaan|q)\s*[:.)-]/i.test(l));
        const prompt = qLine ? qLine.replace(/^(soal|pertanyaan|q)\s*[:.)-]\s*/i, '') : lines[0];
        if (!prompt) return;
        const optLines = lines.filter((l) => /^[a-e][.)]\s+/i.test(l));
        const ansLine = lines.find((l) => /^(jawaban|kunci|answer)\s*[:.)-]/i.test(l));
        if (optLines.length >= 2) {
          const options = optLines.map((l) => l.replace(/^[a-e][.)]\s+/i, '').trim());
          let answer = '';
          if (ansLine) {
            const v = ansLine.replace(/^(jawaban|kunci|answer)\s*[:.)-]\s*/i, '').trim();
            if (/^[a-e]$/i.test(v)) answer = options['abcde'.indexOf(v.toLowerCase())] || '';
            else answer = options.find((o) => o.toLowerCase() === v.toLowerCase()) || v;
          }
          while (options.length < 4) options.push('');
          out.push({ id: PB.uid('q'), type: 'mc', prompt, options: options.slice(0, 4), answer, points: 10, explanation: '', difficulty: 'sedang', source: 'tempel' });
        } else if (ansLine && /^(benar|salah|b|s)$/i.test(ansLine.replace(/^(jawaban|kunci|answer)\s*[:.)-]\s*/i, '').trim())) {
          const v = ansLine.replace(/^(jawaban|kunci|answer)\s*[:.)-]\s*/i, '').trim().toLowerCase();
          out.push({ id: PB.uid('q'), type: 'tf', prompt, options: ['benar', 'salah'], answer: v.startsWith('b') ? 'benar' : 'salah', points: 10, explanation: '', difficulty: 'mudah', source: 'tempel' });
        } else if (ansLine) {
          out.push({ id: PB.uid('q'), type: 'fill', prompt: prompt.includes('…') ? prompt : prompt + ' …', options: [], answer: ansLine.replace(/^(jawaban|kunci|answer)\s*[:.)-]\s*/i, '').trim(), points: 15, explanation: '', difficulty: 'sedang', source: 'tempel' });
        }
      });
      return out.length ? out : null;
    }

    function previewModal() {
      const m = modal({ title: '👁 Pratinjau (tampilan siswa)', wide: true, body: h('div', { id: 'prev-root' }) });
      const prev = document.getElementById('prev-root');
      const fake = { game: { title: S.title, desc: S.desc, cover: S.cover, subjectName: (subjects.find((s) => s.id === S.subjectId) || {}).name, topicName: S.topicName, settings: S.settings }, questions: S.questions };
      lastPlayStop = null;
      const inst = window.PBGame.play(prev, fake, { name: 'Pratinjau Guru' }, () => m.close());
      m.box.addEventListener('transitionend', () => {});
      const stop = () => { try { inst && inst.stop && inst.stop(); } catch (e) {} };
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { stop(); obs.disconnect(); } });
      obs.observe(document.body, { childList: true });
    }

    /* langkah 4 */
    function stepPublish(card) {
      card.appendChild(h('h2', {}, '🚀 Publikasi & pengaturan'));
      card.appendChild(h('p', { class: 'muted small' }, 'Pilih kelas yang boleh memainkan game ini. Kalau tidak dipilih, semua siswa dengan kode bisa main.'));

      const clsWrap = h('div', { class: 'grid g3' });
      if (!classes.length) clsWrap.appendChild(h('p', { class: 'muted' }, 'Belum ada kelas. ', h('a', { onclick: () => navigate('/guru/kelas') }, 'Buat kelas dulu →')));
      classes.forEach((c) => {
        const cb = h('input', { type: 'checkbox', checked: S.classIds.includes(c.id) });
        cb.addEventListener('change', () => { S.classIds = cb.checked ? [...S.classIds, c.id] : S.classIds.filter((x) => x !== c.id); cb.parentElement.classList.toggle('on', cb.checked); });
        clsWrap.appendChild(h('label', { class: 'check' + (S.classIds.includes(c.id) ? ' on' : '') }, cb, h('span', {}, `${c.name} (${c.students.length} siswa)`)));
      });
      card.appendChild(clsWrap);

      card.appendChild(h('div', { class: 'divider' }));
      const timer = h('select', { class: 'inp', style: { maxWidth: '190px' } }, [['0', 'Tanpa batas waktu'], ['20', '20 detik/soal'], ['30', '30 detik/soal'], ['45', '45 detik/soal'], ['60', '60 detik/soal']].map(([v, l]) => h('option', { value: v, selected: String(S.settings.timer) === v }, l)));
      const passScore = h('input', { class: 'inp', type: 'number', min: 0, max: 100, value: S.settings.passScore, style: { maxWidth: '140px' } });
      const showExp = h('input', { type: 'checkbox', checked: S.settings.showExplanation });
      const shuffleQ = h('input', { type: 'checkbox', checked: S.settings.shuffle });
      card.appendChild(h('div', { class: 'grid g2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Batas waktu tiap soal'), timer),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'KKM / nilai tuntas (%)'), passScore),
      ));
      card.appendChild(h('div', { class: 'switch-row' },
        h('label', { class: 'check' + (S.settings.showExplanation ? ' on' : '') }, showExp, 'Tampilkan pembahasan setelah menjawab'),
        h('label', { class: 'check' + (S.settings.shuffle ? ' on' : '') }, shuffleQ, 'Acak urutan soal'),
      ));
      [showExp, shuffleQ].forEach((cb, i) => cb.addEventListener('change', () => { S.settings[i ? 'shuffle' : 'showExplanation'] = cb.checked; cb.parentElement.classList.toggle('on', cb.checked); }));

      card.appendChild(h('div', { class: 'demo-box', style: { marginTop: '1rem' } },
        h('b', {}, '📊 Ringkasan: '), `${S.title} · ${S.questions.length} soal · ${S.classIds.length ? S.classIds.length + ' kelas' : 'semua siswa'}`,
        h('div', { class: 'tiny muted', style: { marginTop: '.3rem' } }, 'Setelah terbit, kamu mendapat kode game + link + QR code untuk dibagikan.'),
      ));

      navButtons(card, {
        nextLabel: S.editId ? '💾 Simpan Perubahan' : '🚀 Simpan & Publikasikan',
        onNext: async () => {
          S.settings.timer = Number(timer.value) || 0;
          S.settings.passScore = Number(passScore.value) || 70;
          const payload = {
            title: S.title, subjectId: S.subjectId || null, topicName: S.topicName, desc: S.desc, cover: S.cover,
            classIds: S.classIds, status: 'published', settings: S.settings, mode: 'klasik',
            questions: S.questions.map((q, i) => Object.assign({}, q, { order: i + 1 })),
          };
          try {
            let res;
            if (S.editId) res = await api.updateGame(S.editId, payload);
            else res = await api.saveGame(payload);
            const gid = S.editId || res.game.id;
            toast(S.editId ? 'Perubahan tersimpan ✅' : 'Game terbit! 🎉', 'ok');
            PB.confetti(90);
            const full = await api.game(gid);
            shareGame(Object.assign({}, full.game, { shareCode: full.game.shareCode }));
            navigate('/guru/games/' + gid);
          } catch (e) { toast(e.message, 'err'); }
        },
      });
    }

    draw();
  }

  const CONTOH = {
    ipa: `Fotosintesis adalah proses pembuatan makanan oleh tumbuhan hijau dengan bantuan cahaya matahari.
- Klorofil: zat hijau daun yang berfungsi menyerap energi cahaya matahari.
- Kloroplas: tempat terjadinya fotosintesis di dalam sel daun.
- Stomata: lubang kecil pada daun untuk masuknya karbon dioksida.
- Bahan fotosintesis: karbon dioksida, air, dan cahaya matahari.
- Hasil fotosintesis: glukosa dan oksigen.
- Xilem: pembuluh pengangkut air dari akar ke daun.
Langkah-langkah fotosintesis:
1. Akar menyerap air dari dalam tanah.
2. Air diangkut ke daun melalui pembuluh xilem.
3. Stomata menyerap karbon dioksida dari udara.
4. Klorofil menyerap energi cahaya matahari.
5. Air dan karbon dioksida diubah menjadi glukosa dan oksigen.
6. Glukosa diedarkan ke seluruh tubuh tumbuhan.`,
    sejarah: `Proklamasi Kemerdekaan Indonesia adalah peristiwa pembacaan teks proklamasi pada 17 Agustus 1945.
- Ir. Soekarno: tokoh yang membacakan teks proklamasi.
- Drs. Mohammad Hatta: tokoh yang mendampingi Soekarno saat proklamasi.
- Sayuti Melik: tokoh yang mengetik naskah proklamasi.
- Ibu Fatmawati: tokoh yang menjahit bendera Merah Putih.
- Lokasi proklamasi: Jalan Pegangsaan Timur Nomor 56, Jakarta.
- Peristiwa Rengasdengklok: pengamanan Soekarno dan Hatta oleh golongan muda pada 16 Agustus 1945.
- Rumah Laksamana Maeda: tempat perumusan teks proklamasi.
- PPKI: Panitia Persiapan Kemerdekaan Indonesia yang dibentuk 7 Agustus 1945.`,
    english: `Simple Present Tense is a tense used to talk about habits, facts, and daily routines.
- Formula positif: Subject + Verb1 (+s/es).
- Formula negatif: Subject + do/does + not + Verb1.
- Kata "goes" dipakai bila subjeknya he, she, atau it.
- Adverb of frequency: always, usually, often, sometimes, never.
- Contoh kalimat positif: She goes to school every morning.
- Contoh kalimat negatif: They do not play football on Sunday.
- Contoh kalimat tanya: Do you like reading books?
- To be dalam simple present: am, is, are.`,
  };

  function addSubjectDialog(done) {
    const name = h('input', { class: 'inp', placeholder: 'Contoh: PJOK, Seni Budaya, Informatika' });
    const jenjang = h('select', { class: 'inp' }, ['sd|SD', 'smp|SMP', 'sma|SMA/SMK'].map((o) => { const [v, l] = o.split('|'); return h('option', { value: v }, l); }));
    const icons = ['📘', '📖', '🔢', '🧮', '🔬', '🧪', '🌍', '🌏', '🎨', '🎵', '⚽', '💻', '🕌', '🔤', '🧠'];
    let icon = '📘';
    const iconRow = h('div', { class: 'row' });
    icons.forEach((ic) => iconRow.appendChild(h('button', { class: 'icon-btn', style: { border: ic === icon ? '2px solid #a78bfa' : '' }, onclick: (e) => { icon = ic; iconRow.querySelectorAll('button').forEach((b) => b.style.border = ''); e.currentTarget.style.border = '2px solid #a78bfa'; } }, ic)));
    const topics = h('input', { class: 'inp', placeholder: 'Topik/materi, pisahkan dengan koma (opsional)' });
    const m = modal({
      title: '＋ Mata pelajaran baru',
      body: h('div', {},
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama mapel *'), name),
        h('div', { class: 'grid g2' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Jenjang'), jenjang)),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Ikon'), iconRow),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Daftar topik/materi'), topics, h('div', { class: 'hint' }, 'Contoh: Pecahan, Bangun Datar, KPK dan FPB')),
      ),
      footer: [
        h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'),
        h('button', { class: 'btn', onclick: async () => {
          if (!name.value.trim()) return toast('Nama mapel wajib diisi.', 'err');
          try {
            await api.saveSubject({ name: name.value.trim(), jenjang: jenjang.value, icon, color: '#6366f1', topics: topics.value.split(',').map((s) => s.trim()).filter(Boolean) });
            toast('Mapel ditambahkan ✅', 'ok'); m.close(); if (done) done();
          } catch (e) { toast(e.message, 'err'); }
        } }, 'Simpan'),
      ],
    });
  }

  /* ------------------------------ EDIT GAME ------------------------------ */
  async function teacherEditGame(id, nav) {
    const main = await shell('games', nav);
    await teacherCreate(main, id);
  }

  /* ------------------------------- KELAS --------------------------------- */
  async function teacherClasses(main, focusId) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', {}, h('h1', {}, '👥 Kelas & Siswa'), h('p', { class: 'muted' }, 'Buat kelas, tambahkan siswa (akun dibuat otomatis), dan bagikan kode kelas.')),
      h('button', { class: 'btn', onclick: () => addClassDialog() }, '＋ Buat Kelas'),
    ));
    const classes = await api.classes().catch(() => []);
    if (!classes.length) return main.appendChild(emptyBox('🏫', 'Belum ada kelas', 'Buat kelas untuk menampung siswa dan membagikan game.'));

    classes.forEach((c) => {
      const card = h('div', { class: 'card', style: { marginBottom: '1.1rem' } });
      card.appendChild(h('div', { class: 'card-h' },
        h('div', { class: 'row' },
          h('div', { class: 'game-cover', style: { width: '46px', height: '46px', fontSize: '1.5rem' } }, '🏫'),
          h('div', {}, h('h3', {}, c.name), h('div', { class: 'tiny muted' }, `${c.students.length} siswa · jenjang ${String(c.jenjang || '').toUpperCase()}`)),
        ),
        h('div', { class: 'row' },
          h('span', { class: 'chip chip-info', style: { fontSize: '.95rem', letterSpacing: '.1em' } }, '🔑 ' + c.joinCode),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => copyText(c.joinCode, e.currentTarget) }, '📋'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => addStudentsDialog(c) }, '＋ Siswa'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => importDialog(c) }, '📋 Impor'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => printRoster(c) }, '🖨'),
          h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDlg(`Hapus kelas ${c.name}? Akun siswa tetap ada.`, async () => { await api.deleteClass(c.id); toast('Kelas dihapus', 'ok'); render(); }, 'Hapus kelas') }, '🗑'),
        ),
      ));

      if (!c.students.length) {
        card.appendChild(h('p', { class: 'muted small' }, 'Belum ada siswa. Klik "＋ Siswa" untuk membuatkan akun, atau bagikan kode kelas ' + c.joinCode + ' agar siswa mendaftar sendiri lalu gabung.'));
      } else {
        const tw = h('div', { class: 'tablewrap' });
        const tbl = h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ['Siswa', 'Username', 'Password', 'Game dimainkan', 'Rata-rata', 'Poin', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, c.students.map((s) => h('tr', {},
            h('td', {}, h('div', { class: 'row' }, h('span', {}, s.avatar || '🧑‍🎓'), h('b', {}, s.name))),
            h('td', {}, h('code', {}, s.username)),
            h('td', {}, h('code', {}, '123456')),
            h('td', {}, String(s.attempts)),
            h('td', {}, h('div', { class: 'row' }, h('div', { class: 'bar ' + (s.avg >= 70 ? '' : s.avg >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: Math.min(100, s.avg) + '%' } })), h('span', { class: 'tiny' }, s.avg + '%'))),
            h('td', {}, h('b', {}, String(s.points))),
            h('td', {}, h('button', { class: 'btn btn-sm btn-ghost', onclick: () => viewStudent(s.id, s.name) }, 'Detail')),
          ))),
        );
        tw.appendChild(tbl);
        card.appendChild(tw);
      }
      main.appendChild(card);
    });

    function addClassDialog() {
      const name = h('input', { class: 'inp', placeholder: 'Contoh: Kelas 6A Ceria' });
      const jenjang = h('select', { class: 'inp' }, ['sd|SD', 'smp|SMP', 'sma|SMA/SMK'].map((o) => { const [v, l] = o.split('|'); return h('option', { value: v }, l); }));
      const m = modal({
        title: '＋ Kelas baru',
        body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama kelas *'), name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Jenjang'), jenjang)),
        footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'), h('button', { class: 'btn', onclick: async () => {
          if (!name.value.trim()) return toast('Nama kelas wajib diisi.', 'err');
          const r = await api.saveClass({ name: name.value.trim(), jenjang: jenjang.value });
          toast(`Kelas dibuat! Kode gabung: ${r.klass.joinCode}`, 'ok'); m.close(); render();
        } }, 'Buat')],
      });
    }

    function addStudentsDialog(c) {
      const name = h('input', { class: 'inp', placeholder: 'Nama siswa' });
      const uname = h('input', { class: 'inp', placeholder: 'kosongkan = otomatis dari nama' });
      const pass = h('input', { class: 'inp', value: '123456' });
      const out = h('div', { style: { marginTop: '.7rem' } });
      const m = modal({
        title: '＋ Siswa ke ' + c.name,
        body: h('div', {},
          h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama siswa *'), name),
          h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Username'), uname),
          h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Password awal'), pass),
          out,
        ),
        footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Selesai'), h('button', { class: 'btn', onclick: async () => {
          if (!name.value.trim()) return toast('Nama siswa wajib diisi.', 'err');
          try {
            const r = await api.addStudent(c.id, { name: name.value.trim(), username: uname.value.trim(), password: pass.value.trim() || '123456' });
            out.appendChild(h('div', { class: 'demo-box', html: `✅ <b>${esc(r.student.name)}</b> — username <code>${esc(r.student.username)}</code>, password <code>${esc(r.student.password || '123456')}</code>` }));
            name.value = ''; uname.value = '';
            toast('Siswa ditambahkan', 'ok');
            render();
          } catch (e) { toast(e.message, 'err'); }
        } }, 'Tambah')],
      });
    }

    function importDialog(c) {
      const ta = h('textarea', { class: 'inp', placeholder: 'Satu nama per baris:\nAhmad Fauzi\nDewi Lestari\nRangga Saputra' });
      const pass = h('input', { class: 'inp', value: '123456' });
      const m = modal({
        title: '📋 Impor siswa massal',
        body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Daftar nama'), ta), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Password seragam'), pass), h('p', { class: 'hint' }, 'Username dibuat otomatis dari nama (mis. "ahmadfauzi"). Bila bentrok, sistem menambah angka.')),
        footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'), h('button', { class: 'btn', onclick: async () => {
          if (!ta.value.trim()) return toast('Daftar nama kosong.', 'err');
          const r = await api.importStudents(c.id, ta.value, pass.value.trim() || '123456');
          toast(`${(r.created || []).length} siswa dibuat ✅`, 'ok'); m.close(); render();
        } }, 'Impor')],
      });
    }

    function printRoster(c) {
      const win = window.open('', '_blank');
      if (!win) return toast('Pop-up diblokir browser.', 'err');
      const rows = c.students.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td><b>${esc(s.username)}</b></td><td>123456</td><td>${s.points || 0}</td></tr>`).join('');
      win.document.write(`<html><head><title>Daftar Akun ${esc(c.name)}</title><style>body{font-family:Arial;padding:24px;color:#111}h2{margin-bottom:4px}table{border-collapse:collapse;width:100%;margin-top:14px}th,td{border:1px solid #999;padding:7px 9px;font-size:13px;text-align:left}th{background:#eee}</style></head><body>
      <h2>🎮 Petualangan Belajar — Daftar Akun Kelas ${esc(c.name)}</h2>
      <p>Kode kelas: <b>${esc(c.joinCode)}</b> · Dicetak ${new Date().toLocaleDateString('id-ID')}</p>
      <table><thead><tr><th>No</th><th>Nama</th><th>Username</th><th>Password</th><th>Poin</th></tr></thead><tbody>${rows || '<tr><td colspan=5>Belum ada siswa</td></tr>'}</tbody></table>
      <p style="margin-top:16px;font-size:12px">Petunjuk siswa: buka alamat aplikasi, pilih <b>Masuk</b>, isi username &amp; password, lalu mainkan game dari kode yang diberikan guru.</p>
      <script>window.print()</script></body></html>`);
      win.document.close();
    }

    async function viewStudent(sid, name) {
      const list = await api.teacherAttempts({ studentId: sid }).catch(() => []);
      const avg = list.length ? Math.round(list.reduce((s, a) => s + a.percent, 0) / list.length) : 0;
      const body = h('div', {},
        h('div', { class: 'row-between', style: { marginBottom: '.8rem' } },
          h('div', {}, h('h3', {}, name), h('div', { class: 'tiny muted' }, `${list.length} pengerjaan · rata-rata ${avg}%`)),
          h('div', { html: PB.ringPercent(avg, 92) }),
        ),
        h('div', { class: 'divider' }),
        list.length ? h('div', { class: 'scroll-y' }, list.map((a) => h('div', { class: 'rank-row', style: { cursor: 'pointer' }, onclick: () => openAttemptDetail(a.id, true) },
          h('div', { class: 'rank-no' }, a.percent >= 70 ? '🌟' : '📘'),
          h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 800 } }, a.gameTitle), h('div', { class: 'tiny muted' }, fmtDate(a.finishedAt))),
          h('b', {}, Math.round(a.percent) + '%'),
        ))) : h('p', { class: 'muted' }, 'Siswa ini belum mengerjakan game apa pun.'),
      );
      modal({ title: '👤 Profil belajar siswa', body, wide: true });
    }
  }

  /* ------------------------------ HASIL SISWA ---------------------------- */
  async function teacherResults(main, filter) {
    if (!main || main.__stale) return;
    const [games, classes] = await Promise.all([api.games().catch(() => []), api.classes().catch(() => [])]);
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', {}, h('h1', {}, '📥 Hasil Kerja Siswa'), h('p', { class: 'muted' }, 'Semua pengerjaan siswa tersimpan otomatis ke akun kamu.')),
      h('div', { class: 'row no-print' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => exportCSV() }, '⬇️ Unduh CSV'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => window.print() }, '🖨 Cetak'),
      ),
    ));

    const params = {};
    const gSel = h('select', { class: 'inp', style: { maxWidth: '240px' }, onchange: (e) => { params.gameId = e.target.value || undefined; load(); } }, h('option', { value: '' }, 'Semua game'), games.map((g) => h('option', { value: g.id }, g.title)));
    const cSel = h('select', { class: 'inp', style: { maxWidth: '200px' }, onchange: (e) => { params.classId = e.target.value || undefined; load(); } }, h('option', { value: '' }, 'Semua kelas'), classes.map((c) => h('option', { value: c.id }, c.name)));
    const search = h('input', { class: 'inp', style: { maxWidth: '220px' }, placeholder: '🔍 cari nama siswa…' });
    search.addEventListener('input', () => load());
    main.appendChild(h('div', { class: 'card no-print', style: { marginBottom: '1rem' } }, h('div', { class: 'row' }, gSel, cSel, search)));

    const holder = h('div', {});
    main.appendChild(holder);

    async function load() {
      holder.innerHTML = '<div class="skel"></div><div class="skel" style="margin-top:.6rem"></div>';
      const list = await api.teacherAttempts(params).catch(() => []);
      const q = search.value.trim().toLowerCase();
      const filtered = q ? list.filter((a) => a.studentName.toLowerCase().includes(q)) : list;
      holder.innerHTML = '';
      if (!filtered.length) return holder.appendChild(emptyBox('📭', 'Belum ada hasil', 'Ubah filter atau tunggu siswa mengerjakan game.'));
      const avg = Math.round(filtered.reduce((s, a) => s + a.percent, 0) / filtered.length);
      holder.appendChild(h('div', { class: 'row', style: { marginBottom: '.7rem' } },
        h('span', { class: 'chip' }, `${filtered.length} pengerjaan`),
        h('span', { class: 'chip ' + (avg >= 70 ? 'chip-ok' : 'chip-warn') }, `rata-rata ${avg}%`),
        h('span', { class: 'chip' }, `tuntas ${filtered.filter((a) => a.percent >= 70).length} siswa`),
      ));
      const tw = h('div', { class: 'tablewrap' });
      tw.appendChild(h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Waktu', 'Siswa', 'Kelas', 'Game', 'Mapel', 'Benar', 'Nilai', 'Waktu', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, filtered.map((a) => h('tr', { style: { cursor: 'pointer' }, onclick: () => openAttemptDetail(a.id, true) },
          h('td', { class: 'tiny muted' }, fmtDate(a.finishedAt)),
          h('td', {}, h('div', { class: 'row' }, h('span', {}, a.studentAvatar || '🧑‍🎓'), h('b', {}, a.studentName))),
          h('td', { class: 'muted small' }, a.className || '-'),
          h('td', { class: 'small' }, a.gameTitle),
          h('td', { class: 'muted small' }, a.subjectName || '-'),
          h('td', {}, `${a.correct}/${a.total}`),
          h('td', {}, h('div', { class: 'row' }, h('b', { style: { color: a.percent >= 70 ? '#86efac' : a.percent >= 40 ? '#fde68a' : '#fecaca' } }, Math.round(a.percent) + '%'), h('div', { class: 'bar ' + (a.percent >= 70 ? '' : a.percent >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: Math.min(100, a.percent) + '%' } })))),
          h('td', { class: 'tiny muted' }, fmtDuration(a.timeSpent)),
          h('td', {}, h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => { e.stopPropagation(); openAttemptDetail(a.id, true); } }, 'Detail')),
        ))),
      ));
      holder.appendChild(tw);
    }
    load();
  }

  /* --------------------------- MAPEL & MATERI ---------------------------- */
  async function teacherSubjects(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head row-between' },
      h('div', {}, h('h1', {}, '📚 Mata Pelajaran & Materi'), h('p', { class: 'muted' }, 'Tambah mapel dan topik sendiri, lalu simpan bank materi untuk dipakai AI.')),
      h('button', { class: 'btn', onclick: () => addSubjectDialog(() => render()) }, '＋ Mapel Baru'),
    ));

    const subjects = await api.subjects().catch(() => []);
    const grid = h('div', { class: 'grid g2' });
    main.appendChild(grid);
    if (!subjects.length) grid.appendChild(emptyBox('📚', 'Belum ada mapel', 'Klik "＋ Mapel Baru".'));

    subjects.forEach((s) => {
      const topicsBox = h('div', {});
      const repaintTopics = () => {
        topicsBox.innerHTML = '';
        (s.topics || []).forEach((t) => topicsBox.appendChild(h('div', { class: 'row', style: { padding: '.25rem 0' } },
          h('span', { class: 'tag' }, '📌 ' + t.name),
          h('button', { class: 'icon-btn', style: { width: '26px', height: '26px', fontSize: '.75rem' }, onclick: async () => { await api.deleteTopic(t.id); s.topics = s.topics.filter((x) => x.id !== t.id); repaintTopics(); } }, '✕'),
        )));
        if (!(s.topics || []).length) topicsBox.appendChild(h('div', { class: 'tiny muted' }, 'Belum ada topik/materi.'));
      };
      repaintTopics();
      const newTopic = h('input', { class: 'inp', placeholder: 'Tambah topik lalu Enter' });
      newTopic.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || !newTopic.value.trim()) return;
        const r = await api.addTopic(s.id, newTopic.value.trim());
        s.topics.push(r.topic); newTopic.value = ''; repaintTopics();
      });

      grid.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-h' },
          h('div', { class: 'row' },
            h('div', { class: 'game-cover', style: { width: '46px', height: '46px', fontSize: '1.5rem', background: (s.color || '#6366f1') + '33' } }, s.icon || '📘'),
            h('div', {}, h('h3', {}, s.name), h('div', { class: 'tiny muted' }, `${(s.topics || []).length} topik · ${s.games || 0} game · ${String(s.jenjang || '').toUpperCase()}`)),
          ),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => editSubjectDialog(s, () => render()) }, '✏️'),
            h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDlg(`Hapus mapel ${s.name} beserta game dan nilainya?`, async () => { await api.deleteSubject(s.id); toast('Mapel dihapus', 'ok'); render(); }, 'Hapus') }, '🗑'),
          ),
        ),
        h('label', { class: 'lbl small' }, 'Topik / materi'),
        topicsBox,
        h('div', { class: 'row', style: { marginTop: '.5rem' } }, newTopic, h('button', { class: 'btn btn-sm', onclick: async () => { if (!newTopic.value.trim()) return; const r = await api.addTopic(s.id, newTopic.value.trim()); s.topics.push(r.topic); newTopic.value = ''; repaintTopics(); } }, '＋')),
      ));
    });

    // bank materi
    main.appendChild(h('div', { class: 'card', style: { marginTop: '1.2rem' } },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🗂 Bank Materi'), h('button', { class: 'btn btn-sm', onclick: () => materialDialog(subjects, () => render()) }, '＋ Tambah Materi')),
      h('p', { class: 'muted small' }, 'Simpan materi sekali, pakai berkali-kali untuk membuat game dengan AI.'),
      h('div', { id: 'mat-list' }),
    ));
    const matList = document.getElementById('mat-list');
    const mats = await api.materials().catch(() => []);
    if (!mats.length) matList.appendChild(h('p', { class: 'muted small' }, 'Belum ada materi tersimpan.'));
    mats.forEach((m) => {
      const sub = subjects.find((s) => s.id === m.subjectId);
      matList.appendChild(h('div', { class: 'qitem' },
        h('div', { class: 'row-between' },
          h('div', {}, h('b', {}, m.title), h('div', { class: 'tiny muted' }, `${sub ? sub.icon + ' ' + sub.name : 'Umum'} · ${fmtDateShort(m.createdAt)} · ${String(m.content || '').split(/\s+/).length} kata`)),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => showMaterial(m) }, 'Lihat'),
            h('button', { class: 'btn btn-sm', onclick: () => { navigate('/guru/buat'); setTimeout(() => toast('Tempel materi dari Bank Materi di langkah 2.', 'info'), 600); } }, '✨ Buat game'),
            h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDlg('Hapus materi ini?', async () => { await api.deleteMaterial(m.id); toast('Materi dihapus', 'ok'); render(); }, 'Hapus') }, '🗑'),
          ),
        ),
      ));
    });
  }

  function showMaterial(m) {
    modal({ title: '📄 ' + m.title, wide: true, body: h('div', {}, h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 } }, m.content)) });
  }

  function editSubjectDialog(s, done) {
    const name = h('input', { class: 'inp', value: s.name });
    const icon = h('input', { class: 'inp', value: s.icon || '📘', style: { maxWidth: '90px' } });
    const color = h('input', { class: 'inp', type: 'color', value: s.color || '#6366f1', style: { maxWidth: '90px', height: '44px', padding: '.2rem' } });
    const m = modal({
      title: '✏️ Ubah mapel',
      body: h('div', { class: 'grid g3' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama'), name), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Ikon (emoji)'), icon), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Warna'), color)),
      footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'), h('button', { class: 'btn', onclick: async () => { await api.updateSubject(s.id, { name: name.value.trim(), icon: icon.value.trim(), color: color.value }); m.close(); toast('Tersimpan ✅', 'ok'); done(); } }, 'Simpan')],
    });
  }

  function materialDialog(subjects, done) {
    const title = h('input', { class: 'inp', placeholder: 'Judul materi' });
    const sub = h('select', { class: 'inp' }, h('option', { value: '' }, '— mapel (opsional) —'), subjects.map((s) => h('option', { value: s.id }, s.icon + ' ' + s.name)));
    const content = h('textarea', { class: 'inp', style: { minHeight: '220px' }, placeholder: 'Tempel materi di sini…' });
    const m = modal({
      title: '＋ Materi baru', wide: true,
      body: h('div', {}, h('div', { class: 'grid g2' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Judul'), title), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Mapel'), sub)), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Isi materi'), content), h('p', { class: 'hint' }, 'Tips: gunakan pola "Istilah: pengertian" atau bullet "-" supaya AI menghasilkan soal lebih bagus.')),
      footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'), h('button', { class: 'btn', onclick: async () => {
        if (content.value.trim().length < 20) return toast('Isi materi minimal 20 karakter.', 'err');
        await api.saveMaterial({ title: title.value.trim() || 'Materi tanpa judul', subjectId: sub.value || null, content: content.value });
        toast('Materi tersimpan ✅', 'ok'); m.close(); done();
      } }, 'Simpan')],
    });
  }

  /* ------------------------------ ASISTEN AI ----------------------------- */
  async function teacherAI(main) {
    if (!main || main.__stale) return;
    const subjects = await api.subjects().catch(() => []);
    main.appendChild(h('div', { class: 'page-head' },
      h('h1', {}, '🤖 Asisten AI Guru'),
      h('p', { class: 'muted' }, 'Bantu siapkan perangkat pembelajaran: soal, rencana pembelajaran, dan analisis hasil belajar.'),
    ));

    const grid = h('div', { class: 'grid g2' });
    main.appendChild(grid);

    // kartu 1: generator soal cepat
    const ta = h('textarea', { class: 'inp', style: { minHeight: '170px' }, placeholder: 'Tempel materi di sini…' });
    const topic = h('input', { class: 'inp', placeholder: 'Topik (opsional)' });
    const level = h('select', { class: 'inp' }, ['sd-kelas-1-2|SD kelas 1–2', 'sd-kelas-3-4|SD kelas 3–4', 'sd-kelas-5-6|SD kelas 5–6', 'smp|SMP', 'sma|SMA/SMK'].map((o) => { const [v, l] = o.split('|'); return h('option', { value: v, selected: v === 'sd-kelas-3-4' }, l); }));
    const cnt = h('select', { class: 'inp' }, [5, 8, 10, 15].map((n) => h('option', { value: n, selected: n === 8 }, n + ' soal')));
    const types = {};
    const tRow = h('div', { class: 'switch-row' });
    [['mc', 'Pilihan Ganda'], ['tf', 'Benar/Salah'], ['fill', 'Isian'], ['order', 'Urutan'], ['match', 'Menjodohkan']].forEach(([v, l]) => {
      const cb = h('input', { type: 'checkbox', checked: v === 'mc' || v === 'tf' });
      types[v] = cb;
      cb.addEventListener('change', () => cb.parentElement.classList.toggle('on', cb.checked));
      tRow.appendChild(h('label', { class: 'check' + (cb.checked ? ' on' : '') }, cb, l));
    });
    const out = h('div', { style: { marginTop: '.9rem' } });
    const genBtn = h('button', { class: 'btn', onclick: async () => {
      const chosen = Object.entries(types).filter(([, cb]) => cb.checked).map(([v]) => v);
      if (!chosen.length) return toast('Pilih minimal satu tipe soal.', 'err');
      if (ta.value.trim().length < 20) return toast('Materi terlalu pendek.', 'err');
      genBtn.disabled = true; genBtn.innerHTML = '<span class="spinner"></span> AI bekerja…';
      out.innerHTML = '';
      try {
        const res = await api.aiPreview({ material: ta.value, topic: topic.value, count: Number(cnt.value), types: chosen, level: level.value });
        out.appendChild(h('div', { class: 'demo-box', html: `✨ <b>${res.questions.length} soal</b> dibuat oleh mesin: <b>${esc(res.engine)}</b>` }));
        const list = h('div', { class: 'scroll-y', style: { marginTop: '.7rem', maxHeight: '420px' } });
        res.questions.forEach((q, i) => list.appendChild(h('div', { class: 'qitem' },
          h('div', { class: 'qitem-head' }, h('span', { class: 'chip' }, '#' + (i + 1)), h('span', { class: 'chip chip-info' }, window.PBGame.TYPE_LABEL[q.type] || q.type), h('span', { class: 'chip' }, q.points + ' poin')),
          h('div', { class: 'small', style: { fontWeight: 700, whiteSpace: 'pre-wrap' } }, q.prompt),
          q.options && q.options.length ? h('div', { class: 'tiny', style: { marginTop: '.4rem' } }, q.options.map((o) => h('div', {}, String(o) === String(q.answer) ? '✅ ' : '▫️ ', o))) : null,
          q.type === 'fill' ? h('div', { class: 'tiny' }, '✅ ' + String(q.answer)) : null,
          q.type === 'order' ? h('div', { class: 'tiny', style: { whiteSpace: 'pre-wrap' } }, (q.answer || []).map((x, k) => `${k + 1}. ${x}`).join('\n')) : null,
          q.type === 'match' ? h('div', { class: 'tiny' }, (q.answer || []).map((p) => h('div', {}, p.left + ' = ' + p.right))) : null,
          q.explanation ? h('div', { class: 'tiny muted', style: { marginTop: '.35rem' } }, '💡 ' + q.explanation) : null,
        )));
        out.appendChild(list);
        out.appendChild(h('div', { class: 'row', style: { marginTop: '.8rem' } },
          h('button', { class: 'btn btn-ok', onclick: () => saveAsGame(res.questions, topic.value || 'Game AI') }, '💾 Jadikan Game Baru'),
          h('button', { class: 'btn btn-ghost', onclick: () => copyQuestions(res.questions) }, '📋 Salin sebagai teks'),
        ));
      } catch (e) { out.appendChild(h('div', { class: 'demo-box', style: { borderColor: 'rgba(239,68,68,.5)', background: 'rgba(239,68,68,.14)' } }, '⚠️ ' + esc(e.message))); }
      genBtn.disabled = false; genBtn.textContent = '✨ Buat Soal dengan AI';
    } }, '✨ Buat Soal dengan AI');

    const matBtn = h('button', { class: 'btn btn-ghost', onclick: async () => {
      if (!topic.value.trim()) return toast('Isi kolom Topik dulu (mis. fotosintesis).', 'err');
      matBtn.disabled = true; matBtn.textContent = '🪄 Menulis materi…';
      try {
        const r = await api.generateMaterial({ topic: topic.value.trim(), level: level.value, subject: '' });
        ta.value = r.text;
        toast('🪄 Materi otomatis siap (' + r.source + ')', 'ok');
      } catch (e) { toast(e.message, 'err'); }
      matBtn.disabled = false; matBtn.textContent = '🪄 Materi otomatis';
    } }, '🪄 Materi otomatis');

    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '⚡ Generator Soal Cepat'), h('span', { class: 'ai-badge' }, 'AI')),
      h('p', { class: 'muted small' }, 'Untuk kebutuhan mendadak: tempel materi, dapat soal siap pakai.'),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Materi'), ta),
      h('div', { class: 'grid g3' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Topik'), topic),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Jenjang'), level),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Jumlah'), cnt),
      ),
      h('label', { class: 'lbl' }, 'Tipe soal'), tRow,
      h('div', { class: 'row', style: { marginTop: '.8rem' } }, genBtn, matBtn),
      out,
    ));

    // kartu 2: rencana pembelajaran
    const rpTopic = h('input', { class: 'inp', placeholder: 'Contoh: Rantai Makanan' });
    const rpSub = h('select', { class: 'inp' }, h('option', { value: '' }, '— mapel —'), subjects.map((s) => h('option', { value: s.name }, s.icon + ' ' + s.name)));
    const rpLevel = h('select', { class: 'inp' }, ['sd|SD', 'smp|SMP', 'sma|SMA/SMK'].map((o) => { const [v, l] = o.split('|'); return h('option', { value: v }, l); }));
    const rpMat = h('textarea', { class: 'inp', style: { minHeight: '110px' }, placeholder: 'Materi singkat (opsional, agar lebih akurat)' });
    const rpOut = h('div', { style: { marginTop: '.8rem' } });
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '📋 Rencana Pembelajaran'), h('span', { class: 'ai-badge' }, 'AI')),
      h('p', { class: 'muted small' }, 'AI menyusun tujuan, langkah kegiatan, dan ringkasan materi.'),
      h('div', { class: 'grid g3' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Topik'), rpTopic), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Mapel'), rpSub), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Jenjang'), rpLevel)),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Materi'), rpMat),
      h('button', { class: 'btn btn-ghost', onclick: async () => {
        if (!rpTopic.value.trim()) return toast('Isi topik dulu.', 'err');
        rpOut.innerHTML = '<div class="center"><span class="spinner"></span></div>';
        try {
          const r = await api.lessonPlan({ topic: rpTopic.value, subject: rpSub.value, level: rpLevel.value, material: rpMat.value });
          const p = r.plan;
          rpOut.innerHTML = '';
          rpOut.appendChild(h('div', { class: 'card', style: { background: 'rgba(59,130,246,.12)' } },
            h('h3', {}, '🎯 Tujuan pembelajaran'), h('div', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, (p.tujuan || []).join('\n')),
            h('div', { class: 'divider' }), h('h3', {}, '🧭 Langkah kegiatan'), h('div', { class: 'small' }, (p.aktivitas || []).map((x) => h('div', {}, '• ' + x))),
            p.ringkasan ? h('div', {}, h('div', { class: 'divider' }), h('h3', {}, '📖 Ringkasan materi'), h('div', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, p.ringkasan)) : null,
            p.saranGame ? h('div', { class: 'demo-box', style: { marginTop: '.8rem' } }, '🎮 ' + esc(p.saranGame)) : null,
            h('button', { class: 'btn btn-sm btn-ghost', style: { marginTop: '.7rem' }, onclick: (e) => copyText(`RENCANA PEMBELAJARAN\nTopik: ${rpTopic.value}\n\nTujuan:\n${(p.tujuan || []).join('\n')}\n\nKegiatan:\n${(p.aktivitas || []).join('\n')}\n\nRingkasan:\n${p.ringkasan || ''}`, e.currentTarget) }, '📋 Salin'),
          ));
        } catch (e) { rpOut.innerHTML = ''; rpOut.appendChild(h('div', { class: 'demo-box' }, '⚠️ ' + esc(e.message))); }
      } }, '🤖 Susun Rencana'),
      rpOut,
    ));

    // kartu 3: analisis hasil
    const anOut = h('div', {});
    const anBtn = h('button', { class: 'btn', onclick: async () => {
      anBtn.disabled = true; anOut.innerHTML = '<div class="center"><span class="spinner"></span></div>';
      const a = await api.analytics().catch(() => null);
      anBtn.disabled = false; anOut.innerHTML = '';
      if (!a) return anOut.appendChild(h('p', { class: 'muted' }, 'Gagal memuat data.'));
      anOut.appendChild(h('div', { class: 'card', style: { background: 'rgba(34,197,94,.12)' } },
        h('h3', {}, '📈 Analisis kelas'), h('p', { class: 'small' }, a.insight.ringkasan),
        h('div', { class: 'divider' }), h('h3', {}, '💡 Saran tindak lanjut'),
        h('ul', { class: 'list-plain small' }, (a.insight.saran || []).map((s) => h('li', {}, '• ' + s))),
        (a.subjects || []).length ? h('div', {}, h('div', { class: 'divider' }), h('h3', {}, '📚 Rata-rata per mapel'),
          h('div', {}, a.subjects.map((s) => h('div', { style: { marginBottom: '.55rem' } },
            h('div', { class: 'row-between small' }, h('span', {}, s.name), h('b', {}, s.avg + '%')),
            h('div', { class: 'bar ' + (s.avg >= 70 ? '' : s.avg >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: s.avg + '%' } })),
            h('div', { class: 'tiny muted' }, s.count + ' pengerjaan'),
          )))) : null,
        (a.hardest || []).length ? h('div', {}, h('div', { class: 'divider' }), h('h3', {}, '🎯 Soal paling sulit'),
          h('div', {}, a.hardest.map((q) => h('div', { style: { marginBottom: '.5rem' } },
            h('div', { class: 'row-between small' }, h('span', {}, truncate(q.prompt, 46)), h('b', { style: { color: q.rate < 50 ? '#fecaca' : '#bbf7d0' } }, q.rate + '%')),
            h('div', { class: 'bar ' + (q.rate >= 70 ? '' : q.rate >= 40 ? 'warn' : 'bad') }, h('i', { style: { width: q.rate + '%' } })),
          )))) : null,
      ));
    } }, '🔎 Analisis Sekarang');
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🔎 Analisis Hasil Belajar'), h('span', { class: 'ai-badge' }, 'AI')),
      h('p', { class: 'muted small' }, 'AI membaca seluruh nilai siswa lalu memberi saran tindak lanjut untuk kelas kamu.'),
      anBtn, anOut,
    ));

    // kartu 4: tentang mesin AI
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🧠 Cara kerja AI di aplikasi ini')),
      h('p', { class: 'small muted' }, 'Ada dua mesin yang bisa dipakai:'),
      h('ul', { class: 'list-plain small' },
        h('li', { html: '✨ <b>AI Offline (PB-AI)</b> — buatan sendiri, tanpa internet dan gratis. Membaca materi kamu: menemukan pola "istilah: pengertian", angka, nama, dan langkah bernomor, lalu menyusun soal pilihan ganda, benar/salah, isian, urutan, dan menjodohkan lengkap dengan pengecoh dan pembahasan.' }),
        h('li', { html: '🔌 <b>AI API (opsional)</b> — bila kamu mengisi API key di Pengaturan, soal dibuat oleh model AI besar (lebih luwes). Kalau API gagal, sistem otomatis kembali ke mesin offline.' }),
      ),
      h('div', { class: 'demo-box', style: { marginTop: '.8rem' }, html: '💡 Tips hasil terbaik: tulis materi dengan pola <code>Istilah: pengertian</code> per baris, sertakan angka/fakta, dan beri langkah bernomor bila ada proses.' }),
      h('button', { class: 'btn btn-sm btn-ghost', style: { marginTop: '.7rem' }, onclick: () => navigate('/guru/pengaturan') }, '⚙️ Atur mesin AI'),
    ));

    async function saveAsGame(questions, title) {
      const cls = await api.classes().catch(() => []);
      const subSel = h('select', { class: 'inp' }, h('option', { value: '' }, '— mapel —'), subjects.map((s) => h('option', { value: s.id }, s.icon + ' ' + s.name)));
      const titleIn = h('input', { class: 'inp', value: title });
      const m = modal({
        title: '💾 Jadikan game baru',
        body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Judul game'), titleIn), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Mata pelajaran'), subSel)),
        footer: [h('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Batal'), h('button', { class: 'btn', onclick: async () => {
          const r = await api.saveGame({ title: titleIn.value.trim() || title, subjectId: subSel.value || null, topicName: topic.value, desc: 'Dibuat dari Asisten AI', cover: '🤖', classIds: [], status: 'published', questions });
          toast('Game dibuat ✅', 'ok'); m.close(); PB.confetti(60);
          navigate('/guru/games/' + r.game.id);
        } }, 'Simpan & Terbitkan')],
      });
    }
    function copyQuestions(qs) {
      const text = qs.map((q, i) => {
        let s = `${i + 1}. ${q.prompt}\n`;
        if (q.options && q.options.length) s += q.options.map((o, k) => `${'ABCD'[k]}. ${o}`).join('\n') + '\n';
        s += `Jawaban: ${Array.isArray(q.answer) ? JSON.stringify(q.answer) : q.answer}\n`;
        if (q.explanation) s += `Pembahasan: ${q.explanation}\n`;
        return s;
      }).join('\n');
      copyText(text, { textContent: '' });
      toast('Soal disalin ke clipboard 📋', 'ok');
    }
  }

  /* ------------------------------ PENGATURAN ----------------------------- */
  async function teacherSettings(main) {
    if (!main || main.__stale) return;
    main.appendChild(h('div', { class: 'page-head' }, h('h1', {}, '⚙️ Pengaturan'), h('p', { class: 'muted' }, 'Mesin AI, identitas sekolah, data, dan panduan pemakaian.')));
    const s = await api.settings().catch(() => ({}));

    const grid = h('div', { class: 'grid g2' });
    main.appendChild(grid);

    // AI
    const mode = h('select', { class: 'inp' }, [['auto', 'Otomatis (pakai API bila ada key, kalau tidak pakai offline)'], ['offline', 'Selalu AI Offline (gratis, tanpa internet)'], ['api', 'Selalu AI API (wajib punya key)']].map(([v, l]) => h('option', { value: v, selected: (s.aiMode || 'auto') === v }, l)));
    const baseUrl = h('input', { class: 'inp', value: s.aiBaseUrl || '', placeholder: 'https://api.openai.com/v1' });
    const model = h('input', { class: 'inp', value: s.aiModel || '', placeholder: 'gpt-4o-mini' });
    const key = h('input', { class: 'inp', type: 'password', value: '', placeholder: s.aiKeySet ? 'API key sudah tersimpan (kosongkan bila tidak diganti)' : 'sk-…' });
    const testOut = h('div', { style: { marginTop: '.7rem' } });
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🤖 Mesin AI'), h('span', { class: 'ai-badge' }, s.aiKeySet ? 'API terpasang' : 'Mode offline')),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Mode mesin'), mode),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'API Base URL'), baseUrl, h('div', { class: 'hint' }, 'Kompatibel dengan OpenAI, OpenRouter, Groq, Together, atau server lokal (LM Studio/Ollama).')),
      h('div', { class: 'grid g2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama model'), model),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'API Key'), key),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: async () => {
          await api.saveSettings({ aiMode: mode.value, aiBaseUrl: baseUrl.value.trim(), aiModel: model.value.trim(), aiApiKey: key.value.trim() });
          toast('Pengaturan AI tersimpan ✅', 'ok'); render();
        } }, '💾 Simpan'),
        OFFLINE ? null : h('button', { class: 'btn btn-ghost', onclick: async (e) => {
          e.currentTarget.disabled = true; testOut.innerHTML = '<span class="spinner"></span> Menguji koneksi…';
          await api.saveSettings({ aiMode: mode.value, aiBaseUrl: baseUrl.value.trim(), aiModel: model.value.trim(), aiApiKey: key.value.trim() });
          try {
            const r = await fetch('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const j = await r.json();
            testOut.innerHTML = '';
            testOut.appendChild(h('div', { class: 'demo-box' }, (j.ok ? '✅ ' : '⚠️ ') + esc(j.message || '')));
          } catch (err) { testOut.innerHTML = ''; testOut.appendChild(h('div', { class: 'demo-box' }, '⚠️ ' + esc(err.message))); }
          e.currentTarget.disabled = false;
        } }, '🔌 Uji koneksi API'),
      ),
      testOut,
      h('div', { class: 'demo-box', style: { marginTop: '.8rem' } }, '🔒 API key disimpan di server kamu sendiri dan tidak dikirim ke pihak lain. Tanpa API key, aplikasi tetap 100% berfungsi memakai AI offline.'),
    ));

    // sekolah & data
    const school = h('input', { class: 'inp', value: s.schoolName || '' });
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '🏫 Identitas & Data')),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nama sekolah'), school),
      h('button', { class: 'btn btn-sm', onclick: async () => { await api.saveSettings({ schoolName: school.value.trim() }); toast('Tersimpan ✅', 'ok'); render(); } }, '💾 Simpan'),
      h('div', { class: 'divider' }),
      h('h3', {}, '📦 Ekspor & cadangan'),
      h('p', { class: 'muted small' }, OFFLINE ? 'Versi offline: data ada di browser ini. Gunakan ekspor bila tersedia pada versi server.' : 'Unduh seluruh aplikasi + data kamu menjadi SATU file HTML yang bisa dibuka tanpa internet dan tanpa server.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => exportCSV() }, '⬇️ Nilai (CSV)'),
        OFFLINE ? null : h('button', { class: 'btn btn-sm btn-ok', onclick: () => { window.location.href = '/api/teacher/export-html'; } }, '⬇️ Aplikasi Offline (HTML)'),
      ),
      h('div', { class: 'divider' }),
      h('h3', {}, '🧪 Data contoh'),
      h('p', { class: 'muted small' }, 'Kembalikan data demo (guru, kelas 6A, 5 game, nilai contoh). Data yang kamu buat akan dihapus.'),
      OFFLINE ? h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDlg('Reset semua data offline ke kondisi awal?', () => api.resetOffline(), 'Reset') }, '♻️ Reset data offline')
        : h('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmDlg('Reset ke data demo? Semua game, kelas, dan nilai buatanmu akan hilang.', async () => { await fetch('/api/admin/reset-demo', { method: 'POST' }); toast('Data demo dipulihkan', 'ok'); setTimeout(() => location.reload(), 900); }, 'Reset sekarang') }, '♻️ Reset ke data demo'),
    ));

    // panduan
    main.appendChild(h('div', { class: 'card', style: { marginTop: '1.1rem' } },
      h('div', { class: 'card-h' }, h('div', { class: 'card-title' }, '📖 Panduan singkat pemakaian')),
      h('div', { class: 'grid g2' },
        h('div', {},
          h('h3', {}, '👩‍🏫 Untuk guru'),
          h('ol', { class: 'small muted' },
            h('li', { html: 'Buat kelas di menu <b>Kelas & Siswa</b>, lalu tambahkan siswa (akun & password dibuat otomatis). Cetak daftar akunnya bila perlu.' }),
            h('li', { html: 'Tambah mapel dan topik di <b>Mapel & Materi</b>.' }),
            h('li', { html: 'Klik <b>Buat Game AI</b>: isi judul → tempel materi → AI menyusun soal → edit bila perlu → terbitkan ke kelas.' }),
            h('li', { html: 'Bagikan <b>kode game</b>, link, atau QR code ke siswa.' }),
            h('li', { html: 'Pantau nilai otomatis di <b>Dashboard</b> dan <b>Hasil Siswa</b>, unduh CSV untuk rapor.' }),
          ),
        ),
        h('div', {},
          h('h3', {}, '🧑‍🎓 Untuk siswa'),
          h('ol', { class: 'small muted' },
            h('li', {}, 'Masuk dengan username & password dari guru.'),
            h('li', {}, 'Pilih game di beranda, atau masukkan kode game dari guru.'),
            h('li', {}, 'Kerjakan soal — ada poin, combo, dan bintang.'),
            h('li', { html: 'Selesai! Nilai otomatis terkirim ke akun guru dan tersimpan di <b>Nilai Saya</b>.' }),
          ),
          h('div', { class: 'demo-box', style: { marginTop: '.8rem' } }, '🌐 Siswa bisa main dari HP/laptop sendiri selama terhubung ke server (WiFi sekolah) atau membuka file HTML offline yang dibagikan guru.'),
        ),
      ),
    ));
  }

  /* --------------------------- MAIN (SISWA) ------------------------------ */
  async function screenPlay(code) {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'play-body' }, h('div', { class: 'qcard' }, h('div', { class: 'qbox center' }, h('div', { class: 'spinner', style: { width: '30px', height: '30px' } }), h('p', { class: 'muted', style: { marginTop: '.8rem' } }, 'Memuat game…')))));
    try {
      const data = await api.play(code);
      if (!data.questions || !data.questions.length) throw new Error('Game ini belum punya soal.');
      app.innerHTML = '';
      const holder = h('div', {});
      app.appendChild(holder);
      lastPlayStop = null;
      const inst = window.PBGame.play(holder, data, ME, () => { navigate('/siswa'); });
      lastPlayStop = () => inst && inst.stop && inst.stop();
    } catch (e) {
      app.innerHTML = '';
      app.appendChild(h('div', { class: 'auth-wrap' }, h('div', { class: 'card card-pad auth-card center' },
        h('div', { style: { fontSize: '3rem' } }, '🚫'),
        h('h2', {}, 'Game tidak bisa dibuka'),
        h('p', { class: 'muted' }, String(e.message || e)),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1rem' } },
          h('button', { class: 'btn btn-ghost', onclick: () => history.back() }, '← Kembali'),
          h('button', { class: 'btn', onclick: () => navigate(ME ? (ME.role === 'teacher' ? '/guru' : '/siswa') : '/masuk') }, '🏠 Beranda'),
        ),
      )));
    }
  }

  async function screenPlayByCode(code) {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'auth-wrap' }, h('div', { class: 'card card-pad auth-card center' },
      h('div', { style: { fontSize: '3rem' } }, '🔑'),
      h('h2', {}, 'Masuk dulu untuk main'),
      h('p', { class: 'muted' }, 'Kode game: ', h('b', {}, code.toUpperCase()), '. Nilai harus tersimpan ke akun guru, jadi kamu perlu masuk sebagai siswa.'),
      h('button', { class: 'btn btn-lg', onclick: () => { location.hash = '/masuk'; } }, 'Masuk / Daftar'),
    )));
  }

  /* ================================ START ================================ */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
