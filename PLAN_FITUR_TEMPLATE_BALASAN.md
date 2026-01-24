# PLAN: Fitur Template Balasan & Antrian Data Saat Tutup

## 🎯 Tujuan
1. **Admin bisa setting tulisan balasan** tanpa edit script
2. **Admin atur balasan sesuai keinginan** via template yang sudah dibuat
3. **Data tetap diterima saat bot tutup** (tidak diproses, masuk antrian)
4. **Data diproses otomatis saat jam buka**

---

## 📊 ANALISIS KONDISI SAAT INI

### Lokasi Template Pesan Existing:

| File | Isi | Status |
|------|-----|--------|
| `src/config/messages.ts` | Menu Utama, FAQ, Menu Admin | ✅ Terpusat |
| `src/reply.ts` | Balasan data sukses/gagal | ⚠️ Hardcoded di function |
| `src/recap.ts` | Rekap data user & admin | ⚠️ Hardcoded di function |
| `src/wa.ts` | 40+ pesan inline | ❌ Tersebar, sulit diubah |

### Masalah:
- Sebagian besar template **inline di wa.ts** (tidak terpusat)
- Admin harus edit kode untuk ubah pesan
- Tidak ada database untuk simpan template

---

## 📋 DAFTAR LENGKAP 55 SKENARIO BALASAN

### 🟦 A. SKENARIO USER UMUM (17 Skenario)

| ID | Kode Template | Skenario | Lokasi Saat Ini |
|----|---------------|----------|-----------------|
| U01 | `MENU_UTAMA` | Menu utama (HALO, MENU, HI, dll) | messages.ts ✅ |
| U02 | `FORMAT_DAFTAR` | Panduan format pendaftaran | messages.ts ✅ |
| U03 | `FAQ_BANTUAN` | FAQ dan bantuan | messages.ts ✅ |
| U04 | `PILIH_LOKASI` | Pilih lokasi (Pasarjaya/Dharmajaya) | wa.ts ❌ |
| U05 | `LOKASI_PASARJAYA` | Konfirmasi pilih Pasarjaya + format 5 baris | wa.ts ❌ |
| U06 | `LOKASI_DHARMAJAYA` | Konfirmasi pilih Dharmajaya + format 4 baris | wa.ts ❌ |
| U07 | `DATA_SUKSES` | Data pendaftaran diterima (semua OK) | reply.ts ⚠️ |
| U08 | `DATA_PARTIAL` | Data dicatat sebagian | reply.ts ⚠️ |
| U09 | `DATA_GAGAL` | Data belum bisa diproses (semua gagal) | reply.ts ⚠️ |
| U10 | `CEK_DATA_ADA` | Hasil cek data (ada data) | recap.ts ⚠️ |
| U11 | `CEK_DATA_KOSONG` | Hasil cek data (tidak ada) | wa.ts ❌ |
| U12 | `HAPUS_PILIH` | Menu pilih data untuk dihapus | wa.ts ❌ |
| U13 | `HAPUS_SUKSES` | Konfirmasi data berhasil dihapus | wa.ts ❌ |
| U14 | `HAPUS_GAGAL` | Data gagal dihapus | wa.ts ❌ |
| U15 | `BATAL_SUKSES` | Data dibatalkan (dalam 30 menit) | wa.ts ❌ |
| U16 | `BATAL_GAGAL` | Tidak ada data yang bisa dibatalkan | wa.ts ❌ |
| U17 | `GAMBAR_TANPA_CAPTION` | Error: kirim gambar tanpa teks | wa.ts ❌ |

---

### 🟥 B. SKENARIO SISTEM (6 Skenario)

| ID | Kode Template | Skenario | Lokasi Saat Ini |
|----|---------------|----------|-----------------|
| S01 | `SISTEM_TUTUP` | Bot sedang tutup (04.01-06.00 WIB) | wa.ts ❌ |
| S02 | `MINTA_NOMOR_HP` | LID belum terdaftar, minta nomor | wa.ts ❌ |
| S03 | `VERIFIKASI_SUKSES` | Nomor HP berhasil dicatat | wa.ts ❌ |
| S04 | `VERIFIKASI_GAGAL` | Nomor HP gagal disimpan | wa.ts ❌ |
| S05 | `WELCOME_BACK` | User sudah terdaftar, selamat datang | wa.ts ❌ |
| S06 | `BLOCKED_LID` | Perangkat tidak dikenali | wa.ts ❌ |

