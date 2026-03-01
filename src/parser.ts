// src/parser.ts

import type { LogItem, ParsedFields, ItemError, LogJson, LogStats } from './types';
import { checkBlockedKkBatch, checkBlockedKtpBatch, checkDuplicateForItem, checkDuplicatesBatch } from './supabase';
import { parseFlexibleDate } from './utils/dateParser';
import { normalizeCardTypeName, getCardTypeChoicesText } from './utils/cardTypeRules';
import { getCardPrefixType } from './utils/cardPrefixConfig';

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

/**
 * Ekstrak hanya huruf dan spasi dari teks campuran (hapus angka dan tanda baca).
 * Digunakan untuk membaca jenis kartu dari baris nomor kartu.
 */
function extractCardText(raw: string): string {
    if (!raw) return '';
    // Hanya huruf dan spasi
    const lettersOnly = raw.replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ').trim();
    return lettersOnly;
}

/**
 * Normalisasi teks jenis kartu dengan alias mapping.
 * Returns null jika tidak dikenal.
 */
function normalizeCardType(text: string): string | null {
    return normalizeCardTypeName(text);
}

/**
 * Deteksi jenis kartu dari nomor KJP dan teks manual.
 * Prioritas: prefix map > teks manual (alias) > null
 */
function resolveJenisKartu(noKjp: string, textManual: string): {
    jenis_kartu: string | null;
    sumber: 'prefix' | 'manual' | 'koreksi' | null;
    koreksi: boolean; // true jika teks manual ada tapi berbeda dari prefix
    has_manual_text: boolean;
    manual_invalid: boolean;
    manual_type: string | null;
    prefix_type: string | null;
} {
    const prefix8 = noKjp.length >= 8 ? noKjp.substring(0, 8) : null;
    let fromPrefix = prefix8 ? getCardPrefixType(prefix8) : null;
    const fromText = normalizeCardType(textManual);
    const hasManualText = textManual.trim().length > 0;
    const manualInvalid = hasManualText && !fromText;

    const isLegacyKjpPrefix = prefix8 === '50494812';
    const isLegacyKjpLength = noKjp.length === 17 || noKjp.length === 18;

    if (isLegacyKjpPrefix && fromPrefix === 'KJP' && !isLegacyKjpLength) {
        fromPrefix = null;
    }

    if (fromPrefix) {
        // Prefix dikenali — selalu menang
        const koreksi = !!(fromText && fromText !== fromPrefix);
        return {
            jenis_kartu: fromPrefix,
            sumber: koreksi ? 'koreksi' : 'prefix',
            koreksi,
            has_manual_text: hasManualText,
            manual_invalid: manualInvalid,
            manual_type: fromText,
            prefix_type: fromPrefix,
        };
    }

    if (fromText) {
        // Teks manual dikenali
        return {
            jenis_kartu: fromText,
            sumber: 'manual',
            koreksi: false,
            has_manual_text: hasManualText,
            manual_invalid: false,
            manual_type: fromText,
            prefix_type: null,
        };
    }

    return {
        jenis_kartu: null,
        sumber: null,
        koreksi: false,
        has_manual_text: hasManualText,
        manual_invalid: manualInvalid,
        manual_type: null,
        prefix_type: null,
    };
}

// --- BAGIAN 2: PARSING LOGIC ---

