import { beforeEach, describe, expect, test, mock } from 'bun:test';
import type { LogItem } from '../types';

mock.restore();

type MockQueryResult = {
    data: any;
    error: any;
};

let moduleSeq = 0;
let fromCalls: string[] = [];
let currentTable: string | null = null;
let mockQueryResult: MockQueryResult = { data: [], error: null };
const tableResults = new Map<string, MockQueryResult>();

function resetMockState(): void {
    fromCalls = [];
    currentTable = null;
    mockQueryResult = { data: [], error: null };
    tableResults.clear();
}

function setTableResult(table: string, data: any, error: any = null): void {
    tableResults.set(table, { data, error });
}

const mockChain = new Proxy({} as any, {
    get(_target, prop) {
        if (prop === 'then') {
            return (resolve: (value: any) => void, _reject?: (reason?: any) => void) => {
                resolve({ data: mockQueryResult.data, error: mockQueryResult.error });
            };
        }
        if (prop === 'data') return mockQueryResult.data;
        if (prop === 'error') return mockQueryResult.error;

        return (..._args: any[]) => mockChain;
    },
});

const mockSupabaseClient = {
    from: (table: string) => {
        currentTable = table;
        fromCalls.push(table);
        const tableResult = tableResults.get(table) || { data: [], error: null };
        mockQueryResult = tableResult;
        return mockChain;
    },
};

mock.module('@supabase/supabase-js', () => ({
    createClient: () => mockSupabaseClient,
}));

async function loadSupabaseCrudModule() {
    moduleSeq += 1;
    return import(`../supabase.ts?supabase-crud-test=${moduleSeq}`);
}

function createLogItem(overrides?: Partial<LogItem>): LogItem {
    return {
        index: 0,
        raw_lines: ['Budi', '5049488500001234', '3171234567890123', '3171098765432109'],
        parsed: {
            nama: 'BUDI',
            no_kjp: '5049488500001234',
            no_ktp: '3171234567890123',
            no_kk: '3171098765432109',
            ...overrides?.parsed,
        },
        status: 'OK',
        errors: [],
        duplicate_info: null,
        ...overrides,
    };
}

