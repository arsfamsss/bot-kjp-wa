// src/config/messages.ts
// File ini berisi semua template pesan statis untuk bot WA

// --- MENU UTAMA USER ---
export const MENU_MESSAGE = [
    'Hai Ibu/Bapak! 👋',
    '',
    '🛒 *DAFTAR SEMBAKO BERSUBSIDI*',
    '',
    'Mau ngapain hari ini?',
    '',
    '1️⃣ *DAFTAR* → Kirim data antrean',
    '2️⃣ *CEK* → Lihat data saya',
    '3️⃣ *HAPUS* → Hapus data',
    '4️⃣ *EDIT* → Ganti Data Salah',
    '5️⃣ *BANTUAN* → Tanya-tanya',
    '',
    'Ketik angkanya ya~ (1-5) 😊',
].join('\n');

// --- FORMAT DAFTAR (Dipanggil saat user ketik 1) ---
export const FORMAT_DAFTAR_MESSAGE = [
    '📍 *PILIH LOKASI*',
    '',
    'Mau ambil sembako dimana?',
    '',
    '~1. PASARJAYA~ (⛔ Tutup Sementara)',
    '',
    '2️⃣ *DHARMAJAYA*',
    '(Kosambi,Kapuk Jagal,Pulogadung,Cakung)',
    '',
    'Silakan ketik *2* untuk lanjut ke Dharmajaya.',
    'Ketik 0 kalau batal 😊',
].join('\n');

// --- MENU & MAPPING LOKASI PASARJAYA (NEW) ---
export const MENU_PASARJAYA_LOCATIONS = [
    '📍 *LOKASI PENGAMBILAN*',
    '',
    '*1.* Jakgrosir Kedoya',
    '*2.* Gerai Rusun Pesakih',
    '*3.* Mini DC Kec. Cengkareng',
    '*4.* Jakmart Bambu Larangan',
    '*5.* Lokasi Lain...',
    '',
    '_Silakan balas dengan angka pilihanmu!_',
    '_(Ketik 0 untuk batal)_'
].join('\n');

export const PASARJAYA_MAPPING: Record<string, string> = {
    '1': 'Jakgrosir Kedoya',
    '2': 'Gerai Rusun Pesakih',
    '3': 'Mini DC Kec. Cengkareng',
    '4': 'Jakmart Bambu Larangan'
};

// --- MENU & MAPPING LOKASI DHARMAJAYA (NEW) ---
export const MENU_DHARMAJAYA_LOCATIONS = [
    '📍 *LOKASI PENGAMBILAN*',
    '',
    '*1.* Duri Kosambi',
    '*2.* Kapuk Jagal',
    '*3.* Pulogadung',
    '*4.* Cakung',
    '',
    '_Silakan balas dengan angka pilihanmu!_',
    '_(Ketik 0 untuk batal)_'
].join('\n');

export const DHARMAJAYA_MAPPING: Record<string, string> = {
    '1': 'Duri Kosambi',
    '2': 'Kapuk Jagal',
    '3': 'Pulogadung',
    '4': 'Cakung'
};

// --- FORMAT DAFTAR PASARJAYA (5 baris) ---
export const FORMAT_DAFTAR_PASARJAYA = [
    '✅ *LOKASI TERPILIH: PASARJAYA*',
    '',
    '📝 Kirim data dalam *5 BARIS*:',
    '',
    '1. Nama',
    '2. Nomor Kartu KJP',
    '3. Nomor KTP',
    '4. Nomor KK',
    '5. Tanggal lahir',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📌 *CONTOH:*',
    '',
    'Agus',
    'KJP 5049488500001234',
    'KTP 3171234567890123',
    'KK 3171098765432109',
    '15-08-1975',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '✅ *Harap kirim sesuai contoh di atas*',
    '⚠️ _Agar data tidak ditolak sistem_',
    '',
    '💡 Tips: Tulis ke bawah, bukan samping!',
    'Kalau lebih dari 1 orang, kasih jarak 1 enter',
].join('\n');

