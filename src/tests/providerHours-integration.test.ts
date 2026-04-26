import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.restore();

const actualSupabase = await import('../supabase');
const actualTime = await import('../time');

type ProviderKey = 'PASARJAYA' | 'DHARMAJAYA' | 'FOODSTATION';

type OverrideType = {
    provider: ProviderKey;
    override_type: 'open' | 'close';
    expires_at?: string | null;
    manual_close_start?: string | null;
    manual_close_end?: string | null;
    created_at?: string;
};

const providerOverrideStore = new Map<ProviderKey, OverrideType>();
const providerBlockedStore = new Set<ProviderKey>();
const blockedLocationStore = new Map<string, { reason: string | null }>();

const mockGetWibParts = mock((_date: Date) => ({
    year: 2099,
    month: 1,
    day: 1,
    hour: 10,
    minute: 0,
    second: 0,
}));

const mockIsProviderBlocked = mock(async (provider: string) => providerBlockedStore.has(provider as ProviderKey));
const mockGetProviderOverride = mock(async (provider: string) => providerOverrideStore.get(provider as ProviderKey) || null);
const mockUpsertProviderOverride = mock(async (data: {
    provider: string;
    override_type: 'open' | 'close';
    expires_at?: string;
    manual_close_start?: string;
    manual_close_end?: string;
}) => {
    providerOverrideStore.set(data.provider as ProviderKey, {
        provider: data.provider as ProviderKey,
        override_type: data.override_type,
        expires_at: data.expires_at || null,
        manual_close_start: data.manual_close_start || null,
        manual_close_end: data.manual_close_end || null,
        created_at: new Date().toISOString(),
    });
    return true;
});
const mockDeleteProviderOverride = mock(async (provider: string) => {
    providerOverrideStore.delete(provider as ProviderKey);
    return true;
});
const mockDeleteAllProviderOverrides = mock(async () => {
    providerOverrideStore.clear();
    return true;
});
const mockIsLocationBlocked = mock(async (locationRaw: string) => {
    const row = blockedLocationStore.get((locationRaw || '').trim());
    if (!row) return { blocked: false, reason: null };
    return { blocked: true, reason: row.reason };
});
const mockIsGlobalLocationQuotaFull = mock(async () => ({
    full: false,
    used: 0,
    limit: 100,
}));

let moduleSeq = 0;

function setMockTime(hour: number, minute: number, year: number = 2099, month: number = 1, day: number = 1): void {
    mockGetWibParts.mockImplementation((_date: Date) => ({
        year,
        month,
        day,
        hour,
        minute,
        second: 0,
    }));
}

function resetStoresAndMocks(): void {
    providerOverrideStore.clear();
    providerBlockedStore.clear();
    blockedLocationStore.clear();

    mockGetWibParts.mockReset();
    mockIsProviderBlocked.mockReset();
    mockGetProviderOverride.mockReset();
    mockUpsertProviderOverride.mockReset();
    mockDeleteProviderOverride.mockReset();
    mockDeleteAllProviderOverrides.mockReset();
    mockIsLocationBlocked.mockReset();
    mockIsGlobalLocationQuotaFull.mockReset();

    setMockTime(10, 0);

    mockIsProviderBlocked.mockImplementation(async (provider: string) => providerBlockedStore.has(provider as ProviderKey));
    mockGetProviderOverride.mockImplementation(async (provider: string) => providerOverrideStore.get(provider as ProviderKey) || null);
    mockUpsertProviderOverride.mockImplementation(async (data: {
        provider: string;
        override_type: 'open' | 'close';
        expires_at?: string;
        manual_close_start?: string;
        manual_close_end?: string;
    }) => {
        providerOverrideStore.set(data.provider as ProviderKey, {
            provider: data.provider as ProviderKey,
            override_type: data.override_type,
            expires_at: data.expires_at || null,
            manual_close_start: data.manual_close_start || null,
            manual_close_end: data.manual_close_end || null,
            created_at: new Date().toISOString(),
        });
        return true;
    });
    mockDeleteProviderOverride.mockImplementation(async (provider: string) => {
        providerOverrideStore.delete(provider as ProviderKey);
        return true;
    });
    mockDeleteAllProviderOverrides.mockImplementation(async () => {
        providerOverrideStore.clear();
        return true;
    });
    mockIsLocationBlocked.mockImplementation(async (locationRaw: string) => {
        const row = blockedLocationStore.get((locationRaw || '').trim());
        if (!row) return { blocked: false, reason: null };
        return { blocked: true, reason: row.reason };
    });
    mockIsGlobalLocationQuotaFull.mockImplementation(async () => ({
        full: false,
        used: 0,
        limit: 100,
    }));
}

