# Rollout Checklist: Global Quota RPC

## 1) Eksekusi SQL di Supabase

Jalankan isi file `src/sql/global_location_quota_rpc.sql` di SQL Editor (project production).

## 2) Validasi RPC tersedia

Jalankan query berikut:

```sql
select proname
from pg_proc
where proname in (
  'apply_global_location_quota_delta',
  'reconcile_global_location_quota_day'
);
```

Expected: 2 baris fungsi ditemukan.

## 3) Uji smoke RPC delta

Gunakan hari aktif dan satu lokasi uji:

```sql
select *
from public.apply_global_location_quota_delta(
  '2026-03-11',
  'DHARMAJAYA - Kapuk Jagal',
  1
);

select *
from public.apply_global_location_quota_delta(
  '2026-03-11',
  'DHARMAJAYA - Kapuk Jagal',
  -1
);
```

Expected:
- Panggilan `+1` menambah `used_after`.
- Panggilan `-1` menurunkan `used_after`.
- Nilai tidak pernah negatif.

## 4) Uji rekonsiliasi harian

```sql
select *
from public.reconcile_global_location_quota_day('2026-03-11', 'DHARMAJAYA - ');
```

Expected:
- `used_after` per lokasi sama dengan hitungan aktual `data_harian` di hari yang sama.

## 5) Cek permission error sudah hilang

Setelah bot running, cek log PM2:

```bash
pm2 logs bot-kjp --lines 200 --nostream
```

Expected:
- Tidak ada lagi error `permission denied for table location_global_quota_usage`.

## 6) Verifikasi skenario bisnis

1. Set limit Kapuk = 210.
2. Isi data sampai mendekati batas.
3. Lakukan edit lokasi antar-lokasi pada beberapa data.
4. Cek:
   - laporan admin (`data_harian`) vs kuota global (`location_global_quota_usage`) tetap konsisten,
   - marker `(FULL)` muncul tepat saat batas tercapai,
   - saat `used == limit`, bot menolak tambahan data baru.

## 7) Recovery manual jika mismatch lagi

Jalankan rekonsiliasi ulang hari berjalan:

```sql
select *
from public.reconcile_global_location_quota_day(
  to_char((now() at time zone 'Asia/Jakarta'), 'YYYY-MM-DD'),
  'DHARMAJAYA - '
);
```
