import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.restore();

const actualSupabase = await import('../supabase');
const actualMessages = await import('../config/messages');

type BlockedRow = {
    location_key: string;
    provider: string | null;
    reason: string | null;
    is_active: boolean;
    updated_at: string;
};

type ScheduleRow = {
    id: string;
    provider: string;
    sub_location: string | null;
    action: 'open' | 'close';
    schedule_type: 'one_time' | 'recurring';
    scheduled_time: string;
    recurring_time: string | null;
    reason: string | null;
    is_active: boolean;
    last_executed_at: string | null;
    created_at: string;
};

const blockedStore = new Map<string, BlockedRow>();
const scheduleStore: ScheduleRow[] = [];
let scheduleSeq = 0;

const closeLocationByProviderMock = mock(async (provider: string, reason?: string) => {
    const providerKey = (provider || '').trim();
    if (!providerKey) return false;

    blockedStore.set(providerKey, {
        location_key: providerKey,
        provider: providerKey,
        reason: (reason || '').trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
    });
    return true;
});

const openLocationByProviderMock = mock(async (provider: string) => {
    const providerKey = (provider || '').trim();
    if (!providerKey) return false;

    const row = blockedStore.get(providerKey);
    if (row) {
        row.is_active = false;
        row.updated_at = new Date().toISOString();
        blockedStore.set(providerKey, row);
    }
    return true;
});

const isProviderBlockedMock = mock(async (provider: string) => {
    const providerKey = (provider || '').trim();
    if (!providerKey) return false;
    return blockedStore.get(providerKey)?.is_active === true;
});

const closeLocationMock = mock(async (provider: string, locationRaw: string, reason?: string) => {
    const locationKey = (locationRaw || '').trim();
    if (!locationKey) {
        return { success: false, message: 'Nama lokasi wajib diisi.' };
    }

    blockedStore.set(locationKey, {
        location_key: locationKey,
        provider: (provider || '').trim() || null,
        reason: (reason || '').trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
    });
    return { success: true, message: `Lokasi ${locationKey} ditandai penuh.` };
});

const openLocationMock = mock(async (_providerOrLocationRaw: string, locationRaw?: string) => {
    const locationKey = (locationRaw ?? _providerOrLocationRaw ?? '').trim();
    if (!locationKey) {
        return { success: false, message: 'Nama lokasi wajib diisi.' };
    }

    const row = blockedStore.get(locationKey);
    if (!row || !row.is_active) {
        return { success: false, message: `Lokasi ${locationKey} tidak ada di daftar penuh.` };
    }

    row.is_active = false;
    row.updated_at = new Date().toISOString();
    blockedStore.set(locationKey, row);
    return { success: true, message: `Lokasi ${locationKey} dibuka kembali.` };
});

const isLocationBlockedMock = mock(async (locationRaw: string) => {
    const locationKey = (locationRaw || '').trim();
    if (!locationKey) return { blocked: false, reason: null };

    const row = blockedStore.get(locationKey);
    if (!row || !row.is_active) return { blocked: false, reason: null };
    return { blocked: true, reason: row.reason };
});

const getBlockedLocationListMock = mock(async (limit: number = 200) => {
    return Array.from(blockedStore.values())
        .filter((row) => row.is_active)
        .sort((a, b) => a.location_key.localeCompare(b.location_key))
        .slice(0, limit)
        .map((row) => ({
            location_key: row.location_key,
            reason: row.reason,
            is_active: row.is_active,
            created_at: row.updated_at,
            updated_at: row.updated_at,
        }));
});

const isGlobalLocationQuotaFullMock = mock(async () => ({
    full: false,
    used: 0,
    limit: 100,
}));

const createScheduleMock = mock(async (input: any) => {
    scheduleSeq += 1;
    const id = `sched-${scheduleSeq}`;
    scheduleStore.push({
        id,
        provider: input.provider,
        sub_location: input.sub_location ?? null,
        action: input.action,
        schedule_type: input.schedule_type,
        scheduled_time: input.scheduled_time,
        recurring_time: input.recurring_time ?? null,
        reason: input.reason ?? null,
        is_active: true,
        last_executed_at: null,
        created_at: new Date().toISOString(),
    });
    return { id };
});

