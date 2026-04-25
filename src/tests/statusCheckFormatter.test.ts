import { describe, test, expect } from 'bun:test';
import {
    convertDateToDisplay,
    buildPasarjayaStatusSummary,
    buildPasarjayaFailedCopy,
    buildFoodStationStatusSummary,
    buildFoodStationFailedCopy,
} from '../services/statusCheckFormatter';
import { PasarjayaStatusCheckResult } from '../services/pasarjayaStatusCheck';
import { FoodStationStatusCheckResult } from '../services/foodStationStatusCheck';

function makePasarjayaResult(
    state: 'BERHASIL' | 'GAGAL' | 'ERROR',
    detail?: PasarjayaStatusCheckResult['detail'],
): PasarjayaStatusCheckResult {
    return {
        item: {
            nama: 'Test Anak',
            no_kjp: '5049488500001234',
            no_ktp: '3171234567890123',
            no_kk: '3171098765432109',
            tanggal_lahir: '1975-08-15',
        },
        state,
        detail,
    };
}

function makeFoodStationResult(
    state: 'BERHASIL' | 'GAGAL' | 'ERROR',
    detail?: FoodStationStatusCheckResult['detail'],
): FoodStationStatusCheckResult {
    return {
        item: {
            nama: 'Test Anak FS',
            no_kjp: '5049488500005678',
            no_ktp: '3171234567890456',
            no_kk: '3171098765432999',
        },
        state,
        detail,
    };
}

describe('convertDateToDisplay', () => {
    test('converts YYYY-MM-DD to DD-MM-YYYY', () => {
        expect(convertDateToDisplay('1975-08-15')).toBe('15-08-1975');
    });
});

describe('buildPasarjayaStatusSummary', () => {
    test('mixed results include PASARJAYA header, sukses details, gagal and error sections', () => {
        const results: PasarjayaStatusCheckResult[] = [
            makePasarjayaResult('BERHASIL', {
                lokasi: 'Jakgrosir Kedoya',
                tanggalPengambilan: '2026-04-25',
                nomorUrut: '17',
            }),
            {
                ...makePasarjayaResult('GAGAL'),
                item: {
                    ...makePasarjayaResult('GAGAL').item,
                    nama: 'Gagal Satu',
                },
            },
            {
                ...makePasarjayaResult('ERROR'),
                item: {
                    ...makePasarjayaResult('ERROR').item,
                    nama: 'Error Satu',
                },
            },
        ];

        const summary = buildPasarjayaStatusSummary(results, '2026-04-25');

        expect(summary).toContain('PASARJAYA');
        expect(summary).toContain('📍 Lokasi: Jakgrosir Kedoya');
        expect(summary).toContain('📅 Tgl Pengambilan: 2026-04-25');
        expect(summary).toContain('🔢 No Urut: 17');
        expect(summary).toContain('Belum terdaftar');
        expect(summary).toContain('Sedang ada kendala');
    });

    test('all sukses does not include failed or error entries', () => {
        const results: PasarjayaStatusCheckResult[] = [
            makePasarjayaResult('BERHASIL', {
                lokasi: 'Pasar Cempaka Putih',
                tanggalPengambilan: '2026-04-26',
                nomorUrut: '9',
            }),
            {
                ...makePasarjayaResult('BERHASIL', {
                    lokasi: 'Pasar Senen',
                    tanggalPengambilan: '2026-04-26',
                    nomorUrut: '10',
                }),
                item: {
                    ...makePasarjayaResult('BERHASIL').item,
                    nama: 'Sukses Dua',
                },
            },
        ];

        const summary = buildPasarjayaStatusSummary(results, '2026-04-26');

        expect(summary).toContain('✅ *SUKSES: 2 Data*');
        expect(summary).not.toContain('Belum terdaftar');
        expect(summary).not.toContain('⚠️ *PERLU DI CEK ULANG');
    });

    test('empty results show dash for sukses and gagal sections', () => {
        const summary = buildPasarjayaStatusSummary([], '2026-04-27');

        expect(summary).toContain('✅ *SUKSES: 0 Data*');
        expect(summary).toContain('❌ *GAGAL: 0 Data*');
        expect(summary).toMatch(/✅ \*SUKSES: 0 Data\*\n-\n\n❌ \*GAGAL: 0 Data\*\n-$/);
    });
});

