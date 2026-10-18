# 🎮 Petualangan Belajar

Platform **game pembelajaran** untuk guru dan siswa:

- 👩🏫 **Guru** membuat game sendiri (atau dibantu **AI**), menambah mata pelajaran & materi sendiri.
- 🧑‍🎓 **Siswa** mengerjakan game dari HP/laptop mana pun.
- 📥 **Setiap tugas siswa otomatis tersimpan ke akun guru** — lengkap dengan nilai, jawaban per soal, waktu, dan analisis soal tersulit.
- 🤖 **AI pembuat soal** berjalan **offline tanpa internet** (mesin PB-AI buatan sendiri), dan **opsional** bisa disambungkan ke API AI (OpenAI/OpenRouter/Groq/server lokal) lewat Pengaturan.
- 📦 Bisa diekspor menjadi **satu file HTML offline** untuk sekolah tanpa internet.

Dibuat untuk: **Arifin** 🙌

---

## 🚀 Menjalankan

```bash
cd petualangan-belajar
npm install        # sekali saja
npm start          # server jalan di http://localhost:3000
```

Buka di browser: **http://localhost:3000**

### Akun demo

| Peran  | Username | Password |
|--------|----------|----------|
| Guru   | `guru`   | `guru123`|
| Siswa  | `andi`, `siti`, `budi`, `lani`, `rina`, `dayu` | `123456` |

Kode kelas demo: `6ACERIA` · Guru juga bisa membuat akun siswa sendiri (password otomatis).

### Dipakai banyak device (WiFi sekolah / lab)

1. Jalankan server di satu komputer: `npm start` (port bisa diganti: `PORT=8080 npm start`).
2. Cari IP komputer itu (mis. `192.168.1.10`).
3. Siswa membuka `http://192.168.1.10:3000` dari HP/laptop masing-masing, lalu masuk dengan akun dari guru.
4. Semua nilai masuk otomatis ke akun guru, real-time.

### Mode 1 file HTML (tanpa internet & tanpa server)

Masuk sebagai guru → **Pengaturan** → **⬇️ Aplikasi Offline (HTML)**.
Hasilnya satu file (±350 KB) berisi seluruh aplikasi **beserta data kamu** (game, soal, kelas, nilai). File bisa dibuka langsung di browser mana pun, dibagikan lewat flashdisk/WhatsApp, dan tetap bisa dipakai bermain + menyimpan nilai di browser tersebut.

---

## ✨ Fitur lengkap

### Guru
- **Dashboard**: jumlah siswa, game, tugas masuk, rata-rata nilai, papan peringkat, tugas terbaru, dan **Analisis AI** (ringkasan + saran tindak lanjut).
- **Buat Game AI (wizard 4 langkah)**: identitas → tempel materi → AI menyusun soal → terbitkan ke kelas.
  - 5 tipe soal: **Pilihan Ganda, Benar/Salah, Isian Singkat, Urutan Langkah, Menjodohkan**.
  - Semua soal bisa diedit, dihapus, ditambah manual, ditempel dari Word/WhatsApp, atau dibuat ulang oleh AI.
  - Pratinjau tampilan siswa sebelum terbit.
  - Pengaturan: batas waktu per soal, KKM, acak soal, tampilkan pembahasan.
- **Bagikan game**: kode 6 huruf, link langsung, dan **QR code** (siap dipindai HP siswa).
- **Kelas & Siswa**: buat kelas, buat akun siswa satu-satu atau impor massal dari daftar nama, cetak daftar akun (username+password) untuk dibagikan.
- **Hasil Siswa**: tabel semua pengerjaan + filter game/kelas/nama, detail jawaban per siswa, unduh **CSV** untuk rapor, cetak.
- **Mapel & Materi**: tambah mapel, ikon, warna, jenjang, topik sendiri; **Bank Materi** untuk dipakai ulang oleh AI.
- **Asisten AI**: generator soal cepat, penyusun **Rencana Pembelajaran** (tujuan, kegiatan, ringkasan), dan **Analisis Hasil Belajar** kelas.
- **Pengaturan**: mode mesin AI (auto/offline/API), API key, nama sekolah, ekspor, reset data demo.

### Siswa
- Beranda dengan poin, game tersedia, dan kode game cepat.
- Main game: combo 🔥, bonus kecepatan ⚡, bintang ⭐, konfeti, penjelasan setelah menjawab.
- Gabung kelas dengan kode dari guru.
- **Nilai Saya**: riwayat semua tugas + ulasan jawaban & pembahasan.
- Profil: ganti nama, avatar, warna.

