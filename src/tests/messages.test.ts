import { describe, test, expect, mock } from 'bun:test';

// Mock supabase before importing messages (buildFormatDaftarMessage calls isProviderBlocked)
mock.module('../supabase', () => ({
    isProviderBlocked: async (_provider: string) => false,
}));

import {
    MENU_MESSAGE,
    buildFormatDaftarMessage,
    FORMAT_DAFTAR_FOOD_STATION,
    FORMAT_DAFTAR_PASARJAYA,
    FORMAT_DAFTAR_DHARMAJAYA,
    PASARJAYA_MAPPING,
    DHARMAJAYA_MAPPING,
    FOODSTATION_MAPPING,
    PROVIDER_LIST,
    FAQ_MESSAGE,
    ADMIN_PHONES_RAW,
    MENU_PASARJAYA_LOCATIONS,
    MENU_DHARMAJAYA_LOCATIONS,
} from '../config/messages';

describe('messages config constants', () => {
    test('MENU_MESSAGE contains menu options 1-6', () => {
        const menu = MENU_MESSAGE;
        ['1', '2', '3', '4', '5', '6'].forEach((option) => {
            expect(menu).toContain(option);
        });
    });

    test('buildFormatDaftarMessage lists providers and option numbers when all open', async () => {
        const msg = await buildFormatDaftarMessage();
        ['PASARJAYA', 'DHARMAJAYA', 'FOOD STATION'].forEach((provider) => {
            expect(msg).toContain(provider);
        });
        ['1', '2', '3'].forEach((option) => {
            expect(msg).toContain(option);
        });
    });

    test('FORMAT_DAFTAR_FOOD_STATION provides 4-line format instructions', () => {
        const lines = FORMAT_DAFTAR_FOOD_STATION.split('\n');
        expect(Array.isArray(lines)).toBe(true);
        expect(lines.length).toBeGreaterThan(0);
        ['1. Nama', '2. Jenis Kartu + Nomor Kartu', '3. KTP + Nomor KTP (NIK)', '4. KK + Nomor KK'].forEach((line) => {
            expect(FORMAT_DAFTAR_FOOD_STATION).toContain(line);
        });
    });

    test('FORMAT_DAFTAR_PASARJAYA provides 5-line format instructions', () => {
        const lines = FORMAT_DAFTAR_PASARJAYA.split('\n');
        expect(Array.isArray(lines)).toBe(true);
        expect(lines).toEqual(expect.arrayContaining([
            '1. Nama',
            '2. Nomor Kartu',
            '3. Nomor KTP (NIK)',
            '4. Nomor KK',
            '5. Tanggal lahir',
        ]));
    });

    test('FORMAT_DAFTAR_DHARMAJAYA provides 4-line format instructions', () => {
        const lines = FORMAT_DAFTAR_DHARMAJAYA.split('\n');
        expect(Array.isArray(lines)).toBe(true);
        expect(lines).toEqual(expect.arrayContaining([
            '1. Nama',
            '2. Jenis Kartu + Nomor Kartu',
            '3. KTP + Nomor KTP (NIK)',
            '4. KK + Nomor KK',
        ]));
    });

    test('PASARJAYA_MAPPING has 4 entries with non-empty string values and unique keys', () => {
        const keys = Object.keys(PASARJAYA_MAPPING);
        expect(keys.length).toBe(4);
        expect(new Set(keys).size).toBe(keys.length);
        keys.forEach((key) => {
            expect(typeof PASARJAYA_MAPPING[key]).toBe('string');
            expect(PASARJAYA_MAPPING[key].trim().length).toBeGreaterThan(0);
        });
    });

    test('DHARMAJAYA_MAPPING has 4 entries with non-empty string values and unique keys', () => {
        const keys = Object.keys(DHARMAJAYA_MAPPING);
        expect(keys.length).toBe(4);
        expect(new Set(keys).size).toBe(keys.length);
        keys.forEach((key) => {
            expect(typeof DHARMAJAYA_MAPPING[key]).toBe('string');
            expect(DHARMAJAYA_MAPPING[key].trim().length).toBeGreaterThan(0);
        });
    });

    test('FOODSTATION_MAPPING has entries with non-empty string values and unique keys', () => {
        const keys = Object.keys(FOODSTATION_MAPPING);
        expect(keys.length).toBeGreaterThan(0);
        expect(new Set(keys).size).toBe(keys.length);
        keys.forEach((key) => {
            expect(typeof FOODSTATION_MAPPING[key]).toBe('string');
            expect(FOODSTATION_MAPPING[key].trim().length).toBeGreaterThan(0);
        });
    });

    test('PROVIDER_LIST has expected providers and mappings', () => {
        expect(PROVIDER_LIST.length).toBe(3);
        const [first, second, third] = PROVIDER_LIST;
        expect(first.key).toBe('DHARMAJAYA');
        expect(second.key).toBe('PASARJAYA');
        expect(third.key).toBe('FOOD_STATION');
        PROVIDER_LIST.forEach((provider) => {
            expect(typeof provider.name).toBe('string');
            expect(provider.name.trim().length).toBeGreaterThan(0);
            const mappingKeys = Object.keys(provider.mapping);
            expect(new Set(mappingKeys).size).toBe(mappingKeys.length);
            mappingKeys.forEach((key) => {
                const value = provider.mapping[key];
                expect(typeof value).toBe('string');
                expect(value.trim().length).toBeGreaterThan(0);
            });
        });
    });

    test('FAQ_MESSAGE mentions FOOD STATION', () => {
        expect(FAQ_MESSAGE).toContain('FOOD STATION');
    });

    test('ADMIN_PHONES_RAW is an array of strings', () => {
        expect(Array.isArray(ADMIN_PHONES_RAW)).toBe(true);
        ADMIN_PHONES_RAW.forEach((phone) => {
            expect(typeof phone).toBe('string');
            expect(phone.trim().length).toBeGreaterThan(0);
        });
    });

    test('MENU_PASARJAYA_LOCATIONS and MENU_DHARMAJAYA_LOCATIONS are defined strings', () => {
        expect(typeof MENU_PASARJAYA_LOCATIONS).toBe('string');
        expect(MENU_PASARJAYA_LOCATIONS.length).toBeGreaterThan(0);
        expect(typeof MENU_DHARMAJAYA_LOCATIONS).toBe('string');
        expect(MENU_DHARMAJAYA_LOCATIONS.length).toBeGreaterThan(0);
    });
});