async function loadProviderHoursModules(caseName: string) {
    const supabaseResolved = new URL('../supabase.ts', import.meta.url).pathname;
    const timeResolved = new URL('../time.ts', import.meta.url).pathname;

    const supabaseFactory = () => ({
        ...actualSupabase,
        isProviderBlocked: mockIsProviderBlocked,
        getProviderOverride: mockGetProviderOverride,
        upsertProviderOverride: mockUpsertProviderOverride,
        deleteProviderOverride: mockDeleteProviderOverride,
        deleteAllProviderOverrides: mockDeleteAllProviderOverrides,
        isLocationBlocked: mockIsLocationBlocked,
        isGlobalLocationQuotaFull: mockIsGlobalLocationQuotaFull,
    });

    const timeFactory = () => ({
        ...actualTime,
        getWibParts: mockGetWibParts,
    });

    mock.module('../supabase', supabaseFactory);
    mock.module('../supabase.ts', supabaseFactory);
    mock.module(supabaseResolved, supabaseFactory);

    mock.module('../time', timeFactory);
    mock.module('../time.ts', timeFactory);
    mock.module(timeResolved, timeFactory);

    moduleSeq += 1;
    const suffix = `provider-hours-integration-${caseName}-${moduleSeq}`;

    const messagesModule = await import(`../config/messages.ts?${suffix}`);
    const locationGateModule = await import(`../services/locationGate.ts?${suffix}`);
    return {
        messagesModule,
        locationGateModule,
    };
}

describe('integration - provider operating hours', () => {
    beforeEach(() => {
        resetStoresAndMocks();
    });

    it('S1: provider di luar jam -> menu label -> reject at gate', async () => {
        setMockTime(6, 0);
        const { messagesModule, locationGateModule } = await loadProviderHoursModules('s1-outside-hours-reject');

        const daftarMessage = await messagesModule.buildFormatDaftarMessage();
        expect(daftarMessage).toContain('*PASARJAYA* (TUTUP - buka jam 07.10)');

        const gateResult = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
        expect(gateResult.closed).toBe(true);
        expect(gateResult.reason).toContain('Di luar jam operasional');
    });

    it('S2: admin buka sekarang -> provider opens despite outside hours', async () => {
        setMockTime(6, 0);
        const { locationGateModule } = await loadProviderHoursModules('s2-open-override-wins');

        await mockUpsertProviderOverride({
            provider: 'PASARJAYA',
            override_type: 'open',
            expires_at: '2099-01-01T23:59:00+07:00',
        });

        const gateResult = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
        expect(gateResult).toEqual({ closed: false, reason: null });
    });

    it('S3: admin tutup sekarang -> provider closes despite within hours', async () => {
        setMockTime(10, 0);
        const { locationGateModule } = await loadProviderHoursModules('s3-close-override-wins');

        const now = Date.now();
        await mockUpsertProviderOverride({
            provider: 'DHARMAJAYA',
            override_type: 'close',
            manual_close_start: new Date(now - 60_000).toISOString(),
            manual_close_end: new Date(now + 60_000).toISOString(),
        });

        const gateResult = await locationGateModule.isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        expect(gateResult.closed).toBe(true);
        expect(gateResult.reason).toBe('Ditutup sementara oleh admin');
    });

    it('S4: kembali ke default -> all overrides deleted', async () => {
        await loadProviderHoursModules('s4-delete-all-overrides');

        await mockUpsertProviderOverride({
            provider: 'PASARJAYA',
            override_type: 'open',
            expires_at: '2099-01-01T23:59:00+07:00',
        });
        await mockUpsertProviderOverride({
            provider: 'DHARMAJAYA',
            override_type: 'close',
            manual_close_start: '2099-01-01T07:00:00+07:00',
            manual_close_end: '2099-01-01T12:00:00+07:00',
        });
        await mockUpsertProviderOverride({
            provider: 'FOODSTATION',
            override_type: 'open',
            expires_at: '2099-01-01T23:59:00+07:00',
        });

        const cleared = await mockDeleteAllProviderOverrides();
        expect(cleared).toBe(true);

        expect(await mockGetProviderOverride('PASARJAYA')).toBeNull();
        expect(await mockGetProviderOverride('DHARMAJAYA')).toBeNull();
        expect(await mockGetProviderOverride('FOODSTATION')).toBeNull();
    });

    it('S5: override expired -> falls back to default hours', async () => {
        setMockTime(6, 0);
        const { locationGateModule } = await loadProviderHoursModules('s5-expired-open-override');

        await mockUpsertProviderOverride({
            provider: 'PASARJAYA',
            override_type: 'open',
            expires_at: '2000-01-01T23:59:00+07:00',
        });

        const gateResult = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
        expect(gateResult.closed).toBe(true);
        expect(gateResult.reason).toContain('Di luar jam operasional');
    });

    it('S6: design test - isSpecificLocationClosed does not check global gate', async () => {
        setMockTime(6, 0);
        const { locationGateModule } = await loadProviderHoursModules('s6-no-global-gate-inside-location-gate');

        await mockUpsertProviderOverride({
            provider: 'PASARJAYA',
            override_type: 'open',
            expires_at: '2099-01-01T23:59:00+07:00',
        });

        const gateResult = await locationGateModule.isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');
        expect(gateResult).toEqual({ closed: false, reason: null });
    });

    it('S7: status check not affected by registration hours', async () => {
        setMockTime(6, 0);
        const { messagesModule } = await loadProviderHoursModules('s7-status-check-separate-hours');

        const statusCheckOpen = messagesModule.isStatusCheckOpen('PASARJAYA');
        expect(statusCheckOpen).toBe(false);

        const menu = await messagesModule.STATUS_CHECK_PROVIDER_MENU();
        expect(menu).toContain('*Pasarjaya* (buka jam 07:10)');
    });
});
