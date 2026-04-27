import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.restore();

let mockSelectData: any[] = [];

mock.module('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: () => ({
            select: () => ({
                in: () => Promise.resolve({ data: mockSelectData, error: null }),
            }),
        }),
    }),
}));

const actualSupabase = await import('../supabase');

mock.module('../supabase', () => ({
    ...actualSupabase,
    cleanupBlockedKtpAtEndOfMonthWib: async () => {},
}));

let moduleSeq = 0;

async function loadModule() {
    moduleSeq += 1;
    return import(`../supabase.ts?blocked-ktp-location-context=${moduleSeq}`);
}

function makeOkItem(no_ktp: string): any {
    return {
        status: 'OK',
        parsed: { no_ktp, nama: 'Test', no_kjp: '504948000', no_kk: '317000' },
        errors: [],
    };
}

describe('checkBlockedKtpBatch with locationContext', () => {
    beforeEach(() => {
        mockSelectData = [];
    });

    test('Dharmajaya + temporary blocked -> SKIP', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'temporary',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')], 'DHARMAJAYA');

        expect(result[0].status).toBe('SKIP_FORMAT');
    });

    test('Pasarjaya + temporary blocked -> tetap OK', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'temporary',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')], 'PASARJAYA');

        expect(result[0].status).toBe('OK');
    });

    test('Foodstation + temporary blocked -> tetap OK', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'temporary',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')], 'FOODSTATION');

        expect(result[0].status).toBe('OK');
    });

    test('Dharmajaya + permanent blocked -> SKIP', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'permanent',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')], 'DHARMAJAYA');

        expect(result[0].status).toBe('SKIP_FORMAT');
    });

    test('Pasarjaya + permanent blocked -> SKIP (permanent tetap global)', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'permanent',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')], 'PASARJAYA');

        expect(result[0].status).toBe('SKIP_FORMAT');
    });

    test('tanpa locationContext + temporary blocked -> tetap OK (safe default)', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'temporary',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')]);

        expect(result[0].status).toBe('OK');
    });

    test('tanpa locationContext + permanent blocked -> SKIP', async () => {
        const { checkBlockedKtpBatch } = await loadModule();

        mockSelectData = [
            {
                no_ktp: '3171234567890123',
                reason: null,
                block_type: 'permanent',
                created_at: new Date().toISOString(),
            },
        ];

        const result = await checkBlockedKtpBatch([makeOkItem('3171234567890123')]);

        expect(result[0].status).toBe('SKIP_FORMAT');
    });
});