---

### 🟨 C. SKENARIO VALIDASI DATA (14 Skenario)

| ID | Kode Template | Skenario | Error Type |
|----|---------------|----------|------------|
| V01 | `ERR_NAMA_KOSONG` | Nama wajib diisi | `required` |
| V02 | `ERR_KARTU_KOSONG` | Nomor Kartu wajib diisi | `required` |
| V03 | `ERR_KARTU_PANJANG` | Panjang nomor kartu salah (harus 16-18) | `invalid_length` |
| V04 | `ERR_KARTU_PREFIX` | Nomor kartu tidak awali 504948 | `invalid_prefix` |
| V05 | `ERR_KTP_KOSONG` | No KTP wajib diisi | `required` |
| V06 | `ERR_KTP_PANJANG` | Panjang KTP salah (harus 16 digit) | `invalid_length` |
| V07 | `ERR_KK_KOSONG` | No KK wajib diisi | `required` |
| V08 | `ERR_KK_PANJANG` | Panjang KK salah (harus 16 digit) | `invalid_length` |
| V09 | `ERR_TGL_LAHIR` | Tanggal lahir kosong/salah (Pasarjaya) | `required` |
| V10 | `ERR_URUTAN_SALAH` | Urutan baris salah (KK & KTP terbalik) | `wrong_order` |
| V11 | `ERR_NOMOR_SAMA` | Nomor sama antar field (KJP=KTP, dll) | `same_as_other` |
| V12 | `ERR_DUPLIKAT_PESAN` | Duplikat dalam 1 pesan | `duplicate_in_message` |
| V13 | `ERR_DUPLIKAT_KARTU` | Kartu sudah terdaftar bulan ini | `SKIP_DUPLICATE` |
| V14 | `ERR_DUPLIKAT_KTP` | KTP sudah terdaftar hari ini | `SKIP_DUPLICATE` |

---

### 🟩 D. SKENARIO ADMIN (18 Skenario)

| ID | Kode Template | Skenario | Lokasi Saat Ini |
|----|---------------|----------|-----------------|
| A01 | `ADMIN_MENU` | Menu admin utama | messages.ts ✅ |
| A02 | `ADMIN_REKAP_HARI_INI` | Header rekap hari ini | recap.ts ⚠️ |
| A03 | `ADMIN_REKAP_TANGGAL` | Rekap tanggal tertentu | recap.ts ⚠️ |
| A04 | `ADMIN_REKAP_RENTANG` | Rekap rentang tanggal | recap.ts ⚠️ |
| A05 | `ADMIN_LIST_KONTAK` | Header list semua kontak | wa.ts ❌ |
| A06 | `ADMIN_EDIT_KONTAK_OK` | Sukses simpan/edit kontak | wa.ts ❌ |
| A07 | `ADMIN_HAPUS_KONTAK_OK` | Sukses hapus kontak | wa.ts ❌ |
| A08 | `ADMIN_BROADCAST_SELECT` | Pilih target broadcast | wa.ts ❌ |
| A09 | `ADMIN_BROADCAST_MSG` | Minta isi pesan broadcast | wa.ts ❌ |
| A10 | `ADMIN_BROADCAST_PREVIEW` | Preview broadcast | wa.ts ❌ |
| A11 | `ADMIN_BROADCAST_DONE` | Broadcast selesai | wa.ts ❌ |
| A12 | `ADMIN_BROADCAST_SCHEDULE` | Broadcast dijadwalkan | wa.ts ❌ |
| A13 | `ADMIN_STATISTIK` | Dashboard statistik | wa.ts ❌ |
| A14 | `ADMIN_CARI_DITEMUKAN` | Hasil pencarian ditemukan | wa.ts ❌ |
| A15 | `ADMIN_CARI_TIDAK_ADA` | Hasil pencarian tidak ada | wa.ts ❌ |
| A16 | `ADMIN_LOG` | Header log aktivitas | wa.ts ❌ |
| A17 | `ADMIN_EXPORT_OK` | Export data sukses | wa.ts ❌ |
| A18 | `ADMIN_EXPORT_KOSONG` | Export data kosong | wa.ts ❌ |

---

## 🔧 FITUR YANG AKAN DIBUAT

### 1. Tabel Database `template_pesan`

