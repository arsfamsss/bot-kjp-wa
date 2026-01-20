// src/parser.ts

import type { LogItem, ParsedFields, ItemError, LogJson, LogStats } from './types';
import { checkDuplicateForItem } from './supabase';

// --- BAGIAN 1: PEMBERSIH INPUT ---

/**
 * Membersihkan nama untuk konsistensi duplikat:
 * - Hapus karakter gaib (zero width, nbsp, dll)
 * - Rapikan spasi
 * - Simpan sebagai UPPERCASE (case-insensitive)
 */
function cleanName(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  // Hanya ambil karakter huruf, angka, spasi, titik, koma, strip, petik (nama orang umum)
  // [a-zA-Z0-9\s.,'-]
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s.,'-]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.toUpperCase();
}

/**
 * Membersihkan nomor:
 * - Baru konversi huruf O/o menjadi 0 (hanya di bagian angka)
 * - Hanya ambil ANGKA (0-9)
 */
export function extractDigits(input: string): string {
  if (!input) return '';

  // Ganti huruf O/o dengan angka 0 terlebih dahulu
  let cleaned = input.replace(/[Oo]/g, '0');

  // Ambil HANYA angka, abaikan semua huruf/label/tanda baca apapun
  return (cleaned.match(/\d+/g) || []).join('');
}

// --- BAGIAN 2: PARSING LOGIC ---

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

export function groupLinesToBlocks(lines: string[]): { blocks: string[][]; remainder: string[] } {
  const blocks: string[][] = [];
  const validChunkCount = Math.floor(lines.length / 4);

  for (let i = 0; i < validChunkCount; i++) {
    const chunk = lines.slice(i * 4, (i * 4) + 4);
    blocks.push(chunk);
  }

  // Sisa baris yang tidak cukup 4 (gantung)
  const remainder = lines.slice(validChunkCount * 4);

  return { blocks, remainder };
}

function buildParsedFields(block: string[]): ParsedFields {
  const [line1, line2, line3, line4] = block;
  return {
    nama: cleanName(line1),
    no_kjp: extractDigits(line2),
    no_ktp: extractDigits(line3),
    no_kk: extractDigits(line4),
  };
}

export function validateBlockToItem(block: string[], index: number): LogItem {
  const parsed = buildParsedFields(block);
  const errors: ItemError[] = [];

  // Nama wajib ada
  if (!parsed.nama) {
    errors.push({ field: 'nama', type: 'required', detail: 'Nama wajib diisi.' });
  }

  // NOMOR KARTU 16–18 digit
  if (!parsed.no_kjp) {
    errors.push({ field: 'no_kjp', type: 'required', detail: 'Nomor Kartu wajib diisi angka.' });
  } else if (parsed.no_kjp.length < 16 || parsed.no_kjp.length > 18) {
    errors.push({
      field: 'no_kjp',
      type: 'invalid_length',
      detail: `Panjang Nomor Kartu salah (${parsed.no_kjp.length} digit). Harusnya 16-18 digit.`,
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

  // VALIDASI: Deteksi urutan terbalik (KK di baris 3, KTP di baris 4)
  // Cek apakah baris 3 mengandung label "KK" dan baris 4 mengandung label "KTP"
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

  // VALIDASI BARU: Cek apakah nomor dalam 1 blok ada yang sama
  // No Kartu, No KTP, No KK harus UNIK (berbeda satu sama lain)
  if (parsed.no_kjp && parsed.no_ktp && parsed.no_kjp === parsed.no_ktp) {
    errors.push({
      field: 'no_ktp',
      type: 'same_as_other',
      detail: 'No KTP sama dengan No Kartu. Setiap nomor harus berbeda.',
    });
  }
  if (parsed.no_kjp && parsed.no_kk && parsed.no_kjp === parsed.no_kk) {
    errors.push({
      field: 'no_kk',
      type: 'same_as_other',
      detail: 'No KK sama dengan No Kartu. Setiap nomor harus berbeda.',
    });
  }
  if (parsed.no_ktp && parsed.no_kk && parsed.no_ktp === parsed.no_kk) {
    errors.push({
      field: 'no_kk',
      type: 'same_as_other',
      detail: 'No KK sama dengan No KTP. Setiap nomor harus berbeda.',
    });
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
}): Promise<LogJson> {
  const { text, senderPhone, messageId, receivedAt, tanggal, processingDayKey } = params;

  const receivedAtIso = receivedAt.toISOString();
  const lines = parseRawMessageToLines(text);

  // 1) Grouping dengan Partial Success Logic
  const { blocks, remainder } = groupLinesToBlocks(lines);

  // 2) parse & validasi format
  let items = blocks.map((block, i) => validateBlockToItem(block, i + 1));

  // 3) duplikat DI DALAM 1 PESAN
  // ✅ PENTING: KK BOLEH SAMA DALAM 1 PESAN (Sesuai Request D)
  // ✅ Tapi KJP dan KTP/NIK Tetap TIDAK BOLEH SAMA DALAM 1 PESAN (Logis)

  const occurrences = new Map<string, { itemIdx: number; field: 'no_kjp' | 'no_ktp' }[]>();

  items.forEach((it, idx) => {
    // Cek duplikat internal hanya untuk KJP dan KTP
    (['no_kjp', 'no_ktp'] as const).forEach((field) => {
      const val = it.parsed[field];
      if (!val) return;
      const arr = occurrences.get(val) ?? [];
      arr.push({ itemIdx: idx, field });
      occurrences.set(val, arr);
    });
  });

  for (const [val, occs] of occurrences.entries()) {
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
          detail: `Data ini duplikat (${field === 'no_kjp' ? 'No Kartu' : 'No KTP'} sama dengan data sebelumnya).`,
        });
      }
    });
  }

  // 4) cek duplikat database hanya untuk item OK
  const updatedItems: LogItem[] = [];
  for (const item of items) {
    const updated = await checkDuplicateForItem(item, {
      processingDayKey,
      senderPhone,
    });
    updatedItems.push(updated);
  }
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
    failed_remainder_lines: remainder.length > 0 ? remainder : undefined
  };

  return logJson;
}
