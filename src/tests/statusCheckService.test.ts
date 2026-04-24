// Note: Non-exported helpers in statusCheckService.ts (not tested here):
// toPositiveInt, parseIsoDateUtc, shiftIsoDate, formatLongIndonesianDate,
// formatIndonesianDateWithoutWeekday, normalizeProgramLabel

import { describe, test, expect } from 'bun:test';
import {
    buildStatusSummaryMessage,
    buildFailedDataCopyMessage,
    StatusCheckItem,
    StatusCheckResult,
} from '../services/statusCheckService';

const baseItem: StatusCheckItem = {
    nama: 'Jane Doe',
    no_kjp: '1234567890',
    no_ktp: '3201010101010001',
    no_kk: '3201010101010002',
};

describe('buildStatusSummaryMessage', () => {
    const dateIso = '2026-04-24'; // Jumat, 24 April 2026; report date shifts to 23 April 2026

    test('all BERHASIL shows success list and dash for failed', () => {
        const results: StatusCheckResult[] = [
            { item: baseItem, state: 'BERHASIL' },
            { item: { ...baseItem, nama: 'John Smith', no_kjp: '9999999999' }, state: 'BERHASIL' },
        ];

        const message = buildStatusSummaryMessage(results, dateIso);

        expect(message).toContain('📋 *LAPORAN HASIL PENDAFTARAN 23 April 2026*');
        expect(message).toContain('Tanggal Pengambilan : Jumat, 24 April 2026');
        expect(message).toContain('✅ *SUKSES: 2 Data*');
        expect(message).toContain('1. Jane Doe (1234567890)');
        expect(message).toContain('2. John Smith (9999999999)');
        expect(message).toMatch(/❌ \*GAGAL: 0 Data\*[\s\S]*\n-$/);
    });

    test('all GAGAL shows dash for success and failed list with Belum terdaftar', () => {
        const results: StatusCheckResult[] = [
            { item: baseItem, state: 'GAGAL' },
            { item: { ...baseItem, nama: 'Siti', no_kjp: '1111' }, state: 'GAGAL' },
        ];

        const message = buildStatusSummaryMessage(results, dateIso);

        expect(message).toContain('✅ *SUKSES: 0 Data*');
        expect(message).toMatch(/✅ \*SUKSES: 0 Data\*[\s\S]*\n-/);
        expect(message).toContain('❌ *GAGAL: 2 Data*');
        expect(message).toContain('1. Jane Doe - Belum terdaftar');
        expect(message).toContain('2. Siti - Belum terdaftar');
    });

    test('mixed BERHASIL and GAGAL populates both sections', () => {
        const results: StatusCheckResult[] = [
            { item: baseItem, state: 'BERHASIL' },
            { item: { ...baseItem, nama: 'Andi', no_kjp: '2222' }, state: 'GAGAL' },
        ];

        const message = buildStatusSummaryMessage(results, dateIso);

        expect(message).toContain('✅ *SUKSES: 1 Data*');
        expect(message).toContain('1. Jane Doe (1234567890)');
        expect(message).toContain('❌ *GAGAL: 1 Data*');
        expect(message).toContain('1. Andi - Belum terdaftar');
    });

    test('includes error section when ERROR results exist', () => {
        const results: StatusCheckResult[] = [
            { item: baseItem, state: 'ERROR' },
            { item: { ...baseItem, nama: 'Lala', no_kjp: '3333' }, state: 'ERROR' },
        ];

        const message = buildStatusSummaryMessage(results, dateIso);

        expect(message).toContain('⚠️ *PERLU DI CEK ULANG: 2 Data*');
        expect(message).toContain('1. Jane Doe - Sedang ada kendala, mohon ulangi dalam beberapa menit.');
        expect(message).toContain('2. Lala - Sedang ada kendala, mohon ulangi dalam beberapa menit.');
    });

    test('empty results show zero counts and dashes', () => {
        const message = buildStatusSummaryMessage([], dateIso);

        expect(message).toContain('✅ *SUKSES: 0 Data*');
        expect(message).toContain('❌ *GAGAL: 0 Data*');
        expect(message).toContain('LAPORAN HASIL PENDAFTARAN 23 April 2026');
        expect(message).toMatch(/SUKSES: 0 Data\*\n-\n\n❌ \*GAGAL: 0 Data\*\n-$/);
    });
});

describe('buildFailedDataCopyMessage', () => {
    test('returns null when there are no GAGAL results', () => {
        const results: StatusCheckResult[] = [
            { item: baseItem, state: 'BERHASIL' },
            { item: { ...baseItem, nama: 'Lala', no_kjp: '3333' }, state: 'ERROR' },
        ];

        const message = buildFailedDataCopyMessage(results);
        expect(message).toBeNull();
    });

    test('returns header and body for failed results with default KJP label when jenis_kartu null', () => {
        const failedItem: StatusCheckItem = { ...baseItem, jenis_kartu: null };
        const results: StatusCheckResult[] = [{ item: failedItem, state: 'GAGAL' }];

        const message = buildFailedDataCopyMessage(results);

        expect(message).not.toBeNull();
        expect(message?.header).toContain('DATA YANG BELUM BERHASIL');
        expect(message?.body).toContain('Jane Doe');
        expect(message?.body).toContain('KJP 1234567890');
        expect(message?.body).toContain('KTP 3201010101010001');
        expect(message?.body).toContain('KK  3201010101010002');
    });

    test('multiple failures are all listed separated by blank line', () => {
        const failedResults: StatusCheckResult[] = [
            { item: { ...baseItem, nama: 'Alpha', no_kjp: '111' }, state: 'GAGAL' },
            { item: { ...baseItem, nama: 'Beta', no_kjp: '222', no_ktp: '9876', no_kk: '5432', jenis_kartu: 'kjp plus' }, state: 'GAGAL' },
        ];

        const message = buildFailedDataCopyMessage(failedResults);

        expect(message?.body).toContain('Alpha');
        expect(message?.body).toContain('KJP 111');
        expect(message?.body).toContain('Beta');
        expect(message?.body).toContain('KJP PLUS 222');
        expect(message?.body).toMatch(/Alpha[\s\S]*KK  3201010101010002\n\nBeta/);
    });
});
