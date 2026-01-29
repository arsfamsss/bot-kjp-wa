// src/parser.ts

import type { LogItem, ParsedFields, ItemError, LogJson, LogStats } from './types';
import { checkDuplicateForItem } from './supabase';
import { parseFlexibleDate } from './utils/dateParser';

// --- BAGIAN 1: PEMBERSIH INPUT ---

/**
 * Membersihkan nama untuk konsistensi duplikat:
 * - Hapus karakter gaib (zero width, nbsp, dll)
 * - Rapikan spasi
 * - Simpan sebagai UPPERCASE (case-insensitive)
 */
// (Function cleanName moved to Helper section below)

/**
 * Membersihkan nomor:
 * - Hanya ambil ANGKA (0-9), abaikan semua huruf dan tanda baca
 */
export function extractDigits(input: string): string {
    if (!input) return '';

    // Ambil HANYA angka, abaikan semua huruf/label/tanda baca apapun
    return (input.match(/\d+/g) || []).join('');
}

// --- BAGIAN 2: PARSING LOGIC ---

/// --- HELPER: CLEAN NAME ---
function cleanName(raw: string): string {
    // 1. Hapus penomoran di awal (1. , 2. , 1), 2) dll)
    // Regex: ^\s*\d+[\.\)\s]+\s*
    let cleaned = raw.replace(/^\s*\d+[\.\)\s]+\s*/, '');

    // 2. Hapus kata "nama" (case insensitive) di awal
    // Regex: ^\s*nama\s+
    cleaned = cleaned.replace(/^\s*nama\s+/i, '');

    // 3. Ganti titik di tengah menjadi spasi, TAPI jangan ganti titik di akhir kalimat
    // Strategi: Split by '.' lalu join ' '
    cleaned = cleaned.split('.').join(' ');

    // 4. Rapikan spasi berlebih
    return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Mem-parsing 1 blok data (4 baris atau 5 baris) menjadi object LogItem.
 * Ini adalah langkah awal parsing, belum termasuk validasi lengkap atau cek duplikat.
 *
 * @param lines Array of strings representing a block (e.g., 4 or 5 lines).
 * @param index Index of this block in the overall message.
 * @param processingDayKey Key for the processing day (YYYY-MM-DD).
 * @param locationContext Optional location context ('PASARJAYA' | 'DHARMAJAYA').
 * @returns LogItem object with initial parsed fields and status.
 */
export function parseBlockToItem(lines: string[], index: number, processingDayKey: string, locationContext?: 'PASARJAYA' | 'DHARMAJAYA', specificLocation?: string): LogItem {
    // Pastikan lines minimal ada (walau kosong)
    const rawNama = lines[0] || '';
    const parsedNama = cleanName(rawNama);

    const result: LogItem = {
        index,
        raw_lines: lines,
        status: 'OK', // Default OK, nanti divalidasi
        errors: [],
        parsed: {
            nama: parsedNama,
            no_kjp: lines[1] || '',
            no_ktp: lines[2] || '',
            no_kk: lines[3] || '',
        },
        duplicate_info: null,
    };

    // Tambahkan parsing tanggal lahir jika lokasi PASARJAYA dan ada baris ke-5
    if (locationContext === 'PASARJAYA' && lines.length >= 5) {
        result.parsed.tanggal_lahir = parseFlexibleDate(lines[4]);
    }

    // Set lokasi
    if (specificLocation) {
        result.parsed.lokasi = specificLocation as any; // Allow string
    } else if (locationContext) {
        result.parsed.lokasi = locationContext;
    }

    return result;
}