```sql
CREATE TABLE template_pesan (
    id SERIAL PRIMARY KEY,
    kode VARCHAR(50) UNIQUE NOT NULL,       -- Kode template (MENU_UTAMA, DATA_SUKSES, dll)
    kategori VARCHAR(20) NOT NULL,           -- USER, SISTEM, VALIDASI, ADMIN
    judul VARCHAR(100),                      -- Deskripsi singkat
    isi_pesan TEXT NOT NULL,                 -- Isi template (support variabel)
    is_active BOOLEAN DEFAULT TRUE,          -- Aktif/nonaktif
    updated_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index untuk performa
CREATE INDEX idx_template_kode ON template_pesan(kode);
CREATE INDEX idx_template_kategori ON template_pesan(kategori);
```

### 2. Default Values (55 Template)

```sql
-- USER UMUM
INSERT INTO template_pesan (kode, kategori, judul, isi_pesan) VALUES
('MENU_UTAMA', 'USER', 'Menu Utama', '🛒 *PENDAFTARAN SEMBAKO BERSUBSIDI*\n\nSelamat datang! 👋\n\nKetik angka untuk memilih:\n\n1️⃣ 📋 *Daftar* - Kirim data antrean\n2️⃣ 🔍 *Cek* - Lihat data yg anda kirim\n3️⃣ 🗑️ *Hapus* - Hapus data\n4️⃣ ❓ *Bantuan* - FAQ'),
('SISTEM_TUTUP', 'SISTEM', 'Sistem Tutup', '⛔ *MOHON MAAF, SISTEM SEDANG TUTUP*\n(Maintenance Harian)\n\n🕒 Jam Tutup: *04.01 - 06.00 WIB*\n✅ Buka Kembali: *Pukul 06.01 WIB*\n\n📌 Data yang Anda kirim sekarang *tidak akan diproses*.\nSilakan kirim ulang setelah jam buka untuk pendaftaran besok.\n\n_Terima kasih atas pengertiannya._ 🙏'),
('DATA_SUKSES', 'USER', 'Data Diterima', '✅ *DATA PENDAFTARAN DITERIMA*\n\n🎯 Diterima: *{total} orang*\n📊 Total Data Anda hari ini: *{total_hari_ini} orang*\n\nTerima kasih 🙏\nData pendaftaran Anda telah kami terima dan dicatat.'),
-- ... (lanjutkan untuk 55 template)
```

### 3. Variabel yang Tersedia di Template

| Variabel | Diganti dengan | Contoh |
|----------|----------------|--------|
| `{nama}` | Nama penerima data | Budi |
| `{nama_pengirim}` | Nama pengirim WA | Tari |
| `{tanggal}` | Tanggal hari ini (DD-MM-YYYY) | 24-01-2026 |
| `{jam_buka}` | Jam buka bot | 06.01 |
| `{jam_tutup}` | Jam tutup bot | 04.00 |
| `{total}` | Jumlah data diterima | 5 |
| `{total_hari_ini}` | Total data hari ini | 10 |
| `{total_gagal}` | Jumlah data gagal | 2 |
| `{error}` | Pesan error spesifik | Panjang KTP salah |
| `{nomor_kartu}` | Nomor kartu yang diinput | 5049488500001111 |
| `{panjang_aktual}` | Panjang digit aktual | 14 |
| `{panjang_seharusnya}` | Panjang yang diharapkan | 16 |
| `{lokasi}` | Lokasi pengambilan | Pasarjaya / Dharmajaya |

---

### 4. Perintah Admin untuk Kelola Template

| Perintah | Fungsi |
|----------|--------|
| `LIHAT TEMPLATE` | Lihat semua template (per kategori) |
| `LIHAT TEMPLATE [KODE]` | Lihat detail satu template |
| `UBAH TEMPLATE [KODE] = [isi]` | Ubah isi template |
| `RESET TEMPLATE [KODE]` | Kembalikan ke default |
| `AKTIFKAN TEMPLATE [KODE]` | Aktifkan template |
| `NONAKTIFKAN TEMPLATE [KODE]` | Nonaktifkan template |

**Contoh:**
```
Admin: LIHAT TEMPLATE

Bot: 📝 *DAFTAR TEMPLATE BALASAN*

📂 *USER* (17 template)
├ MENU_UTAMA ✅
├ FORMAT_DAFTAR ✅
├ DATA_SUKSES ✅
└ ...

📂 *SISTEM* (6 template)
├ SISTEM_TUTUP ✅
├ MINTA_NOMOR_HP ✅
└ ...

📂 *VALIDASI* (14 template)
└ ...

📂 *ADMIN* (18 template)
└ ...

👇 Ketik: LIHAT TEMPLATE [KODE]
```

