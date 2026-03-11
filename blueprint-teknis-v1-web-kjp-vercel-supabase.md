# Blueprint Teknis V1 - Web Transaksi KJP (Vercel + Supabase)

## 1) Tujuan Produk

- Menyediakan web dashboard profesional, ringan, dan modern untuk memantau transaksi harian.
- Menampilkan laporan transaksi berhasil/gagal secara otomatis saat ada perubahan status dari bot checker.
- Menyatukan data dari bot input utama dan bot cek status dalam satu sumber data Supabase yang konsisten.
- Wajib menampilkan `nama_orang_tua` dan `nama_parent` pada detail transaksi.

## 2) Batasan & Prinsip

- Deployment frontend/backend web di Vercel.
- Database utama di Supabase.
- Tidak menyalin mentah referensi lama; hanya mengambil pola yang relevan lalu diimprovisasi.
- Kunci service role hanya di server (Route Handler/Server Action), tidak pernah di client.
- Semua sinkronisasi lintas sistem harus idempotent (aman jika event terkirim ulang).

## 3) Sumber Data Saat Ini (As-Is)

1. Bot input WA (`D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS`)
   - Menulis transaksi valid harian ke `data_harian`.
   - Menyimpan raw parsing/log ke `log_pesan_wa`.

2. Bot cek status (`D:\BOT\CEK STATUS DAN KIRIM BUKTI DHARMAJAYA*`)
   - Menghasilkan status pendaftaran (berhasil/gagal/error) dan bukti.
   - Sumber penting untuk laporan hasil transaksi akhir.

3. Gap utama saat ini
   - Status checker dan transaksi harian belum dimodelkan sebagai event pipeline tunggal yang mudah diaudit di web.
   - Data parent/ortu belum dipastikan selalu tersedia di satu view konsumsi dashboard.

## 4) Arsitektur Target (To-Be)

### 4.1 Komponen

- **Frontend Web**: Next.js App Router (TypeScript) + Tailwind + komponen UI modern.
- **Backend Web (Vercel)**: Route Handlers untuk query aman, ingestion endpoint, dan actions.
- **Supabase**:
  - tabel transaksi,
  - tabel event status,
  - tabel direktori parent,
  - view/materialized view untuk laporan cepat.
- **Workers/Bots**:
  - bot input tetap menulis transaksi,
  - bot checker kirim event status ke endpoint ingestion.

### 4.2 Alur Sinkronisasi

1. Bot input simpan transaksi ke Supabase.
2. Bot checker mendeteksi hasil pendaftaran lalu POST ke endpoint ingestion (`/api/ingest/status`).
3. Endpoint menyimpan ke `transaction_status_events` dengan `idempotency_key`.
4. Trigger/rekonsiliasi membentuk status terakhir per transaksi (`latest status snapshot`).
5. Dashboard membaca dari view agregat + detail.

## 5) Desain Data V1

### 5.1 Tabel inti

1. `daily_transactions` (atau adaptasi dari `data_harian`)
   - `id`
   - `processing_day_key`
   - `nama`
   - `no_kjp`, `no_ktp`, `no_kk`
   - `lokasi`
   - `sender_phone`
   - `created_at`

2. `transaction_status_events`
   - `id`
   - `transaction_ref` (id transaksi atau komposit key)
   - `status` (`BERHASIL`/`GAGAL`/`ERROR`)
   - `source_system` (`telegram_only` / `wa_telegram`)
   - `payload_json`
   - `event_time`
   - `idempotency_key` (unique)
   - `created_at`

3. `parent_directory`
   - `id`
   - `key_identity` (no_kjp/no_ktp/no_kk/phone normalized)
   - `nama_orang_tua`
   - `nama_parent`
   - `phone_parent`
   - `updated_at`

### 5.2 View laporan

1. `v_transaction_detail_with_parent`
   - join transaksi + status terakhir + parent directory
   - memastikan kolom wajib:
     - `nama_orang_tua`
     - `nama_parent`

2. `v_transaction_summary_daily`
   - total transaksi harian
   - total berhasil/gagal/error
   - breakdown lokasi

## 6) Sinkronisasi Otomatis

### 6.1 Ingestion endpoint (Vercel)

- `POST /api/ingest/status`
- Header wajib: `x-ingest-signature` (HMAC secret)
- Validasi payload + dedup via `idempotency_key`
- Upsert event status dan update snapshot status terakhir

### 6.2 Strategi konsistensi

- Event sourcing ringan: simpan event mentah + snapshot status terbaru.
- Retry-safe: event yang sama tidak membuat data ganda.
- Rekonsiliasi berkala (cron) untuk memastikan snapshot sejalan dengan event.

## 7) UI/UX V1 (Modern & Ringan)

- Layout 3 area: KPI atas, filter bar, tabel detail.
- Fitur utama:
  - filter tanggal, lokasi, status, keyword,
  - sort + server pagination,
  - export CSV,
  - badge status berwarna jelas.
- Kolom wajib tampil di tabel detail:
  - `nama`
  - `nama_orang_tua`
  - `nama_parent`
  - `lokasi`
  - `status_terakhir`
  - `waktu_update_status`

## 8) Keamanan

- RLS aktif pada tabel sensitif.
- Akses data dashboard via server-side queries.
- Service role hanya untuk endpoint ingest/ops internal.
- Audit log untuk perubahan status dan operasi admin.

## 9) Performa

- Gunakan cursor/keyset pagination untuk tabel besar.
- Index minimal:
  - `daily_transactions(processing_day_key, lokasi)`
  - `transaction_status_events(transaction_ref, event_time desc)`
  - `transaction_status_events(idempotency_key unique)`
  - `parent_directory(key_identity)`
- Cache SSR dengan revalidate tags untuk ringkasan, realtime hanya untuk panel penting.

## 10) Tahapan Implementasi

### Phase 1 - Fondasi Data
- Finalisasi schema tabel event + parent directory.
- Buat view laporan detail/summary.
- Setup policy RLS dan role akses.

### Phase 2 - Integrasi Bot
- Tambah sender webhook pada bot checker.
- Tambah endpoint ingest di Vercel.
- Jalankan test idempotency + retry.

### Phase 3 - Dashboard V1
- Bangun halaman dashboard + detail transaksi.
- Tambahkan filter, pagination, export.
- Pastikan `nama_orang_tua` dan `nama_parent` tampil konsisten.

### Phase 4 - Hardening
- Monitoring, alert error ingestion, retry queue.
- Uji beban jam ramai.
- UAT + rollout bertahap.

## 11) Kriteria Sukses (DoD)

- Dashboard live di Vercel dengan koneksi Supabase stabil.
- Data transaksi harian tersaji otomatis tanpa input manual tambahan.
- Perubahan status berhasil/gagal dari bot checker muncul otomatis di web.
- Tidak ada duplikasi event saat retry.
- Kolom `nama_orang_tua` dan `nama_parent` selalu tersedia di tampilan detail (dengan fallback terkontrol bila mapping belum ada).

## 12) Risiko & Mitigasi

- **Risiko**: mapping parent tidak lengkap.
  - **Mitigasi**: sinkronisasi direktori parent harian + fallback marker `BELUM TERMAPING`.
- **Risiko**: lonjakan event jam sibuk.
  - **Mitigasi**: idempotency key + retry policy + batching.
- **Risiko**: query laporan berat.
  - **Mitigasi**: index + view agregat + server pagination.