const getActiveSchedulesMock = mock(async () => {
    return scheduleStore.filter((row) => row.is_active).map((row) => ({ ...row }));
});

const markScheduleExecutedMock = mock(async (id: string, deactivate: boolean = false) => {
    const row = scheduleStore.find((it) => it.id === id);
    if (!row) return false;
    row.last_executed_at = new Date().toISOString();
    if (deactivate) row.is_active = false;
    return true;
});

const deleteScheduleMock = mock(async (id: string) => {
    const idx = scheduleStore.findIndex((it) => it.id === id);
    if (idx === -1) return false;
    scheduleStore.splice(idx, 1);
    return true;
});

const listSchedulesByProviderMock = mock(async (provider: string) => {
    const providerKey = (provider || '').trim();
    return scheduleStore
        .filter((row) => row.provider === providerKey)
        .map((row) => ({ ...row }));
});

function resetStoresAndMocks(): void {
    blockedStore.clear();
    scheduleStore.length = 0;
    scheduleSeq = 0;

    closeLocationByProviderMock.mockReset();
    openLocationByProviderMock.mockReset();
    isProviderBlockedMock.mockReset();
    closeLocationMock.mockReset();
    openLocationMock.mockReset();
    isLocationBlockedMock.mockReset();
    getBlockedLocationListMock.mockReset();
    isGlobalLocationQuotaFullMock.mockReset();
    createScheduleMock.mockReset();
    getActiveSchedulesMock.mockReset();
    markScheduleExecutedMock.mockReset();
    deleteScheduleMock.mockReset();
    listSchedulesByProviderMock.mockReset();

    closeLocationByProviderMock.mockImplementation(async (provider: string, reason?: string) => {
        const providerKey = (provider || '').trim();
        if (!providerKey) return false;
        blockedStore.set(providerKey, {
            location_key: providerKey,
            provider: providerKey,
            reason: (reason || '').trim() || null,
            is_active: true,
            updated_at: new Date().toISOString(),
        });
        return true;
    });

    openLocationByProviderMock.mockImplementation(async (provider: string) => {
        const providerKey = (provider || '').trim();
        if (!providerKey) return false;
        const row = blockedStore.get(providerKey);
        if (row) {
            row.is_active = false;
            row.updated_at = new Date().toISOString();
            blockedStore.set(providerKey, row);
        }
        return true;
    });

    isProviderBlockedMock.mockImplementation(async (provider: string) => {
        const providerKey = (provider || '').trim();
        if (!providerKey) return false;
        return blockedStore.get(providerKey)?.is_active === true;
    });

    closeLocationMock.mockImplementation(async (provider: string, locationRaw: string, reason?: string) => {
        const locationKey = (locationRaw || '').trim();
        if (!locationKey) return { success: false, message: 'Nama lokasi wajib diisi.' };
        blockedStore.set(locationKey, {
            location_key: locationKey,
            provider: (provider || '').trim() || null,
            reason: (reason || '').trim() || null,
            is_active: true,
            updated_at: new Date().toISOString(),
        });
        return { success: true, message: `Lokasi ${locationKey} ditandai penuh.` };
    });

    openLocationMock.mockImplementation(async (_providerOrLocationRaw: string, locationRaw?: string) => {
        const locationKey = (locationRaw ?? _providerOrLocationRaw ?? '').trim();
        if (!locationKey) return { success: false, message: 'Nama lokasi wajib diisi.' };
        const row = blockedStore.get(locationKey);
        if (!row || !row.is_active) {
            return { success: false, message: `Lokasi ${locationKey} tidak ada di daftar penuh.` };
        }
        row.is_active = false;
        row.updated_at = new Date().toISOString();
        blockedStore.set(locationKey, row);
        return { success: true, message: `Lokasi ${locationKey} dibuka kembali.` };
    });

    isLocationBlockedMock.mockImplementation(async (locationRaw: string) => {
        const locationKey = (locationRaw || '').trim();
        if (!locationKey) return { blocked: false, reason: null };
        const row = blockedStore.get(locationKey);
        if (!row || !row.is_active) return { blocked: false, reason: null };
        return { blocked: true, reason: row.reason };
    });

    getBlockedLocationListMock.mockImplementation(async (limit: number = 200) => {
        return Array.from(blockedStore.values())
            .filter((row) => row.is_active)
            .sort((a, b) => a.location_key.localeCompare(b.location_key))
            .slice(0, limit)
            .map((row) => ({
                location_key: row.location_key,
                reason: row.reason,
                is_active: row.is_active,
                created_at: row.updated_at,
                updated_at: row.updated_at,
            }));
    });

    isGlobalLocationQuotaFullMock.mockImplementation(async () => ({
        full: false,
        used: 0,
        limit: 100,
    }));

    createScheduleMock.mockImplementation(async (input: any) => {
        scheduleSeq += 1;
        const id = `sched-${scheduleSeq}`;
        scheduleStore.push({
            id,
            provider: input.provider,
            sub_location: input.sub_location ?? null,
            action: input.action,
            schedule_type: input.schedule_type,
            scheduled_time: input.scheduled_time,
            recurring_time: input.recurring_time ?? null,
            reason: input.reason ?? null,
            is_active: true,
            last_executed_at: null,
            created_at: new Date().toISOString(),
        });
        return { id };
    });

    getActiveSchedulesMock.mockImplementation(async () => {
        return scheduleStore.filter((row) => row.is_active).map((row) => ({ ...row }));
    });

    markScheduleExecutedMock.mockImplementation(async (id: string, deactivate: boolean = false) => {
        const row = scheduleStore.find((it) => it.id === id);
        if (!row) return false;
        row.last_executed_at = new Date().toISOString();
        if (deactivate) row.is_active = false;
        return true;
    });

    deleteScheduleMock.mockImplementation(async (id: string) => {
        const idx = scheduleStore.findIndex((it) => it.id === id);
        if (idx === -1) return false;
        scheduleStore.splice(idx, 1);
        return true;
    });

    listSchedulesByProviderMock.mockImplementation(async (provider: string) => {
        const providerKey = (provider || '').trim();
        return scheduleStore
            .filter((row) => row.provider === providerKey)
            .map((row) => ({ ...row }));
    });
}

