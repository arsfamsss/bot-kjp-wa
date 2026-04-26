import { describe, test, expect, mock } from 'bun:test';
import type { ItemError, LogItem, LogJson, LogStats, ParsedFields } from '../types';
import type { ValidItemDetail } from '../recap';

mock.module('../recap', () => ({
    extractChildName: (fullName: string) => fullName.split('(')[0]?.trim() || fullName,
}));

const { buildReplyForNewData } = await import('../reply');

function createLogItem(
    overrides: Partial<LogItem> & { parsed?: Partial<ParsedFields> } = {}
): LogItem {
    const parsed: ParsedFields = {
        nama: 'Siti Aminah',
        no_kjp: '5049488500000001',
        no_ktp: '3174010101010001',
        no_kk: '3174010101010001',
        ...overrides.parsed,
    };

    return {
        index: 1,
        raw_lines: ['Siti Aminah', '5049488500000001', '3174010101010001', '3174010101010001'],
        status: 'OK',
        errors: [],
        duplicate_info: null,
        parsed,
        ...overrides,
        parsed,
        errors: overrides.errors ?? [],
        duplicate_info: overrides.duplicate_info ?? null,
    };
}

function createLogJson(
    overrides: Partial<LogJson> & { stats?: Partial<LogStats>; items?: LogItem[] } = {}
): LogJson {
    const items = overrides.items ?? [createLogItem()];
    const computedStats: LogStats = {
        total_blocks: items.length,
        ok_count: items.filter((i) => i.status === 'OK').length,
        skip_format_count: items.filter((i) => i.status === 'SKIP_FORMAT').length,
        skip_duplicate_count: items.filter((i) => i.status === 'SKIP_DUPLICATE').length,
    };

    return {
        message_id: 'msg-1',
        sender_phone: '6281234567890',
        received_at: '2026-04-24T10:00:00.000Z',
        tanggal: '2026-04-24',
        processing_day_key: '2026-04-24',
        stats: {
            ...computedStats,
            ...overrides.stats,
        },
        items,
        ...overrides,
        items,
    };
}

