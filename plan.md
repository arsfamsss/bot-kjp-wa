# Rencana Implementasi Fitur Blokir No KJP (Tahap Wacana)

## 1) Ringkasan Tujuan
- Menambahkan fitur baru **Kelola Blokir No KJP** di menu admin.
- Posisi baru ditempatkan di **menu nomor 14**.
- Nomor menu yang saat ini ada akan bergeser: `Blokir No HP` pindah ke nomor 17, lalu menu 17 menjadi 18, dan seterusnya.
- Pola kerja mengikuti fitur yang sudah ada, terutama pola `Blokir No KK` (menu/list/add/delete + validasi di pipeline parser).

## 2) Batasan Tahap Ini
- Dokumen ini hanya rencana analisa (belum eksekusi implementasi).
- Tidak ada perubahan kode fitur produksi pada tahap ini.

## 3) Asumsi Kerja (agar rencana bisa dieksekusi)
- **Asumsi utama:** perilaku blokir KJP mengikuti gaya `Blokir No KK` (persisten, bukan reset bulanan).
- Input admin untuk tambah blokir tetap format: `nomor|alasan`.
- Operator lama mungkin masih hafal nomor menu lama, jadi perlu masa transisi alias nomor lama -> aksi baru selama periode tertentu.

## 3.1) Mapping Renumbering (Old -> New) yang Akan Dipegang
- Catatan: mapping ini mengikuti arahan bisnis Anda (bukan sekadar insert + shift satu langkah).
- `14 Kelola Blokir No HP` -> `17 Kelola Blokir No HP`
- `15 Kelola Blokir No KTP` -> `15 Kelola Blokir No KTP` (tetap)
- `16 Kelola Blokir No KK` -> `16 Kelola Blokir No KK` (tetap)
- `17 Kelola Prefix Kartu` -> `18 Kelola Prefix Kartu`
- `18 Kelola Lokasi Penuh` -> `19 Kelola Lokasi Penuh`
- `19 Batas per Lokasi` -> `20 Batas per Lokasi`
- `20 Kuota Global per Lokasi` -> `21 Kuota Global per Lokasi`
- `14 (baru)` = `Kelola Blokir No KJP`

## 4) Daftar Spesifik File yang Akan Disentuh/Diubah
1. `src/config/messages.ts`
   - Update teks menu admin (`ADMIN_MENU_MESSAGE`) agar nomor 14 menjadi `Kelola Blokir No KJP` dan item berikutnya bergeser konsisten.
2. `src/wa.ts`
   - Update router pilihan menu admin (`normalized === '14'`, dst) agar sinkron dengan teks menu.
   - Tambah state flow baru untuk KJP (`BLOCKED_KJP_MENU`, `BLOCKED_KJP_ADD`, `BLOCKED_KJP_DELETE`) dengan pola serupa KK.
   - Tambah helper tampilan menu KJP (setara helper menu blokir lain).
3. `src/state.ts`
   - Tambah literal state admin baru untuk flow KJP.
4. `src/supabase.ts`
   - Tambah fungsi data layer KJP: list/add/delete/check batch (menyesuaikan struktur yang dipakai parser).
   - Tambah akses ke tabel blokir KJP (misal `blocked_kjp`).
5. `src/parser.ts`
   - Sisipkan check blokir KJP pada urutan pipeline validasi (di area check blocked sebelum duplicate batch final).
6. `src/types.ts`
   - Tambah union error type baru (mis. `blocked_kjp`) agar type-safe lintas modul.
7. `src/reply.ts`
   - Tambah mapping pesan human-readable untuk error `blocked_kjp`.
8. `src/sql/blocked_kjp.sql` (file SQL baru)
   - Buat skema tabel blokir KJP + index/constraint unik yang sesuai pola `src/sql/blocked_locations.sql`.