// Parsing logic with Auto-Split feature
export function parseRawMessageToLines(text: string): string[] {
    // SANITASI AWAL: Bersihkan karakter invisible dan format aneh
    let sanitized = (text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Zero-width characters
        .replace(/\u00A0/g, ' ')                  // Non-breaking space → normal space
        .replace(/:+/g, ':')                      // :: → :
        .replace(/\r\n/g, '\n')                   // Windows newline
        .replace(/\r/g, '\n');                    // Old Mac newline

    const rawLines = sanitized
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const finalLines: string[] = [];

    // Auto-Split Logic: Deteksi baris yang berisi Nama + Angka 16 digit tergabung
    // Regex: 
    // ^(.*?)          -> Nama di depan (lazy match)
    // \s+             -> Spasi pemisah
    // (\d{16,})$      -> Angka 16 digit atau lebih di akhir
    const mergedRegex = /^(.*?)[\s\t]+(\d{16,})$/;

    for (const line of rawLines) {
        // Cek apakah baris ini "Name + KJP" yang nempel?
        // Contoh: "Agus Dalimin 5049488500001111"
        const match = line.match(mergedRegex);

        // Tapi hati-hati, jangan split jika itu cuma angka (misal user kirim angka doang tapi ada spasi di depan)
        // Pastikan grup 1 (Nama) mengandung huruf minimal 2
        if (match && /[a-zA-Z]{2,}/.test(match[1])) {

            // FIX: Jangan split jika Text bagian depan sepertinya adalah LABEL umum
            // Contoh: "NIK 3173..." -> Jangan split jadi "NIK" dan "3173..."
            const candidateName = match[1].trim();
            // Cek apakah candidateName MENGANDUNG kata kunci label umum (lebih fleksibel)
            // Termasuk: ATM, KTP, NIK, KK, KJP, KARTU, KELUARGA, NO, NOMOR, NOMER
            const isLabel = /\b(NIK|KTP|KK|KJP|KARTU|KELUARGA|ATM|NO|NOMOR|NOMER)\b/i.test(candidateName);

            if (isLabel) {
                // Ini kemungkinan format "NIK 123456...", jangan displit
                finalLines.push(line);
            } else {
                // Beneran nama nempel
                finalLines.push(candidateName);
                finalLines.push(match[2].trim()); // Nomor
            }
        } else {
            finalLines.push(line);
        }
    }

    return finalLines;
}

export function groupLinesToBlocks(lines: string[], linesPerBlock: number = 4): { blocks: string[][]; remainder: string[] } {
    const blocks: string[][] = [];
    const validChunkCount = Math.floor(lines.length / linesPerBlock);

    for (let i = 0; i < validChunkCount; i++) {
        const chunk = lines.slice(i * linesPerBlock, (i * linesPerBlock) + linesPerBlock);
        blocks.push(chunk);
    }

    // Sisa baris yang tidak cukup (gantung)
    const remainder = lines.slice(validChunkCount * linesPerBlock);

    return { blocks, remainder };
}

function buildParsedFields(block: string[], location: 'PASARJAYA' | 'DHARMAJAYA' | 'DEFAULT' = 'DEFAULT'): ParsedFields {
    if (location === 'PASARJAYA') {
        // FORMAT 5 BARIS PASARJAYA: Nama, Kartu, KTP, KK, Tanggal Lahir
        // Urutan sama seperti Dharmajaya + Tanggal Lahir di baris 5
        const [line1, line2, line3, line4, line5] = block;
        return {
            nama: cleanName(line1),
            no_kjp: extractDigits(line2),  // Line 2: Kartu
            no_ktp: extractDigits(line3),  // Line 3: KTP
            no_kk: extractDigits(line4),   // Line 4: KK
            tanggal_lahir: parseFlexibleDate(line5), // Line 5: Date
            lokasi: 'PASARJAYA'
        };
    } else {
        // DEFAULT / DHARMAJAYA (4 BARIS): Nama, Kartu, KTP, KK
        const [line1, line2, line3, line4] = block;
        return {
            nama: cleanName(line1),
            no_kjp: extractDigits(line2), // Line 2: Kartu
            no_ktp: extractDigits(line3), // Line 3: KTP
            no_kk: extractDigits(line4),  // Line 4: KK
            lokasi: location === 'DHARMAJAYA' ? 'DHARMAJAYA' : undefined
        };
    }
}

export function validateBlockToItem(block: string[], index: number, location: 'PASARJAYA' | 'DHARMAJAYA' | 'DEFAULT' = 'DEFAULT'): LogItem {
    const parsed = buildParsedFields(block, location);
    const errors: ItemError[] = [];

    // Nama wajib ada
    if (!parsed.nama) {
        errors.push({ field: 'nama', type: 'required', detail: 'Nama wajib diisi.' });
    }

    // VALIDASI NOMOR (Common)

    // NOMOR KARTU 16–18 digit DAN harus diawali dengan 504948
    if (!parsed.no_kjp) {
        errors.push({ field: 'no_kjp', type: 'required', detail: 'Nomor Kartu wajib diisi angka.' });
    } else if (parsed.no_kjp.length < 16 || parsed.no_kjp.length > 18) {
        errors.push({
            field: 'no_kjp',
            type: 'invalid_length',
            detail: `Panjang Nomor Kartu salah (${parsed.no_kjp.length} digit). Harusnya 16-18 digit.`,
        });
    } else if (!parsed.no_kjp.startsWith('504948')) {
        // Validasi PREFIX: Nomor Kartu KJP harus diawali dengan 504948
        errors.push({
            field: 'no_kjp',
            type: 'invalid_prefix',
            detail: `Nomor Kartu tidak valid. Nomor Kartu KJP harus diawali dengan 504948.`,
        });
    }

    // KTP 16 digit
    if (!parsed.no_ktp) {
        errors.push({ field: 'no_ktp', type: 'required', detail: 'No KTP wajib diisi angka.' });
    } else if (parsed.no_ktp.length !== 16) {
        errors.push({
            field: 'no_ktp',
            type: 'invalid_length',
            detail: `Panjang KTP salah (${parsed.no_ktp.length} digit). Harusnya 16 digit.`,
        });
    }

    // KK 16 digit
    if (!parsed.no_kk) {
        errors.push({ field: 'no_kk', type: 'required', detail: 'No KK wajib diisi angka.' });
    } else if (parsed.no_kk.length !== 16) {
        errors.push({
            field: 'no_kk',
            type: 'invalid_length',
            detail: `Panjang KK salah (${parsed.no_kk.length} digit). Harusnya 16 digit.`,
        });
    }

    // VALIDASI TANGGAL LAHIR (Khusus Pasarjaya)
    if (location === 'PASARJAYA') {
        if (!parsed.tanggal_lahir) {
            errors.push({
                field: 'tanggal_lahir',
                type: 'required',
                detail: 'Tanggal lahir salah format atau kosong. Gunakan: Tgl-Bln-Thn (Contoh: 01-01-2015)'
            });
        }
        // Note: Logic urutan terbalik KTP/KK tidak relevan di Pasarjaya karena urutan fixed: KK, KTP, Kartu
    } else {
        // VALIDASI: Deteksi urutan terbalik (KK di baris 3, KTP di baris 4) - HANYA UNTUK 4 BARIS
        const line3 = block[2]?.toLowerCase() || '';
        const line4 = block[3]?.toLowerCase() || '';
        const line3HasKK = /\b(kk|kartu\s*keluarga)\b/.test(line3);
        const line4HasKTP = /\b(ktp|nik)\b/.test(line4);

        if (line3HasKK && line4HasKTP) {
            errors.push({
                field: 'no_ktp',
                type: 'wrong_order',
                detail: 'Urutan salah! Baris 3 harus KTP, baris 4 harus KK. Kirim ulang dengan urutan: Nama → Kartu → KTP → KK.',
            });
        }
    }

    // VALIDASI UNIK INTER-FIELD
    if (parsed.no_kjp && parsed.no_ktp && parsed.no_kjp === parsed.no_ktp) {
        errors.push({ field: 'no_ktp', type: 'same_as_other', detail: 'No KTP sama dengan No Kartu.' });
    }
    if (parsed.no_kjp && parsed.no_kk && parsed.no_kjp === parsed.no_kk) {
        errors.push({ field: 'no_kk', type: 'same_as_other', detail: 'No KK sama dengan No Kartu.' });
    }
    if (parsed.no_ktp && parsed.no_kk && parsed.no_ktp === parsed.no_kk) {
        errors.push({ field: 'no_kk', type: 'same_as_other', detail: 'No KK sama dengan No KTP.' });
    }

    const status = errors.length === 0 ? 'OK' : 'SKIP_FORMAT';

    return {
        index,
        raw_lines: [...block],
        parsed,
        status,
        errors,
        duplicate_info: null,
    };
}

export async function processRawMessageToLogJson(params: {
    text: string;
    senderPhone: string;
    messageId?: string | null;
    receivedAt: Date;
    tanggal: string; // YYYY-MM-DD (kalender WIB)
    processingDayKey: string; // YYYY-MM-DD (periode operasional)
    locationContext?: 'PASARJAYA' | 'DHARMAJAYA'; // New Param
    specificLocation?: string; // New Param: "PASARJAYA - Jakgrosir"
}): Promise<LogJson> {
    const { text, senderPhone, messageId, receivedAt, tanggal, processingDayKey, locationContext, specificLocation } = params;

    // Determine lines per block based on location
    const location = locationContext || 'DEFAULT';
    const linesPerBlock = location === 'PASARJAYA' ? 5 : 4;

    const receivedAtIso = receivedAt.toISOString();
    const lines = parseRawMessageToLines(text);

    // 1) Grouping dengan Partial Success Logic
    const { blocks, remainder } = groupLinesToBlocks(lines, linesPerBlock);

    // 2) parse & validasi format
    let items = blocks.map((block, i) => validateBlockToItem(block, i + 1, location));
    // Manual Update parsed.lokasi if specificLocation provided (because validateBlockToItem resets it via buildParsedFields)
    // Actually validateBlockToItem calls buildParsedFields which sets lokasi based on 'location' arg ('PASARJAYA').
    // We need to override it if specificLocation is present.
    if (specificLocation) {
        items.forEach(it => {
            if (it.parsed) it.parsed.lokasi = specificLocation as any;
        });
    }

    // 3) duplikat DI DALAM 1 PESAN
    // ✅ PENTING: KK BOLEH SAMA DALAM 1 PESAN (Sesuai Request)
    // ✅ Tapi KJP dan KTP/NIK Tetap TIDAK BOLEH SAMA DALAM 1 PESAN

    const occurrences = new Map<string, { itemIdx: number; field: 'no_kjp' | 'no_ktp' }[]>();

    items.forEach((it, idx) => {
        // PERBAIKAN: Hanya cek item yang statusnya masih OK
        if (it.status !== 'OK') return;

        // Cek duplikat internal hanya untuk KJP dan KTP
        (['no_kjp', 'no_ktp'] as const).forEach((field) => {
            const val = it.parsed[field];
            if (!val) return;

            // Gunakan key unik per field agar KJP dan KTP tidak tumpang tindih
            const key = `${field}:${val}`;
            const arr = occurrences.get(key) ?? [];
            arr.push({ itemIdx: idx, field });
            occurrences.set(key, arr);
        });
    });

    for (const [key, occs] of occurrences.entries()) {
        if (occs.length <= 1) continue;

        // SMART DUPLICATE: Pertahankan yang PERTAMA, tandai sisanya sebagai duplikat
        // Skip index 0 (occurrence pertama), hanya proses index 1 ke atas
        occs.slice(1).forEach(({ itemIdx, field }) => {
            const it = items[itemIdx];
            if (it.status === 'OK') {
                it.status = 'SKIP_FORMAT';
                it.errors.push({
                    field,
                    type: 'duplicate_in_message',
                    detail: `Data ini duplikat (${field === 'no_kjp' ? 'No Kartu' : 'No KTP'} sama dengan data sebelumnya dalam pesan ini).`,
                });
            }
        });
    }

    // 4) cek duplikat database hanya untuk item OK (PARALLEL)
    const updatedItems = await Promise.all(items.map(async (item) => {
        return checkDuplicateForItem(item, {
            processingDayKey,
            senderPhone,
        });
    }));
    items = updatedItems;

    // 5) hitung stats
    const stats: LogStats = {
        total_blocks: items.length,
        ok_count: items.filter((it) => it.status === 'OK').length,
        skip_format_count: items.filter((it) => it.status === 'SKIP_FORMAT').length,
        skip_duplicate_count: items.filter((it) => it.status === 'SKIP_DUPLICATE').length,
    };

    const logJson: LogJson = {
        message_id: messageId ?? null,
        sender_phone: senderPhone,
        received_at: receivedAtIso,
        tanggal,
        processing_day_key: processingDayKey,
        stats,
        items,

        failed_remainder_lines: remainder.length > 0 ? remainder : undefined,
        lokasi: specificLocation || (location !== 'DEFAULT' ? location : undefined) // Simpan lokasi spesifik di log
    };

    return logJson;
}
