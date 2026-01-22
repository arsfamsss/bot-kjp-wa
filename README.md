# 🤖 BOT WHATSAPP PENDAFTARAN KJP SEMBAKO

Bot WhatsApp untuk menerima dan mengelola data pendaftaran antrean sembako KJP (Kartu Jakarta Pintar). Bot ini otomatis memproses data yang dikirim melalui WhatsApp dan menyimpan ke database Supabase.

---

## ✨ Fitur Utama

### 📥 Pendaftaran Data
- Terima data pendaftaran via WhatsApp (format 4 atau 5 baris)
- Validasi otomatis: Nama, No Kartu (16-18 digit), No KTP (16 digit), No KK (16 digit)
- Deteksi duplikat (No Kartu/KTP/KK yang sudah terdaftar hari ini)
- Dukungan 2 lokasi: **Pasarjaya** (5 baris + tanggal lahir) & **Dharmajaya** (4 baris)

### 📋 Menu User
| Perintah | Fungsi |
|----------|--------|
| `MENU` | Tampilkan menu utama |
| `1` / `DAFTAR` | Mulai pendaftaran (pilih lokasi) |
| `2` / `CEK` | Lihat data yang sudah didaftarkan hari ini |
| `3` / `HAPUS` | Hapus data tertentu |
| `HAPUS 1,2,3` | Hapus data nomor 1, 2, 3 sekaligus |
| `BATAL` | Batalkan data terakhir (dalam 30 menit) |
| `FAQ` | Bantuan & panduan |

### 🔐 Menu Admin
| No | Fungsi |
|----|--------|
| 1 | Hapus Data User (pilih user → pilih data) |
| 2 | Rekap Hari Ini |
| 3 | Rekap Tanggal Tertentu |
| 4 | Rekap Rentang Tanggal |
| 5 | List Semua Kontak |
| 6 | Edit Kontak |
| 7 | Hapus Kontak |
| 8 | Broadcast Informasi |
| 9 | Statistik Dashboard |
| 10 | Cari Data |
| 11 | Log Aktivitas |
| 12 | Export Data (TXT) |

---

## 🛠️ Teknologi

- **Node.js** + TypeScript
- **Baileys** - WhatsApp Web API
- **Supabase** - Database PostgreSQL
- **PM2** - Process Manager (untuk Termux/VPS)

---

## 📦 Instalasi

### 1. Clone Repository
```bash
git clone https://github.com/arsfamsss/bot-kjp-wa.git
cd bot-kjp-wa
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Konfigurasi Environment
Buat file `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### 4. Setup Database
Jalankan migration SQL di Supabase:
```bash
# Lihat file migration.sql
```

### 5. Jalankan Bot
```bash
# Development
npm run dev

# Production (dengan PM2)
npm run build
pm2 start dist/index.js --name bot-wa
```

### 6. Scan QR Code
Setelah bot berjalan, scan QR Code yang muncul di terminal menggunakan WhatsApp.

---

## 📱 Contoh Format Pendaftaran

### Lokasi Dharmajaya (4 Baris)
```
Budi Santoso
5049488500001111
3173444455556666
3173555566667777
```

### Lokasi Pasarjaya (5 Baris)
```
Budi Santoso
5049488500001111
3173444455556666
3173555566667777
15-08-1985
```

### Multiple Data (Sekaligus)
```
Budi Santoso
5049488500001111
3173444455556666
3173555566667777

Siti Aminah
5049488522223333
3173000011112222
3173888877776666
```

---

## ⏰ Jam Operasional

| Waktu | Status |
|-------|--------|
| 06.01 - 04.00 WIB | ✅ Buka |
| 04.01 - 06.00 WIB | ❌ Tutup (Maintenance) |

Data yang masuk di jam tutup tidak akan diproses.

---

## 📊 Struktur Database

### Tabel `data_harian`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | uuid | Primary Key |
| processing_day_key | date | Tanggal proses |
| nama | text | Nama penerima |
| no_kjp | text | Nomor Kartu KJP |
| no_ktp | text | Nomor KTP |
| no_kk | text | Nomor KK |
| tanggal_lahir | text | Tanggal lahir (optional) |
| sender_phone | text | Nomor HP pengirim |
| sender_name | text | Nama pengirim |
| received_at | timestamp | Waktu diterima |

### Tabel `lid_phone_map`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| lid_jid | text | JID WhatsApp (untuk LID) |
| phone_number | text | Nomor HP |
| push_name | text | Nama kontak |

### Tabel `log_pesan_wa`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | uuid | Primary Key |
| message_id | text | ID pesan WA |
| sender_phone | text | Pengirim |
| processing_day_key | date | Tanggal |
| stats_total_blocks | int | Total data |
| stats_ok_count | int | Data berhasil |

---

## 👨‍💻 Konfigurasi Admin

Edit file `src/config/messages.ts`:
```typescript
export const ADMIN_PHONES_RAW = [
  '6281234567890',  // Admin 1
  '6289876543210',  // Admin 2
];
```

---

## 📝 Update Bot (Termux)

```bash
cd ~/bot-kjp-wa
git pull
npm run build
pm2 restart bot-wa
```

---

## 📄 Lisensi

MIT License - Bebas digunakan dan dimodifikasi.

---

## 🙋 Kontak

Untuk pertanyaan atau bantuan, hubungi developer.
