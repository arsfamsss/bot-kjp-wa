# RENCANA REVISI UX BOT WHATSAPP KJP

**Tanggal:** 22 Januari 2026  
**Tujuan:** Memperbaiki pengalaman pengguna (UX) agar lebih mudah dipahami oleh ibu-ibu dan orang tua

---

## 📋 DAFTAR PERUBAHAN

### 1. MENU PILIH LOKASI (Sederhanakan)

**SEBELUM:**
```
📋 *DAFTAR ANTREAN*
Silakan pilih lokasi pendaftaran:

1️⃣ **Pasarjaya** (Kedoya/Cengkareng)
   _Format: 5 Baris (Ada Tanggal Lahir)_

2️⃣ **Dharmajaya** (Duri Kosambi)
   _Format: 4 Baris (Standar)_

_Ketik 0 untuk batal._
```

**SESUDAH:**
```
📋 *DAFTAR ANTREAN*
Silakan pilih lokasi pengambilan:

1️⃣ *Pasarjaya* (Kedoya/Cengkareng)
2️⃣ *Dharmajaya* (Duri Kosambi)

_Ketik 0 untuk batal._
_Ketik MENU untuk kembali ke menu utama._
```

**File:** `src/wa.ts` - Handler `SELECT_LOCATION` dan menu `normalized === '1'`

---

### 2. BALASAN SETELAH PILIH LOKASI (Tambah Contoh Format Alternatif)

#### 2a. PASARJAYA (5 Baris)

**SESUDAH:**
```
✅ *LOKASI: PASARJAYA (Kedoya/Cengkareng)*

📋 Format pendaftaran *5 BARIS*:
1. Nama
2. Nomor Kartu (16-18 digit)
3. Nomor KTP (16 digit)
4. Nomor KK (16 digit)
5. Tanggal Lahir (DD-MM-YYYY)

*Contoh 1:*
Budi Santoso
5049488500001111
3173444455556666
3173555566667777
15-08-1985

*Atau Contoh 2:*
Budi Santoso
Kjp 5049488500001111
Ktp 3173444455556666
Kk 3173555566667777
15-08-1985

👇 Silakan kirim data pendaftaran sekarang.
```

#### 2b. DHARMAJAYA (4 Baris)

**SESUDAH:**
```
✅ *LOKASI: DHARMAJAYA (Duri Kosambi)*

📋 Format pendaftaran *4 BARIS*:
1. Nama
2. Nomor Kartu (16-18 digit)
3. Nomor KTP (16 digit)
4. Nomor KK (16 digit)

*Contoh 1:*
Budi Santoso
5049488500001111
3173444455556666
3173555566667777

*Atau Contoh 2:*
Budi Santoso
Kjp 5049488500001111
Ktp 3173444455556666
Kk 3173555566667777

👇 Silakan kirim data pendaftaran sekarang.
```

**File:** `src/wa.ts` - Handler `SELECT_LOCATION` case '1' dan case '2'

---

### 3. BALASAN DATA DITERIMA (Revisi Pesan)

**SEBELUM:**
```
✅ *DATA PENDAFTARAN DITERIMA*

📌 Data diterima: *1 orang*
📊 Total data Anda hari ini: *2 orang*

Terima kasih 🙏
Data pendaftaran antrean sembako bersubsidi telah kami terima dan dicatat.

📅 Pengambilan: *H+1* (keesokan hari)
⏰ Silakan menunggu informasi selanjutnya.

💡 _Ketik *CEK* untuk melihat detail data Anda._
💡 _Ketik *BATAL* dalam 30 menit jika ingin membatalkan._
```

**SESUDAH:**
```
✅ *DATA PENDAFTARAN DITERIMA*

📌 Data diterima: *1 orang*
📊 Total data Anda hari ini: *2 orang*

Terima kasih 🙏
Data pendaftaran anda telah kami terima dan dicatat.

⚠️ *PENTING:*
Pastikan data sudah BENAR dan URUT sesuai contoh.
Jika salah, pengambilan sembako bisa DITOLAK.

💡 _Ketik *CEK* untuk melihat detail data Anda._
💡 _Ketik *BATAL* dalam 30 menit jika ingin membatalkan._
💡 _Atau langsung kirim data baru sesuai format pendaftaran._
```

**File:** `src/reply.ts` - function `buildReplyForNewData()`

---

### 4. FITUR CEK DATA (Langsung Tampilkan, Tanpa Sub-Menu)

**SEBELUM:** User ketik CEK → Tampil menu pilih periode → User pilih 1 → Baru tampil data

**SESUDAH:** User ketik CEK → Langsung tampil data hari ini

**Format Balasan Baru:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔎 *STATUS DATA HARI INI*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 Periode: *22-01-2026* (06.01–04.00 WIB)

✅ *Data Terdaftar: 2 Orang*

┌── 1. *BUDI SANTOSO*
│   📇 Kartu : 5049488500001111
│   🪪 KTP   : 3173444455556666
│   🏠 KK    : 3173555566667777
└── 📍 Lokasi: Pasarjaya

