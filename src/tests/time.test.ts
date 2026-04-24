import { describe, it, expect } from 'bun:test';
import {
    getWibParts,
    formatIsoDateFromParts,
    getWibIsoDate,
    getStartOfWibMonthUTC,
    getStartOfNextWibMonthUTC,
    isLastDayOfWibMonth,
    getWibTimeHHmm,
    isSystemClosed,
    getProcessingDayKey,
    shiftIsoDate,
} from '../time';

// WIB = UTC +7 helper
function wibDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
    return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

describe('getWibParts', () => {
    it('converts UTC midnight to 07:00 WIB with correct date', () => {
        const parts = getWibParts(new Date('2026-04-24T00:00:00Z'));
        expect(parts).toEqual({ year: 2026, month: 4, day: 24, hour: 7, minute: 0, second: 0 });
    });

    it('extracts all parts for a known WIB time', () => {
        const parts = getWibParts(new Date('2026-04-24T10:30:00Z'));
        expect(parts).toEqual({ year: 2026, month: 4, day: 24, hour: 17, minute: 30, second: 0 });
    });
});

describe('formatIsoDateFromParts', () => {
    it('formats standard date parts', () => {
        expect(formatIsoDateFromParts({ year: 2026, month: 4, day: 24 })).toBe('2026-04-24');
    });

    it('zero-pads month and day', () => {
        expect(formatIsoDateFromParts({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    });
});

describe('getWibIsoDate', () => {
    it('returns WIB iso date for normal time', () => {
        expect(getWibIsoDate(new Date('2026-04-24T10:00:00Z'))).toBe('2026-04-24');
    });

    it('shifts to next day near midnight UTC', () => {
        expect(getWibIsoDate(new Date('2026-04-24T20:00:00Z'))).toBe('2026-04-25');
    });
});

describe('getStartOfWibMonthUTC', () => {
    it('returns ISO for first day of current WIB month at 00:00 WIB', () => {
        const iso = getStartOfWibMonthUTC(new Date('2026-04-15T10:00:00Z'));
        expect(iso).toBe('2026-03-31T17:00:00.000Z');
    });

    it('handles January by keeping the same year', () => {
        const iso = getStartOfWibMonthUTC(new Date('2026-01-20T12:00:00Z'));
        expect(iso).toBe('2025-12-31T17:00:00.000Z');
    });
});

describe('getStartOfNextWibMonthUTC', () => {
    it('returns first day of next month at 00:00 WIB', () => {
        const iso = getStartOfNextWibMonthUTC(new Date('2026-04-15T10:00:00Z'));
        expect(iso).toBe('2026-04-30T17:00:00.000Z');
    });

    it('rolls over December to January next year', () => {
        const iso = getStartOfNextWibMonthUTC(new Date('2026-12-10T10:00:00Z'));
        expect(iso).toBe('2026-12-31T17:00:00.000Z');
    });
});

describe('isLastDayOfWibMonth', () => {
    it('returns true on last day of April', () => {
        expect(isLastDayOfWibMonth(wibDate(2026, 4, 30, 12))).toBe(true);
    });

    it('returns false on non-last day of April', () => {
        expect(isLastDayOfWibMonth(wibDate(2026, 4, 29, 12))).toBe(false);
    });

    it('returns true on Feb 28 for non-leap year', () => {
        expect(isLastDayOfWibMonth(wibDate(2025, 2, 28, 12))).toBe(true);
    });

    it('returns false on Feb 28 for leap year', () => {
        expect(isLastDayOfWibMonth(wibDate(2024, 2, 28, 12))).toBe(false);
    });

    it('returns true on Feb 29 for leap year', () => {
        expect(isLastDayOfWibMonth(wibDate(2024, 2, 29, 12))).toBe(true);
    });
});

describe('getWibTimeHHmm', () => {
    it('formats WIB time with dot separator', () => {
        expect(getWibTimeHHmm(new Date('2026-04-24T03:30:00Z'))).toBe('10.30');
    });
});

describe('isSystemClosed', () => {
    it('uses default window: closed at 03:00 WIB', () => {
        expect(isSystemClosed(wibDate(2026, 4, 24, 3))).toBe(true);
    });

    it('uses default window: open at 07:00 WIB', () => {
        expect(isSystemClosed(wibDate(2026, 4, 24, 7))).toBe(false);
    });

    it('uses default window: closed at 06:04 WIB boundary', () => {
        expect(isSystemClosed(wibDate(2026, 4, 24, 6, 4))).toBe(true);
    });

    it('uses default window: open at 06:05 WIB boundary', () => {
        expect(isSystemClosed(wibDate(2026, 4, 24, 6, 5))).toBe(false);
    });

    it('respects custom close window (09:00-12:00): closed at 10:00', () => {
        const settings = { close_hour_start: 9, close_minute_start: 0, close_hour_end: 12, close_minute_end: 0 };
        expect(isSystemClosed(wibDate(2026, 4, 24, 10), settings)).toBe(true);
    });

    it('respects custom close window (09:00-12:00): open at 13:00', () => {
        const settings = { close_hour_start: 9, close_minute_start: 0, close_hour_end: 12, close_minute_end: 0 };
        expect(isSystemClosed(wibDate(2026, 4, 24, 13), settings)).toBe(false);
    });

    it('handles cross-midnight close (23:00-04:00): closed at 01:00', () => {
        const settings = { close_hour_start: 23, close_minute_start: 0, close_hour_end: 4, close_minute_end: 0 };
        expect(isSystemClosed(wibDate(2026, 4, 24, 1), settings)).toBe(true);
    });

    it('handles cross-midnight close (23:00-04:00): closed at 23:30', () => {
        const settings = { close_hour_start: 23, close_minute_start: 0, close_hour_end: 4, close_minute_end: 0 };
        expect(isSystemClosed(wibDate(2026, 4, 24, 23, 30), settings)).toBe(true);
    });

    it('handles cross-midnight close (23:00-04:00): open at 05:00', () => {
        const settings = { close_hour_start: 23, close_minute_start: 0, close_hour_end: 4, close_minute_end: 0 };
        expect(isSystemClosed(wibDate(2026, 4, 24, 5), settings)).toBe(false);
    });

    it('returns false when start and end are equal (feature off)', () => {
        const settings = { close_hour_start: 0, close_minute_start: 0, close_hour_end: 0, close_minute_end: 0 };
        expect(isSystemClosed(wibDate(2026, 4, 24, 2), settings)).toBe(false);
    });

    it('manual close overrides daily window when within range', () => {
        const manualStart = wibDate(2026, 4, 24, 8).toISOString();
        const manualEnd = wibDate(2026, 4, 24, 18).toISOString();
        const settings = { close_hour_start: 0, close_minute_start: 0, close_hour_end: 6, close_minute_end: 5, manual_close_start: manualStart, manual_close_end: manualEnd };
        expect(isSystemClosed(wibDate(2026, 4, 24, 10), settings)).toBe(true);
    });

    it('falls back to daily window when outside manual range', () => {
        const manualStart = wibDate(2026, 4, 23, 8).toISOString();
        const manualEnd = wibDate(2026, 4, 23, 18).toISOString();
        const settings = { close_hour_start: 0, close_minute_start: 0, close_hour_end: 6, close_minute_end: 5, manual_close_start: manualStart, manual_close_end: manualEnd };
        expect(isSystemClosed(wibDate(2026, 4, 24, 10), settings)).toBe(false);
    });

    it('ignores invalid manual dates and applies daily rule', () => {
        const manualStart = 'not-a-date';
        const manualEnd = 'also-not-a-date';
        const settings = { close_hour_start: 0, close_minute_start: 0, close_hour_end: 6, close_minute_end: 5, manual_close_start: manualStart, manual_close_end: manualEnd };
        expect(isSystemClosed(wibDate(2026, 4, 24, 3), settings)).toBe(true);
    });
});

describe('getProcessingDayKey', () => {
    it('matches getWibIsoDate output', () => {
        const date = new Date('2026-04-24T10:00:00Z');
        expect(getProcessingDayKey(date)).toBe(getWibIsoDate(date));
    });
});

describe('shiftIsoDate', () => {
    it('shifts forward by one day', () => {
        expect(shiftIsoDate('2026-04-24', 1)).toBe('2026-04-25');
    });

    it('shifts backward by one day', () => {
        expect(shiftIsoDate('2026-04-24', -1)).toBe('2026-04-23');
    });

    it('rolls month forward when needed', () => {
        expect(shiftIsoDate('2026-04-30', 1)).toBe('2026-05-01');
    });

    it('rolls year forward when needed', () => {
        expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('returns input unchanged for invalid iso', () => {
        expect(shiftIsoDate('abc', 1)).toBe('abc');
    });

    it('returns input unchanged for empty string', () => {
        expect(shiftIsoDate('', 1)).toBe('');
    });
});