describe('buildReplyForNewData', () => {
    test('builds success message when all items are OK and no remainder', () => {
        const log = createLogJson({
            items: [
                createLogItem({ parsed: { nama: 'Ani' } }),
                createLogItem({ index: 2, parsed: { nama: 'Budi', no_kjp: '5049488500000002' } }),
            ],
        });

        const reply = buildReplyForNewData(log);

        expect(reply).toContain('DATA BERHASIL DISIMPAN');
        expect(reply).toContain('Data Baru Diterima: 2 Orang');
        expect(reply).toContain('✅ *Ani*');
        expect(reply).toContain('✅ *Budi*');
    });

    test('includes card type in parentheses for successful items', () => {
        const log = createLogJson({
            items: [createLogItem({ parsed: { nama: 'Cici', jenis_kartu: 'KJP' } })],
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('🆔 5049488500000001 (KJP)');
    });

    test("shows 'jenis disesuaikan otomatis' warning when jenis_kartu_sumber is koreksi", () => {
        const log = createLogJson({
            items: [
                createLogItem({
                    parsed: {
                        nama: 'Dedi',
                        jenis_kartu: 'KJP',
                        jenis_kartu_sumber: 'koreksi',
                    },
                }),
            ],
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('jenis disesuaikan otomatis');
    });

    test('shows warning section for duplicate name errors on OK items', () => {
        const duplicateNameError: ItemError = {
            field: 'nama',
            type: 'duplicate',
            detail: 'Nama mirip dengan data sebelumnya',
        };
        const log = createLogJson({
            items: [createLogItem({ parsed: { nama: 'Eka' }, errors: [duplicateNameError] })],
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('PERINGATAN CEK NAMA');
        expect(reply).toContain('⚠️ Eka → Nama mirip dengan data sebelumnya');
    });

    test('uses totalDataToday when provided', () => {
        const log = createLogJson();

        const reply = buildReplyForNewData(log, 12);
        expect(reply).toContain('🔥 Total: *12 Orang*');
    });

    test('shows registered-today list when allDataTodayItems is provided', () => {
        const log = createLogJson();
        const allDataTodayItems: ValidItemDetail[] = [
            {
                nama: 'Fajar',
                no_kjp: '5049488500000100',
                no_ktp: '3174010101010100',
                no_kk: '3174010101010100',
                jenis_kartu: 'LANSIA',
                lokasi: 'PASARJAYA - Kramat Jati',
            },
            {
                nama: 'Gina',
                no_kjp: '5049488500000101',
                no_ktp: '3174010101010101',
                no_kk: '3174010101010101',
            },
        ];

        const reply = buildReplyForNewData(log, undefined, undefined, allDataTodayItems);

        expect(reply).toContain('🔥 Total: *2 Orang*');
        expect(reply).toContain('1. *Fajar*');
        expect(reply).toContain('└ 5049488500000100 (LANSIA) 📍 Kramat Jati');
        expect(reply).toContain('2. *Gina*');
    });

    test('handles empty items array gracefully', () => {
        const log = createLogJson({
            items: [],
            stats: {
                total_blocks: 0,
                ok_count: 0,
                skip_format_count: 0,
                skip_duplicate_count: 0,
            },
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('DATA BERHASIL DISIMPAN');
        expect(reply).toContain('Data Baru Diterima: 0 Orang');
    });

    test('uses correct wording for a single successful item', () => {
        const log = createLogJson({
            items: [createLogItem({ parsed: { nama: 'Hana' } })],
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('Data Baru Diterima: 1 Orang');
    });

    test('builds failure message with details when all items fail', () => {
        const failedItem = createLogItem({
            status: 'SKIP_FORMAT',
            parsed: { nama: 'Iwan', no_kjp: '123' },
            errors: [{ field: 'no_kjp', type: 'invalid_length', detail: 'Nomor tidak valid' }],
        });
        const log = createLogJson({
            items: [failedItem],
            stats: {
                total_blocks: 1,
                ok_count: 0,
                skip_format_count: 1,
                skip_duplicate_count: 0,
            },
        });

        const reply = buildReplyForNewData(log);

        expect(reply).toContain('Data belum bisa diproses');
        expect(reply).toContain('❌ *Iwan*');
        expect(reply).toContain('Kartu kurang 13 angka, minimal 16 angka.');
    });

    test('builds mixed message when there are successful and failed items', () => {
        const ok = createLogItem({ parsed: { nama: 'Joko' } });
        const failed = createLogItem({
            index: 2,
            status: 'SKIP_FORMAT',
            parsed: { nama: 'Kiki' },
            errors: [{ field: 'nama', type: 'required', detail: 'Nama wajib diisi' }],
        });
        const log = createLogJson({ items: [ok, failed] });

        const reply = buildReplyForNewData(log, 3);

        expect(reply).toContain('Ada yang perlu diperbaiki');
        expect(reply).toContain('✅ Masuk: *1 orang*');
        expect(reply).toContain('❌ Perlu cek: *1 data*');
        expect(reply).toContain('Total hari ini: *3 orang*');
        expect(reply).toContain('Yang sudah masuk');
        expect(reply).toContain('1. Joko');
        expect(reply).toContain('❌ *Kiki*');
        expect(reply).toContain('→ Nama kosong');
    });

    test('shows remainder warning when there are extra incomplete lines', () => {
        const log = createLogJson({
            items: [createLogItem()],
            failed_remainder_lines: ['baris 1', 'baris 2'],
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('Data tidak lengkap');
        expect(reply).toContain('Kurang baris (harus 4 baris/orang)');
    });

    test('uses 5-line expectation for PASARJAYA remainder context', () => {
        const log = createLogJson({
            items: [createLogItem()],
            failed_remainder_lines: ['sisa'],
        });

        const reply = buildReplyForNewData(log, undefined, 'PASARJAYA');
        expect(reply).toContain('Kurang baris (harus 5 baris/orang)');
    });

    test('uses 4-line expectation for FOODSTATION remainder context', () => {
        const log = createLogJson({
            items: [createLogItem()],
            failed_remainder_lines: ['sisa'],
        });

        const reply = buildReplyForNewData(log, undefined, 'FOODSTATION');
        expect(reply).toContain('Kurang baris (harus 4 baris/orang)');
    });

    test('uses 4-line expectation for DHARMAJAYA remainder context', () => {
        const log = createLogJson({
            items: [createLogItem()],
            failed_remainder_lines: ['sisa'],
        });

        const reply = buildReplyForNewData(log, undefined, 'DHARMAJAYA');
        expect(reply).toContain('Kurang baris (harus 4 baris/orang)');
    });

    test('shows blocked location message for blocked_location errors', () => {
        const blocked = createLogItem({
            status: 'SKIP_FORMAT',
            parsed: { nama: 'Lina', lokasi: 'PASARJAYA - Kedoya' },
            errors: [{ field: 'lokasi', type: 'blocked_location', detail: 'Lokasi penuh' }],
        });
        const log = createLogJson({
            items: [blocked],
            stats: {
                total_blocks: 1,
                ok_count: 0,
                skip_format_count: 1,
                skip_duplicate_count: 0,
            },
        });

        const reply = buildReplyForNewData(log, undefined, 'PASARJAYA');
        expect(reply).toContain('lokasi *Kedoya* sedang penuh');
    });

    test('shows duplicate safe message for SKIP_DUPLICATE items', () => {
        const duplicateItem = createLogItem({
            status: 'SKIP_DUPLICATE',
            parsed: { nama: 'Mira' },
            duplicate_info: {
                kind: 'NO_KJP',
                processing_day_key: '2026-04-24',
                safe_message: '   → Sudah terdaftar hari ini',
            },
        });
        const log = createLogJson({
            items: [duplicateItem],
            stats: {
                total_blocks: 1,
                ok_count: 0,
                skip_format_count: 0,
                skip_duplicate_count: 1,
            },
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('❌ *Mira*');
        expect(reply).toContain('Sudah terdaftar hari ini');
    });

    test('shows admin contact line when duplicate conflicts with another WhatsApp number', () => {
        const conflictItem = createLogItem({
            status: 'SKIP_DUPLICATE',
            parsed: { nama: 'Nina' },
            duplicate_info: {
                kind: 'NO_KTP',
                processing_day_key: '2026-04-24',
                safe_message: 'Data sudah dipakai nomor WA lain',
            },
        });
        const log = createLogJson({
            items: [conflictItem],
            stats: {
                total_blocks: 1,
                ok_count: 0,
                skip_format_count: 0,
                skip_duplicate_count: 1,
            },
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('Silakan hubungi Admin');
    });

    test('always ends failure/partial flows with CEK guidance', () => {
        const failedItem = createLogItem({
            status: 'SKIP_FORMAT',
            parsed: { nama: 'Oki' },
            errors: [{ field: 'no_kk', type: 'required', detail: 'KK wajib ada' }],
        });
        const log = createLogJson({
            items: [failedItem],
            stats: {
                total_blocks: 1,
                ok_count: 0,
                skip_format_count: 1,
                skip_duplicate_count: 0,
            },
        });

        const reply = buildReplyForNewData(log);
        expect(reply).toContain('Ketik CEK untuk lihat data 👀');
    });
});
