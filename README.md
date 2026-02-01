# Bot Input Data KJP via WhatsApp (Automasi Input & Export Excel)

Bot ini dirancang untuk mempermudah pendaftaran data KJP/Sembako secara otomatis via WhatsApp dengan format khusus untuk lokasi **Pasarjaya** (5 baris) dan **Dharmajaya** (4 baris). Data yang masuk disimpan ke Supabase dan dapat diekspor menjadi rekap harian format Excel/TXT oleh admin.

## 📌 Fitur Utama

- **Otomatisasi Input**: Membaca pesan teks WhatsApp dan mem-parsing data pendaftaran.
- **Validasi Format Strict**:
  - **Pasarjaya**: Wajib 5 baris (Nama, Kartu, KTP, KK, Tanggal Lahir).
  - **Dharmajaya**: Wajib 4 baris (Nama, Kartu, KTP, KK).
- **Cek Duplikat Real-time**: Mencegah input data ganda (berdasarkan No Kartu & KTP) pada hari yang sama.
- **Manajemen User (LID)**: Support mapping nomor HP asli untuk akun @lid (Linked Devices).
- **Admin Dashboard**: Menu khusus admin untuk rekap harian, hapus data, broadcast pesan, dan pengaturan jam tutup bot.
- **Export Excel Otomatis**: Generate laporan harian dalam format Excel (.xlsx) yang rapi.

## 🛠 Tech Stack

- **Runtime**: Node.js (TypeScript)
- **WhatsApp API**: `@whiskeysockets/baileys`
- **Database**: Supabase (`@supabase/supabase-js`)
- **Server**: Express (untuk keep-alive / health check)
- **Excel Generator**: `xlsx` & `xlsx-js-style`
- **Logging**: `pino`

## 📋 Persyaratan Sistem

- **Node.js**: v16 atau lebih baru.
- **Supabase Account**: URL & Anon Key project Supabase.
- **VPS / Server**: Ubuntu (Rekomendasi) untuk menjalankan bot 24/7.
- **WhatsApp Beta**: Multi-device support enabled.

## 🚀 Instalasi & Konfigurasi

1. **Clone Repository & Install Dependencies**
   ```bash
   npm install
   ```

2. **Konfigurasi Environment (.env)**
   Buat file `.env` di root folder dan isi:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   PORT=3000
   ```

3. **Database Schema**
   Pastikan tabel `data_harian`, `lid_phone_map`, `log_pesan_wa`, dan `bot_settings` sudah dibuat di Supabase.

## ▶️ Cara Menjalankan Bot

### Mode Development (Lokal)
Jalankan bot dengan `ts-node` (hot-reload tidak termasuk, perlu restart manual jika kode berubah):
```bash
npm run dev
```

### Mode Production (VPS)
Compile TypeScript ke JavaScript terlebih dahulu, lalu jalankan dari folder `dist`:
```bash
npm run build
npm start
```
*Disarankan menggunakan `pm2` untuk process manager di VPS.*

## 📂 Struktur Project Ringkas

```
src/
├── config/       # Konfigurasi pesan statis & template (messages.ts)
├── services/     # Logic bisnis tambahan (excelService.ts)
├── utils/        # Helper function (dateParser.ts, contactUtils.ts)
├── index.ts      # Entry point utama (Express & Init WA)
├── wa.ts         # Logika utama koneksi WhatsApp & Event Handler
├── parser.ts     # Parsing pesan teks menjadi data terstruktur
├── recap.ts      # Logic pembuatan rekap & laporan
├── supabase.ts   # Interaksi database (CRUD)
├── store.ts      # Manajemen state/session sementara
├── state.ts      # State flow user (menu bertingkat)
└── types.ts      # Definisi tipe data TypeScript
```

## 🔐 Menu Admin

Admin dapat mengakses menu khusus dengan mengetik `ADMIN MENU` (atau `0` jika dalam flow admin). Fitur admin meliputi:
1. **Hapus Data User**: Hapus data pendaftaran spesifik.
2. **Rekap Harian**: Cek ringkasan total data hari ini.
3. **Rekap Tanggal Lain**: Cek data tanggal lalu.
4. **List Semua Kontak**: Tampilkan semua user terdaftar.
5. **Broadcast Info**: Kirim pengumuman ke semua/sebagian user.
6. **Statistik Dashboard**: Grafik performa input data.
7. **Cari Data**: Search data berdasarkan nama/nomor.
8. **Log Aktivitas**: Pantau traffic pesan masuk.
9. **Export Data**: Download file TXT & Excel.
10. **Atur Jam Tutup**: Set jam operasional bot (otomatis tolak pesan saat tutup).

## ☁️ Deployment ke VPS

Lihat panduan lengkap di file `CARA PUSH KE VPS SEHABIS UPDATE SCRIPT.txt` untuk instruksi update aman menggunakan script `update-bot`.

Ringkasan perintah update:
```bash
ssh root@<IP_VPS>
update-bot bot-wa-1 kjp-bot
# Cek status
pm2 status
pm2 logs kjp-bot --lines 20
```
