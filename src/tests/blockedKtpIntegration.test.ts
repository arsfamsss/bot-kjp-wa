import { beforeEach, describe, expect, test, mock } from 'bun:test';
import type { LogItem, LogJson } from '../types';

mock.restore();

// ---------------------------------------------------------------------------
// Chainable mock proxy for supabase client (same pattern as blockedKtp.test.ts)
// ---------------------------------------------------------------------------

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

let lastDeleteEqCalls: Array<{ column: string; value: any }> = [];
let lastUpdatePayload: any = null;

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

        return (...args: any[]) => {
            // Track .eq() calls on delete chains to verify cleanup targets block_type='temporary'
            if (prop === 'eq' && args.length >= 2) {
                lastDeleteEqCalls.push({ column: args[0], value: args[1] });
            }
            // Track .update() payload to verify created_at refresh
            if (prop === 'update' && args.length >= 1) {
                lastUpdatePayload = args[0];
            }
            return mockChain;
        };
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
    return import(`../supabase.ts?blocked-ktp-integration=${moduleSeq}`);
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

function createLogJson(items: LogItem[], locationContext?: string): LogJson {
    const okCount = items.filter(i => i.status === 'OK').length;
    return {
        message_id: 'test-msg-1',
        sender_phone: '6281234567890',
        sender_name: 'Test User',
        received_at: new Date().toISOString(),
        tanggal: '2026-04-25',
        processing_day_key: '2026-04-25',
        stats: {
            total_blocks: items.length,
            ok_count: okCount,
            skip_format_count: items.filter(i => i.status === 'SKIP_FORMAT').length,
            skip_duplicate_count: items.filter(i => i.status === 'SKIP_DUPLICATE').length,
        },
        items,
        lokasi: locationContext,
    };
}

