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
    return import(`../supabase.ts?supabase-location-test=${moduleSeq}`);
}

describe('supabase location + schedule functions', () => {
    beforeEach(() => {
        resetClientState();
    });

    it('closeLocation upserts blocked_locations with provider column and active flag', async () => {
        const { closeLocation } = await loadSupabaseModule();
        await closeLocation('DHARMAJAYA', 'DHARMAJAYA - Cakung', 'Penuh sementara');

        const fromCall = getCalls().find((it) => it.method === 'from');
        expect(fromCall?.args[0]).toBe('blocked_locations');

        const upsertCall = getCalls().find((it) => it.method === 'upsert');
        expect(upsertCall).toBeTruthy();

        const payload = upsertCall?.args[0] as Record<string, unknown>;
        expect(payload.location_key).toBe('DHARMAJAYA - Cakung');
        expect(payload.provider).toBe('DHARMAJAYA');
        expect(payload.reason).toBe('Penuh sementara');
        expect(payload.is_active).toBe(true);
    });

    it('openLocation soft-opens by update is_active false (not delete)', async () => {
        const { openLocation } = await loadSupabaseModule();
        setClientResult([{ location_key: 'DHARMAJAYA - Cakung' }], null);

        await openLocation('DHARMAJAYA', 'DHARMAJAYA - Cakung');

        const updateCall = getCalls().find((it) => it.method === 'update');
        expect(updateCall).toBeTruthy();

        const payload = updateCall?.args[0] as Record<string, unknown>;
        expect(payload.is_active).toBe(false);

        const deleteCall = getCalls().find((it) => it.method === 'delete');
        expect(deleteCall).toBeUndefined();
    });

    it('closeLocationByProvider upserts provider-level key', async () => {
        const { closeLocationByProvider } = await loadSupabaseModule();
        const ok = await closeLocationByProvider('PASARJAYA', 'Maintenance');

        expect(ok).toBe(true);

        const upsertCall = getCalls().find((it) => it.method === 'upsert');
        expect(upsertCall).toBeTruthy();

        const payload = upsertCall?.args[0] as Record<string, unknown>;
        expect(payload.location_key).toBe('PASARJAYA');
        expect(payload.provider).toBe('PASARJAYA');
        expect(payload.reason).toBe('Maintenance');
        expect(payload.is_active).toBe(true);
    });

    it('openLocationByProvider soft-toggles provider-level key to inactive', async () => {
        const { openLocationByProvider } = await loadSupabaseModule();
        const ok = await openLocationByProvider('PASARJAYA');

        expect(ok).toBe(true);

        const updateCall = getCalls().find((it) => it.method === 'update');
        expect(updateCall).toBeTruthy();
        const payload = updateCall?.args[0] as Record<string, unknown>;
        expect(payload.is_active).toBe(false);

        const eqArgs = getCalls().filter((it) => it.method === 'eq').map((it) => it.args);
        expect(eqArgs).toContainEqual(['location_key', 'PASARJAYA']);
        expect(eqArgs).toContainEqual(['is_active', true]);
    });

    it('isProviderBlocked returns true when maybeSingle has row', async () => {
        const { isProviderBlocked } = await loadSupabaseModule();
        setClientResult({ location_key: 'DHARMAJAYA' }, null);

        const blocked = await isProviderBlocked('DHARMAJAYA');
        expect(blocked).toBe(true);
    });

    it('isProviderBlocked returns false when maybeSingle has no row', async () => {
        const { isProviderBlocked } = await loadSupabaseModule();
        setClientResult(null, null);

        const blocked = await isProviderBlocked('DHARMAJAYA');
        expect(blocked).toBe(false);
    });

    it('createSchedule inserts active schedule and returns id', async () => {
        const { createSchedule } = await loadSupabaseModule();
        setClientResult({ id: 'sched-1' }, null);

        const out = await createSchedule({
            provider: 'DHARMAJAYA',
            sub_location: 'Cakung',
            action: 'close',
            schedule_type: 'one_time',
            scheduled_time: '2026-04-25T01:00:00.000Z',
            recurring_time: null,
            reason: 'Auto close',
        });

        expect(out).toEqual({ id: 'sched-1' });

        const insertCall = getCalls().find((it) => it.method === 'insert');
        expect(insertCall).toBeTruthy();
        const payload = insertCall?.args[0] as Record<string, unknown>;
        expect(payload.provider).toBe('DHARMAJAYA');
        expect(payload.sub_location).toBe('Cakung');
        expect(payload.is_active).toBe(true);
    });

    it('getActiveSchedules returns rows from location_schedules', async () => {
        const { getActiveSchedules } = await loadSupabaseModule();
        setClientResult([{ id: 'a' }, { id: 'b' }], null);

        const rows = await getActiveSchedules();
        expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('markScheduleExecuted updates execution timestamp and can deactivate', async () => {
        const { markScheduleExecuted } = await loadSupabaseModule();
        const ok = await markScheduleExecuted('sched-99', true);

        expect(ok).toBe(true);

        const updateCall = getCalls().find((it) => it.method === 'update');
        expect(updateCall).toBeTruthy();

        const payload = updateCall?.args[0] as Record<string, unknown>;
        expect(typeof payload.last_executed_at).toBe('string');
        expect(payload.is_active).toBe(false);
    });

    it('deleteSchedule deletes row by id', async () => {
        const { deleteSchedule } = await loadSupabaseModule();
        const ok = await deleteSchedule('sched-delete');

        expect(ok).toBe(true);

        const deleteCall = getCalls().find((it) => it.method === 'delete');
        expect(deleteCall).toBeTruthy();

        const eqCall = getCalls().find((it) => it.method === 'eq' && it.args[0] === 'id');
        expect(eqCall?.args[1]).toBe('sched-delete');
    });
});
