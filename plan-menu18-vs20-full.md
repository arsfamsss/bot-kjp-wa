# Plan: Sinkronisasi Status `(FULL)` untuk Menu 18 vs Menu 20

## Latar Belakang
- Menu `1️⃣8️⃣ Kelola Lokasi Penuh` menutup lokasi secara manual (status ditandai penuh/ditutup).
- Menu `2️⃣0️⃣ Kuota Global per Lokasi (semua user/hari)` membatasi total kuota harian per lokasi.
- Ekspektasi bisnis: saat kuota global lokasi habis, pengalaman user di menu pilih lokasi seharusnya konsisten seperti lokasi yang di-set penuh manual (ada indikator `(FULL)` / tidak bisa dipilih).

## Temuan Kondisi Saat Ini

### 1) Perbedaan Konsep
- **Menu 18**: kontrol status manual (tutup/buka lokasi).
- **Menu 20**: kontrol angka kuota global harian (limit total semua user).

### 2) Alur User yang Sudah Benar
- Pada flow `SELECT_LOCATION -> SELECT_DHARMAJAYA_SUB`, menu lokasi dibangun dari `buildDharmajayaMenuWithStatus()`.
- Fungsi tersebut sudah menggabungkan 2 sumber status penuh:
  - lokasi ditutup manual (menu 18)
  - kuota global harian penuh (menu 20)
- Saat user memilih lokasi yang penuh, validasi `isSpecificLocationClosed()` menolak pilihan dan kirim ulang menu.

### 3) Gap yang Masih Mungkin Terasa di Lapangan
- Ada beberapa menu lokasi yang masih statis (tanpa marker `(FULL)`), misalnya pada flow edit lokasi tertentu.
- Akibatnya user/admin bisa melihat daftar lokasi tanpa label `(FULL)` di flow tertentu, meski status penuh sebenarnya aktif.

## Tujuan Perubahan
- Menyamakan UX: lokasi penuh dari menu 18 **dan** menu 20 tampil konsisten sebagai `(FULL)` di semua menu pemilihan lokasi user yang relevan.
- Menjaga validasi backend tetap menjadi sumber kebenaran (bukan hanya tampilan).

## Rencana Implementasi (Tanpa Eksekusi Dulu)

1. **Inventaris semua renderer menu lokasi user**
   - Petakan seluruh titik yang menampilkan daftar lokasi DHARMAJAYA/PASARJAYA.
   - Tandai mana yang masih hardcoded/statis.

2. **Standarisasi builder menu lokasi**
   - Buat/gunakan satu helper dinamis untuk daftar lokasi DHARMAJAYA dengan status `(FULL)`.
   - Untuk flow yang masih statis, ganti agar memakai helper ini.

3. **Sinkronisasi wording status**
   - Samakan narasi ketika lokasi ditolak karena penuh:
     - manual full (menu 18)
     - global quota full (menu 20)
   - Tetap izinkan detail alasan yang relevan (mis. kuota penuh) tanpa membuka data sensitif yang tidak perlu.

4. **Pastikan guardrail pemilihan lokasi tetap aktif**
   - Di semua flow yang bisa memilih/mengubah lokasi, tetap cek `isSpecificLocationClosed()` sebelum lanjut.
   - Jika penuh, re-render menu dinamis agar user langsung lihat `(FULL)`.

5. **Uji skenario end-to-end**
   - Skenario A: lokasi di-set penuh via menu 18 -> tampil `(FULL)` dan tidak bisa dipilih.
   - Skenario B: kuota global menu 20 habis -> tampil `(FULL)` dan tidak bisa dipilih.
   - Skenario C: lokasi dibuka kembali / kuota direset -> marker `(FULL)` hilang.
   - Skenario D: flow edit lokasi juga konsisten menunjukkan status terbaru.

## Dampak dan Risiko
- **Dampak positif**: user tidak bingung karena status penuh konsisten lintas flow.
- **Risiko**: jika ada flow lama yang tetap pakai daftar statis, inkonsistensi masih muncul.
- **Mitigasi**: lakukan checklist seluruh flow lokasi sebelum release.

## Kriteria Selesai (Definition of Done)
- Semua menu pemilihan lokasi user yang relevan menggunakan renderer dinamis status penuh.
- Lokasi penuh dari menu 18 dan menu 20 sama-sama tampil `(FULL)`.
- Pilihan lokasi penuh selalu ditolak secara validasi, bukan hanya visual.
- Hasil build/typecheck lulus dan uji skenario utama lolos.

## Catatan Keputusan
- Menu 18 dan menu 20 **tetap beda fungsi bisnis**, tetapi **harus seragam di UX status lokasi**.
- Jadi yang diseragamkan adalah *indikator dan perilaku pemilihan lokasi*, bukan mekanisme backend-nya.
