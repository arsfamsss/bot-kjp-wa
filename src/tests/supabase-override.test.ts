import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.restore();

type RecordedCall = {
    method: string;
    args: unknown[];
};

const recordedCalls: RecordedCall[] = [];
let currentData: unknown = null;
let currentError: unknown = null;

function resetClientState(): void {
    recordedCalls.length = 0;
    currentData = null;
    currentError = null;
}

function setClientResult(data: unknown, error: unknown = null): void {
    currentData = data;
    currentError = error;
}

function getCalls(): RecordedCall[] {
    return recordedCalls;
}

function buildChainableClient() {
    const chain = new Proxy({} as Record<string, unknown>, {
        get(_target, prop) {
            if (prop === 'then') return undefined;
            if (prop === 'data') return currentData;
            if (prop === 'error') return currentError;

            return (...args: unknown[]) => {
                const method = String(prop);
                recordedCalls.push({ method, args });

                if (method === 'single' || method === 'maybeSingle') {
                    return Promise.resolve({ data: currentData, error: currentError });
                }

                return chain;
            };
        },
    });

    return {
        from: (table: string) => {
            recordedCalls.push({ method: 'from', args: [table] });
            return chain;
        },
    };
}

const mockSupabaseClient = buildChainableClient();

mock.module('@supabase/supabase-js', () => ({
    createClient: () => mockSupabaseClient,
}));

let moduleSeq = 0;

async function loadSupabaseModule() {
    moduleSeq += 1;
    return import(`../supabase.ts?supabase-override-test=${moduleSeq}`);
}

describe('supabase provider overrides', () => {
    beforeEach(() => {
        resetClientState();
    });

    it('upsertProviderOverride calls upsert with normalized payload and onConflict provider', async () => {
        const { upsertProviderOverride } = await loadSupabaseModule();
        const ok = await upsertProviderOverride({
            provider: 'PASARJAYA',
            override_type: 'open',
            expires_at: '2026-04-26T16:59:59.000Z',
        });

        expect(ok).toBe(true);

        const fromCall = getCalls().find((call) => call.method === 'from');
        expect(fromCall?.args[0]).toBe('provider_operation_overrides');

        const upsertCall = getCalls().find((call) => call.method === 'upsert');
        expect(upsertCall).toBeTruthy();

        const payload = upsertCall?.args[0] as Record<string, unknown>;
        expect(payload.provider).toBe('PASARJAYA');
        expect(payload.override_type).toBe('open');
        expect(payload.expires_at).toBe('2026-04-26T16:59:59.000Z');
        expect(payload.manual_close_start).toBeNull();
        expect(payload.manual_close_end).toBeNull();
        expect(typeof payload.created_at).toBe('string');

        const options = upsertCall?.args[1] as Record<string, unknown>;
        expect(options.onConflict).toBe('provider');
    });

    it('getProviderOverride returns row when maybeSingle returns data', async () => {
        const { getProviderOverride } = await loadSupabaseModule();
        setClientResult({
            provider: 'DHARMAJAYA',
            override_type: 'close',
            manual_close_start: '2026-04-26T01:00:00.000Z',
            manual_close_end: '2026-04-26T03:00:00.000Z',
        });

        const row = await getProviderOverride('DHARMAJAYA');

        expect(row).toEqual({
            provider: 'DHARMAJAYA',
            override_type: 'close',
            manual_close_start: '2026-04-26T01:00:00.000Z',
            manual_close_end: '2026-04-26T03:00:00.000Z',
        });

        const eqCall = getCalls().find((call) => call.method === 'eq');
        expect(eqCall?.args).toEqual(['provider', 'DHARMAJAYA']);
    });

    it('deleteProviderOverride calls delete and provider filter', async () => {
        const { deleteProviderOverride } = await loadSupabaseModule();

        const ok = await deleteProviderOverride('FOODSTATION');
        expect(ok).toBe(true);

        const deleteCall = getCalls().find((call) => call.method === 'delete');
        expect(deleteCall).toBeTruthy();

        const eqCall = getCalls().find((call) => call.method === 'eq');
        expect(eqCall?.args).toEqual(['provider', 'FOODSTATION']);
    });

    it('deleteAllProviderOverrides deletes all rows using neq provider empty string', async () => {
        const { deleteAllProviderOverrides } = await loadSupabaseModule();

        const ok = await deleteAllProviderOverrides();
        expect(ok).toBe(true);

        const deleteCall = getCalls().find((call) => call.method === 'delete');
        expect(deleteCall).toBeTruthy();

        const neqCall = getCalls().find((call) => call.method === 'neq');
        expect(neqCall?.args).toEqual(['provider', '']);
    });
});
