# 📋 PLAN: FITUR DAFTAR ULANG KARTU KJP

## 🎯 MASALAH

**Skenario:**
1. User A daftar kartu KJP `5049488500001234` di tanggal 1 Januari via WA Bot
2. Kartu sudah **TERCATAT** di database WA Bot ✅
3. TAPI di lapangan, user **GAGAL** dapat antrian (stok habis, telat, dll)
4. Tanggal 2 Januari, user ingin daftar lagi dengan kartu yang sama
5. **DITOLAK** oleh bot karena kartu sudah terdaftar bulan ini

**Current Logic:**
- 1 kartu KJP = 1x per HARI ✅ (sudah benar!)
- Pengecekan berdasarkan `no_kjp` + `processing_day_key` (tanggal)

---

## 💡 SOLUSI YANG DIUSULKAN

### OPSI A: RESET OTOMATIS SETELAH H+1 (RECOMMENDED)
Data kartu otomatis bisa didaftarkan lagi setelah lewat tanggal pengambilan.

**Logic:**
```
IF tanggal_daftar < hari_ini - 1 THEN
   → Kartu bisa didaftarkan lagi
   → (Artinya tanggal pengambilan sudah lewat)
ELSE
   → Tolak duplikat (masih dalam periode aktif)
```

**Contoh:**
- Daftar: 1 Januari
- Pengambilan: 2 Januari
- Tanggal 3 Januari → Kartu bisa didaftar lagi ✅

**Pro:**
- Otomatis, tidak perlu konfirmasi manual
- User tidak perlu lapor ke admin

**Con:**
- User yang memang sudah ambil bisa daftar lagi (curang?)
- Perlu tracking status pengambilan

---

### OPSI B: FITUR "DAFTAR ULANG" DENGAN KONFIRMASI
User bisa ketik perintah khusus untuk daftar ulang.

**Alur:**
1. User ketik: `ULANG 5049488500001234`
2. Bot cek: "Kartu ini sudah terdaftar tanggal 1 Jan"
3. Bot tanya: "Apakah Anda BELUM berhasil ambil sembako? (Y/N)"
4. User ketik: `Y`
5. Bot hapus data lama, minta kirim data baru
6. Data baru tercatat

**Pro:**
- User sadar dan konfirmasi manual
- Menghindari penyalahgunaan

**Con:**
- Ribet buat user
- Tambahan flow

---

### OPSI C: ADMIN RESET MANUAL
Admin yang reset kartu agar bisa didaftarkan lagi.

**Alur:**
1. User lapor ke admin: "Pak, saya gagal ambil kemarin"
2. Admin ketik: `RESET 5049488500001234`
3. Bot hapus data kartu tersebut
4. User bisa daftar lagi

**Pro:**
- Kontrol penuh di admin
- Menghindari penyalahgunaan

**Con:**
- Admin harus online & responsive
- Tidak scalable kalau banyak request

---

### OPSI D: TRACKING STATUS PENGAMBILAN (KOMPLEKS)
Tambah status: TERDAFTAR → DIAMBIL

**Alur:**
1. User daftar → Status: TERDAFTAR
2. Admin/Sistem update setelah user ambil → Status: DIAMBIL
3. Hanya kartu dengan status DIAMBIL yang tidak bisa daftar lagi bulan ini
4. Kartu dengan status TERDAFTAR tapi sudah lewat H+1 → Bisa daftar ulang

**Pro:**
- Paling akurat
- Bisa buat laporan siapa yang benar-benar ambil

**Con:**
- Perlu integrasi dengan sistem di lapangan
- Kompleks implementasi

---

## 🎯 REKOMENDASI

**OPSI A + C (Hybrid):**

1. **Auto-reset setelah H+2** (lebih aman dari H+1)
   - Daftar tanggal 1 → Pengambilan tanggal 2
   - Tanggal 3 → Otomatis bisa daftar lagi

2. **Admin bisa manual reset** untuk kasus urgent
   - Ketik: `RESET 5049488500001234`
   - Kartu langsung bisa didaftarkan lagi

3. **Notifikasi ke user** saat duplikat:
   ```
   ⚠️ Kartu ini sudah terdaftar tanggal 1 Jan.
   
   Jika BELUM berhasil ambil, kartu akan otomatis 
   bisa didaftarkan lagi mulai tanggal 3 Jan.
   
   Atau hubungi admin untuk reset manual.
   ```

---

## 📝 PERUBAHAN YANG DIPERLUKAN

### 1. Database
- Tidak perlu perubahan schema
- Menggunakan field `processing_day_key` yang sudah ada

### 2. Logic Duplikat (`parser.ts` atau `supabase.ts`)
```typescript
// Sebelum:
// Cek: no_kjp sudah ada di bulan ini? → TOLAK

// Sesudah:
// Cek: no_kjp sudah ada?
//   → Jika tanggal_daftar >= hari_ini - 1 → TOLAK (masih aktif)
//   → Jika tanggal_daftar < hari_ini - 1 → IZINKAN (sudah expired)
```

### 3. Balasan Duplikat (`reply.ts`)
- Tambahkan info kapan bisa daftar lagi
- Tambahkan info hubungi admin

### 4. Fitur Admin Reset (`wa.ts`)
- Tambahkan command: `RESET <no_kartu>`
- Hapus data kartu dari database

---

## ⏱️ ESTIMASI WAKTU

| Task | Waktu |
|------|-------|
| Update logic duplikat | 30 menit |
| Update balasan duplikat | 15 menit |
| Tambah admin reset | 30 menit |
| Testing | 30 menit |
| **TOTAL** | **~2 jam** |

---

## ✅ CHECKLIST IMPLEMENTASI

- [ ] Update logic cek duplikat di `parser.ts`
- [ ] Update balasan duplikat di `reply.ts`
- [ ] Tambahkan fitur RESET di menu admin `wa.ts`
- [ ] Tambahkan handler RESET command
- [ ] Testing skenario daftar ulang
- [ ] Testing admin reset
- [ ] Push ke GitHub

---

## 🤔 PERTANYAAN UNTUK USER

1. **Berapa hari setelah daftar, kartu otomatis bisa didaftarkan lagi?**
   - H+1 (besoknya langsung bisa)?
   - H+2 (2 hari setelah daftar)?

2. **Apakah perlu fitur admin reset?**
   - Ya, untuk kasus urgent
   - Tidak, cukup auto-reset saja

3. **Notifikasi ke user saat ditolak duplikat?**
   - Tampilkan tanggal kapan bisa daftar lagi?
   - Info hubungi admin?

---

*Dokumen ini dibuat: 24 Januari 2026*
*Status: MENUNGGU APPROVAL*