┌── 2. *AAA BUDI SANTOSO*
│   📇 Kartu : 5048888500001111
│   🪪 KTP   : 3173884455556666
│   🏠 KK    : 3173500566667777
└── 📍 Lokasi: Dharmajaya

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 _Ketik *MENU* untuk kembali._
💡 _Ketik *HAPUS 1* atau *HAPUS 1,2,3* untuk menghapus data._
```

**File:** 
- `src/wa.ts` - Handler `normalized === '2' || normalized.startsWith('CEK')`
- `src/recap.ts` - function `buildReplyForTodayRecap()` (revisi format)

---

### 5. FITUR HAPUS DATA (Dengan Konfirmasi & Multi-Delete)

**Format Perintah:**
- `HAPUS 1` → Hapus data nomor 1
- `HAPUS 1,2,3` → Hapus data nomor 1, 2, dan 3
- `HAPUS 1 2 3` → Sama dengan di atas

**Alur:**
1. User ketik `HAPUS 1`
2. Bot balas konfirmasi:
   ```
   ⚠️ *KONFIRMASI HAPUS*
   
   Data yang akan dihapus:
   1. BUDI SANTOSO (5049488500001111)
   
   Ketik *YA* untuk konfirmasi hapus.
   Ketik *TIDAK* untuk batal.
   ```
3. User ketik `YA`
4. Bot balas:
   ```
   ✅ *DATA BERHASIL DIHAPUS*
   
   1 data telah dihapus:
   - BUDI SANTOSO
   
   💡 _Ketik *CEK* untuk melihat sisa data Anda._
   ```

**File:** 
- `src/wa.ts` - Handler baru untuk `HAPUS X` dan state `CONFIRM_DELETE`
- `src/state.ts` - Tambah state `CONFIRM_DELETE` dan cache pending delete items

---

### 6. ALUR USER BARU / TIDAK TERDAFTAR

**Kondisi:** User pertama kali chat ATAU LID tidak dikenali

**Alur Saat Ini (Sudah Ada):**
1. User kirim pesan apa saja
2. Bot minta input nomor HP
3. User input nomor HP
4. Bot simpan dan balas sukses

**Revisi Balasan Setelah Input HP:**
```
✅ *Selamat datang!*
Nomor Anda (6281212985108) sudah terdaftar.

Silakan kirim pesan lagi:
• Ketik *MENU* untuk melihat pilihan
• Atau langsung kirim data pendaftaran Anda
```

**File:** `src/wa.ts` - Bagian verifikasi user baru (sekitar line 350-400)

---

### 7. USER SUDAH TERDAFTAR - LANGSUNG KIRIM DATA

**Kondisi:** User sudah terdaftar, langsung kirim data tanpa ketik menu

**Alur:**
1. User langsung kirim data 4/5 baris
2. Bot deteksi format → Proses sesuai lokasi terakhir yang dipilih
3. Jika belum pernah pilih lokasi → Default ke DHARMAJAYA (4 baris)

**Catatan:** Ini sudah berjalan, tidak perlu perubahan besar

---

### 8. TAMPILAN MENU UTAMA

**Revisi:** Jika user ketik selain angka menu (1,2,3,4,0) dan bukan data valid → Tampilkan menu utama

**Kondisi Trigger Menu:**
- Ketik: MENU, HALO, HI, P, PING, dll
- Ketik huruf/kata random yang bukan data

**File:** `src/wa.ts` - Bagian `isGreetingOrMenu()` dan fallback handler

---

### 9. DATA ADMIN REKAP - Tambah Kolom Lokasi & Tanggal Lahir

**Rekap Admin harus menampilkan:**
- Nama
- No Kartu
- No KTP
- No KK
- **Lokasi Pengambilan** (Pasarjaya/Dharmajaya) ← BARU
- **Tanggal Lahir** (jika Pasarjaya) ← BARU

**Database:** Perlu tambah kolom di tabel `data_harian`:
- `location` (VARCHAR) - 'PASARJAYA' atau 'DHARMAJAYA'
- `tanggal_lahir` (DATE atau VARCHAR) - Format DD-MM-YYYY

**File:**
- `migration.sql` - ALTER TABLE
- `src/supabase.ts` - Update insert/select
- `src/parser.ts` - Parse tanggal lahir untuk Pasarjaya
- `src/recap.ts` - Tampilkan di rekap admin

---

## 📁 FILE YANG PERLU DIUBAH

| No | File | Perubahan |
|----|------|-----------|
| 1 | `src/wa.ts` | Menu lokasi, handler CEK, handler HAPUS, alur user baru |
| 2 | `src/reply.ts` | Pesan data diterima |
| 3 | `src/recap.ts` | Format CEK data, format rekap admin |
| 4 | `src/state.ts` | State CONFIRM_DELETE, cache pending delete |
| 5 | `src/supabase.ts` | Insert/select kolom lokasi & tanggal lahir |
| 6 | `src/parser.ts` | Parse tanggal lahir untuk format Pasarjaya |
| 7 | `migration.sql` | Alter table tambah kolom |

---

## 🔧 URUTAN EKSEKUSI

1. **Fase 1: Database**
   - Tambah kolom `location` dan `tanggal_lahir` di tabel `data_harian`

2. **Fase 2: Parser**
   - Update parser untuk format Pasarjaya (5 baris dengan tanggal lahir)

3. **Fase 3: Pesan & UI**
   - Update menu pilih lokasi
   - Update balasan setelah pilih lokasi
   - Update balasan data diterima
   - Update format CEK data (langsung tampil)
   - Update format HAPUS data (dengan konfirmasi)

4. **Fase 4: Admin Rekap**
   - Update rekap admin dengan kolom lokasi & tanggal lahir

5. **Fase 5: Testing & Deploy**

---

## ✅ CHECKLIST

- [ ] Migration database (tambah kolom)
- [ ] Update parser untuk Pasarjaya
- [ ] Revisi menu pilih lokasi
- [ ] Revisi balasan setelah pilih lokasi (tambah contoh alternatif)
- [ ] Revisi balasan data diterima
- [ ] Fitur CEK langsung tampil (tanpa sub-menu)
- [ ] Fitur HAPUS dengan konfirmasi & multi-delete
- [ ] Revisi balasan user baru
- [ ] Update rekap admin (lokasi & tanggal lahir)
- [ ] Testing
- [ ] Deploy & sync ke Termux

---

**Status:** 📝 DRAFT - Menunggu Approval
