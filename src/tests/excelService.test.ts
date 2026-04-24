import { describe, it, expect, mock } from 'bun:test';
import { Buffer } from 'node:buffer';
import XLSX from 'xlsx-js-style';

mock.module('../utils/cardType', () => ({
    resolveCardTypeLabel: (noKjp: string, jenisKartu?: string | null) => jenisKartu || 'KJP'
}));

const { generateKJPExcel } = await import('../services/excelService');

function parseExcelBuffer(buffer: Buffer): any[][] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1 });
}

function createDataItem(overrides: any = {}) {
    return {
        nama: 'BUDI SANTOSO',
        no_kjp: '5049488500001234',
        no_ktp: '3171234567890123',
        no_kk: '3171098765432109',
        jenis_kartu: 'KJP',
        tanggal_lahir: null,
        lokasi: null,
        sender_name: null,
        ...overrides,
    };
}

const expectedHeader = ["No", "Nama", "Jenis Kartu", "No Kartu", "No KTP", "No KK", "Tgl Lahir", "Lokasi"];

describe('generateKJPExcel', () => {
    it('returns valid XLSX with header row only when data is empty', () => {
        const buffer = generateKJPExcel([]);

        expect(Buffer.isBuffer(buffer)).toBe(true);

        const rows = parseExcelBuffer(buffer);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(expectedHeader);
    });

    it('uses specific DHARMAJAYA lokasi when provided as detailed string', () => {
        const item = createDataItem({ lokasi: 'DHARMAJAYA - Duri Kosambi' });
        const rows = parseExcelBuffer(generateKJPExcel([item]));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows[1]).toEqual([
            1,
            'BUDI SANTOSO',
            'KJP',
            '5049488500001234',
            '3171234567890123',
            '3171098765432109',
            '-',
            'DHARMAJAYA - Duri Kosambi'
        ]);
        expect(rows[1][7]).toBe('DHARMAJAYA - Duri Kosambi');
    });

    it('maps bare DHARMAJAYA to default DHARMAJAYA DURI KOSAMBI', () => {
        const item = createDataItem({ lokasi: 'DHARMAJAYA' });
        const rows = parseExcelBuffer(generateKJPExcel([item]));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows[1]).toEqual([
            1,
            'BUDI SANTOSO',
            'KJP',
            '5049488500001234',
            '3171234567890123',
            '3171098765432109',
            '-',
            'DHARMAJAYA DURI KOSAMBI'
        ]);
        expect(rows[1][7]).toBe('DHARMAJAYA DURI KOSAMBI');
    });

    it('uses PASARJAYA detailed lokasi as-is', () => {
        const item = createDataItem({ lokasi: 'PASARJAYA - Jakgrosir Kedoya' });
        const rows = parseExcelBuffer(generateKJPExcel([item]));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows[1]).toEqual([
            1,
            'BUDI SANTOSO',
            'KJP',
            '5049488500001234',
            '3171234567890123',
            '3171098765432109',
            '-',
            'PASARJAYA - Jakgrosir Kedoya'
        ]);
        expect(rows[1][7]).toBe('PASARJAYA - Jakgrosir Kedoya');
    });

    it('keeps FOOD STATION lokasi and does not fallback to DHARMAJAYA default', () => {
        const item = createDataItem({ lokasi: 'FOOD STATION' });
        const rows = parseExcelBuffer(generateKJPExcel([item]));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows[1]).toEqual([
            1,
            'BUDI SANTOSO',
            'KJP',
            '5049488500001234',
            '3171234567890123',
            '3171098765432109',
            '-',
            'FOOD STATION'
        ]);
        expect(rows[1][7]).toBe('FOOD STATION');
        expect(rows[1][7]).not.toBe('DHARMAJAYA DURI KOSAMBI');
    });

    it('falls back to PASARJAYA when lokasi is empty and tanggal_lahir exists', () => {
        const item = createDataItem({ lokasi: null, tanggal_lahir: '2012-08-17' });
        const rows = parseExcelBuffer(generateKJPExcel([item]));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows[1]).toEqual([
            1,
            'BUDI SANTOSO',
            'KJP',
            '5049488500001234',
            '3171234567890123',
            '3171098765432109',
            '17/08/2012',
            'PASARJAYA'
        ]);
        expect(rows[1][7]).toBe('PASARJAYA');
    });

    it('falls back to DHARMAJAYA DURI KOSAMBI when lokasi and tanggal_lahir are missing', () => {
        const item = createDataItem({ lokasi: null, tanggal_lahir: null });
        const rows = parseExcelBuffer(generateKJPExcel([item]));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows[1]).toEqual([
            1,
            'BUDI SANTOSO',
            'KJP',
            '5049488500001234',
            '3171234567890123',
            '3171098765432109',
            '-',
            'DHARMAJAYA DURI KOSAMBI'
        ]);
        expect(rows[1][7]).toBe('DHARMAJAYA DURI KOSAMBI');
    });

    it('handles mixed providers and applies correct lokasi per row', () => {
        const items = [
            createDataItem({ nama: 'ROW A', lokasi: 'DHARMAJAYA - Duri Kosambi' }),
            createDataItem({ nama: 'ROW B', lokasi: 'DHARMAJAYA' }),
            createDataItem({ nama: 'ROW C', lokasi: 'PASARJAYA - Jakgrosir Kedoya' }),
            createDataItem({ nama: 'ROW D', lokasi: 'FOOD STATION' }),
            createDataItem({ nama: 'ROW E', lokasi: null, tanggal_lahir: '2011-01-01' }),
            createDataItem({ nama: 'ROW F', lokasi: null, tanggal_lahir: null }),
        ];

        const rows = parseExcelBuffer(generateKJPExcel(items));

        expect(rows[0]).toEqual(expectedHeader);
        expect(rows).toHaveLength(1 + items.length);

        const lokasiValues = rows.slice(1).map((row) => row[7]);
        expect(lokasiValues).toEqual([
            'DHARMAJAYA - Duri Kosambi',
            'DHARMAJAYA DURI KOSAMBI',
            'PASARJAYA - Jakgrosir Kedoya',
            'FOOD STATION',
            'PASARJAYA',
            'DHARMAJAYA DURI KOSAMBI',
        ]);
    });
});
