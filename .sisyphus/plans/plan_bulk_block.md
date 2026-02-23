# Rencana Implementasi: Fitur Blokir Massal (Bulk Insert) via WA Admin

## 1. Pendahuluan
Saat ini, menu Admin WA untuk menambah blokir KK (dan KTP) hanya dirancang untuk menerima **satu nomor per pesan** (contoh: `3173010202020001 | alasan`). Rencana ini bertujuan untuk memodifikasi logika pembacaan pesan di WA Admin agar bisa memproses banyak nomor sekaligus dalam satu pesan (dipisahkan oleh baris baru/enter atau koma).

## 2. Analisa Arsitektur Saat Ini
- Di file `src/wa.ts`, ketika status admin adalah `'BLOCKED_KK_ADD'`, sistem membaca input `rawTrim`.
- Sistem memecahnya berdasarkan karakter `|` untuk memisahkan nomor dan alasan.
- Fungsi `addBlockedKk(nomor, alasan)` di `src/supabase.ts` dipanggil **satu kali**.

## 3. Strategi Implementasi
Kita akan mengubah cara `src/wa.ts` menangani input teks pada state `'BLOCKED_KK_ADD'` (dan `'BLOCKED_KTP_ADD'`).
1. **Pemisahan Baris:** Jika pesan memiliki beberapa baris (mengandung `\n` atau koma), kita akan memecah (split) pesan tersebut menjadi array.
2. **Looping Eksekusi:** Melakukan perulangan (loop) pada array tersebut. Setiap baris akan diekstrak nomor dan alasannya, lalu memanggil fungsi `addBlockedKk` (atau KTP).
3. **Akumulasi Hasil:** Bot akan mengumpulkan status keberhasilan tiap nomor dan merangkumnya dalam satu balasan (misal: "✅ 3 sukses, ❌ 1 gagal").

## 4. Langkah Implementasi (Langkah demi Langkah)

### Tahap 1: Modifikasi Logika di `src/wa.ts` (Bagian KK)
- Cari state `currentAdminFlow === 'BLOCKED_KK_ADD'`.
- Ganti logika pemrosesan tunggal menjadi:
  - Pisahkan input berdasarkan enter (`\n`) atau koma (`,`).
  - Bersihkan spasi kosong.
  - Looping setiap item. Pisahkan berdasarkan `|` untuk mencari `reason`.
  - Panggil `await addBlockedKk(...)`.
  - Hitung berapa yang sukses dan gagal.

### Tahap 2: Modifikasi Logika di `src/wa.ts` (Bagian KTP)
- Lakukan hal yang persis sama pada state `currentAdminFlow === 'BLOCKED_KTP_ADD'`.
- Gunakan fungsi `await addBlockedKtp(...)`.

### Tahap 3: Update Teks Panduan Menu
- Ubah teks panduan pada menu `BLOCKED_KK_ADD` dan `BLOCKED_KTP_ADD` agar pengguna tahu mereka bisa mengirim banyak nomor sekaligus.
- Contoh teks baru: *"Ketik No KK yang ingin diblokir. Untuk memasukkan banyak KK sekaligus, pisahkan dengan KOMA atau ENTER."*

## 5. Pengujian (Testing)
- Masuk ke menu Tambah Blokir KK di WA Admin.
- Kirim pesan berisi 4 nomor sekaligus dengan format multiline.
- Pastikan bot membalas dengan ringkasan bahwa ke-4 nomor tersebut berhasil diproses.
- Cek tabel Supabase untuk memastikan 4 data tersebut masuk dengan benar.