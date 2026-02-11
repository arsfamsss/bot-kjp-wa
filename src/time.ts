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
 * Default: 04:01 s/d 06:00 WIB.
 * Bisa di-override dengan parameter settings dari database.
 */
export function isSystemClosed(date: Date, settings?: {
    close_hour_start: number;
    close_minute_start: number;
    close_hour_end: number;
    close_minute_end: number;
    manual_close_start?: string | null;
    manual_close_end?: string | null;
}): boolean {
    // 1. CEK TUTUP JANGKA PANJANG (MANUAL OVERRIDE)
    if (settings?.manual_close_start && settings?.manual_close_end) {
        const start = new Date(settings.manual_close_start).getTime();
        const end = new Date(settings.manual_close_end).getTime();
        const now = date.getTime();

        // Jika sekarang berada di rentang tutup manual
        if (now >= start && now <= end) {
            return true;
        }
    }

    // 2. CEK JAM TUTUP HARIAN
    const p = getWibParts(date);
    const minutes = p.hour * 60 + p.minute;

    // Gunakan settings jika ada, kalau tidak pakai default
    const startClose = settings
        ? settings.close_hour_start * 60 + settings.close_minute_start
        : 4 * 60 + 1;  // 04:01
    const endClose = settings
        ? settings.close_hour_end * 60 + settings.close_minute_end
        : 6 * 60 + 0;    // 06:00

    // LOGIKA HARIAN:
    // Jika Start == End (misal 00:00 - 00:00), anggap fitur matikan (Tidak pernah tutup)
    if (startClose === endClose) {
        return false;
    }

    if (startClose < endClose) {
        // Normal: Tutup 09:00 s/d 12:00
        return minutes >= startClose && minutes <= endClose;
    } else {
        // Lintas Hari: Tutup 23:00 s/d 04:00
        // Artinya: Tutup jika (>= 23:00) ATAU (<= 04:00)
        return minutes >= startClose || minutes <= endClose;
    }
}

/**
 * LOGIKA PROCESSING KEY (PERIODE KERJA)
 * 
 * Aturan Baru (Revisi):
 * 1. Mengikuti Tanggal Kalender Murni.
 * 2. Jam 00:00 - 23:59 -> Key = Tanggal Hari Ini.
 * 
 * Implementasi:
 * - Return getWibIsoDate(now) langsung.
 */
export function getProcessingDayKey(now: Date): string {
    return getWibIsoDate(now);
}

export function shiftIsoDate(iso: string, deltaDays: number): string {
    const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(base + deltaDays * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