let moduleSeq = 0;
let lastLoadedScheduler: { stopSchedulePoller: () => void } | null = null;

async function loadIntegrationModules(caseName: string) {
    const supabaseResolved = new URL('../supabase.ts', import.meta.url).pathname;

    const getProviderOverrideMock = mock(async () => null);

    const supabaseFactory = () => ({
        ...actualSupabase,
        closeLocationByProvider: closeLocationByProviderMock,
        openLocationByProvider: openLocationByProviderMock,
        isProviderBlocked: isProviderBlockedMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
        isLocationBlocked: isLocationBlockedMock,
        getBlockedLocationList: getBlockedLocationListMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        createSchedule: createScheduleMock,
        getActiveSchedules: getActiveSchedulesMock,
        markScheduleExecuted: markScheduleExecutedMock,
        deleteSchedule: deleteScheduleMock,
        listSchedulesByProvider: listSchedulesByProviderMock,
        getProviderOverride: getProviderOverrideMock,
    });

    mock.module('../supabase', supabaseFactory);
    mock.module('../supabase.ts', supabaseFactory);
    mock.module(supabaseResolved, supabaseFactory);

    mock.module('../config/messages', () => ({
        ...actualMessages,
        isProviderOpen: () => true,
        getProviderClosedLabel: () => 'buka jam 06.30',
        PROVIDER_LIST: [
            {
                key: 'DHARMAJAYA',
                name: 'Dharmajaya',
                mapping: {
                    '1': 'Duri Kosambi',
                    '2': 'Kapuk Jagal',
                    '3': 'Pulogadung',
                    '4': 'Cakung',
                },
            },
            {
                key: 'PASARJAYA',
                name: 'Pasarjaya',
                mapping: {
                    '1': 'Jakgrosir Kedoya',
                    '2': 'Gerai Rusun Pesakih',
                    '3': 'Pasar Minggu',
                    '4': 'Lokasi Lain',
                },
            },
            {
                key: 'FOODSTATION',
                name: 'Foodstation',
                mapping: {
                    '1': 'FOODSTATION',
                },
            },
        ],
        DHARMAJAYA_MAPPING: {
            '1': 'Duri Kosambi',
            '2': 'Kapuk Jagal',
            '3': 'Pulogadung',
            '4': 'Cakung',
        },
        PASARJAYA_MAPPING: {
            '1': 'Jakgrosir Kedoya',
            '2': 'Gerai Rusun Pesakih',
            '3': 'Pasar Minggu',
            '4': 'Lokasi Lain',
        },
        FOODSTATION_MAPPING: {
            '1': 'FOODSTATION',
        },
        LOCATION_MGMT_MENU_TEXT: ({
            dharmajayaStatus,
            pasarjayaStatus,
            foodStationStatus,
        }: {
            dharmajayaStatus: string;
            pasarjayaStatus: string;
            foodStationStatus: string;
        }) => [
            '*📍 Kelola Buka/Tutup Lokasi*',
            '',
            `1. Dharmajaya [${dharmajayaStatus}]`,
            `2. Pasarjaya [${pasarjayaStatus}]`,
            `3. Foodstation [${foodStationStatus}]`,
            '',
            '0. Kembali ke menu admin',
        ].join('\n'),
    }));

    moduleSeq += 1;
    const suffix = `integration-location-${caseName}-${moduleSeq}`;

    const locationGateModule = await import(`../services/locationGate.ts?${suffix}`);
    const adminLocationMenuModule = await import(`../services/adminLocationMenu.ts?${suffix}`);
    const locationSchedulerModule = await import(`../services/locationScheduler.ts?${suffix}`);

    lastLoadedScheduler = locationSchedulerModule;

    return {
        locationGateModule,
        adminLocationMenuModule,
        locationSchedulerModule,
    };
}

