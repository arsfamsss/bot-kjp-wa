// src/config/messages.ts
// File ini berisi semua template pesan statis untuk bot WA

type ProviderType = 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION';

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
// Dynamic: hanya tampilkan provider yang BUKA
export async function buildFormatDaftarMessage(): Promise<string> {
    const { isProviderBlocked } = await import('../supabase');

    const [pasarjayaBlocked, dharmajayaBlocked, foodStationBlocked] = await Promise.all([
        isProviderBlocked('PASARJAYA'),
        isProviderBlocked('DHARMAJAYA'),
        isProviderBlocked('FOOD_STATION'),
    ]);

    const providers: { num: number; name: string; detail: string }[] = [];
    let idx = 1;

    if (!pasarjayaBlocked) {
        providers.push({ num: idx++, name: 'PASARJAYA', detail: '(Jakgrosir Kedoya,Gerai Rusun Pesakih,Mini DC Kec. Cengkareng,Jakmart Bambu Larangan,dll)' });
    }
    if (!dharmajayaBlocked) {
        providers.push({ num: idx++, name: 'DHARMAJAYA', detail: '(Kosambi,Kapuk Jagal,Pulogadung,Cakung)' });
    }
    if (!foodStationBlocked) {
        providers.push({ num: idx++, name: 'FOOD STATION', detail: '(Cipinang)' });
    }

    if (providers.length === 0) {
        return [
            '⛔ *SEMUA LOKASI SEDANG TUTUP*',
            '',
            'Mohon maaf, saat ini semua lokasi pengambilan sedang ditutup.',
            'Silakan coba lagi nanti. 🙏'
        ].join('\n');
    }

    const numEmoji = (n: number) => n === 1 ? '1️⃣' : n === 2 ? '2️⃣' : '3️⃣';

    const lines = [
        '📍 *PILIH LOKASI*',
        '',
        'Mau ambil sembako dimana?',
        '',
    ];

    for (const p of providers) {
        lines.push(`${numEmoji(p.num)} *${p.name}*`);
        lines.push(p.detail);
        lines.push('');
    }

    const nums = providers.map(p => `*${p.num}*`).join(', ');
    lines.push(`Silakan ketik ${nums} untuk pilih lokasi.`);
    lines.push('Ketik 0 kalau batal 😊');

    return lines.join('\n');
}

// Helper: mapping nomor dinamis → provider key
export async function getActiveProviderMapping(): Promise<Map<string, string>> {
    const { isProviderBlocked } = await import('../supabase');

    const [pasarjayaBlocked, dharmajayaBlocked, foodStationBlocked] = await Promise.all([
        isProviderBlocked('PASARJAYA'),
        isProviderBlocked('DHARMAJAYA'),
        isProviderBlocked('FOOD_STATION'),
    ]);

    const mapping = new Map<string, string>();
    let idx = 1;
    if (!pasarjayaBlocked) mapping.set(String(idx++), 'PASARJAYA');
    if (!dharmajayaBlocked) mapping.set(String(idx++), 'DHARMAJAYA');
    if (!foodStationBlocked) mapping.set(String(idx++), 'FOOD_STATION');

    return mapping;
}

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

export const FOODSTATION_MAPPING: Record<string, string> = {
    '1': 'FOD STATION'
};

export const PROVIDER_LIST: Array<{ key: ProviderType; name: string; mapping: Record<string, string> }> = [
    { key: 'DHARMAJAYA', name: 'Dharmajaya', mapping: DHARMAJAYA_MAPPING },
    { key: 'PASARJAYA', name: 'Pasarjaya', mapping: PASARJAYA_MAPPING },
    { key: 'FOOD_STATION', name: 'Food Station', mapping: FOODSTATION_MAPPING },
];

export const LOCATION_MGMT_MENU_TEXT = ({
    dharmajayaStatus,
    pasarjayaStatus,
    foodStationStatus,
}: {
    dharmajayaStatus: string;
    pasarjayaStatus: string;
    foodStationStatus: string;
}): string => [
    '*📍 Kelola Buka/Tutup Lokasi*',
    '',
    'Pilih provider:',
    `1. Dharmajaya [${dharmajayaStatus}]`,
    `2. Pasarjaya [${pasarjayaStatus}]`,
    `3. Food Station [${foodStationStatus}]`,
    '',
    '0. Kembali ke menu admin',
].join('\n');

