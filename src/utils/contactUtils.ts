// src/utils/contactUtils.ts
// File ini berisi fungsi utilitas untuk normalisasi dan validasi nomor HP

/**
 * Normalisasi nomor HP ke format internasional (62xxx)
 * - 0812xxx -> 62812xxx
 * - 62xxx -> 62xxx (tetap)
 * - 812xxx -> 812xxx (tetap, bukan Indonesia)
 */
export function normalizePhone(input: string): string {
    const digits = (input || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    if (digits.startsWith('62')) return digits;
    return digits;
}

/**
 * Normalisasi nomor HP dari input manual user
 * - Menerima format: +62, 62, 08, 8
 * - Return null jika tidak valid (kurang dari 9 digit)
 */
export function normalizeManualPhone(input: string): string | null {
    if (!input) return null;
    let s = input.trim();
    // ambil hanya digit dan plus
    s = s.replace(/[^\d+]/g, '');
    if (!s) return null;
    if (s.startsWith('+')) s = s.slice(1);
    // 0812... => 62812...
    if (s.startsWith('0')) s = '62' + s.slice(1);
    // 8xxx (tanpa 0/62) => anggap Indonesia
    if (s.startsWith('8')) s = '62' + s;
    // pastikan digit
    s = s.replace(/\D/g, '');
    if (s.length < 9) return null;
    return s;
}

/**
 * Ekstrak nomor HP dari teks bebas
 * - Cek format perintah eksplisit (nohp:, nomor:, hp:, dll)
 * - Cari pola nomor HP Indonesia (+628, 628, 08)
 */
export function extractManualPhone(text: string): string | null {
    const t = (text || '').trim();

    // 1. Cek format perintah eksplisit
    const cmd = t.match(/^(?:nohp|nomor|hp|nowa|no\s*wa)\s*[:=]?\s*(.+)$/i);
    if (cmd?.[1]) {
        return normalizeManualPhone(cmd[1]);
    }

    // 2. Cari pola nomor HP Indonesia di mana saja dalam teks
    // Mulai dengan: +628, 628, atau 08. Diikuti digit/spasi/strip.
    // Minimal ~10 karakter total.
    const match = t.match(/(?:\+?62|0)\s*8[\d\s\-.]{8,15}/);
    if (match) {
        return normalizeManualPhone(match[0]);
    }

    return null;
}

/**
 * Cek apakah JID adalah LID (Linked ID) bukan nomor HP biasa
 */
export function isLidJid(jid: string): boolean {
    return (jid || '').includes('@lid');
}