/// --- HELPER: CLEAN NAME ---
function cleanName(raw: string): string {
    let cleaned = raw;

    // 1. TIDAK lagi hapus konten dalam kurung — terima apa adanya dari user

    // 2. Hapus kata-kata filter (blacklist location/keywords)
    const blacklist = [
        'kecamatan cengkareng',
        'mini dc cengkareng',
        'rusun pesakih',
        'rusunpesakih',
        'kedoya'
    ];
    const blacklistRegex = new RegExp(`\\b(${blacklist.join('|')})\\b`, 'gi');
    cleaned = cleaned.replace(blacklistRegex, '');

    // 3. Angka TIDAK dihapus dari nama (dibiarkan apa adanya)

    // 4. Hapus kata "nama" atau "nm" (hanya kata utuh, case-insensitive)
    //    Menggunakan \b agar nama seperti "Purnama" tidak rusak menjadi "Pur"
    cleaned = cleaned.replace(/\b(nama|nm)\b/gi, '');

    // 5. Hapus tanda baca: =, :, ;, dan ,
    cleaned = cleaned.replace(/[=:;,]/g, '');

    // 5. Rapikan spasi berlebih
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
        result.parsed.lokasi = specificLocation;
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
            // Termasuk: ATM, KTP, NIK, KK, KJP, KAJ, KPDJ, KJMU, LANSIA, PJLP, RUSUN, DISABILITAS, DASAWISMA, DAWIS, GURU, HONORER, PEKERJA, dsb
            const isLabel = /\b(NIK|KTP|KK|KJP|KAJ|KPDJ|KJMU|LANSIA|PJLP|RUSUN|DISABILITAS|DASAWISMA|DAWIS|GURU|HONORER|PEKERJA|KARTU|KELUARGA|ATM|NO|NOMOR|NOMER)\b/i.test(candidateName);

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
        // Pasarjaya: tidak perlu jenis kartu manual
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
        const noKjp = extractDigits(line2);
        const cardText = extractCardText(line2); // Teks di samping nomor kartu
        const resolved = resolveJenisKartu(noKjp, cardText);
        return {
            nama: cleanName(line1),
            no_kjp: noKjp,
            no_ktp: extractDigits(line3),
            no_kk: extractDigits(line4),
            jenis_kartu: resolved.jenis_kartu ?? undefined,
            jenis_kartu_sumber: resolved.sumber ?? undefined,
            jenis_kartu_manual_invalid: resolved.manual_invalid,
            jenis_kartu_manual_input: resolved.has_manual_text ? cardText : undefined,
            jenis_kartu_manual: resolved.manual_type ?? undefined,
            jenis_kartu_prefix: resolved.prefix_type ?? undefined,
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
        // Validasi PREFIX: Nomor Kartu harus diawali dengan 504948
        errors.push({
            field: 'no_kjp',
            type: 'invalid_prefix',
            detail: `Nomor Kartu tidak valid. Nomor Kartu harus diawali dengan 504948.`,
        });
    } else if (
        location !== 'PASARJAYA' &&
        parsed.no_kjp.startsWith('50494812') &&
        parsed.jenis_kartu_manual === 'KJP' &&
        !(parsed.no_kjp.length === 17 || parsed.no_kjp.length === 18)
    ) {
        errors.push({
            field: 'no_kjp',
            type: 'card_type_mismatch',
            detail: `Untuk prefix 50494812, KJP lama hanya valid jika panjang nomor 17-18 digit. Nomor ${parsed.no_kjp} tidak memenuhi aturan itu.`,
        });
    } else if (location !== 'PASARJAYA' && parsed.jenis_kartu_manual_invalid) {
        const kartuList = getCardTypeChoicesText();
        const inputManual = (parsed.jenis_kartu_manual_input || '').trim() || '-';
        errors.push({
            field: 'no_kjp',
            type: 'invalid_card_type',
            detail: `Nama kartu "${inputManual}" tidak dikenali. Gunakan salah satu: ${kartuList}`,
        });
    } else if (
        location !== 'PASARJAYA' &&
        !parsed.jenis_kartu_prefix &&
        parsed.jenis_kartu_manual === 'KJP'
    ) {
        const prefix8 = parsed.no_kjp.substring(0, 8);
        errors.push({
            field: 'no_kjp',
            type: 'card_type_mismatch',
            detail: `Jenis KJP tidak cocok untuk prefix ${prefix8}. Gunakan jenis kartu yang sesuai prefix, atau daftarkan prefix ini sebagai KJP di Menu Admin 17.`,
        });
    } else if (location !== 'PASARJAYA' && !parsed.jenis_kartu) {
        // Validasi JENIS KARTU (Dharmajaya only): prefix belum dikenal dan tidak ada teks manual
        const kartuList = getCardTypeChoicesText();
        errors.push({
            field: 'no_kjp',
            type: 'unknown_card_type',
            detail: `Nama kartu belum kamu tulis. Silakan tulis nama kartu di samping nomornya ya Bu.\n\nPilihan kartu:\n${kartuList}\n\nContoh: ${parsed.no_kjp} LANSIA`,
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
            if (it.parsed) it.parsed.lokasi = specificLocation;
        });
    }

    // 3) duplikat DI DALAM 1 PESAN
    // ✅ PENTING: KK BOLEH SAMA DALAM 1 PESAN (Sesuai Request)
    // ✅ Tapi KJP dan KTP/NIK Tetap TIDAK BOLEH SAMA DALAM 1 PESAN

    const occurrences = new Map<string, { itemIdx: number; field: 'no_kjp' | 'no_ktp' | 'nama' }[]>();

    items.forEach((it, idx) => {
        // PERBAIKAN: Hanya cek item yang statusnya masih OK
        if (it.status !== 'OK') return;

        // Cek duplikat internal hanya untuk KJP dan KTP
        (['no_kjp', 'no_ktp', 'nama'] as const).forEach((field) => {
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

                let detailMsg = `Data ini duplikat (${field === 'no_kjp' ? 'No Kartu' : 'No KTP'} sama dengan data sebelumnya dalam pesan ini).`;
                if ((field as any) === 'nama') {
                    detailMsg = `❌ Maaf, nama ${it.parsed.nama} double. silahkan edit salah satu nama yg duplikat`;
                }

                it.errors.push({
                    field,
                    type: 'duplicate_in_message' as any,
                    detail: detailMsg,
                });
            }
        });
    }

    items = await checkBlockedKkBatch(items);
    items = await checkBlockedKtpBatch(items);

    const updatedItems = await checkDuplicatesBatch(items, {
        processingDayKey,
        senderPhone,
        tanggal,
    });
    items = updatedItems;

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