### Keamanan & penilaian
- Jawaban dicek **di server** setiap soal (kunci tidak bocor ke browser sebelum dijawab).
- Nilai resmi = poin dasar (tanpa bonus), sehingga konsisten dengan KKM; "poin" termasuk bonus untuk papan peringkat.
- Password di-hash (scrypt), sesi pakai cookie HttpOnly.

---

## 🤖 Cara kerja mesin AI offline (PB-AI)

Mesin ini membaca materi yang kamu tempel dan:

1. **Parsing**: memisahkan kalimat, butir (`-`/`1.`), pasangan *istilah → pengertian* (pola `X: Y`, `X adalah Y`, `X disebut Y`), langkah bernomor, angka, dan istilah penting.
2. **Pemahaman ringan**: mengelompokkan fakta (definisi, angka, nama, proses, daftar).
3. **Penyusunan soal**: membuat 5 tipe soal lengkap dengan **pengecoh cerdas** (diambil dari entitas sejenis di materi, atau variasi angka) dan **pembahasan**.
4. Soal benar/salah dibuat dari pernyataan asli, pernyataan yang dinegasikan, dan pernyataan yang definisinya ditukar.

**Tips hasil terbaik**: tulis materi per baris dengan pola `Istilah: pengertian`, sertakan angka/fakta, dan beri nomor untuk langkah/proses.

Bila API key diisi (Pengaturan → Mesin AI), soal dibuat oleh model AI besar; bila API gagal, sistem otomatis kembali ke mesin offline.

---

## 🗂 Struktur proyek

```
petualangan-belajar/
├── server.js            # server Express + seluruh API
├── package.json
├── data/db.json         # database (dibuat otomatis saat pertama jalan)
├── src/
│   ├── store.js         # penyimpanan JSON + util
│   ├── auth.js          # hash password & sesi
│   ├── ai-engine.js     # MESIN AI OFFLINE (PB-AI)
│   ├── ai-api.js        # jembatan ke API AI eksternal (opsional)
│   └── seed.js          # data contoh (guru, kelas, 5 game, nilai)
└── public/
    ├── index.html
    ├── style.css
    └── js/
        ├── config.js    # isi rtdbUrl untuk Mode Cloud (Vercel+Firebase)
        ├── seed-cloud.js# data contoh untuk Mode Cloud
        ├── util.js      # API client (server / offline / cloud), DOM helper
        ├── game.js      # mesin game siswa (5 tipe soal, combo, konfeti)
        ├── app.js       # seluruh halaman guru & siswa
        ├── qrcode.js    # pustaka QR (MIT, Kazuhiko Arase)
        └── qr.js        # adaptor QR
```

## 🌍 Hosting permanen (semua device + data terpusat)

Link preview dari Arena bersifat sementara. Untuk link permanen yang bisa dibuka
device mana pun dengan satu database terpusat, lihat **`PANDUAN-DEPLOY.md`**:

- **Rute D ⭐ (gratis semua, paling disarankan): GitHub + Vercel + Firebase Realtime Database** — tanpa server sendiri; aplikasi membaca/menulis data langsung dari browser ke Firebase sehingga link Vercel tidak pernah tidur dan semua device berbagi satu data. Cukup isi `rtdbUrl` di `public/js/config.js` lalu ikuti langkahnya di panduan.
- **Rute A (gratis):** Render.com + fitur **Cloud Sync GitHub** bawaan (`PB_GH_TOKEN`, `PB_GH_REPO`) — data dicadangkan otomatis ke repo private tiap ±60 detik dan dipulihkan saat server start.
- **Rute B (gratis):** PC sekolah selalu hidup + Cloudflare Tunnel (+ domain `.my.id` opsional).
- **Rute C (paling stabil):** VPS + pm2 (+ nginx/SSL opsional).

Variabel lingkungan sync (opsional): `PB_GH_TOKEN`, `PB_GH_REPO`, `PB_GH_PATH`, `PB_SYNC_EVERY`.

## 🔧 Perintah berguna

```bash
npm start                 # jalankan server
npm run seed:reset        # kembalikan data demo (hapus semua data buatan)
PORT=8080 npm start       # ganti port
```

## 📝 Lisensi

MIT — silakan dipakai dan dimodifikasi untuk keperluan sekolah.
