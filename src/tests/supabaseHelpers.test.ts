import { describe, test, expect } from 'bun:test';
import {
    formatCloseTimeString,
    formatOpenTimeString,
    renderCloseMessage,
    clearBotSettingsCache,
    getStartOfCurrentMonthUTC,
    type BotSettings,
} from '../supabase';

// NOTE: Pure helpers below are not exported from src/supabase.ts, so they are untestable directly here:
// normalizeKjp, normalizeKk, normalizePhoneNumber, normalizeLocationKey, normalizeNameForDedup,
// groupGlobalQuotaUsageDeltas, buildPhoneCandidates, stripLegacyCloseNote, shiftDateString, toGlobalLocationQuotaDecision

function createSettings(overrides: Partial<BotSettings> = {}): BotSettings {
    return {
        close_hour_start: 0,
        close_minute_start: 0,
        close_hour_end: 6,
        close_minute_end: 5,
        close_message_template: '⛔ Tutup {JAM_TUTUP} | ✅ Buka {JAM_BUKA}',
        manual_close_start: null,
        manual_close_end: null,
        ...overrides,
    };
}

describe('formatCloseTimeString', () => {
    test('formats default settings (0:0 - 6:5) to 00.00 - 06.05 WIB', () => {
        const settings = createSettings();
        expect(formatCloseTimeString(settings)).toBe('00.00 - 06.05 WIB');
    });

    test('formats custom settings (22:30 - 5:0) to 22.30 - 05.00 WIB', () => {
        const settings = createSettings({
            close_hour_start: 22,
            close_minute_start: 30,
            close_hour_end: 5,
            close_minute_end: 0,
        });
        expect(formatCloseTimeString(settings)).toBe('22.30 - 05.00 WIB');
    });

    test('zero-pads single digit hours and minutes', () => {
        const settings = createSettings({
            close_hour_start: 1,
            close_minute_start: 2,
            close_hour_end: 3,
            close_minute_end: 4,
        });
        expect(formatCloseTimeString(settings)).toBe('01.02 - 03.04 WIB');
    });
});

describe('formatOpenTimeString', () => {
    test('formats default open time from end 6:5 to 06.05', () => {
        const settings = createSettings();
        expect(formatOpenTimeString(settings)).toBe('06.05');
    });

    test('formats custom open time from end 23:59 to 23.59', () => {
        const settings = createSettings({ close_hour_end: 23, close_minute_end: 59 });
        expect(formatOpenTimeString(settings)).toBe('23.59');
    });
});

describe('renderCloseMessage', () => {
    test('replaces placeholders in default-style template with JAM_TUTUP and JAM_BUKA', () => {
        const settings = createSettings({
            close_message_template: 'TUTUP: {JAM_TUTUP} | BUKA: {JAM_BUKA}',
        });

        expect(renderCloseMessage(settings)).toBe('TUTUP: 00.00 - 06.05 WIB | BUKA: 06.05');
    });

    test('replaces placeholders in custom template', () => {
        const settings = createSettings({
            close_hour_start: 22,
            close_minute_start: 30,
            close_hour_end: 5,
            close_minute_end: 0,
            close_message_template: 'Maaf, layanan tutup {JAM_TUTUP}. Buka lagi {JAM_BUKA}.',
        });

        expect(renderCloseMessage(settings)).toBe('Maaf, layanan tutup 22.30 - 05.00 WIB. Buka lagi 05.00.');
    });

    test('uses long-term manual-close open time format when now is within manual range', () => {
        const now = Date.now();
        const manualStart = new Date(now - 60 * 60 * 1000);
        const manualEnd = new Date(now + 60 * 60 * 1000);

        const settings = createSettings({
            close_hour_start: 22,
            close_minute_start: 30,
            close_hour_end: 5,
            close_minute_end: 0,
            close_message_template: 'Tutup: {JAM_TUTUP} | Buka: {JAM_BUKA}',
            manual_close_start: manualStart.toISOString(),
            manual_close_end: manualEnd.toISOString(),
        });

        const expectedDate = manualEnd.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
        const expectedTime = manualEnd
            .toLocaleTimeString('id-ID', {
                timeZone: 'Asia/Jakarta',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            })
            .replace(':', '.');

        const expected = `Tutup: 22.30 - 05.00 WIB | Buka: ${expectedDate} Pukul ${expectedTime} WIB`;
        expect(renderCloseMessage(settings)).toBe(expected);
    });

    test('uses daily format when manual close range is in the past', () => {
        const now = Date.now();
        const manualStart = new Date(now - 3 * 60 * 60 * 1000);
        const manualEnd = new Date(now - 2 * 60 * 60 * 1000);

        const settings = createSettings({
            close_hour_start: 22,
            close_minute_start: 30,
            close_hour_end: 5,
            close_minute_end: 0,
            close_message_template: 'Tutup: {JAM_TUTUP} | Buka: {JAM_BUKA}',
            manual_close_start: manualStart.toISOString(),
            manual_close_end: manualEnd.toISOString(),
        });

        expect(renderCloseMessage(settings)).toBe('Tutup: 22.30 - 05.00 WIB | Buka: 05.00');
    });

    test('falls back to built-in default template when template is empty', () => {
        const settings = createSettings({ close_message_template: '' });
        const message = renderCloseMessage(settings);

        expect(message).toContain('MOHON MAAF, Layanan Sedang Tutup');
        expect(message).toContain('00.00 - 06.05 WIB');
        expect(message).toContain('Pukul 06.05 WIB');
    });
});

describe('clearBotSettingsCache', () => {
    test('clears cache and returns void', () => {
        const result = clearBotSettingsCache();
        expect(result).toBeUndefined();
    });
});

describe('getStartOfCurrentMonthUTC', () => {
    test('returns a string with leading YYYY-MM-DD date part', () => {
        const value = getStartOfCurrentMonthUTC();
        expect(value).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    test('always points to day 01 for WIB month-start', () => {
        const value = getStartOfCurrentMonthUTC();
        const day = new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
        }).format(new Date(value));
        expect(day).toBe('01');
    });
});