```
Admin: UBAH TEMPLATE SISTEM_TUTUP = 🌙 Bot sedang istirahat (22:00-06:00). Data Anda tidak diproses. Coba lagi besok ya!

Bot: ✅ Template SISTEM_TUTUP berhasil diubah!
```

---

### 5. Antrian Data Saat Bot Tutup

#### Tabel `antrian_data`:
```sql
CREATE TABLE antrian_data (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(30) NOT NULL,
    push_name VARCHAR(100),
    raw_message TEXT NOT NULL,
    detected_format VARCHAR(20),     -- PASARJAYA / DHARMAJAYA
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PROCESSED, FAILED
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    result TEXT                       -- Hasil proses / error message
);

CREATE INDEX idx_antrian_status ON antrian_data(status);
CREATE INDEX idx_antrian_created ON antrian_data(created_at);
```

#### Flow Antrian:
```
User kirim data (jam 04:30)
    ↓
Bot simpan ke tabel "antrian_data" (status: PENDING)
    ↓
Bot balas: Template SISTEM_TUTUP_ANTRIAN
    "🌙 Data Anda sudah diterima dan masuk antrian #{nomor_antrian}.
     Akan diproses otomatis jam 06:01 WIB."
    ↓
[Jam 06:01] Cron job proses semua antrian
    ↓
Bot kirim notifikasi ke user: "✅ Data Anda sudah diproses"
```

#### Perintah Admin Antrian:
| Perintah | Fungsi |
|----------|--------|
| `LIHAT ANTRIAN` | Lihat data yang menunggu |
| `PROSES ANTRIAN` | Proses manual sekarang |
| `HAPUS ANTRIAN` | Hapus semua antrian |

---

## 🏗️ RENCANA IMPLEMENTASI

### Fase 1: Database & Template Manager
- [ ] Buat tabel `template_pesan` di Supabase
- [ ] Insert 55 template default
- [ ] Buat file `src/template.ts` untuk CRUD template
- [ ] Buat cache template (agar tidak query DB terus)

### Fase 2: Integrasi ke Kode Existing
- [ ] Refactor `messages.ts` → ambil dari database
- [ ] Refactor `reply.ts` → gunakan template + variabel
- [ ] Refactor `recap.ts` → gunakan template header
- [ ] Refactor `wa.ts` → ganti inline message dengan template

### Fase 3: Perintah Admin
- [ ] Implementasi `LIHAT TEMPLATE`
- [ ] Implementasi `UBAH TEMPLATE`
- [ ] Implementasi `RESET TEMPLATE`

### Fase 4: Antrian Data
- [ ] Buat tabel `antrian_data`
- [ ] Buat file `src/antrian.ts`
- [ ] Update `wa.ts` untuk simpan ke antrian saat tutup
- [ ] Buat cron job proses antrian jam 06:01

### Fase 5: Testing
- [ ] Test semua 55 skenario balasan
- [ ] Test ubah template via admin
- [ ] Test antrian data saat tutup

---

## ❓ PERTANYAAN UNTUK ANDA

1. **Jam operasional saat ini sudah benar?**
   - Buka: 06.01 WIB
   - Tutup: 04.00 WIB (dini hari)
   - Mau bisa diubah via perintah admin?

2. **Fitur antrian data:**
   - Mau diimplementasi? (Data diterima saat tutup, diproses saat buka)
   - Atau tetap tolak saja saat tutup?

3. **Template mana yang paling prioritas untuk bisa diubah admin?**
   - [ ] Semua 55 template
   - [ ] Hanya template user (17)
   - [ ] Hanya template sistem (6)
   - [ ] Pilihan tertentu saja

4. **Notifikasi setelah antrian diproses:**
   - Kirim pesan ke user? "✅ Data Anda sudah diproses"
   - Atau tidak perlu?

---

## 📌 CATATAN TEKNIS

- Template disimpan di database Supabase
- Cache di memory untuk performa (refresh setiap 5 menit atau saat ada update)
- Variabel di-replace runtime (`{nama}` → "Budi")
- Admin bisa ubah via WhatsApp tanpa akses kode
- Perubahan langsung berlaku tanpa restart bot
- Template yang tidak aktif akan fallback ke default hardcoded
