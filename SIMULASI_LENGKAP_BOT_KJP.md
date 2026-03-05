# DOKUMENTASI SIMULASI LENGKAP BOT WHATSAPP KJP (USER FLOW)

Dokumen ini berisi semua skenario simulasi interaksi pengguna biasa (User Flow) dengan bot, termasuk semua variasi kondisi yang mungkin terjadi. Mulai dari pengguna baru (verifikasi), jam tutup, fitur daftar ulang, hingga berbagai jenis kesalahan input yang divalidasi oleh bot. (Tidak termasuk Menu Admin).

---

## DAFTAR ISI
1. [Skenario 0: Saat Sistem Tutup](#skenario-0-saat-sistem-tutup)
2. [Skenario 1: Verifikasi Akun Baru (Device Baru/Linked Device)](#skenario-1-verifikasi-akun-baru)
3. [Skenario 2: Navigasi Awal (Menu Utama)](#skenario-2-navigasi-awal)
4. [Skenario 3: Pendaftaran Pasarjaya (5 Baris)](#skenario-3-pendaftaran-pasarjaya)
5. [Skenario 4: Pendaftaran Dharmajaya (4 Baris)](#skenario-4-pendaftaran-dharmajaya)
6. [Skenario 5: Tawaran Daftar Ulang (Reregister)](#skenario-5-tawaran-daftar-ulang)
7. [Skenario 6: Cek Data (Menu 2)](#skenario-6-cek-data)
8. [Skenario 7: Hapus Data (Menu 3)](#skenario-7-hapus-data)
9. [Skenario 8: Edit Data (Menu 4)](#skenario-8-edit-data)
10. [Skenario 9: Cek Status Pendaftaran Dharmajaya (Menu 5)](#skenario-9-cek-status-pendaftaran)
11. [Skenario 10: Bantuan/FAQ (Menu 6)](#skenario-10-bantuan)
12. [Skenario 11: Berbagai Variasi Error & Validasi Penolakan](#skenario-11-variasi-error-validasi)

---

## SKENARIO 0: SAAT SISTEM TUTUP
Sistem akan otomatis menolak pesan yang masuk di luar jam operasional (00.00-06.00 WIB) atau saat Admin menutup bot secara manual.

**👤 User mengirim:**
> Halo

**🤖 Bot membalas:**
> ⛔ *MOHON MAAF, SISTEM SEDANG TUTUP (Maintenance dan rekap Harian) ⛔*
> 
> 🕒 Jam Tutup: 00.00 - 06.00 WIB
> ✅ Buka Kembali: Pukul 06.01 WIB
> 
> 📌 Data yang Anda kirim sekarang tidak akan diproses. Silakan kirim ulang setelah jam buka untuk pendaftaran besok.
> 
> Terima kasih atas pengertiannya. 🙏

---

## SKENARIO 1: VERIFIKASI AKUN BARU
Jika user menggunakan WhatsApp *Linked Device* atau nomor yang formatnya tidak dikenali oleh WhatsApp secara bawaan.

**👤 User mengirim:**
> P

**🤖 Bot membalas:**
> ⛔ *SISTEM TIDAK MENGENALI PERANGKAT ANDA*
> 
> Mohon ketik **NOMOR HP ANDA** (Contoh: 08123456789) satu kali untuk verifikasi.
> 
> _Agar sistem bisa memproses data pendaftaran kartu Anda._

**👤 User mengirim:**
> 081234567890

**🤖 Bot membalas:**
> ✅ *Nomor kamu sudah dicatat: 081234567890*
> Silakan lanjut.
> 
> 📋 *Selanjutnya silakan kirim data yang akan didaftarkan:*
> 
> 1. Nama
> 2. Jenis Kartu + Nomor Kartu
> 3. KTP + Nomor KTP (NIK)
> 4. KK + Nomor KK
> 
> *Contoh 1 (KJP):*
> Budi
> KJP 5049488500001111
> KTP 3173444455556666
> KK 3173555566667777
> 
> *Contoh 2 (LANSIA):*
> Budi
> LANSIA 5049441234567890
> KTP 3173444455556666
> KK 3173555566667777
> 
> Jenis kartu yang didukung:
> KJP · LANSIA · RUSUN · DISABILITAS · DASAWISMA · PEKERJA · GURU HONORER · PJLP · KAJ

---

## SKENARIO 2: NAVIGASI AWAL

**👤 User mengirim:**
> MENU

**🤖 Bot membalas:**
> Hai Ibu/Bapak! 👋
> 
> 🛒 *DAFTAR SEMBAKO BERSUBSIDI*
> 
> Mau ngapain hari ini?
> 
> 1️⃣ *DAFTAR* → Kirim data antrean
> 2️⃣ *CEK* → Lihat data saya
> 3️⃣ *HAPUS* → Hapus data
> 4️⃣ *EDIT* → Ganti Data Salah
> 5️⃣ *CEK STATUS PENDAFTARAN* → Cek hasil daftar
> 6️⃣ *BANTUAN* → Tanya-tanya
> 
> Ketik angkanya ya~ (1-6) 😊

---

## SKENARIO 3: PENDAFTARAN PASARJAYA
Pasarjaya WAJIB 5 baris data per orang.

### 3.1. Flow Sukses Pasarjaya
**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> 📍 *PILIH LOKASI*
> 
> Mau ambil sembako dimana?
> 
> 1️⃣ *PASARJAYA*
> (Jakgrosir Kedoya, Rusun Pesakih, Mini DC Cengkareng, Bambu Larangan)
> 
> 2️⃣ *DHARMAJAYA*
> (Kosambi,Kapuk Jagal,Pulogadung,Cakung)
> 
> Silakan ketik *1* atau *2* untuk pilih lokasi.
> Ketik 0 kalau batal 😊

**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> 📍 *LOKASI PENGAMBILAN*
> 
> *1.* Jakgrosir Kedoya
> *2.* Gerai Rusun Pesakih
> *3.* Mini DC Kec. Cengkareng
> *4.* Jakmart Bambu Larangan
> *5.* Lokasi Lain...
> 
> _Silakan balas dengan angka pilihanmu!_
> _(Ketik 0 untuk batal)_

**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> ✅ *LOKASI TERPILIH: PASARJAYA*
> 
> 📝 Kirim data dalam *5 BARIS*:
> 
> 1. Nama
> 2. Nomor Kartu
> 3. Nomor KTP (NIK)
> 4. Nomor KK
> 5. Tanggal lahir
> 
> ━━━━━━━━━━━━━━━━━━━━
> 📌 *CONTOH:*
> 
> Agus
> 5049488500001234
> 3171234567890123
> 3171098765432109
> 15-08-1975
> ━━━━━━━━━━━━━━━━━━━━
> 
> ✅ *Harap kirim sesuai contoh di atas*
> ⚠️ _Agar data tidak ditolak sistem_
> 
> 💡 Tips: Tulis ke bawah, bukan samping!
> Kalau lebih dari 1 orang, kasih jarak 1 enter

**👤 User mengirim (5 Baris):**
> Budi Santoso
> 5049488500001111
> 3173444455556666
> 3173555566667777
> 12-12-1980

**🤖 Bot membalas:**
> ✨ *DATA BERHASIL DISIMPAN!* ✨
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 📥 *Data Baru Diterima: 1 Orang*
> ✅ *Budi Santoso*
>      🆔 5049488500001111
> 
> 📈 *UPDATE TOTAL HARI INI*
> 🔥 Total: *1 Orang*
> ────────────────────────────
> 1. *Budi Santoso*
>    └ 5049488500001111 📍 PASARJAYA - Jakgrosir Kedoya
> 
> 👇 *MENU LAINNYA*
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 🔹 Ketik *CEK*   → 🧐 Cek Rekap
> 🔹 Ketik *BATAL* → 🔙 Batal Input
> 🔹 Ketik *EDIT*  → ✏️ Ubah Data
> 🔹 Ketik *HAPUS* → 🗑️ Hapus Data
> 🔹 Ketik *MENU*  → 🏠 Menu Utama
> 
> _Silakan kirim data lagi jika ada..._ 📝

### 3.2. User Input Pasarjaya Manual Lokasi (Pilihan 5)
**👤 User mengirim:**
> 5

**🤖 Bot membalas:**
> 📝 Silakan ketik nama lokasinya saja (Contoh: *Pasar Rumput*):

**👤 User mengirim:**
> Pasar Rebo

**🤖 Bot membalas:**
> ✅ *LOKASI TERPILIH: PASARJAYA*
*(Menampilkan template panduan format 5 baris)*

### 3.3. Pasarjaya Error: Kurang Baris (Kirim 4 Baris)
**👤 User mengirim:**
> Siti
> 5049488500002222
> 3173444455552222
> 3173555566662222

**🤖 Bot membalas:**
> ❌ *Waduh, data belum bisa masuk~*
> 
> Coba kirim ulang ya Bu/Pak 🙏
> 
> 📝 *Cek data ini ya:*
> 
> ❌ *Data tidak lengkap*
>    → Kurang baris (harus 5 baris/orang)
> 
> ━━━━━━━━━━━━━━━━━━━━
> 💡 *Contoh yang bener:*
> Siti Aminah
> KJP 5049488500001234
> KTP 3171234567890123
> KK 3171098765432109
> 15-08-1975
> ━━━━━━━━━━━━━━━━━━━━

### 3.4. Pasarjaya Error: Tanggal Lahir Salah Format
**👤 User mengirim (Baris ke 5 bukan tanggal):**
> Agus
> 5049488500001111
> 3173444455556666
> 3173555566667777
> Bukan Tanggal

**🤖 Bot membalas:**
> ⚠️ *DATA TERTOLAK (Salah Format)*
> 
> Anda memilih **PASARJAYA**, maka wajib kirim **5 Baris** (termasuk Tanggal Lahir).
> 
> Anda hanya mengirim 4 baris. (Baris ke 5 gagal terbaca sebagai tanggal)
> Silakan lengkapi data Anda dengan Tanggal Lahir di baris ke-5.

---

## SKENARIO 4: PENDAFTARAN DHARMAJAYA
Dharmajaya WAJIB 4 baris, dan mewajibkan penulisan Jenis Kartu.

### 4.1. Flow Sukses Dharmajaya
**👤 User mengirim:**
> 2
*(Setelah Menu 1)*

**🤖 Bot membalas:**
> 📍 *LOKASI PENGAMBILAN*
> 
> *1.* Duri Kosambi
> *2.* Kapuk Jagal
> *3.* Pulogadung
> *4.* Cakung
> 
> _Silakan balas dengan angka pilihanmu!_
> _(Ketik 0 untuk batal)_

**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> ✅ *LOKASI TERPILIH: DHARMAJAYA DURI KOSAMBI*
> 
> 📝 Kirim data dalam *4 BARIS* (wajib urut):
> 
> 1. Nama
> 2. Jenis Kartu + Nomor Kartu
> 3. KTP + Nomor KTP (NIK)
> 4. KK + Nomor KK
> 
> ━━━━━━━━━━━━━━━━━━━━
> 📌 *CONTOH 1 (KJP):*
> Siti Aminah
> KJP 5049488500001234
> KTP 3171234567890123
> KK 3171098765432109
> 
> 📌 *CONTOH 2 (LANSIA):*
> Siti Aminah
> LANSIA 5049441234567890
> KTP 3171234567890123
> KK 3171098765432109
> ━━━━━━━━━━━━━━━━━━━━
> 
> ⚠️ Tulis ke bawah, bukan samping!
> Kalau lebih dari 1 orang, kasih jarak 1 enter
> 
> Langsung kirim ya Bu~ 🚀

**👤 User mengirim (Data Valid):**
> Rina Setiawati
> LANSIA 5049489000001111
> KTP 3173444455556666
> KK 3173555566667777

**🤖 Bot membalas:**
> ✨ *DATA BERHASIL DISIMPAN!* ✨
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 📥 *Data Baru Diterima: 1 Orang*
> ✅ *Rina Setiawati*
>      🆔 5049489000001111 (LANSIA)
> 
> 📈 *UPDATE TOTAL HARI INI*
> 🔥 Total: *1 Orang*
> ────────────────────────────
> 1. *Rina Setiawati*
>    └ 5049489000001111 (LANSIA) 📍 DHARMAJAYA - Duri Kosambi
> 
> 👇 *MENU LAINNYA*
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 🔹 Ketik *CEK*   → 🧐 Cek Rekap
> 🔹 Ketik *BATAL* → 🔙 Batal Input
> 🔹 Ketik *EDIT*  → ✏️ Ubah Data
> 🔹 Ketik *HAPUS* → 🗑️ Hapus Data
> 🔹 Ketik *MENU*  → 🏠 Menu Utama

### 4.2. Dharmajaya Error: Mengirim 5 Baris
**👤 User mengirim (5 baris seperti Pasarjaya):**
> Agus
> KJP 5049488500001111
> 3173444455556666
> 3173555566667777
> 12-12-1980

**🤖 Bot membalas:**
> ⚠️ *DATA TERTOLAK (Salah Format)*
> 
> Anda memilih **DHARMAJAYA**, maka format data harus **4 Baris**.
> 
> Anda mengirim 5 baris (dengan tanggal lahir).
> Silakan hapus baris tanggal lahir atau pilih lokasi Pasarjaya dari Menu.

### 4.3. Dharmajaya Error: Lupa Tulis Jenis Kartu
**👤 User mengirim:**
> Dinda
> 5049489000001111
> KTP 3173444455556666
> KK 3173555566667777

**🤖 Bot membalas:**
> ❌ *Waduh, data belum bisa masuk~*
> 
> Coba kirim ulang ya Bu/Pak 🙏
> 
> 📝 *Cek data ini ya:*
> 
> ❌ *Dinda*
>    → Nama kartu belum kamu tulis. Silakan tulis nama kartu di samping nomornya ya Bu.
> 
> Pilihan kartu:
> KJP, LANSIA, RUSUN, DISABILITAS, DASAWISMA, PEKERJA, GURU HONORER, PJLP, KAJ
> 
> Contoh: 5049489000001111 LANSIA

---

## SKENARIO 5: TAWARAN DAFTAR ULANG (REREGISTER)
Jika user punya data yang "Gagal" hari kemarin (Status Gagal dari API Dharmajaya).

**👤 User mengirim:**
> Halo *(Atau P/Menu)*

**🤖 Bot membalas:**
> 🔄 *TAWARAN DAFTAR ULANG*
> 
> Ada *1* data kemarin yang *gagal terdaftar*:
> 
> *1.* Budi Santoso
>    Kartu: 5049488500001111
>    KTP: 3173444455556666
>    KK: 3173555566667777
>    Lokasi: DHARMAJAYA - Duri Kosambi
> 
> ━━━━━━━━━━━━━━━━━━
> 📋 *Pilihan:*
> ✅ Ketik *ULANG SEMUA* → daftar ulang semua
> ✅ Ketik *ULANG 1 3 5* → pilih nomor tertentu
> ❌ Ketik *SKIP* → lewati / tidak usah

### 5.1. User Ketik SKIP
**👤 User mengirim:**
> SKIP

**🤖 Bot membalas:**
> ✅ OK, tawaran daftar ulang dilewati.
> 
> Silakan lanjut kirim data seperti biasa.
*(Menampilkan Menu Utama)*

### 5.2. User Ketik ULANG SEMUA
**👤 User mengirim:**
> ULANG SEMUA

**🤖 Bot membalas:**
> ✨ *DATA BERHASIL DISIMPAN!* ✨
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 📥 *Data Baru Diterima: 1 Orang*
*(Menyimpan ulang data dan menampilkan rekap terbaru)*

---

## SKENARIO 6: CEK DATA (MENU 2)

**👤 User mengirim:**
> 2

**🤖 Bot membalas:**
> 📄 *CEK DATA (HARI INI)*
> 
> Anda sudah mengirim *1* data.
> 
> 1. *Budi Santoso*
>    └ 5049488500001111 (KJP) 📍 DHARMAJAYA - Duri Kosambi
> 
> 👇 *MENU LAINNYA*
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 🔹 Ketik *EDIT*  → ✏️ Ubah Data
> 🔹 Ketik *HAPUS* → 🗑️ Hapus Data
> 🔹 Ketik *MENU*  → 🏠 Menu Utama

*(Jika user pilih Cek Kemarin (2 dari sub-menu cek) atau Tanggal Lain (3), bot akan membalas dengan format serupa namun dengan `(KEMARIN)` atau `(TANGGAL DD-MM-YYYY)`).*

---

## SKENARIO 7: HAPUS DATA (MENU 3)

**👤 User mengirim:**
> 3

**🤖 Bot membalas:**
> 🗑️ *HAPUS DATA PENDAFTARAN*
> 
> 📋 Pilih data yang ingin dihapus:
> 
> 1. BUDI SANTOSO
> 2. SITI AMINAH
> 
> 👇 *Cara hapus:*
> • Ketik *1* untuk hapus satu data
> • Ketik *1,2,3* untuk hapus beberapa sekaligus
> • Ketik *ALL* untuk hapus semua data
> • Ketik *0* untuk batal
> 
> _Contoh: Ketik 2 untuk hapus data nomor 2_

### 7.1. Hapus Satu Data
**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> ✅ Sukses menghapus *1* data: *Budi Santoso*.
> 
> Sisa data: 1

### 7.2. Hapus Semua Data
**👤 User mengirim:**
> ALL

**🤖 Bot membalas:**
> ✅ Sukses menghapus *2* data (SEMUA): *Budi Santoso, Siti Aminah*.

---

## SKENARIO 8: EDIT DATA (MENU 4)

**👤 User mengirim:**
> 4

**🤖 Bot membalas:**
> 📝 *EDIT DATA HARI INI*
> 
> Pilih nomor data yang mau diedit:
> 
> 1. Budi Santoso [DHJ]
> 
> _Ketik nomor urutnya (Contoh: 1)._
> _Ketik 0 untuk batal._

**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> 📝 *EDIT DATA KE-1*
> 👤 Nama: Budi Santoso
> 📍 Lokasi: Duri Kosambi
> 
> Pilih data yang ingin diubah:
> 1️⃣ Nama
> 2️⃣ Nomor Kartu
> 3️⃣ Nomor KTP (NIK)
> 4️⃣ Nomor KK
> 5️⃣ Lokasi
> 6️⃣ BATAL
> 
> _Ketik angka pilihanmu._

### 8.1. Edit KTP
**👤 User mengirim:**
> 3

**🤖 Bot membalas:**
> 📝 *EDIT NOMOR KTP*
> 
> Silakan ketik nilai baru untuk Nomor KTP.
> 
> _Ketik 0 untuk batal._

**👤 User mengirim:**
> 3171222233334444

**🤖 Bot membalas:**
> 📝 *KONFIRMASI PERUBAHAN*
> 
> Field: *Nomor KTP*
> 
> 🔻 *Data Lama:*
> 3173444455556666
> 
> 🔺 *Data Baru:*
> 3171222233334444
> 
> Apakah Anda yakin ingin menyimpan perubahan ini?
> 
> Ketik *1* atau *OK* untuk SIMPAN
> Ketik *0* atau *BATAL* untuk membatalkan

**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> ✨ *DATA BERHASIL DISIMPAN!* ✨
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> 📂 Field: *NOMOR KTP*
> 🔻 Lama: 3173444455556666
> ✅ Baru: *3171222233334444*
> 
> 👇 *MENU LAINNYA*
*(Daftar Cek, Edit, Hapus)*

### 8.2. Edit Lokasi (Dharmajaya -> Pilih Sub-Lokasi Lain)
**👤 User mengirim:**
> 5
*(Setelah ditanya mau edit field apa)*

**🤖 Bot membalas:**
> 📍 *EDIT LOKASI PENGAMBILAN*
> 
> *1.* Duri Kosambi
> *2.* Kapuk Jagal
> *3.* Pulogadung
> *4.* Cakung
> 
> _Ketik angka pilihanmu!_
> _(Ketik 0 untuk batal)_

**👤 User mengirim:**
> 2

**🤖 Bot membalas:**
> 📝 *KONFIRMASI PERUBAHAN*
> 
> Field: *Lokasi*
> 
> 🔻 *Data Lama:*
> DHARMAJAYA - Duri Kosambi
> 
> 🔺 *Data Baru:*
> DHARMAJAYA - Kapuk Jagal
> 
> Apakah Anda yakin ingin menyimpan perubahan ini?
> 
> Ketik *1* atau *OK* untuk SIMPAN
> Ketik *0* atau *BATAL* untuk membatalkan

---

## SKENARIO 9: CEK STATUS PENDAFTARAN (MENU 5)
Menu ini memanggil API Dharmajaya.

**👤 User mengirim:**
> 5

**🤖 Bot membalas:**
> 📊 *CEK STATUS PENDAFTARAN*
> Default tanggal pengambilan: *BESOK (06 Maret 2026)*
> Data sumber: *2026-03-04*
> 
> 1. Budi Santoso (5049488500001111)
> 
> Balas dengan:
> • *1* (cek satu data)
> • *1,2,5* (cek beberapa data)
> • *CEK SEMUA* (cek semua data)
> • *0* untuk batal

**👤 User mengirim:**
> 1

**🤖 Bot membalas:**
> ⏳ Sedang cek status pendaftaran (1 data) untuk pengambilan 2026-03-06 (06 Maret 2026). Mohon tunggu...

*(Setelah sukses memanggil API)*

**🤖 Bot membalas:**
> 📋 *LAPORAN PENDAFTARAN - DHARMA JAYA SEMUA LOKASI*
> 🗓️ Tanggal: 06032026
> 
> ✅ *SUKSES: 1 Data*
> 1. Budi Santoso (5049488500001111)
> 
> ❌ *GAGAL: 0 Data*
> -

*(Jika API Dharmajaya mengembalikan status Gagal, list di bagian Sukses akan 0 dan user diminta menghubungi Admin).*

---

## SKENARIO 10: BANTUAN/FAQ (MENU 6)

**👤 User mengirim:**
> 6

**🤖 Bot membalas:**
> ❓ *BANTUAN SINGKAT*
> 
> ━━━━━━━━━━━━━━━━━━━━
> ⏰ *JAM LAYANAN*
> ━━━━━━━━━━━━━━━━━━━━
> 🟢 Jam layanan: *06.30-23.59*.
> 📌 Kecuali saat *libur* atau *maintenance*, akan ada info penyesuaian jam layanan.
> 
> ━━━━━━━━━━━━━━━━━━━━
> 📌 *ALUR CEPAT*
> ━━━━━━━━━━━━━━━━━━━━
> 1) Ketik *1* untuk DAFTAR
> 2) Pilih lokasi: *PASARJAYA* / *DHARMAJAYA*
> 3) Kirim data sesuai format
> 4) Ketik *CEK* untuk lihat data masuk
> 
> *(... Isi FAQ panjang tentang Batas KTP, Aturan Kartu, Perintah Penting, dll ...)*
> 
> Ketik *MENU* untuk kembali 🙂

---

## SKENARIO 11: BERBAGAI VARIASI ERROR & VALIDASI PENOLAKAN

Berikut adalah kompilasi berbagai bentuk respons penolakan dari sistem (Parser dan WA handlers).

### 11.1. Duplikat KTP dalam Satu Hari yang Sama
**👤 User mengirim Data (Dengan KTP yang sudah dipakai):**

**🤖 Bot membalas:**
> ❌ *Waduh, data belum bisa masuk~*
> 
> Coba kirim ulang ya Bu/Pak 🙏
> 
> 📝 *Cek data ini ya:*
> 
> ❌ *Budi Santoso*
>    → KTP 3173... sudah didaftarkan hari ini oleh nomor 0812***567.
> 
> Silahkan Hub Admin 📞 08568511113

*(Jika mendaftarkan diri sendiri lagi, maka `Silahkan Hub Admin...` tidak muncul, tapi `Ketik CEK buat lihat data 👀` yang akan muncul).*

### 11.2. Validasi Digit KTP Salah
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → Panjang KTP salah (15 digit). Harusnya 16 digit.

### 11.3. Validasi Digit KK Salah
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → Panjang KK salah (17 digit). Harusnya 16 digit.

### 11.4. Validasi Digit Kartu Salah
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → Panjang Nomor Kartu salah (14 digit). Harusnya 16-18 digit.

### 11.5. Prefix Nomor Kartu Bukan 504948
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → 6 digit awal Nomor Kartu wajib 504948 untuk semua jenis kartu.

### 11.6. User Menukar Posisi KTP dan KK (Baris 3 dan 4 Tertukar)
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → Urutan salah! Baris 3 harus KTP, baris 4 harus KK. Kirim ulang dengan urutan: Nama → Kartu → KTP → KK.

### 11.7. User Diblokir Admin (Nomor HP Terblokir)
**👤 User yang di-blacklist mengirim apapun:**
**🤖 Bot membalas:**
> ⛔ *NOMOR ANDA DIBLOKIR SYSTEM*
> 
> Pesan Anda tidak dapat diproses.
> Alasan: Sering membatalkan antrean.

### 11.8. User Mendaftar Menggunakan KK Terblokir
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → No KK terblokir. Silakan ganti data KK lain yang valid.

### 11.9. User Mendaftar ke Lokasi yang Penuh
**🤖 Bot membalas:**
> ❌ *Budi Santoso*
>    → Data belum bisa diproses karena lokasi *Duri Kosambi* sedang penuh. Silakan pilih lokasi lain lalu kirim ulang data yang sama.

### 11.10. Duplikat di Dalam Satu Pesan Multi-Orang
*(Misal mengirim 2 data orang dengan KTP yang sama dalam 1 kali pesan sekaligus)*
**🤖 Bot membalas:**
> ❌ *Waduh, data belum bisa masuk~*
> 
> 📝 *Cek data ini ya:*
> 
> ❌ *Siti Aminah*
>    → Data ini sama dengan data ke-1 di pesan ini.
>    Yang sama: NIK/KTP.
>    Data Ibu/Bapak (ke-2): Nama: Siti Aminah | Kartu: 50494... | NIK: 317...
>    Data yang sudah ada (ke-1): Nama: Budi | Kartu: 50494... | NIK: 317...

*(Data ke-1 tetap masuk, Data ke-2 ditolak dan dijelaskan kesamaannya).*

---
_Dokumen dibuat secara otomatis berdasarkan pemetaan behavior sistem yang aktif di server._
