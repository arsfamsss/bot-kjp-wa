# Rencana Implementasi Fitur Blokir No KJP (Tahap Wacana)

## 1) Ringkasan Tujuan
- Menambahkan fitur baru **Kelola Blokir No KJP** di menu admin.
- Posisi baru ditempatkan di **menu nomor 14**.
- Nomor menu yang saat ini ada akan bergeser: `Blokir No HP` pindah ke nomor 17, lalu menu 17 menjadi 18, dan seterusnya.
- Pola kerja mengikuti fitur yang sudah ada, terutama pola `Blokir No KK` (menu/list/add/delete + validasi di pipeline parser).

## 2) Batasan Tahap Ini
- Dokumen ini hanya rencana analisa (belum eksekusi implementasi).
- Tidak ada perubahan kode fitur produksi pada tahap ini.

## 3) Asumsi Kerja
- Perilaku blokir KJP mengikuti gaya `Blokir No KK` (persisten, bukan reset bulanan).
- Input admin tambah blokir: `nomor|alasan`.
- Perlu masa transisi alias nomor lama -> aksi baru agar operator tidak salah jalur.

## 3.1) Mapping Renumbering Old -> New (Mengikuti Arahan Bisnis)
- `14 Kelola Blokir No HP` -> `17 Kelola Blokir No HP`
- `15 Kelola Blokir No KTP` -> `15 Kelola Blokir No KTP` (tetap)
- `16 Kelola Blokir No KK` -> `16 Kelola Blokir No KK` (tetap)
- `17 Kelola Prefix Kartu` -> `18 Kelola Prefix Kartu`
- `18 Kelola Lokasi Penuh` -> `19 Kelola Lokasi Penuh`
- `19 Batas per Lokasi` -> `20 Batas per Lokasi`
- `20 Kuota Global per Lokasi` -> `21 Kuota Global per Lokasi`
- `14 (baru)` = `Kelola Blokir No KJP`

## 4) Daftar Spesifik File yang Akan Disentuh/Diubah
1. `src/config/messages.ts` (update `ADMIN_MENU_MESSAGE` agar nomor baru sinkron)
2. `src/wa.ts` (update router `normalized === '14'..`, tambah flow KJP menu/add/delete)
3. `src/state.ts` (tambah literal `AdminFlowState` untuk KJP)
4. `src/supabase.ts` (fungsi list/add/remove/check blokir KJP)
5. `src/parser.ts` (sisipkan check blokir KJP di pipeline)
6. `src/types.ts` (tambah union error type `blocked_kjp`)
7. `src/reply.ts` (tambah pesan human-readable untuk `blocked_kjp`)
8. `src/sql/blocked_kjp.sql` (SQL baru blokir KJP + index/constraint)

## 5) Rencana Implementasi Bertahap
1. Sinkronisasi kontrak menu di `messages.ts` dan `wa.ts` secara atomik.
2. Tambah vertical slice KJP lintas `supabase -> state -> wa -> parser -> types -> reply`.
3. Samakan normalisasi nomor KJP di add/remove/check agar konsisten.
4. Tambahkan alias nomor lama selama masa transisi operator.
5. Verifikasi type/build dan smoke test alur menu/admin KJP.
6. Alias minimum wajib: input nomor lama `14` (HP) tetap diterima sementara + pesan deprecate.

## 6) Risiko Error (Persentase) + Alasan

### Tanpa mitigasi
- **42%**
- Alasan:
  1. Ada dua sumber nomor menu (`messages.ts` vs `wa.ts`) yang rawan mismatch.
  2. Pergeseran menu 14/17/18+ rawan off-by-one dan silent misroute.
  3. Coupling lintas layer (state/parser/types/reply/supabase) rawan literal drift.
  4. Operator bisa tetap memakai nomor lama saat transisi.

### Dengan mitigasi plan ini
- **18%**
- Penurunan risiko melalui update atomik, alias transisi, checklist lintas file, dan verifikasi teknis ketat.

## 7) Conflict dan Edge Cases
- Operator memasukkan nomor lama setelah deploy.
- `blocked_kjp` tidak konsisten antar file sehingga compile/runtime/reply tidak sinkron.
- Normalisasi nomor KJP berbeda antara add/list/check.
- Migration DB belum terpasang saat kode aktif.
- Urutan parser check berubah dan memengaruhi outcome status item.

## 8) Kriteria Verifikasi Eksekusi (Agent-Executable)
1. Baseline build saat ini gagal karena error existing di `src/wa.ts` (TS2393 duplicate function implementation).
2. Acceptance fase KJP: **tidak menambah error TypeScript baru** di luar baseline existing.
3. Jika target build hijau total, wajib ada task prasyarat terpisah untuk memperbaiki baseline existing dulu.
4. Validasi mapping menu 14-21 di `src/config/messages.ts` dan `src/wa.ts` konsisten.
5. Pastikan state `BLOCKED_KJP_MENU`, `BLOCKED_KJP_ADD`, `BLOCKED_KJP_DELETE` ada di `src/state.ts` dan dipakai di `src/wa.ts`.
6. Pastikan literal `blocked_kjp` ada konsisten di `src/types.ts`, `src/supabase.ts`, `src/parser.ts`, `src/reply.ts`.
7. Pastikan fungsi check parser memasukkan blokir KJP di urutan check blocked sebelum duplicate batch.

## 9) Go/No-Go
- Go jika semua verifikasi di atas lulus dan migration blokir KJP tervalidasi.
- No-Go jika ada mismatch menu-routing, type errors, atau migration belum siap.