describe('buildPasarjayaFailedCopy', () => {
    test('includes tanggal lahir (DD-MM-YYYY) when tanggal_lahir exists', () => {
        const results: PasarjayaStatusCheckResult[] = [
            makePasarjayaResult('GAGAL'),
        ];

        const copy = buildPasarjayaFailedCopy(results);

        expect(copy).not.toBeNull();
        expect(copy?.body).toContain('Test Anak');
        expect(copy?.body).toContain('KJP 5049488500001234');
        expect(copy?.body).toContain('KTP 3171234567890123');
        expect(copy?.body).toContain('KK 3171098765432109');
        expect(copy?.body).toContain('Tanggal Lahir 15-08-1975');
    });

    test('does not include tanggal lahir line when tanggal_lahir is null', () => {
        const result = makePasarjayaResult('GAGAL');
        const results: PasarjayaStatusCheckResult[] = [
            {
                ...result,
                item: {
                    ...result.item,
                    tanggal_lahir: null,
                },
            },
        ];

        const copy = buildPasarjayaFailedCopy(results);

        expect(copy).not.toBeNull();
        expect(copy?.body).not.toContain('Tanggal Lahir');
    });

    test('returns null when all results are sukses', () => {
        const results: PasarjayaStatusCheckResult[] = [
            makePasarjayaResult('BERHASIL'),
            {
                ...makePasarjayaResult('BERHASIL'),
                item: {
                    ...makePasarjayaResult('BERHASIL').item,
                    nama: 'Sukses Lain',
                },
            },
        ];

        expect(buildPasarjayaFailedCopy(results)).toBeNull();
    });
});

describe('buildFoodStationStatusSummary', () => {
    test('mixed results include FOODSTATION header, sukses pickup details, and gagal section', () => {
        const results: FoodStationStatusCheckResult[] = [
            makeFoodStationResult('BERHASIL', {
                tanggalPengambilan: '25-04-2026',
                jamPengambilan: '08.00 - 10.00 WIB',
            }),
            {
                ...makeFoodStationResult('GAGAL'),
                item: {
                    ...makeFoodStationResult('GAGAL').item,
                    nama: 'FS Gagal',
                },
            },
        ];

        const summary = buildFoodStationStatusSummary(results, '2026-04-25');

        expect(summary).toContain('FOODSTATION');
        expect(summary).toContain('📅 Tgl Pengambilan: 25-04-2026');
        expect(summary).toContain('🕐 Jam: 08.00 - 10.00 WIB');
        expect(summary).toContain('Belum terdaftar');
    });
});

describe('buildFoodStationFailedCopy', () => {
    test('formats failed copy without tanggal lahir', () => {
        const results: FoodStationStatusCheckResult[] = [
            makeFoodStationResult('GAGAL'),
        ];

        const copy = buildFoodStationFailedCopy(results);

        expect(copy).not.toBeNull();
        expect(copy?.body).toContain('Test Anak FS');
        expect(copy?.body).toContain('KJP 5049488500005678');
        expect(copy?.body).toContain('KTP 3171234567890456');
        expect(copy?.body).toContain('KK 3171098765432999');
        expect(copy?.body).not.toContain('Tanggal Lahir');
    });

    test('returns null when all results are sukses', () => {
        const results: FoodStationStatusCheckResult[] = [
            makeFoodStationResult('BERHASIL'),
        ];

        expect(buildFoodStationFailedCopy(results)).toBeNull();
    });
});
