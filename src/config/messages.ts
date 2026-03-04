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
    '5️⃣ *CEK STATUS PENDAFTARAN* → Cek hasil daftar',
    '6️⃣ *BANTUAN* → Tanya-tanya',
    '',
    'Ketik angkanya ya~ (1-6) 😊',
].join('\n');

// --- FORMAT DAFTAR (Dipanggil saat user ketik 1) ---
export const FORMAT_DAFTAR_MESSAGE = [
    '📍 *PILIH LOKASI*',
    '',
    'Mau ambil sembako dimana?',
    '',
    '1️⃣ *PASARJAYA*',
    '(Jakgrosir Kedoya, Rusun Pesakih, Mini DC Cengkareng, Bambu Larangan)',
    '',
    '2️⃣ *DHARMAJAYA*',
    '(Kosambi,Kapuk Jagal,Pulogadung,Cakung)',
    '',
    'Silakan ketik *1* atau *2* untuk pilih lokasi.',
    'Ketik 0 kalau batal 😊'
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
    '2. Nomor Kartu',
    '3. Nomor KTP (NIK)',
    '4. Nomor KK',
    '5. Tanggal lahir',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📌 *CONTOH:*',
    '',
    'Agus',
    '5049488500001234',
    '3171234567890123',
    '3171098765432109',
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
    '📝 Kirim data dalam *4 BARIS* (wajib urut):',
    '',
    '1. Nama',
    '2. Jenis Kartu + Nomor Kartu',
    '3. KTP + Nomor KTP (NIK)',
    '4. KK + Nomor KK',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📌 *CONTOH 1 (KJP):*',
    '',
    'Siti Aminah',
    'KJP 5049488500001234',
    'KTP 3171234567890123',
    'KK 3171098765432109',
    '',
    '📌 *CONTOH 2 (LANSIA):*',
    '',
    'Siti Aminah',
    'LANSIA 5049441234567890',
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
    '❓ *BANTUAN SINGKAT*',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '⏰ *JAM LAYANAN*',
    '━━━━━━━━━━━━━━━━━━━━',
    '🟢 Jam layanan: *06.30-23.59*.',
    '📌 Kecuali saat *libur* atau *maintenance*, akan ada info penyesuaian jam layanan.',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📌 *ALUR CEPAT*',
    '━━━━━━━━━━━━━━━━━━━━',
    '1) Ketik *1* untuk DAFTAR',
    '2) Pilih lokasi: *PASARJAYA* / *DHARMAJAYA*',
    '3) Kirim data sesuai format',
    '4) Ketik *CEK* untuk lihat data masuk',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '🪪 *BATAS DAFTAR KTP*',
    '━━━━━━━━━━━━━━━━━━━━',
    '• 1 KTP hanya bisa daftar *1x sehari*',
    '• 1 KTP maksimal daftar *5x dalam 1 bulan*',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📝 *FORMAT DATA*',
    '━━━━━━━━━━━━━━━━━━━━',
    '• PASARJAYA: *5 baris* (Nama, Kartu, KTP, KK, Tgl Lahir)',
    '• DHARMAJAYA: *4 baris* (Nama, Jenis Kartu+Nomor, KTP+NIK, KK+Nomor KK)',
    '• Boleh kirim banyak orang, pisahkan 1 baris kosong',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '💳 *ATURAN KARTU*',
    '━━━━━━━━━━━━━━━━━━━━',
    '• Nomor kartu harus *16-18 digit*',
    '• Nomor kartu harus diawali *504948*',
    '• Khusus DHARMAJAYA: baris ke-2 wajib tulis JENIS KARTU lalu NOMOR KARTU.',
    '  Contoh: LANSIA 5049489000001234',
    '',
    'Jenis kartu yang bisa dipakai:',
    'KJP, LANSIA, RUSUN, DISABILITAS, DASAWISMA, PEKERJA, GURU HONORER, PJLP, KAJ',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '🛠️ *PERINTAH PENTING*',
    '━━━━━━━━━━━━━━━━━━━━',
    '• *CEK*   = lihat data hari ini',
    '• *CEK STATUS PENDAFTARAN* = cek status daftar',
    '• *EDIT*  = perbaiki data',
    '• *HAPUS* / *HAPUS 1,2,3* = hapus data',
    '• *BATAL* = batal input (maks 30 menit)',
    '• *MENU*  = kembali ke menu utama',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '❗ *JIKA DATA DITOLAK*',
    '━━━━━━━━━━━━━━━━━━━━',
    'Periksa lagi: panjang nomor, awalan kartu, urutan baris, dan jenis kartu.',
    'Jika masih terkendala, hubungi Admin 📞 08568511113',
    '',
    'Ketik *MENU* untuk kembali 🙂',
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
    '1️⃣3️⃣ Atur Status Buka/Tutup',
    '1️⃣4️⃣ Kelola Blokir No HP',
    '1️⃣5️⃣ Kelola Blokir No KTP',
    '1️⃣6️⃣ Kelola Blokir No KK',
    '1️⃣7️⃣ Kelola Prefix Kartu',
    '1️⃣8️⃣ Kelola Lokasi Penuh',
    '',
    '💡 _Ketik *#TEMPLATE* untuk edit pesan tutup_',
    '💡 _Ketik *#TEMPLATE RESET* untuk kembali ke default_',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '0️⃣ _Kembali ke Menu Utama_',
].join('\n');

// --- DAFTAR NOMOR ADMIN ---
export const ADMIN_PHONES_RAW = ['085641411818', '08568511113'];

export const CLOSE_MESSAGE_TEMPLATE_UNIFIED = [
    '⛔ *MOHON MAAF, SISTEM SEDANG TUTUP (Maintenance dan rekap Harian) ⛔*',
    '',
    '🕒 Jam Tutup: 00.00 - 06.00 WIB',
    '✅ Buka Kembali: Pukul 06.01 WIB',
    '',
    '📌 Data yang Anda kirim sekarang tidak akan diproses. Silakan kirim ulang setelah jam buka untuk pendaftaran besok.',
    '',
    'Terima kasih atas pengertiannya. 🙏'
].join('\n');
