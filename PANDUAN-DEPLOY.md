# 🌍 Panduan Deploy Permanen — Petualangan Belajar

Tujuan: link yang **tidak pernah mati**, bisa dibuka **semua device** (HP/laptop/tablet di mana pun),
dan **satu database terpusat** sehingga nilai siswa selalu terhubung ke akun guru.

> Aplikasi ini 100% Node.js + Express tanpa database eksternal, jadi murah dan mudah di-host di mana saja.
> Fitur **Cloud Sync GitHub** (bawaan) membuat data aman walau hostingnya ber-disk sementara.

| Ruta | Biaya | permanen? | semua device? | data terpusat? | kesulitan |
|---|---|---|---|---|---|
| **D. Vercel + Firebase + GitHub** ⭐ | Gratis semua (tanpa kartu kredit) | ✅✅ tidak pernah tidur | ✅ | ✅ (Firebase Realtime Database) | ⭐⭐ |
| **A. Render + GitHub Sync** | Gratis (tanpa kartu kredit) | ✅ URL tetap | ✅ | ✅ (di repo GitHub) | ⭐⭐ |
| **B. PC sekolah + Cloudflare Tunnel** | Gratis (+domain opsional ±Rp15rb/th) | ✅ (selama PC hidup) | ✅ | ✅ (di PC sekolah) | ⭐⭐ |
| **C. VPS** | ±Rp50–100rb/bulan | ✅✅ paling stabil | ✅ | ✅ (di VPS) | ⭐⭐⭐ |

---

## RUTE A — Render.com + GitHub (GRATIS, disarankan untuk mulai)

Prinsip: kode aplikasi di repo GitHub #1, data otomatis dicadangkan ke repo GitHub #2 tiap ±60 detik.
Render free tier bisa "tidur" bila tidak diakses 15 menit (bangkit lagi ±30–50 detik saat dibuka) — normal.

### 1. Siapkan dua repo GitHub
1. Buat akun di https://github.com (gratis).
2. Repo **#1 untuk kode**: nama `petualangan-belajar` (public/private bebas).
3. Repo **#2 untuk data**: nama `pb-data` → **pilih Private** (berisi nilai siswa).

### 2. Unggah kode aplikasi ke repo #1
Cara paling mudah tanpa git (dari komputer mana pun):
- Unduh/salin folder `petualangan-belajar` dari workspace Arena ini.
- Hapus folder `node_modules` dan file `data/db.json` bila ada (tidak perlu ikut).
- Di halaman repo #1 klik **"uploading an existing file"** → seret seluruh isi folder → commit.

Atau pakai git (bila terinstal):
```bash
cd petualangan-belajar
rm -rf node_modules data/db.json
git init && git add -A && git commit -m "Petualangan Belajar v1"
git branch -M main
git remote add origin https://github.com/USERNAME/petualangan-belajar.git
git push -u origin main
```

### 3. Buat token GitHub (kunci untuk sync data)
1. https://github.com/settings/tokens → **Generate new token (classic)**.
2. Centang scope **`repo`** (atau fine-grained: repo `pb-data`, permission *Contents: Read and write*).
3. Salin token (mulai `ghp_...`) — simpan baik-baik, hanya tampil sekali.

### 4. Deploy di Render
1. Buka https://render.com → daftar (paling gampang: *Sign in with GitHub*).
2. **New + → Web Service** → pilih repo `petualangan-belajar`.
3. Setting (kebanyakan terdeteksi otomatis dari `package.json`):
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance/Plan: **Free**
4. Di menu **Environment**, tambahkan:
   - `PB_GH_TOKEN` = token langkah 3
   - `PB_GH_REPO` = `USERNAME/pb-data`
5. Klik **Create Web Service**. Tunggu build ±1–2 menit.
6. Selesai! Link permanen kamu: **`https://petualangan-belajar.onrender.com`** (bisa diganti namanya di Settings).

### 5. Verifikasi sync
- Buka aplikasi, login guru, buat satu kelas uji.
- Tunggu ±1 menit, buka repo `pb-data` di GitHub → muncul file `db.json` ✅.
- Matikan/restart service di Render → buka lagi → data tetap ada ✅ (dipulihkan dari GitHub saat start).

---

## RUTE B — PC/laptop sekolah yang selalu hidup + Cloudflare Tunnel (GRATIS)

Cocok bila ada komputer lab yang menyala saat jam sekolah; data sepenuhnya milik sekolah.

### 1. Jalankan aplikasi sebagai "service"
- Install Node.js → salin folder aplikasi → `npm install`.
- Windows: buat file `mulai.bat` berisi:
  ```bat
  cd /d C:\petualangan-belajar
  node server.js
  ```
  lalu jadwalkan otomatis: **Task Scheduler** → trigger *At log on* → action jalankan `mulai.bat`.
- Linux: `npm i -g pm2 && pm2 start server.js --name pb && pm2 save && pm2 startup`.

### 2. Buka ke internet dengan Cloudflare Tunnel (gratis, tanpa buka port router)
1. Unduh `cloudflared` dari https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. **Cepat (URL acak, ganti tiap restart):**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. **Permanen (disarankan):** akun Cloudflare gratis + domain murah (`.my.id` ±Rp10–25rb/th di registrar Indonesia):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create sekolah
   cloudflared tunnel route dns sekolah belajar.namasekolah.my.id
   cloudflared tunnel run --url http://localhost:3000 sekolah
   ```
   Hasil: **`https://belajar.namasekolah.my.id`** — permanen, HTTPS, semua device, data di PC sekolah.

---

## RUTE C — VPS (paling stabil, ±Rp50–100rb/bulan)