describe('supabase CRUD batch checks', () => {
    beforeEach(() => {
        resetMockState();
    });

    describe('checkDuplicatesBatch', () => {
        const ctx = {
            processingDayKey: '2026-04-24',
            senderPhone: '6281234567890',
            tanggal: '2026-04-24',
        };

        test('no duplicates in DB returns all items with status OK', async () => {
            const { checkDuplicatesBatch } = await loadSupabaseCrudModule();

            setTableResult('data_harian', []);

            const items = [
                createLogItem({
                    index: 0,
                    parsed: {
                        nama: 'BUDI',
                        no_kjp: '5049488500001234',
                        no_ktp: '3171234567890123',
                        no_kk: '3171098765432109',
                    },
                }),
                createLogItem({
                    index: 1,
                    parsed: {
                        nama: 'SITI',
                        no_kjp: '5049488500009999',
                        no_ktp: '3171234567899999',
                        no_kk: '3171098765439999',
                    },
                }),
            ];

            const result = await checkDuplicatesBatch(items, ctx);

            expect(result).toHaveLength(2);
            expect(result.every((it) => it.status === 'OK')).toBe(true);
            expect(result.every((it) => it.duplicate_info === null)).toBe(true);
            expect(fromCalls.filter((table) => table === 'data_harian').length).toBe(2);
        });

        test('global duplicate KJP marks item as SKIP_DUPLICATE with kind NO_KJP', async () => {
            const { checkDuplicatesBatch } = await loadSupabaseCrudModule();

            setTableResult('data_harian', [
                {
                    nama: 'NAMA LAMA',
                    no_kjp: '5049488500001234',
                    no_ktp: '3170000000000000',
                    no_kk: '3171000000000000',
                    sender_phone: '6281111111111',
                },
            ]);

            const item = createLogItem();
            const [result] = await checkDuplicatesBatch([item], ctx);

            expect(result.status).toBe('SKIP_DUPLICATE');
            expect(result.duplicate_info?.kind).toBe('NO_KJP');
            expect(result.duplicate_info?.original_data?.no_kjp).toBe('5049488500001234');
        });

        test('global duplicate KTP marks item as SKIP_DUPLICATE with kind NO_KTP', async () => {
            const { checkDuplicatesBatch } = await loadSupabaseCrudModule();

            setTableResult('data_harian', [
                {
                    nama: 'NAMA LAMA',
                    no_kjp: '5049488500007777',
                    no_ktp: '3171234567890123',
                    no_kk: '3171000000000000',
                    sender_phone: '6281111111111',
                },
            ]);

            const item = createLogItem();
            const [result] = await checkDuplicatesBatch([item], ctx);

            expect(result.status).toBe('SKIP_DUPLICATE');
            expect(result.duplicate_info?.kind).toBe('NO_KTP');
            expect(result.duplicate_info?.original_data?.no_ktp).toBe('3171234567890123');
        });

        test('same sender duplicate name marks item as SKIP_DUPLICATE with kind NAME', async () => {
            const { checkDuplicatesBatch } = await loadSupabaseCrudModule();

            setTableResult('data_harian', [
                {
                    nama: 'BUDI',
                    no_kjp: '5049488500000001',
                    no_ktp: '3171999999999999',
                    no_kk: '3171888888888888',
                },
            ]);

            const item = createLogItem({
                parsed: {
                    nama: 'Budi',
                    no_kjp: '5049488500001234',
                    no_ktp: '3171234567890123',
                    no_kk: '3171098765432109',
                },
            });

            const [result] = await checkDuplicatesBatch([item], ctx);

            expect(result.status).toBe('SKIP_DUPLICATE');
            expect(result.duplicate_info?.kind).toBe('NAME');
            expect(result.duplicate_info?.original_data?.nama).toBe('BUDI');
        });

        test('items with non-OK status are skipped from duplicate checking', async () => {
            const { checkDuplicatesBatch } = await loadSupabaseCrudModule();

            const nonOkItem = createLogItem({ status: 'SKIP_FORMAT' });
            const result = await checkDuplicatesBatch([nonOkItem], ctx);

            expect(result).toEqual([nonOkItem]);
            expect(fromCalls.length).toBe(0);
        });

        test('DB error returns items unchanged', async () => {
            const { checkDuplicatesBatch } = await loadSupabaseCrudModule();

            setTableResult('data_harian', null, { message: 'db down', code: '500' });

            const item = createLogItem();
            const result = await checkDuplicatesBatch([item], ctx);

            expect(result).toEqual([item]);
            expect(fromCalls.filter((table) => table === 'data_harian').length).toBe(2);
        });
    });

    describe('checkBlockedKjpBatch', () => {
        test('no blocked KJP leaves items unchanged', async () => {
            const { checkBlockedKjpBatch } = await loadSupabaseCrudModule();

            setTableResult('blocked_kjp', []);

            const item = createLogItem();
            const result = await checkBlockedKjpBatch([item]);

            expect(result).toEqual([item]);
        });

        test('blocked KJP adds error and changes status', async () => {
            const { checkBlockedKjpBatch } = await loadSupabaseCrudModule();

            setTableResult('blocked_kjp', [{ no_kjp: '5049488500001234', reason: 'Duplikat' }]);

            const item = createLogItem();
            const [result] = await checkBlockedKjpBatch([item]);

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual({
                field: 'no_kjp',
                type: 'blocked_kjp',
                detail: 'Nomor KJP terblokir (Duplikat). Silakan ganti data lain.',
            });
        });
    });

    describe('checkBlockedKtpBatch', () => {
        test('no blocked KTP leaves items unchanged', async () => {
            const { checkBlockedKtpBatch } = await loadSupabaseCrudModule();

            setTableResult('blocked_ktp', []);

            const item = createLogItem();
            const result = await checkBlockedKtpBatch([item]);

            expect(result).toEqual([item]);
        });

        test('blocked KTP adds error and changes status', async () => {
            const { checkBlockedKtpBatch } = await loadSupabaseCrudModule();

            setTableResult('blocked_ktp', [{ no_ktp: '3171234567890123', reason: 'Bulanan' }]);

            const item = createLogItem();
            // Temporary hanya berlaku untuk Dharmajaya
            const [result] = await checkBlockedKtpBatch([item], 'DHARMAJAYA');

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual({
                field: 'no_ktp',
                type: 'ktp_blocked',
                detail: 'KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini',
            });
        });
    });

    describe('checkBlockedKkBatch', () => {
        test('no blocked KK leaves items unchanged', async () => {
            const { checkBlockedKkBatch } = await loadSupabaseCrudModule();

            setTableResult('blocked_kk', []);

            const item = createLogItem();
            const result = await checkBlockedKkBatch([item]);

            expect(result).toEqual([item]);
        });

        test('blocked KK adds error and changes status', async () => {
            const { checkBlockedKkBatch } = await loadSupabaseCrudModule();

            setTableResult('blocked_kk', [{ no_kk: '3171098765432109', reason: 'Invalid' }]);

            const item = createLogItem();
            const [result] = await checkBlockedKkBatch([item]);

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual({
                field: 'no_kk',
                type: 'blocked_kk',
                detail: 'Nomor KK terblokir (Invalid). Silakan ganti data lain.',
            });
        });
    });
});
