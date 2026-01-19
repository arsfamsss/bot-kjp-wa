# BOT KJP REFACTOR (WhatsApp Bot)

Project ini adalah **versi refactor** dari bot antrean sembako KJP sebelumnya.
Bot ini menggunakan library `@whiskeysockets/baileys` dan database Supabase.

## 🚀 Fitur Utama (New)

1.  **Format Input Fleksibel**: Menerima input data 4 baris (Nama, Kartu, KTP, KK) dengan toleransi format yang tinggi.
2.  **Validasi Ketat**:
    - Cek duplikat NIK per hari (1 NIK = 1x daftar/hari).
    - Cek duplikat Kartu per bulan (1 Kartu = 1x daftar/bulan).
    - **Anti-Spam Block**: Cek duplikat internal dalam 1 blok pesan (misal No KTP sama dengan No Kartu).
3.  **Unique LID Handling**: Support chat dari `@lid` (Linked Device) dengan auto-mapping ke nomor HP asli.
4.  **Feedback Informatif**:
    - Menampilkan total data yang berhasil didaftarkan user _hari ini_.
    - Jika duplikat, menampilkan data asli yang sebelumnya sudah terdaftar (Nama & NIK).
    - Pesan error "Same as other" jika nomor tertukar.
5.  **Tampilan Mewah**: Menu dan pesan balasan menggunakan format rapi dengan emoji dan border.

## 📂 Struktur Folder

- `src/wa.ts` -> File utama logic koneksi WA dan event handler.
- `src/parser.ts` -> Logic parsing dan validasi input pesan.
- `src/reply.ts` -> Template balasan pesan (sukses/gagal).
- `src/config/messages.ts` -> Konfigurasi teks menu statis.
- `src/supabase.ts` -> Koneksi dan query ke database.
- `src/recap.ts` -> Logic rekap data harian.
- `test/` -> Script testing simulasi (tanpa koneksi WA).

## 🛠️ Cara Deploy ke Termux (Production)

Repository ini terhubung ke: `https://github.com/arsfamsss/bot-kjp-wa`

### Langkah Update di Termux:

1.  Stop bot: `pm2 stop all`
2.  Backup auth (opsional): `cp -r auth_info_baileys auth_info_baileys_BACKUP`
3.  Pull kode baru: `git pull origin main`
4.  Install dependencies: `npm install`
5.  Restart bot: `pm2 restart all`

> **Note:** Folder `auth_info_baileys` di-ignore di git agar session tidak tertimpa/hilang saat pull.

## 📝 Catatan Penting untuk Developer (AI Agent)

Jika Anda (AI) baru pertama kali membuka repo ini:

1.  Cek `src/config/messages.ts` untuk melihat format menu saat ini.
2.  Gunakan `npm test` atau jalankan script di `test/` untuk simulasi logic sebelum deploy.
3.  **JANGAN** push folder `auth_info_baileys` ke GitHub.
