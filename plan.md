# Rencana Fitur Batas Pengiriman Harian per User per Lokasi

## Tujuan
- Membatasi jumlah data yang bisa dikirim **setiap user** per hari untuk **setiap lokasi**.
- Contoh: set `Cakung = 50` berarti 1 nomor WA maksimal 50 data/hari di Cakung.
- User lain tetap punya jatah sendiri yang sama, jadi total bisa besar (mis. 10 user x 50 = 500) dan itu valid.

## Aturan Bisnis
- Scope kuota: `hari + lokasi + nomor WA`.
- Kuota berlaku per lokasi, bukan gabungan semua lokasi.
- Yang dihitung hanya data valid yang benar-benar tersimpan (`OK items`).
- Jika kuota user untuk lokasi itu habis, kiriman berikutnya dari user yang sama ke lokasi itu ditolak.
- Kuota user lain di lokasi sama tidak ikut terpengaruh.

## Contoh Perilaku
- Admin set:
  - `DHARMAJAYA - Cakung = 50`
  - `DHARMAJAYA - Pulogadung = 20`
- Hari yang sama:
  - User A kirim Cakung 50 -> diterima.
  - User A kirim Cakung lagi 1 -> ditolak.
  - User B kirim Cakung 50 -> tetap diterima.
  - User C kirim Pulogadung 21 -> 20 diterima, sisanya ditolak (sesuai mode pemrosesan batch).

## Desain Data (Supabase)

### 1) Tabel konfigurasi limit per lokasi
`location_daily_limits`
- `location_key` text primary key (contoh: `DHARMAJAYA - Cakung`)
- `daily_limit` integer not null check (`daily_limit >= 0`)
- `is_active` boolean default true
- `updated_by` text null
- `updated_at` timestamptz default now()

### 2) Tabel counter harian per user-lokasi
`location_user_daily_counters`
- `processing_day_key` text not null
- `location_key` text not null
- `sender_phone` text not null
- `used_count` integer not null default 0
- `updated_at` timestamptz default now()
- unique key: (`processing_day_key`, `location_key`, `sender_phone`)

### 3) RPC atomic reservasi kuota
Contoh nama: `reserve_location_user_quota_atomic`
- Input:
  - `p_processing_day_key` text
  - `p_location_key` text
  - `p_sender_phone` text
  - `p_increment_count` integer
- Output:
  - `allowed` boolean
  - `used_after` integer
  - `limit_value` integer
  - `reason` text
- Logika:
  1. Ambil limit aktif untuk `location_key`.
  2. Lock row counter (`FOR UPDATE`) untuk kombinasi hari+lokasi+sender.
  3. Jika `used_count + increment > daily_limit` -> `allowed=false`.
  4. Jika cukup -> update `used_count` atomik dan `allowed=true`.

## Integrasi Kode

### `src/supabase.ts`
- Tambah helper:
  - `setLocationDailyLimit(locationKey, limit)`
  - `getLocationDailyLimit(locationKey)`
  - `listLocationDailyLimits()`
  - `reserveLocationUserQuotaAtomic(dayKey, locationKey, senderPhone, incrementCount)`

### `src/services/locationGate.ts`
- Tambah fungsi:
  - `checkAndReserveLocationUserQuota(locationKey, senderPhone, okCount, dayKey)`
  - return: `{ allowed, reason, usedAfter, limitValue }`

### `src/wa.ts`
- Sebelum `saveLogAndOkItems(...)`, setelah lokasi final diketahui dan `ok_count > 0`:
  - panggil `checkAndReserveLocationUserQuota(...)`.
  - jika `allowed=false`: kirim balasan kuota user habis untuk lokasi itu, lalu batalkan save.

### `src/config/messages.ts`
- Tambah template pesan, contoh:
  - `⛔ Batas kirim Anda untuk lokasi *{lokasi}* hari ini sudah penuh.`
  - `Silakan kirim lagi besok atau pilih lokasi lain yang tersedia.`

## Flow Admin
- Tetap pakai menu `BATAS PER LOKASI`.
- Opsi minimal:
  1. Lihat batas semua lokasi
  2. Set batas lokasi (`SET CAKUNG 50`)
  3. Nonaktifkan batas (`OFF CAKUNG`)
- Tidak perlu set per-user manual; per-user dihitung otomatis dari nomor WA pengirim.

## Urutan Implementasi Aman
1. Tambah migration SQL (`location_daily_limits`, `location_user_daily_counters`, RPC atomic).
2. Tambah helper Supabase.
3. Tambah gate function di `locationGate.ts`.
4. Hook gate di `wa.ts` sebelum save.
5. Tambah/rapikan pesan di `messages.ts`.
6. Uji skenario serial dan paralel.

## Skenario Uji Wajib
- Set `Cakung = 2`:
  - User A kirim 2 -> diterima, kirim ke-3 -> ditolak.
  - User B tetap bisa kirim 2 data sendiri.
- Set `Pulogadung = 1`:
  - User A kirim 1 -> diterima, kirim berikutnya di hari sama -> ditolak.
- Kuota reset otomatis saat ganti `processing_day_key` (hari baru).
- Uji 2-5 request paralel dari user yang sama ke lokasi yang sama: tidak overshoot.

## Risiko dan Mitigasi
- Risiko race condition dari chat paralel user yang sama.
  - Mitigasi: RPC atomic + row lock by `hari+lokasi+sender`.
- Risiko format nomor WA tidak konsisten.
  - Mitigasi: wajib normalisasi nomor sebelum hitung kuota.
- Risiko admin salah set lokasi.
  - Mitigasi: validasi input admin harus dari mapping lokasi internal.

## Definisi Selesai (DoD)
- Admin bisa set batas per lokasi.
- Bot membatasi kiriman per-user sesuai limit lokasi harian.
- User lain tetap punya jatah sendiri di lokasi yang sama.
- Tidak ada overshoot pada uji paralel.
