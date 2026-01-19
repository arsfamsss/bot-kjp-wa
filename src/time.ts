// src/time.ts
// Utility waktu WIB (Asia/Jakarta) tanpa library eksternal.

export type WibParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const WIB_TZ = 'Asia/Jakarta';

function toInt(v: string | undefined): number { return Number.parseInt(v ?? '0', 10); }

export function getWibParts(date: Date): WibParts {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: WIB_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find(p => p.type === t)?.value;
    return {
        year: toInt(get('year')), month: toInt(get('month')), day: toInt(get('day')),
        hour: toInt(get('hour')), minute: toInt(get('minute')), second: toInt(get('second')),
    };
}

export function formatIsoDateFromParts(p: Pick<WibParts, 'year' | 'month' | 'day'>): string {
    return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function getWibIsoDate(date: Date): string {
    return formatIsoDateFromParts(getWibParts(date));
}

export function getWibTimeHHmm(date: Date): string {
    const p = getWibParts(date);
    return `${String(p.hour).padStart(2, '0')}.${String(p.minute).padStart(2, '0')}`;
}

/**
 * Cek apakah sistem sedang TUTUP (Maintenance Harian).
 * Tutup: 04:01 s/d 06:00 WIB.
 */
export function isSystemClosed(date: Date): boolean {
    const p = getWibParts(date);
    const minutes = p.hour * 60 + p.minute;

    const startClose = 4 * 60 + 1;  // 04:01
    const endClose = 6 * 60 + 0;    // 06:00

    return minutes >= startClose && minutes <= endClose;
}

/**
 * LOGIKA PROCESSING KEY (PERIODE KERJA)
 * 
 * Aturan Baru:
 * 1. Hari berjalan: 06:01 - 04:00 (keesokan hari)
 * 2. Maintenance: 04:01 - 06:00 (Tutup, tapi key ikut hari kemarin)
 * 3. Hari Baru mulai: 06:01
 * 
 * Implementasi:
 * - Jika Jam 06:01 - 23:59 -> Key = Today
 * - Jika Jam 00:00 - 06:00 -> Key = Yesterday
 */
export function getProcessingDayKey(now: Date): string {
    const p = getWibParts(now);
    const minutes = p.hour * 60 + p.minute;

    // Mulai jam 06:01 (361 menit)
    if (minutes >= 361) {
        return formatIsoDateFromParts(p);
    }

    // Sebelum 06:01 dianggap milik hari kemarin
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return getWibIsoDate(yesterday);
}

export function shiftIsoDate(iso: string, deltaDays: number): string {
    const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(base + deltaDays * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