async function waitForSchedulerTick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 80));
}

describe('integration - location toggle full lifecycle', () => {
    beforeEach(() => {
        lastLoadedScheduler?.stopSchedulePoller();
        lastLoadedScheduler = null;
        resetStoresAndMocks();
    });

    afterEach(() => {
        lastLoadedScheduler?.stopSchedulePoller();
        lastLoadedScheduler = null;
    });

    it('close provider -> reject submission -> open -> accept', async () => {
        const { adminLocationMenuModule, locationGateModule } = await loadIntegrationModules('provider-close-open-flow');

        const phone = 'admin-1';
        await adminLocationMenuModule.handleLocationMgmt('LOCATION_MGMT_MENU', '1', phone);

        const closedByAdmin = await adminLocationMenuModule.handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '1', phone);
        expect(closedByAdmin.nextState).toBe('LOCATION_MGMT_MENU');
        expect(closedByAdmin.replyText).toContain('berhasil *ditutup*');

        const closedStatus = await locationGateModule.isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        expect(closedStatus.closed).toBe(true);
        expect(closedStatus.reason).toBe('Provider ditutup');

        await adminLocationMenuModule.handleLocationMgmt('LOCATION_MGMT_MENU', '1', phone);
        const openedByAdmin = await adminLocationMenuModule.handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '2', phone);
        expect(openedByAdmin.nextState).toBe('LOCATION_MGMT_MENU');
        expect(openedByAdmin.replyText).toContain('berhasil *dibuka*');

        const openedStatus = await locationGateModule.isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        expect(openedStatus).toEqual({ closed: false, reason: null });
    });

    it('schedule lifecycle: create -> poller executes -> marks executed', async () => {
        const { locationSchedulerModule } = await loadIntegrationModules('schedule-lifecycle');

        const closeSched = await createScheduleMock({
            provider: 'DHARMAJAYA',
            sub_location: null,
            action: 'close',
            schedule_type: 'one_time',
            scheduled_time: new Date(Date.now() - 60_000).toISOString(),
            recurring_time: null,
            reason: 'Close by schedule',
        });

        const openSched = await createScheduleMock({
            provider: 'PASARJAYA',
            sub_location: null,
            action: 'open',
            schedule_type: 'one_time',
            scheduled_time: new Date(Date.now() - 45_000).toISOString(),
            recurring_time: null,
            reason: 'Open by schedule',
        });

        expect(closeSched).toEqual({ id: 'sched-1' });
        expect(openSched).toEqual({ id: 'sched-2' });

        locationSchedulerModule.startSchedulePoller(999_999);
        await waitForSchedulerTick();
        locationSchedulerModule.stopSchedulePoller();

        expect(closeLocationByProviderMock).toHaveBeenCalledWith('DHARMAJAYA', 'Close by schedule');
        expect(openLocationByProviderMock).toHaveBeenCalledWith('PASARJAYA');
        expect(markScheduleExecutedMock).toHaveBeenCalledWith('sched-1', true);
        expect(markScheduleExecutedMock).toHaveBeenCalledWith('sched-2', true);
    });

    it('pasarjaya migration: isSpecificLocationClosed checks DB (not env) and isProviderBlocked works', async () => {
        const { locationGateModule } = await loadIntegrationModules('pasarjaya-migration');

        const prevEnv = process.env.PASARJAYA_DISABLED;
        process.env.PASARJAYA_DISABLED = 'true';

        try {
            const initiallyOpen = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
            expect(initiallyOpen).toEqual({ closed: false, reason: null });

            await closeLocationByProviderMock('PASARJAYA', 'Migrated DB close');

            const nowBlocked = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
            expect(nowBlocked.closed).toBe(true);
            expect(nowBlocked.reason).toBe('Provider ditutup');

            const providerBlocked = await isProviderBlockedMock('PASARJAYA');
            expect(providerBlocked).toBe(true);
        } finally {
            if (prevEnv === undefined) {
                delete process.env.PASARJAYA_DISABLED;
            } else {
                process.env.PASARJAYA_DISABLED = prevEnv;
            }
        }
    });

    it('all 3 providers toggle independently', async () => {
        const { locationGateModule } = await loadIntegrationModules('providers-independent');

        await closeLocationByProviderMock('DHARMAJAYA', 'Only dharmajaya closed');

        const dj = await locationGateModule.isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        const pj = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
        const fs = await locationGateModule.isSpecificLocationClosed('FOODSTATION', 'FOODSTATION');

        expect(dj.closed).toBe(true);
        expect(pj.closed).toBe(false);
        expect(fs.closed).toBe(false);
    });

    it('provider-level close + sub-location close coexist independently', async () => {
        const { locationGateModule } = await loadIntegrationModules('provider-and-sub-coexist');

        await closeLocationByProviderMock('DHARMAJAYA', 'Provider maintenance');
        await locationGateModule.closeSpecificLocation('DHARMAJAYA', 'Cakung', 'Sub maintenance');

        const closedWhileProviderClosed = await locationGateModule.isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        expect(closedWhileProviderClosed.closed).toBe(true);

        await openLocationByProviderMock('DHARMAJAYA');

        const stillClosedBySub = await locationGateModule.isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        expect(stillClosedBySub.closed).toBe(true);
        expect(stillClosedBySub.reason).toBe('Sub maintenance');
    });

    it('"Lokasi Lain" style manual location is blocked by provider-level close', async () => {
        const { locationGateModule } = await loadIntegrationModules('manual-location-provider-guard');

        await closeLocationByProviderMock('PASARJAYA', 'Provider-wide close');

        const status = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Pasar Minggu');
        expect(status.closed).toBe(true);
        expect(status.reason).toBe('Provider ditutup');
    });
});