// --- FORMAT DAFTAR DHARMAJAYA (4 baris) ---
export const FORMAT_DAFTAR_DHARMAJAYA = [
    '✅ *LOKASI TERPILIH: DHARMAJAYA*',
    '',
    '📝 Kirim data dalam *4 BARIS*:',
    '',
    '1. Nama',
    '2. Nomor Kartu KJP',
    '3. Nomor KTP',
    '4. Nomor KK',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📌 *CONTOH:*',
    '',
    'Siti Aminah',
    'KJP 5049488500001234',
    'KTP 3171234567890123',
    'KK 3171098765432109',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '⚠️ Tulis ke bawah, bukan samping!',
    'Kalau lebih dari 1 orang, kasih jarak 1 enter',
    '',
    'Langsung kirim ya Bu~ 🚀',
].join('\n');

// --- FAQ / BANTUAN ---
export const FAQ_MESSAGE = [
    '❓ *BANTUAN & FAQ*',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '⏰ *JAM OPERASIONAL*',
    '━━━━━━━━━━━━━━━━━━━━',
    '🟢 BUKA: 06.01 - 04.00 WIB',
    '🔴 TUTUP: 04.01 - 06.00 WIB',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📖 *TANYA JAWAB*',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '*T: Bisa daftar berapa orang?*',
    'J: Bebas! Kirim semua sekaligus aja~',
    '',
    '*T: 1 kartu boleh berapa kali?*',
    'J: 1 kartu = 1x per HARI',
    '',
    '*T: Salah kirim, gimana?*',
    'J: Ketik *BATAL* (max 30 menit)',
    '',
    '*T: Cara hapus data?*',
    'J: Ketik *HAPUS 1* atau *HAPUS 1,2,3*',
    '',
    '*T: Data salah input?*',
    'J: Ketik *EDIT* untuk perbaiki',
    '',
    '*T: Kapan bisa ambil?*',
    'J: Besok (H+1 setelah daftar)',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    'Ada pertanyaan lain? 🤔',
    'Ketik *MENU* untuk kembali~',
].join('\n');

// --- BARIS TAMBAHAN UNTUK ADMIN DI MENU USER ---
export const ADMIN_LAUNCHER_LINE = '0️⃣ 🛠️ *Menu Admin* _(Khusus Admin)_';

// --- MENU ADMIN ---
export const ADMIN_MENU_MESSAGE = [
    '🛠️ *MENU ADMIN*',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '👇 *Pilih menu (ketik angka):*',
    '',
    '🗑️ *HAPUS DATA HARIAN:*',
    '1️⃣ Hapus Data User (Pilih per Orang)',
    '',
    '📊 *REKAP DATA HARIAN:*',
    '2️⃣ Rekap Hari Ini',
    '3️⃣ Rekap Tanggal Tertentu',
    '4️⃣ Rekap Rentang Tanggal',
    '',
    '👥 *DAFTAR KONTAK:*',
    '5️⃣ List Semua Kontak',
    '6️⃣ 👥 Kelola Kontak',
    '7️⃣ Hapus Kontak',
    '',
    '📢 *FITUR LAINNYA:*',
    '8️⃣ Broadcast Informasi',
    '9️⃣ Statistik Dashboard',
    '🔟 Cari Data',
    '1️⃣1️⃣ Log Aktivitas',
    '1️⃣2️⃣ Export Data (TXT & XLSX)',
    '',
    '⚙️ *PENGATURAN BOT:*',
    '1️⃣3️⃣ Atur Jam Tutup',
    '',
    '💡 _Ketik *#TEMPLATE* untuk edit pesan tutup_',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '0️⃣ _Kembali ke Menu Utama_',
].join('\n');

// --- DAFTAR NOMOR ADMIN ---
export const ADMIN_PHONES_RAW = ['085641411818', '08568511113'];

export const CLOSE_MESSAGE_TEMPLATE_UNIFIED = [
    '⛔ *PENGUMUMAN: LIBUR PENDAFTARAN SEMENTARA* ⛔',
    '',
    'Mohon maaf, layanan Pendaftaran Dharmajaya saat ini sedang *TUTUP / LIBUR*.',
    '',
    'Kami akan *BUKA KEMBALI* pada:',
    '🗓 *SELASA, 17 FEBRUARI 2026*',
    '⏰ *Pukul 06.00 WIB*',
    '',
    '🔴 *14 - 16 FEBRUARI:* TUTUP (Tidak menerima data)',
    '',
    '📌 *PENTING:* Data yang dikirim saat ini *TIDAK AKAN DIPROSES*. Mohon kirimkan data Anda hanya saat layanan sudah dibuka kembali pada hari Selasa.',
    '',
    'Terima kasih atas pengertiannya. 🙏'
].join('\n');