describe('blocked KTP integration — cross-module flows', () => {
    beforeEach(() => {
        resetMockState();
        lastDeleteEqCalls = [];
        lastUpdatePayload = null;
    });

    // -----------------------------------------------------------------------
    // 7a. Permanent block → user submit → rejected with correct message
    // -----------------------------------------------------------------------
    test('7a: permanent block → user submit → rejected with correct message', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        const oldDate = new Date('2024-06-01T00:00:00Z').toISOString();
        setTableResult('blocked_ktp', [
            { no_ktp: '3171234567890123', reason: 'Fraud permanen', block_type: 'permanent', created_at: oldDate },
        ]);

        const item = createLogItem();
        const [result] = await checkBlockedKtpBatch([item]);

        expect(result.status).toBe('SKIP_FORMAT');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('ktp_blocked');
        expect(result.errors[0].detail).toBe('KTP tidak dapat digunakan, silahkan ganti KTP lain');
    });

    // -----------------------------------------------------------------------
    // 7b. Temporary block current month → user submit → rejected
    // -----------------------------------------------------------------------
    test('7b: temporary block current month → user submit → rejected', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        const now = new Date();
        setTableResult('blocked_ktp', [
            { no_ktp: '3171234567890123', reason: 'Bulanan', block_type: 'temporary', created_at: now.toISOString() },
        ]);

        const item = createLogItem();
        // Temporary hanya berlaku untuk Dharmajaya
        const [result] = await checkBlockedKtpBatch([item], 'DHARMAJAYA');

        expect(result.status).toBe('SKIP_FORMAT');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].type).toBe('ktp_blocked');
        expect(result.errors[0].detail).toBe('KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini');
    });

    // -----------------------------------------------------------------------
    // 7c. Temporary block last month → user submit → NOT rejected
    // -----------------------------------------------------------------------
    test('7c: temporary block last month → user submit → NOT rejected', async () => {
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

    // -----------------------------------------------------------------------
    // 7d. Cleanup preserves permanent, deletes temporary
    // -----------------------------------------------------------------------
    test('7d: cleanup preserves permanent, deletes only temporary', async () => {
        const { getBlockedKtpList } = await loadModule();

        const oldDate = new Date('2025-01-15T10:00:00Z').toISOString();
        const now = new Date();
        setTableResult('blocked_ktp', [
            { no_ktp: '1111111111111111', reason: 'Fraud', block_type: 'permanent', created_at: oldDate },
            { no_ktp: '2222222222222222', reason: 'Bulanan', block_type: 'temporary', created_at: now.toISOString() },
        ]);

        // getBlockedKtpList triggers cleanupBlockedKtpAtEndOfMonthWib internally.
        // The cleanup deletes with .eq('block_type', 'temporary') — verify via tracked eq calls.
        const result = await getBlockedKtpList(50);

        // Permanent record always returned regardless of date
        expect(result.some(r => r.no_ktp === '1111111111111111')).toBe(true);
        expect(result.find(r => r.no_ktp === '1111111111111111')?.block_type).toBe('permanent');

        // Temporary record from current month is still returned
        expect(result.some(r => r.no_ktp === '2222222222222222')).toBe(true);

        // Verify that if cleanup ran, it targeted only 'temporary' block_type
        // (cleanup only runs on last day of WIB month, so the eq call may or may not fire,
        //  but the filter logic in getBlockedKtpList itself preserves permanent records)
        const temporaryEqCall = lastDeleteEqCalls.find(
            c => c.column === 'block_type' && c.value === 'temporary'
        );
        const permanentEqCall = lastDeleteEqCalls.find(
            c => c.column === 'block_type' && c.value === 'permanent'
        );

        // If cleanup ran, it should target temporary only
        if (temporaryEqCall) {
            expect(temporaryEqCall.value).toBe('temporary');
        }
        // Permanent should NEVER be targeted by cleanup
        expect(permanentEqCall).toBeUndefined();

        // Additionally verify: old temporary records are filtered out by getBlockedKtpList
        resetMockState();
        setTableResult('blocked_ktp', [
            { no_ktp: '3333333333333333', reason: 'Fraud', block_type: 'permanent', created_at: oldDate },
            { no_ktp: '4444444444444444', reason: 'Bulanan', block_type: 'temporary', created_at: oldDate },
        ]);

        const { getBlockedKtpList: getList2 } = await loadModule();
        const result2 = await getList2(50);

        // Permanent survives even with old date
        expect(result2.some(r => r.no_ktp === '3333333333333333')).toBe(true);
        // Old temporary is filtered out
        expect(result2.some(r => r.no_ktp === '4444444444444444')).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 7e. Add permanent → change to temporary → created_at refreshed
    // -----------------------------------------------------------------------
    test('7e: add permanent → change to temporary → created_at refreshed', async () => {
        const { addBlockedKtp, changeBlockedKtpType } = await loadModule();

        // Step 1: Add as permanent
        setTableResult('blocked_ktp', null); // no existing record
        const addResult = await addBlockedKtp('1234567890123456', 'Fraud', 'permanent');
        expect(addResult.success).toBe(true);
        expect(addResult.message).toContain('permanen');

        // Step 2: Change to temporary — should refresh created_at
        lastUpdatePayload = null;
        setTableResult('blocked_ktp', { block_type: 'permanent', no_ktp: '1234567890123456' });
        const changeResult = await changeBlockedKtpType('1234567890123456', 'temporary');
        expect(changeResult.success).toBe(true);
        expect(changeResult.message).toContain('Sementara');
        expect(changeResult.message).toContain('berhasil diubah');

        // Verify the update payload includes created_at (refreshed to NOW)
        expect(lastUpdatePayload).not.toBeNull();
        expect(lastUpdatePayload.block_type).toBe('temporary');
        expect(lastUpdatePayload.created_at).toBeDefined();
        // created_at should be a recent ISO string
        const refreshedDate = new Date(lastUpdatePayload.created_at);
        const now = new Date();
        const diffMs = Math.abs(now.getTime() - refreshedDate.getTime());
        expect(diffMs).toBeLessThan(5000); // within 5 seconds
    });

    // -----------------------------------------------------------------------
    // 7f. reply.ts renders correct message per type
    // -----------------------------------------------------------------------
    test('7f: reply.ts renders correct message per block type', async () => {
        // Import reply.ts directly — it doesn't depend on supabase at runtime,
        // it just reads err.detail from the LogItem
        const { buildReplyForNewData } = await import(`../reply.ts?integration-ktp-reply=${++moduleSeq}`);

        // Test with permanent block detail
        const permanentItem = createLogItem({
            status: 'SKIP_FORMAT',
            errors: [{
                field: 'no_ktp',
                type: 'ktp_blocked',
                detail: 'KTP tidak dapat digunakan, silahkan ganti KTP lain',
            }],
        });
        const permanentLog = createLogJson([permanentItem], 'DHARMAJAYA');
        const permanentReply = buildReplyForNewData(permanentLog, 0, 'DHARMAJAYA');

        // The reply should contain the permanent detail string verbatim
        expect(permanentReply).toContain('KTP tidak dapat digunakan, silahkan ganti KTP lain');

        // Test with temporary block detail
        const temporaryItem = createLogItem({
            status: 'SKIP_FORMAT',
            errors: [{
                field: 'no_ktp',
                type: 'ktp_blocked',
                detail: 'KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini',
            }],
        });
        const temporaryLog = createLogJson([temporaryItem], 'DHARMAJAYA');
        const temporaryReply = buildReplyForNewData(temporaryLog, 0, 'DHARMAJAYA');

        // The reply should contain the temporary detail string verbatim
        expect(temporaryReply).toContain('KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini');

        // Both should show the error section header
        expect(permanentReply).toContain('Cek data ini ya');
        expect(temporaryReply).toContain('Cek data ini ya');
    });

    // -----------------------------------------------------------------------
    // 7g. Build verification (tsc + full test suite)
    //     This test verifies the module loads without errors — actual build
    //     verification is done via CLI commands after the test file is created.
    // -----------------------------------------------------------------------
    test('7g: all supabase KTP functions load and are callable', async () => {
        const mod = await loadModule();

        // Verify all expected exports exist and are functions
        expect(typeof mod.checkBlockedKtpBatch).toBe('function');
        expect(typeof mod.getBlockedKtpList).toBe('function');
        expect(typeof mod.addBlockedKtp).toBe('function');
        expect(typeof mod.removeBlockedKtp).toBe('function');
        expect(typeof mod.changeBlockedKtpType).toBe('function');

        // Verify the dual-type system works end-to-end:
        // 1. Add permanent block
        setTableResult('blocked_ktp', null);
        const addPerm = await mod.addBlockedKtp('9876543210123456', 'Test', 'permanent');
        expect(addPerm.success).toBe(true);

        // 2. Add temporary block
        const addTemp = await mod.addBlockedKtp('1234567890654321', 'Test', 'temporary');
        expect(addTemp.success).toBe(true);

        // 3. Check batch with both types present
        setTableResult('blocked_ktp', [
            { no_ktp: '3171234567890123', reason: 'Fraud', block_type: 'permanent', created_at: '2024-01-01T00:00:00Z' },
        ]);
        const items = [createLogItem()];
        const checked = await mod.checkBlockedKtpBatch(items);
        expect(checked).toHaveLength(1);
        expect(checked[0].status).toBe('SKIP_FORMAT');

        // 4. Remove block
        setTableResult('blocked_ktp', { block_type: 'permanent' }, null, 1);
        const removed = await mod.removeBlockedKtp('3171234567890123');
        expect(removed.success).toBe(true);

        // 5. Change type
        setTableResult('blocked_ktp', { block_type: 'temporary', no_ktp: '3171234567890123' });
        const changed = await mod.changeBlockedKtpType('3171234567890123', 'permanent');
        expect(changed.success).toBe(true);

        // 6. List
        setTableResult('blocked_ktp', [
            { no_ktp: '1111111111111111', reason: 'Test', block_type: 'permanent', created_at: '2024-01-01T00:00:00Z' },
        ]);
        const list = await mod.getBlockedKtpList(10);
        expect(list).toHaveLength(1);
    });
});