Provider Indonesia mana pun (IDCloudHost, Niagahoster, Rumahweb, dll) atau DigitalOcean/Vultr. Pilih Ubuntu 22.04, RAM 1GB cukup.

```bash
# 1) masuk ke VPS
ssh root@IP-VPS

# 2) install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3) unggah aplikasi dari komputermu (jalankan di komputer lokal, bukan di VPS):
#    scp -r petualangan-belajar root@IP-VPS:/opt/petualangan-belajar

# 4) jalankan permanen dengan pm2
cd /opt/petualangan-belajar
npm install
sudo npm i -g pm2
pm2 start server.js --name pb
pm2 save && pm2 startup
sudo ufw allow 3000/tcp

# 5) akses: http://IP-VPS:3000  (seluruh device, di mana pun)
```

Opsional biar cantik & aman: arahkan domain ke IP VPS + pasang nginx & SSL:
```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
# buat server proxy di /etc/nginx/sites-available/pb ke localhost:3000, lalu:
sudo certbot --nginx -d belajar.namasekolah.sch.id
```
Data tersimpan di disk VPS (`data/db.json`). Ingin cadangan ganda? Aktifkan juga sync GitHub:
`pm2 set pm2:env PB_GH_TOKEN=... ` atau edit ecosystem: jalankan dengan env `PB_GH_TOKEN` & `PB_GH_REPO`.

---

## RUTE D — GitHub + Vercel + Firebase (GRATIS SEMUA, PALING DIREKOMENDASIKAN) ⭐

Prinsip: kode di **GitHub** → website di-host **Vercel** (tidak pernah tidur) → seluruh data disimpan di
**Firebase Realtime Database** (Google, gratis). Aplikasi membuka/menyimpan data **langsung dari browser**
ke Firebase, jadi tidak perlu server sendiri sama sekali. Semua device melihat data yang sama.

### 1. Buat database Firebase (±5 menit)
1. Buka <https://console.firebase.google.com> → login akun Google → **Add project** → beri nama (mis. `petualangan-belajar`) → Next, Next, Create.
2. Tidak perlu mendaftarkan aplikasi web — yang dibutuhkan hanya database:
   menu kiri **Build → Realtime Database → Create Database** → lokasi **asia-southeast1 (Singapore)** → *Start in test mode* → Enable.
3. Salin URL database yang muncul di atas, bentuknya:
   `https://petualangan-belajar-default-rtdb.asia-southeast1.firebasedatabase.app`
4. Masih di halaman Realtime Database → tab **Rules** → ganti isinya dengan file `firebase-rules.json` dari repo ini:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   → **Publish**. (Aturan terbuka dipilih agar deployment tetap gratis & tanpa login Google untuk siswa.
   Konsekuensinya: orang yang tahu URL database bisa membaca isinya. Untuk pemakaian kelas/sekolah ini wajar;
   jangan simpan data sensitif seperti NISN lengkap/nilai rapor resmi.)

### 2. Isi URL ke aplikasi
Buka `public/js/config.js`, isi satu baris ini:
```js
window.PB_CLOUD = {
  rtdbUrl: "https://petualangan-belajar-default-rtdb.asia-southeast1.firebasedatabase.app",
};
```

### 3. Unggah ke GitHub
1. Buat repo baru di <https://github.com/new> (mis. `petualangan-belajar`, **Public**).
2. Di folder proyek ini jalankan:
   ```bash
   git init && git add -A && git commit -m "Petualangan Belajar"
   git branch -M main
   git remote add origin https://github.com/USERNAME/petualangan-belajar.git
   git push -u origin main
   ```

### 4. Deploy ke Vercel (±3 menit)
1. Buka <https://vercel.com/signup> → **Continue with GitHub** → izinkan.
2. **Add New… → Project** → pilih repo `petualangan-belajar` → **Import**.
3. Pengaturan build:
   - Framework Preset: **Other**
   - Build Command: **kosongkan**
   - Output Directory: **`public`**
   - Install Command: **kosongkan**
4. **Deploy**. Selesai — dapat link permanen seperti `https://petualangan-belajar.vercel.app`.

### 5. Muat data contoh & mulai pakai
1. Buka link Vercel-mu. Karena database masih kosong, muncul tombol **📦 Muat data contoh** → klik.
2. Login guru `guru/guru123`, siswa `andi/123456` (kode kelas `6ACERIA`, game contoh `F64C6F` dll.).
   Ganti password/akun demo lewat aplikasi sesuai kebutuhan.
3. Bagikan link + kode game ke siswa — nilai otomatis masuk ke akun guru dari device mana pun.

### Bila ada perubahan kode
Cukup `git push` — Vercel otomatis deploy ulang (±1 menit). Data di Firebase tidak tersentuh.

---

## ❓ Sering ditanya

**Apakah link preview Arena (`....e2b.app`) bisa dipermanenkan?**
Tidak bisa — itu sandbox demo sementara milik asisten. Untuk permanen pakai Ruta A/B/C di atas.

**Bila pakai Ruta A, apakah nilai tetap masuk saat Render tidur?**
Ya. Request pertama membangunkan server (±30–50 detik), lalu semua berfungsi normal dan data dipulihkan dari GitHub.

**Bisa pindah rute nanti?**
Bisa. Datanya portabel: file `data/db.json` (server) atau repo `pb-data` (sync). Cukup salin/arahkan env-nya.

**Rute D vs Rute A, pilih mana?**
Rute D (Vercel+Firebase): link tidak pernah tidur, cocok untuk harian. Rute A (Render): server Express penuh
(ada ekspor CSV/HTML dari server), tapi bisa "tidur" ±30–50 detik saat pertama dibuka.

**Keamanan data siswa?**
Repo data wajib **private**; token GitHub jangan dibagikan; password akun di-hash di server.
