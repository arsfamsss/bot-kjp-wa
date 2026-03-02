# Rencana Fitur Kuota Harian Data (Atomic)

## Tujuan
- Menambahkan pembatasan jumlah data harian yang diproses bot WA.
- Mendukung 2 mode:
  - `GLOBAL`: semua pengirim berbagi kuota harian yang sama.
  - `PERSONAL`: hanya nomor HP tertentu yang dibatasi kuota harian.
- Menjaga perilaku saat trafik bersamaan tetap konsisten dengan mekanisme **atomic** di database.
- Tidak menabrak fitur existing `blokir no HP total` di menu admin.

## Scope Perilaku
- Kuota dihitung berdasarkan **jumlah data valid (OK items)**, bukan jumlah chat.
- Jika kuota habis, pesan user ditolak sebelum data disimpan.
- Pesan penolakan disamakan untuk global/personal:
  - `⛔ *KUOTA HARIAN SUDAH PENUH*`
  - `Batas maksimal pengiriman data hari ini sudah tercapai.`
  - `Silakan kirim lagi esok hari. Terima kasih.`

## Desain Konfigurasi
- Simpan konfigurasi kuota di area setting bot (DB), contoh field:
  - `quota_enabled` (boolean)
  - `quota_mode` (`GLOBAL` | `PERSONAL`)
  - `quota_daily_limit` (integer, mis. 30)
  - `quota_message_template` (text, optional)
- Simpan daftar nomor target mode personal pada tabel baru, contoh:
  - `quota_target_phones(phone_number, is_active, created_at, updated_at)`
  - Nomor disimpan dalam format normalisasi internal (`62xxxxxxxxxx`).

## Desain Atomic (Wajib)
- Tambah RPC/function di PostgreSQL (Supabase) untuk reservasi kuota atomik, contoh:
  - Input: `processing_day_key`, `sender_phone`, `increment_count`, `mode`, `limit`, `is_targeted_sender`
  - Output: `{ allowed: boolean, used_after: int, limit: int, reason: text }`
- Mekanisme:
  1. Lock row counter harian (`FOR UPDATE`) berdasarkan mode (global atau sender).
  2. Jika `used + increment_count > limit` => `allowed=false` (tidak update counter).
  3. Jika masih cukup => update counter dan `allowed=true`.
- Tambah tabel counter harian, contoh:
  - `daily_quota_counters(scope_type, scope_key, processing_day_key, used_count, updated_at)`
  - `scope_type`: `GLOBAL` / `PERSONAL`
  - `scope_key`: `GLOBAL` atau nomor HP

## Integrasi Aplikasi

### 1) `src/supabase.ts`
- Tambah fungsi baca/update setting kuota.
- Tambah fungsi kelola daftar nomor kuota personal (add/remove/list).
- Tambah fungsi `reserveDailyQuotaAtomic(...)` yang memanggil RPC DB.

### 2) `src/services/quotaGate.ts` (baru)
- Pusat logika keputusan kuota:
  - Baca setting kuota.
  - Tentukan apakah sender termasuk target (untuk mode personal).
  - Hitung `increment_count` dari `logJson.stats.ok_count`.
  - Panggil reserve atomic.
  - Return `{ allowed, reason }`.

### 3) `src/wa.ts`
- Tambah 1 hook kecil sebelum `saveLogAndOkItems(...)`:
  - Jika `ok_count > 0`, cek quota gate.
  - Jika `allowed=false`, balas pesan kuota penuh dan **jangan simpan** data.
- Jangan ubah flow besar menu user agar risiko regresi rendah.

### 4) `src/config/messages.ts`
- Tambah konstanta pesan kuota penuh (satu template untuk global/personal).

## Menu Admin (Tidak Tabrakan dengan Blokir No HP)
- Tambah menu baru: `📊 KUOTA HARIAN DATA`.
- Struktur yang disarankan:
  1. ON/OFF Kuota
  2. Set Batas Harian
  3. Set Mode (`GLOBAL`/`PERSONAL`)
  4. Kelola Nomor Target Personal
- Gunakan state flow baru (mis. `QUOTA_MENU`, `QUOTA_SET_LIMIT`, dst),
  terpisah dari flow `BLOCKED_PHONE_*` agar tidak konflik.

## Urutan Implementasi Aman
1. Tambah struktur DB (table counter + table target + RPC atomic).
2. Tambah fungsi supabase helper untuk quota.
3. Tambah service `quotaGate.ts`.
4. Sisipkan hook kuota di `wa.ts` (sebelum save).
5. Tambah menu admin kuota.
6. Uji skenario serial + paralel.

## Skenario Uji Wajib
- `GLOBAL` limit 30:
  - Data ke-30 diterima, data ke-31 ditolak.
- `PERSONAL` limit 30:
  - Nomor dalam daftar target: ke-31 ditolak.
  - Nomor di luar daftar target: tetap diterima.
- Prefix/format parser tetap normal (tidak terpengaruh fitur kuota).
- Uji konkurensi (2-5 kiriman hampir bersamaan) untuk pastikan tidak overshoot.
- Pastikan fitur blokir no HP total tetap berfungsi dan tidak tercampur dengan menu kuota.

## Risiko & Mitigasi
- Risiko tabrakan flow admin di `wa.ts`.
  - Mitigasi: state flow kuota baru yang terisolasi.
- Risiko overshoot kuota saat trafik tinggi.
  - Mitigasi: wajib atomic di DB (bukan check-then-insert di app).
- Risiko salah normalisasi nomor target.
  - Mitigasi: reuse util normalisasi nomor yang sudah dipakai fitur blokir no HP.

## Estimasi Risiko Setelah Implementasi
- Dengan atomic DB: risiko overshoot kuota sangat rendah (`< 0.1%`).
- Risiko regresi flow admin/user: rendah-menengah (`~1-3%`) tergantung kedisiplinan scope edit di `wa.ts`.
