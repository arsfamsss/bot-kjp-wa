import { describe, test, expect, mock } from 'bun:test';

// IMPORTANT: mock cardType BEFORE importing recap.ts
mock.module('../utils/cardType', () => ({
    resolveCardTypeLabel: (_noKjp: string, jenisKartu?: string) => jenisKartu || 'KJP',
}));

import type { ValidItemDetail, TodayInvalidItem } from '../recap';
const {
    extractChildName,
    buildReplyForTodayRecap,
    buildReplyForInvalidDetails,
} = await import('../recap');

// NOTE: non-exported functions in recap.ts (not tested directly):
// - normalizeLocationMeta
// - buildReasonForInvalidItem
// - dedupInvalidItems

describe('recap.ts exported pure functions', () => {
    describe('extractChildName', () => {
        test('returns plain name as identity', () => {
            expect(extractChildName('Budi Santoso')).toBe('Budi Santoso');
        });

        test('returns name with parenthetical note as identity', () => {
            expect(extractChildName('Hamzah (bude)')).toBe('Hamzah (bude)');
        });

        test('returns empty string as identity', () => {
            expect(extractChildName('')).toBe('');
        });
    });

    describe('buildReplyForTodayRecap', () => {
        const baseItem = (overrides?: Partial<ValidItemDetail>): ValidItemDetail => ({
            nama: 'Budi Santoso',
            no_kjp: '5049488500001234',
            no_ktp: '3171234567890123',
            no_kk: '3171234567890456',
            ...overrides,
        });

        test('0 items contains fallback message', () => {
            const reply = buildReplyForTodayRecap(0, 0, [], '2026-04-24');
            expect(reply).toContain('Belum ada data terdaftar hari ini');
        });

        test('contains status header, registered count, menu hint, and formatted date', () => {
            const reply = buildReplyForTodayRecap(0, 0, [], '2026-04-24');

            expect(reply).toContain('STATUS DATA HARI INI');
            expect(reply).toContain('Data Terdaftar: 0 Orang');
            expect(reply).toContain('Ketik *MENU* untuk kembali');
            expect(reply).toContain('24-04-2026');
        });

        test('single DHARMAJAYA item contains numbered block and location label', () => {
            const reply = buildReplyForTodayRecap(
                1,
                0,
                [baseItem({ lokasi: 'DHARMAJAYA - Duri Kosambi' })],
                '2026-04-24'
            );

            expect(reply).toContain('┌── 1. *Budi Santoso*');
            expect(reply).toContain('📍 DHARMAJAYA - Duri Kosambi');
        });

        test('single PASARJAYA item with tanggal_lahir contains birthday line', () => {
            const reply = buildReplyForTodayRecap(
                1,
                0,
                [
                    baseItem({
                        lokasi: 'PASARJAYA - Tomang Barat',
                        tanggal_lahir: '2015-01-30',
                    }),
                ],
                '2026-04-24'
            );

            expect(reply).toContain('🎂 Lahir : 30-01-2015');
        });

        test('single FOOD STATION item contains FOOD STATION location label', () => {
            const reply = buildReplyForTodayRecap(
                1,
                0,
                [baseItem({ lokasi: 'FOOD STATION' })],
                '2026-04-24'
            );

            expect(reply).toContain('📍 FOOD STATION');
        });

        test('item with no lokasi defaults to Duri Kosambi', () => {
            const reply = buildReplyForTodayRecap(1, 0, [baseItem({ lokasi: undefined })], '2026-04-24');
            expect(reply).toContain('📍 Duri Kosambi');
        });

        test('multiple items are numbered 1, 2, 3', () => {
            const reply = buildReplyForTodayRecap(
                3,
                0,
                [
                    baseItem({ nama: 'Anak Satu' }),
                    baseItem({ nama: 'Anak Dua', no_kjp: '5049488500001111', no_ktp: '3171234567890111', no_kk: '3171234567890222' }),
                    baseItem({ nama: 'Anak Tiga', no_kjp: '5049488500002222', no_ktp: '3171234567890333', no_kk: '3171234567890444' }),
                ],
                '2026-04-24'
            );

            expect(reply).toContain('┌── 1. *Anak Satu*');
            expect(reply).toContain('┌── 2. *Anak Dua*');
            expect(reply).toContain('┌── 3. *Anak Tiga*');
        });

        test('item with jenis_kartu shows card type label (via mocked resolveCardTypeLabel)', () => {
            const reply = buildReplyForTodayRecap(
                1,
                0,
                [baseItem({ jenis_kartu: 'LANSIA' })],
                '2026-04-24'
            );

            expect(reply).toContain('📇 LANSIA : 5049488500001234');
        });
    });

    describe('buildReplyForInvalidDetails', () => {
        test('empty array contains no-failure message and header', () => {
            const reply = buildReplyForInvalidDetails([]);

            expect(reply).toContain('Rincian gagal');
            expect(reply).toContain('Tidak ada data gagal');
        });

        test('with items contains each failed name and reason text', () => {
            const detailItems: TodayInvalidItem[] = [
                {
                    index: 1,
                    nama: 'Budi Santoso',
                    status: 'SKIP_FORMAT',
                    reason: 'Format salah di baris KTP.',
                },
                {
                    index: 2,
                    nama: 'Siti Aminah',
                    status: 'SKIP_DUPLICATE',
                    reason: 'Data duplikat (sudah terdaftar hari ini).',
                },
            ];

            const reply = buildReplyForInvalidDetails(detailItems);

            expect(reply).toContain('Rincian gagal');
            expect(reply).toContain('❌ *Budi Santoso*');
            expect(reply).toContain('❌ *Siti Aminah*');
            expect(reply).toContain('Format salah di baris KTP.');
            expect(reply).toContain('Data duplikat (sudah terdaftar hari ini).');
        });
    });
});