## 5) Rencana Implementasi Bertahap (Ketat)
1. **Sinkronisasi kontrak menu**
   - Ubah `messages.ts` dan `wa.ts` dalam satu paket agar tidak terjadi mismatch angka menu vs handler.
   - Terapkan alias sementara untuk nomor lama yang terdampak (grace period) guna mencegah salah operasi admin.
   - Alias minimum yang wajib: input `14` lama untuk HP tetap diterima sementara (dengan pesan deprecate) selama masa transisi.
2. **Bangun vertical slice KJP end-to-end**
   - Data layer (`supabase.ts`) -> state flow (`state.ts`) -> admin handler (`wa.ts`) -> parser (`parser.ts`) -> type (`types.ts`) -> reply (`reply.ts`).
3. **Stabilkan validasi & normalisasi input KJP**
   - Samakan normalisasi nomor KJP di add/remove/check agar tidak terjadi mismatch data tersimpan vs data yang dicek.
4. **Verifikasi teknis**
   - Jalankan type/build checks.
   - Jalankan smoke test menu admin (14-21) dan alur add/list/delete blokir KJP.

## 6) Risiko Error (Persentase) + Alasan Utama

### Estimasi Risiko Jika Dieksekusi Tanpa Mitigasi
- **42%**
- Alasan utama:
  1. Ada **dua sumber kebenaran** nomor menu (teks di `messages.ts` dan routing di `wa.ts`) yang mudah tidak sinkron.
  2. Perubahan nomor menu bersifat **cascading** (14, 17, 18, dst), rawan off-by-one dan salah route tanpa error compile.
  3. Fitur blokir menyentuh banyak layer (state, parser, type, reply, DB), rawan literal drift (`blocked_kjp` vs nama lain).
  4. Potensi bentrok operasional karena operator masih memakai nomor lama.

### Estimasi Risiko Jika Mitigasi Diterapkan Sesuai Plan
- **18%**
- Penurunan risiko dicapai lewat:
  - update atomik menu text + router,
  - alias transisi nomor lama,
  - checklist lintas file wajib,
  - verifikasi build/type + smoke test alur admin.

## 7) Potensi Conflict dan Edge Cases
- Admin mengetik nomor menu lama setelah deploy -> harus diarahkan/di-alias agar tidak mengaktifkan fitur yang salah.
- Mismatch penamaan error type (`blocked_kjp`) antar file -> compile/runtime/reply tidak konsisten.
- Data KJP yang sama dengan format berbeda (spasi/simbol) bisa lolos jika normalisasi tidak seragam.
- Migrasi DB belum terpasang saat kode aktif -> flow add/check bisa gagal di runtime.
- Urutan check parser berubah tidak sengaja -> hasil status item bisa bergeser dari perilaku saat ini.

## 8) Kriteria Siap Eksekusi (Go/No-Go)
- Mapping menu admin 14-21 konsisten antara teks dan routing.
- State baru KJP terdaftar penuh di `AdminFlowState` dan dipakai di `wa.ts`.
- Fungsi KJP di `supabase.ts` lengkap: list/add/delete/check.
- `parser.ts`, `types.ts`, `reply.ts` sudah mengenali `blocked_kjp` secara konsisten.
- SQL `src/sql/blocked_kjp.sql` tersedia dan tervalidasi sebelum rollout aplikasi.

## 8.1) Kriteria Verifikasi Build pada Baseline Nyata
- Baseline saat ini sudah gagal build karena error existing di `src/wa.ts` (duplicate function implementation, TS2393).
- Maka acceptance untuk fase fitur KJP adalah:
  1. Tidak menambah error TypeScript baru di luar baseline existing.
  2. Semua perubahan terkait KJP (menu/state/supabase/parser/types/reply) tidak menambah error compile baru.
  3. Jika ingin target `build hijau total`, harus ada task prasyarat terpisah untuk membereskan baseline error existing terlebih dahulu.

## 9) Catatan Rollout yang Disarankan
- Aktifkan kompatibilitas nomor lama selama 1-2 minggu.
- Tambahkan notifikasi singkat di menu admin bahwa ada pergeseran nomor.
- Pantau usage nomor lama selama masa transisi, lalu hapus alias setelah stabil.