export const LOCATION_CLOSED_REJECT_TEXT = 'Maaf, lokasi {location} sedang *ditutup*. Silakan coba lagi nanti atau pilih lokasi lain.';

export const UNDERAGE_CONFIRMATION_MESSAGE = [
    '⚠️ *PERLU KONFIRMASI*',
    '',
    'Ada data dengan usia di bawah 17 tahun (terdeteksi dari NIK di baris KTP).',
    'Kalau Ibu/Bapak ingin tetap diproses, ketik *LANJUT*.',
    'Kalau tidak jadi, ketik *BATAL* untuk batalkan data usia di bawah 17 tahun.'
].join('\n');

export const UNDERAGE_CONFIRMATION_REMINDER = 'Balas *LANJUT* atau *BATAL*.';
export const UNDERAGE_CONFIRMATION_CANCEL_MESSAGE = '✅ Data usia di bawah 17 tahun dibatalkan. Tidak ada data yang diproses.';

export const UNKNOWN_REGION_CONFIRMATION_MESSAGE = [
    '⚠️ *PERLU KONFIRMASI KODE WILAYAH KTP*',
    '',
    'Ada data dengan kode wilayah NIK yang tidak ditemukan di referensi.',
    'Kalau Ibu/Bapak yakin datanya benar dan ingin tetap diproses, balas *YA*.',
    'Kalau mau batalkan data tersebut dulu, balas *BATAL*.'
].join('\n');

export const UNKNOWN_REGION_CONFIRMATION_REMINDER = 'Balas *YA* atau *BATAL*.';
export const UNKNOWN_REGION_CONFIRMATION_CANCEL_MESSAGE = '✅ Data dengan kode wilayah KTP tidak dikenal dibatalkan. Tidak ada data yang diproses.';

export const KTP_REGION_NOT_FOUND_MESSAGE = [
    'Kode wilayah NIK tidak ditemukan di data referensi.',
    'Mohon cek ulang nomor KTP (16 angka) lalu kirim lagi.'
].join(' ');

export const KTP_MASTER_UNAVAILABLE_MESSAGE = [
    'Validasi wilayah KTP sedang bermasalah di sistem.',
    'Mohon coba lagi sebentar, jangan ubah data dulu.'
].join(' ');

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

// --- FORMAT DAFTAR FOOD STATION (4 baris, sama seperti Dharmajaya) ---
export const FORMAT_DAFTAR_FOOD_STATION = [
    '✅ *LOKASI TERPILIH: FOOD STATION*',
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
    '2) Pilih lokasi yang tersedia: *PASARJAYA*, *DHARMAJAYA*, atau *FOOD STATION*',
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
    '• PASARJAYA: *5 baris* (Nama, Nomor Kartu, Nomor KTP, Nomor KK, Tanggal Lahir)',
    '• DHARMAJAYA: *4 baris* (Nama, Jenis Kartu+Nomor, KTP+Nomor, KK+Nomor KK)',
    '• FOOD STATION: *4 baris* (Nama, Jenis Kartu+Nomor, KTP+Nomor, KK+Nomor KK)',
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
    '1️⃣ Atur Status Buka/Tutup Bot',
    '2️⃣ Export Data (TXT & XLSX)',
    '3️⃣ Hapus Data User (per Orang)',
    '4️⃣ Kelola Blokir Nomor',
    '    ↳ KJP, KTP, KK, HP',
    '5️⃣ Kelola Buka/Tutup Lokasi',
    '    ↳ Toggle + Jadwal',
    '6️⃣ Kelola Kontak',
    '    ↳ Cari, Tambah, Lihat, Hapus',
    '7️⃣ Kelola Kuota Lokasi',
    '    ↳ Per User + Global',
    '8️⃣ Kelola Prefix Kartu',
    '9️⃣ Kelola Whitelist No HP',
    '🔟 Laporan & Analitik',
    '    ↳ Statistik, Log, Cari Data, Broadcast',
    '1️⃣1️⃣ Rekap Data',
    '    ↳ Hari Ini, Tanggal, Rentang',
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
    '⛔ *MOHON MAAF, Layanan Sedang Tutup ⛔*',
    '',
    '🕒 Jam Tutup: *00.00 - 06.05 WIB*',
    '✅ Buka Kembali: *Pukul 06.05 WIB*',
    '',
    '📌 Data yang Anda kirim sekarang *tidak akan diproses*. Silakan kirim ulang setelah jam buka untuk pendaftaran besok.',
    '',
    'Terima kasih atas pengertiannya. 🙏'
].join('\n');
