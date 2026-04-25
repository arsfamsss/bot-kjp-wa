import { beforeEach, describe, expect, test, mock } from 'bun:test';
import type { LogItem } from '../types';

mock.restore();

type MockQueryResult = {
    data: any;
    error: any;
    count?: number | null;
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

function setTableResult(table: string, data: any, error: any = null, count?: number | null): void {
    tableResults.set(table, { data, error, count: count !== undefined ? count : null });
}

const mockChain = new Proxy({} as any, {
    get(_target, prop) {
        if (prop === 'then') {
            return (resolve: (value: any) => void, _reject?: (reason?: any) => void) => {
                resolve({
                    data: mockQueryResult.data,
                    error: mockQueryResult.error,
                    count: mockQueryResult.count,
                });
            };
        }
        if (prop === 'data') return mockQueryResult.data;
        if (prop === 'error') return mockQueryResult.error;
        if (prop === 'count') return mockQueryResult.count;

        return (..._args: any[]) => mockChain;
    },
});

const mockSupabaseClient = {
    from: (table: string) => {
        currentTable = table;
        fromCalls.push(table);
        const tableResult = tableResults.get(table) || { data: [], error: null, count: null };
        mockQueryResult = tableResult;
        return mockChain;
    },
};

mock.module('@supabase/supabase-js', () => ({
    createClient: () => mockSupabaseClient,
}));

async function loadModule() {
    moduleSeq += 1;
    return import(`../supabase.ts?blocked-ktp-test=${moduleSeq}`);
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

describe('blocked KTP dual type', () => {
    beforeEach(() => {
        resetMockState();
    });

    describe('cleanupBlockedKtpAtEndOfMonthWib (via getBlockedKtpList trigger)', () => {
        test('permanent block survives cleanup — only temporary blocks are deleted', async () => {
            const { getBlockedKtpList } = await loadModule();

            const now = new Date();
            const oldDate = new Date('2025-01-15T10:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '1111111111111111', reason: 'Fraud', block_type: 'permanent', created_at: oldDate },
                { no_ktp: '2222222222222222', reason: 'Bulanan', block_type: 'temporary', created_at: now.toISOString() },
            ]);

            const result = await getBlockedKtpList(50);

            expect(result.some(r => r.no_ktp === '1111111111111111')).toBe(true);
            expect(result.some(r => r.no_ktp === '2222222222222222')).toBe(true);
        });

        test('temporary block from previous month is filtered out by getBlockedKtpList', async () => {
            const { getBlockedKtpList } = await loadModule();

            const oldDate = new Date('2025-01-15T10:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '1111111111111111', reason: 'Fraud', block_type: 'permanent', created_at: oldDate },
                { no_ktp: '2222222222222222', reason: 'Bulanan', block_type: 'temporary', created_at: oldDate },
            ]);

            const result = await getBlockedKtpList(50);

            expect(result.some(r => r.no_ktp === '1111111111111111')).toBe(true);
            expect(result.some(r => r.no_ktp === '2222222222222222')).toBe(false);
        });
    });

    describe('checkBlockedKtpBatch', () => {
        test('permanent block detected with correct detail string', async () => {
            const { checkBlockedKtpBatch } = await loadModule();

            const oldDate = new Date('2025-01-15T10:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '3171234567890123', reason: 'Fraud', block_type: 'permanent', created_at: oldDate },
            ]);

            const item = createLogItem();
            const [result] = await checkBlockedKtpBatch([item]);

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual({
                field: 'no_ktp',
                type: 'ktp_blocked',
                detail: 'KTP tidak dapat digunakan, silahkan ganti KTP lain',
            });
        });

        test('temporary block (current month) detected with correct detail string', async () => {
            const { checkBlockedKtpBatch } = await loadModule();

            const now = new Date();
            setTableResult('blocked_ktp', [
                { no_ktp: '3171234567890123', reason: 'Bulanan', block_type: 'temporary', created_at: now.toISOString() },
            ]);

            const item = createLogItem();
            const [result] = await checkBlockedKtpBatch([item]);

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual({
                field: 'no_ktp',
                type: 'ktp_blocked',
                detail: 'KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini',
            });
        });

        test('temporary block from last month is NOT detected', async () => {
            const { checkBlockedKtpBatch } = await loadModule();

            const oldDate = new Date('2025-01-15T10:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '3171234567890123', reason: 'Bulanan', block_type: 'temporary', created_at: oldDate },
            ]);

            const item = createLogItem();
            const [result] = await checkBlockedKtpBatch([item]);

            expect(result.status).toBe('OK');
            expect(result.errors).toHaveLength(0);
        });

        test('permanent block with old created_at still detected', async () => {
            const { checkBlockedKtpBatch } = await loadModule();

            const veryOldDate = new Date('2024-06-01T00:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '3171234567890123', reason: 'Permanen', block_type: 'permanent', created_at: veryOldDate },
            ]);

            const item = createLogItem();
            const [result] = await checkBlockedKtpBatch([item]);

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors[0].detail).toBe('KTP tidak dapat digunakan, silahkan ganti KTP lain');
        });

        test('undefined block_type treated as temporary (backward compat)', async () => {
            const { checkBlockedKtpBatch } = await loadModule();

            const now = new Date();
            setTableResult('blocked_ktp', [
                { no_ktp: '3171234567890123', reason: 'Bulanan', created_at: now.toISOString() },
            ]);

            const item = createLogItem();
            const [result] = await checkBlockedKtpBatch([item]);

            expect(result.status).toBe('SKIP_FORMAT');
            expect(result.errors[0].detail).toBe('KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini');
        });
    });

    describe('getBlockedKtpList', () => {
        test('returns permanent records regardless of creation date', async () => {
            const { getBlockedKtpList } = await loadModule();

            const oldDate = new Date('2024-01-15T10:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '1111111111111111', reason: 'Fraud', block_type: 'permanent', created_at: oldDate },
            ]);

            const result = await getBlockedKtpList(50);

            expect(result).toHaveLength(1);
            expect(result[0].no_ktp).toBe('1111111111111111');
            expect(result[0].block_type).toBe('permanent');
        });

        test('returns temporary records only from current month', async () => {
            const { getBlockedKtpList } = await loadModule();

            const now = new Date();
            setTableResult('blocked_ktp', [
                { no_ktp: '2222222222222222', reason: 'Bulanan', block_type: 'temporary', created_at: now.toISOString() },
            ]);

            const result = await getBlockedKtpList(50);

            expect(result).toHaveLength(1);
            expect(result[0].no_ktp).toBe('2222222222222222');
        });

        test('filters out temporary records from previous months', async () => {
            const { getBlockedKtpList } = await loadModule();

            const oldDate = new Date('2024-06-15T10:00:00Z').toISOString();
            setTableResult('blocked_ktp', [
                { no_ktp: '3333333333333333', reason: 'Bulanan', block_type: 'temporary', created_at: oldDate },
            ]);

            const result = await getBlockedKtpList(50);

            expect(result).toHaveLength(0);
        });
    });

    describe('addBlockedKtp', () => {
        test('add permanent block → record has block_type permanent, correct message', async () => {
            const { addBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', null);

            const result = await addBlockedKtp('3171234567890123', 'Fraud', 'permanent');

            expect(result.success).toBe(true);
            expect(result.message).toContain('permanen');
            expect(result.message).toContain('3171234567890123');
        });

        test('add temporary block → record has block_type temporary, correct message', async () => {
            const { addBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', null);

            const result = await addBlockedKtp('3171234567890123', 'Bulanan', 'temporary');

            expect(result.success).toBe(true);
            expect(result.message).toContain('sementara');
            expect(result.message).toContain('3171234567890123');
        });

        test('upsert with different type → warning message about type change', async () => {
            const { addBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', { block_type: 'permanent' });

            const result = await addBlockedKtp('3171234567890123', 'Changed', 'temporary');

            expect(result.success).toBe(true);
            expect(result.message).toContain('sudah diblokir');
            expect(result.message).toContain('permanen');
            expect(result.message).toContain('sementara');
        });

        test('default blockType is temporary', async () => {
            const { addBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', null);

            const result = await addBlockedKtp('3171234567890123', 'Bulanan');

            expect(result.success).toBe(true);
            expect(result.message).toContain('sementara');
        });

        test('invalid KTP (not 16 digits) returns error', async () => {
            const { addBlockedKtp } = await loadModule();

            const result = await addBlockedKtp('12345', 'Test');

            expect(result.success).toBe(false);
            expect(result.message).toBe('No KTP harus 16 digit.');
        });
    });

    describe('removeBlockedKtp', () => {
        test('remove permanent block → message includes "permanen"', async () => {
            const { removeBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', { block_type: 'permanent' }, null, 1);

            const result = await removeBlockedKtp('3171234567890123');

            expect(result.success).toBe(true);
            expect(result.message).toContain('permanen');
            expect(result.message).toContain('3171234567890123');
        });

        test('remove temporary block → message includes "sementara"', async () => {
            const { removeBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', { block_type: 'temporary' }, null, 1);

            const result = await removeBlockedKtp('3171234567890123');

            expect(result.success).toBe(true);
            expect(result.message).toContain('sementara');
            expect(result.message).toContain('3171234567890123');
        });

        test('remove non-existent KTP → existing error message unchanged', async () => {
            const { removeBlockedKtp } = await loadModule();

            setTableResult('blocked_ktp', null, null, 0);

            const result = await removeBlockedKtp('3171234567890123');

            expect(result.success).toBe(false);
            expect(result.message).toContain('tidak ditemukan');
        });
    });

    describe('changeBlockedKtpType', () => {
        test('change permanent → temporary: block_type changed + created_at updated', async () => {
            const { changeBlockedKtpType } = await loadModule();

            setTableResult('blocked_ktp', { block_type: 'permanent', no_ktp: '3171234567890123' });

            const result = await changeBlockedKtpType('3171234567890123', 'temporary');

            expect(result.success).toBe(true);
            expect(result.message).toContain('Sementara');
            expect(result.message).toContain('berhasil diubah');
        });

        test('change temporary → permanent: block_type changed + created_at NOT changed', async () => {
            const { changeBlockedKtpType } = await loadModule();

            setTableResult('blocked_ktp', { block_type: 'temporary', no_ktp: '3171234567890123' });

            const result = await changeBlockedKtpType('3171234567890123', 'permanent');

            expect(result.success).toBe(true);
            expect(result.message).toContain('Permanen');
            expect(result.message).toContain('berhasil diubah');
        });

        test('change non-existent KTP → error message', async () => {
            const { changeBlockedKtpType } = await loadModule();

            setTableResult('blocked_ktp', null);

            const result = await changeBlockedKtpType('3171234567890123', 'permanent');

            expect(result.success).toBe(false);
            expect(result.message).toContain('tidak ditemukan');
        });

        test('change to same type → "sudah berstatus" message', async () => {
            const { changeBlockedKtpType } = await loadModule();

            setTableResult('blocked_ktp', { block_type: 'permanent', no_ktp: '3171234567890123' });

            const result = await changeBlockedKtpType('3171234567890123', 'permanent');

            expect(result.success).toBe(false);
            expect(result.message).toContain('sudah berstatus');
            expect(result.message).toContain('Permanen');
        });

        test('invalid KTP (not 16 digits) → validation error', async () => {
            const { changeBlockedKtpType } = await loadModule();

            const result = await changeBlockedKtpType('12345', 'permanent');

            expect(result.success).toBe(false);
            expect(result.message).toBe('No KTP harus 16 digit.');
        });
    });
});
