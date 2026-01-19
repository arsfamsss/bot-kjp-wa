# Implementasi Fitur Daftar Ulang Cepat (Quick Re-registration)

## Goal

Memudahkan pengguna untuk mendaftarkan kembali data yang sama (untuk bulan baru) tanpa harus mengetik ulang format panjang, dengan tetap memastikan data valid (KTP/KK tidak berubah).

## User Review Required

> [!IMPORTANT]
> **Logic Validasi**: Pengguna harus mengkonfirmasi bahwa data (terutama KTP dan KK) **masih sama**. Jika ada perubahan sekecil apapun pada KTP/KK, mereka **wajib** input manual ulang. Fitur ini hanya untuk data yang 100% sama dengan bulan lalu.
>
> **Privacy**: Data history hanya diambil berdasarkan `sender_phone`. Pengguna tidak bisa melihat data orang lain.

## Proposed Changes

### Database & Query (`src/supabase.ts`)

- [NEW] Function `getRegistrationHistory(senderPhone: string)`
  - Akan mengambil daftar unique dari `data_harian` berdasarkan `sender_phone`.
  - Mengambil kolom `nama, no_kjp, no_ktp, no_kk`.
  - Logic: `SELECT DISTINCT ON (no_kjp) ... ORDER BY no_kjp, received_at DESC LIMIT 10`.
  - Ini memastikan kita mendapat data terakhir yang valid untuk setiap nomor kartu yang pernah didaftarkan user ini.

### Menu Configuration (`src/config/messages.ts`)

- [MODIFY] Update `MENU_MESSAGE` untuk menambahkan opsi baru:
  - `4. Daftar Ulang Cepat (Data Lama)`

### State Management (`src/state.ts`)

- [MODIFY] Update `UserFlowState` type untuk handle flow baru:
  - `'QUICK_REGISTER_MENU'` (Saat pilih data)
  - `'QUICK_REGISTER_CONFIRM'` (Saat konfirmasi Ya/Tidak)

### Bot Logic (`src/wa.ts`)

#### 1. Menu Handler

- Tambahkan deteksi input `4` atau `DAFTAR ULANG`.
- Panggil `getRegistrationHistory`.
- Jika kosong -> Info "Belum ada history".
- Jika ada -> Tampilkan list nomer urut & nama/kartu.
  - Simpan list ini di temporary storage (`quickRegisterCache` di `state.ts`).
  - Info ke user: "Bisa pilih banyak (contoh: 1, 2, 3)".

#### 2. Input Handler (Flow: `QUICK_REGISTER_MENU`)

- User ketik nomor urut (SINGLE `1` atau MULTIPLE `1,3,5` dipisah koma/spasi).
- Bot parsing input menjadi array of numbers.
- Bot ambil detail data dari cache untuk setiap nomor.
- Bot tampilkan ringkasan:
  - **Tampilkan detail lengkap (Nama, No Kartu, NIK, KK) untuk SETIAP item yang dipilih.**
  - (Jangan disingkat, agar User bisa cek satu per satu).

  ```
  Konfirmasi Data (3 Orang):
  1. Agus
     Kartu: ...1234
     NIK: ...5678
     KK: ...9012

  2. Budi
  ...

  Apakah data (NIK & KK) untuk SEMUA di atas MASIH SAMA?
  Ketik YA untuk lanjut.
  Ketik TIDAK untuk batal.
  ```

#### 3. Input Handler (Flow: `QUICK_REGISTER_CONFIRM`)

- Jika `YA`:
  - Loop semua item yang dipilih.
  - Jalankan validasi standar untuk setiap item (Cek kuota, cek duplikat).
  - Insert item yang valid.
  - Kirim rekap hasil:
    ```
    ✅ PENDAFTARAN BERHASIL (2/2)
    1. AGUS SANTOSO - Sukses
    2. BUDI SANTOSO - Sukses
    ```
- Jika `TIDAK`:
  - Kirim pesan panduan manual dengan format standar 4 baris (Nama, Kartu, KTP, KK) + Contoh.
  - Reset flow.

## Verification Plan

### Manual Verification

1.  **Test User Baru**: Kirim `4` -> Harusnya "Belum ada history".
2.  **Test User Lama (Agus)**:
    - Pastikan DB ada data Agus bulan lalu.
    - Kirim `4` -> Muncul list "1. Agus (Kartu: ...1234)".
    - Pilih `1`.
    - Bot tanya konfirmasi.
    - Jawab `TIDAK` -> Harusnya batal.
    - Ulangi, Jawab `YA`.
    - Cek DB `data_harian` -> Harus ada entry baru dengan tanggal hari ini.
    - Cek Validasi -> Coba daftar ulang lagi di hari yang sama -> Harusnya kena validasi "Sudah terdaftar hari ini".
