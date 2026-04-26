import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.restore();

const actualSupabase = await import('../supabase');
const actualRecap = await import('../recap');
const actualStatusCheckService = await import('../services/statusCheckService');
const actualPasarjayaStatusCheck = await import('../services/pasarjayaStatusCheck');
const actualFoodStationStatusCheck = await import('../services/foodStationStatusCheck');

type ProviderKey = 'PASARJAYA' | 'DHARMAJAYA' | 'FOODSTATION';

type RecapItem = {
    nama: string;
    no_kjp: string;
    no_ktp?: string;
    no_kk?: string;
    jenis_kartu?: string | null;
    lokasi?: string;
    tanggal_lahir?: string | null;
};

const defaultRecapResponse = {
    validCount: 0,
    validItems: [] as RecapItem[],
    totalInvalid: 0,
    detailItems: [],
};

const mockIsProviderBlocked = mock(async (_provider: string) => false);
const mockGetTodayRecapForSender = mock(async () => defaultRecapResponse);
const mockCheckRegistrationStatuses = mock(async (items: any[]) =>
    items.map((item) => ({ item, state: 'BERHASIL' as const })),
);
const mockCheckPasarjayaStatuses = mock(async (items: any[]) =>
    items.map((item) => ({ item, state: 'BERHASIL' as const })),
);
const mockCheckFoodStationStatuses = mock(async (items: any[]) =>
    items.map((item) => ({ item, state: 'BERHASIL' as const })),
);

mock.module('../supabase', () => ({
    ...actualSupabase,
    isProviderBlocked: mockIsProviderBlocked,
}));

mock.module('../supabase.ts', () => ({
    ...actualSupabase,
    isProviderBlocked: mockIsProviderBlocked,
}));

mock.module('../recap', () => ({
    ...actualRecap,
    getTodayRecapForSender: mockGetTodayRecapForSender,
}));

mock.module('../recap.ts', () => ({
    ...actualRecap,
    getTodayRecapForSender: mockGetTodayRecapForSender,
}));

mock.module('../services/statusCheckService', () => ({
    ...actualStatusCheckService,
    checkRegistrationStatuses: mockCheckRegistrationStatuses,
}));

mock.module('../services/statusCheckService.ts', () => ({
    ...actualStatusCheckService,
    checkRegistrationStatuses: mockCheckRegistrationStatuses,
}));

mock.module('../services/pasarjayaStatusCheck', () => ({
    ...actualPasarjayaStatusCheck,
    checkPasarjayaStatuses: mockCheckPasarjayaStatuses,
}));

mock.module('../services/pasarjayaStatusCheck.ts', () => ({
    ...actualPasarjayaStatusCheck,
    checkPasarjayaStatuses: mockCheckPasarjayaStatuses,
}));

mock.module('../services/foodStationStatusCheck', () => ({
    ...actualFoodStationStatusCheck,
    checkFoodStationStatuses: mockCheckFoodStationStatuses,
}));

mock.module('../services/foodStationStatusCheck.ts', () => ({
    ...actualFoodStationStatusCheck,
    checkFoodStationStatuses: mockCheckFoodStationStatuses,
}));

let moduleSeq = 0;

function nextSuffix(tag: string): string {
    moduleSeq += 1;
    return `status-check-multi-provider-${tag}-${moduleSeq}`;
}

function makeRecapItem(overrides: Partial<RecapItem> = {}): RecapItem {
    return {
        nama: 'Nama Test',
        no_kjp: '5049488500001234',
        no_ktp: '3171234567890123',
        no_kk: '3171098765432109',
        jenis_kartu: 'KJP',
        lokasi: 'DHARMAJAYA - Cakung',
        tanggal_lahir: null,
        ...overrides,
    };
}

function normalizeRecapItems(validItems: RecapItem[]) {
    return validItems.map((item) => ({
        nama: item.nama,
        no_kjp: item.no_kjp,
        no_ktp: item.no_ktp || '-',
        no_kk: item.no_kk || '-',
        jenis_kartu: item.jenis_kartu || null,
        lokasi: item.lokasi || undefined,
        tanggal_lahir: item.tanggal_lahir || null,
    }));
}

function filterItemsByProvider(items: ReturnType<typeof normalizeRecapItems>, providerFilter: ProviderKey) {
    return items.filter((item) => {
        if (!item.lokasi) return false;
        if (providerFilter === 'PASARJAYA') return item.lokasi.startsWith('PASARJAYA');
        if (providerFilter === 'DHARMAJAYA') return item.lokasi.startsWith('DHARMAJAYA');
        return item.lokasi.startsWith('FOODSTATION');
    });
}

async function resolveStatusSourceItemsForTest(
    senderPhone: string,
    sourceDate: string,
    providerFilter?: ProviderKey,
) {
    const { getTodayRecapForSender } = await import('../recap');
    const { validItems } = await getTodayRecapForSender(senderPhone, sourceDate, 'received_at');
    const items = normalizeRecapItems(validItems);

    if (!providerFilter) {
        return { sourceDate, items };
    }

    return { sourceDate, items: filterItemsByProvider(items, providerFilter) };
}

async function processProviderStatusCheckForTest(
    providerKey: ProviderKey,
    senderPhone: string,
    sourceDate: string,
    targetDate: string,
) {
    const { items } = await resolveStatusSourceItemsForTest(senderPhone, sourceDate, providerKey);

    if (providerKey === 'DHARMAJAYA') {
        const { checkRegistrationStatuses } = await import('../services/statusCheckService');
        const results = await checkRegistrationStatuses(items, targetDate);
        return { items, results, summary: null };
    }

    if (providerKey === 'PASARJAYA') {
        const { checkPasarjayaStatuses } = await import('../services/pasarjayaStatusCheck');
        const { buildPasarjayaStatusSummary } = await import(`../services/statusCheckFormatter.ts?${nextSuffix('formatter-pj')}`);
        const results = await checkPasarjayaStatuses(items);
        const summary = buildPasarjayaStatusSummary(results, sourceDate);
        return { items, results, summary };
    }

    const { checkFoodStationStatuses } = await import('../services/foodStationStatusCheck');
    const { buildFoodStationStatusSummary } = await import(`../services/statusCheckFormatter.ts?${nextSuffix('formatter-fs')}`);
    const results = await checkFoodStationStatuses(items);
    const summary = buildFoodStationStatusSummary(results, sourceDate);
    return { items, results, summary };
}

describe('Multi-Provider Status Check Integration', () => {
    beforeEach(() => {
        mockIsProviderBlocked.mockReset();
        mockGetTodayRecapForSender.mockReset();
        mockCheckRegistrationStatuses.mockReset();
        mockCheckPasarjayaStatuses.mockReset();
        mockCheckFoodStationStatuses.mockReset();

        mockIsProviderBlocked.mockImplementation(async () => false);
        mockGetTodayRecapForSender.mockImplementation(async () => defaultRecapResponse);
        mockCheckRegistrationStatuses.mockImplementation(async (items: any[]) =>
            items.map((item) => ({ item, state: 'BERHASIL' as const })),
        );
        mockCheckPasarjayaStatuses.mockImplementation(async (items: any[]) =>
            items.map((item) => ({ item, state: 'BERHASIL' as const })),
        );
        mockCheckFoodStationStatuses.mockImplementation(async (items: any[]) =>
            items.map((item) => ({ item, state: 'BERHASIL' as const })),
        );
    });

    test('routes DHARMAJAYA status checks to checkRegistrationStatuses only', async () => {
        mockGetTodayRecapForSender.mockResolvedValue({
            ...defaultRecapResponse,
            validCount: 3,
            validItems: [
                makeRecapItem({ nama: 'Dharma 1', lokasi: 'DHARMAJAYA - Cakung' }),
                makeRecapItem({ nama: 'Pasar 1', lokasi: 'PASARJAYA - Jakgrosir Kedoya', tanggal_lahir: '1975-08-15' }),
                makeRecapItem({ nama: 'Food 1', lokasi: 'FOODSTATION' }),
            ],
        });

        const result = await processProviderStatusCheckForTest('DHARMAJAYA', '628123', '2026-04-24', '2026-04-25');

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.lokasi).toBe('DHARMAJAYA - Cakung');
        expect(mockCheckRegistrationStatuses).toHaveBeenCalledTimes(1);
        expect(mockCheckPasarjayaStatuses).not.toHaveBeenCalled();
        expect(mockCheckFoodStationStatuses).not.toHaveBeenCalled();
    });

    test('routes PASARJAYA status checks and summary includes lokasi, tgl pengambilan, no urut', async () => {
        mockGetTodayRecapForSender.mockResolvedValue({
            ...defaultRecapResponse,
            validCount: 2,
            validItems: [
                makeRecapItem({
                    nama: 'Pasar A',
                    lokasi: 'PASARJAYA - Jakgrosir Kedoya',
                    tanggal_lahir: '1980-01-01',
                }),
                makeRecapItem({ nama: 'Dharma B', lokasi: 'DHARMAJAYA - Cakung' }),
            ],
        });

        mockCheckPasarjayaStatuses.mockImplementation(async (items: any[]) =>
            items.map((item) => ({
                item,
                state: 'BERHASIL' as const,
                detail: {
                    lokasi: 'Jakgrosir Kedoya',
                    tanggalPengambilan: '2026-04-25',
                    nomorUrut: '12',
                },
            })),
        );

        const result = await processProviderStatusCheckForTest('PASARJAYA', '628123', '2026-04-24', '2026-04-25');

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.lokasi).toContain('PASARJAYA');
        expect(mockCheckPasarjayaStatuses).toHaveBeenCalledTimes(1);
        expect(mockCheckRegistrationStatuses).not.toHaveBeenCalled();
        expect(mockCheckFoodStationStatuses).not.toHaveBeenCalled();
        expect(result.summary).toContain('📍 Lokasi: Jakgrosir Kedoya');
        expect(result.summary).toContain('📅 Tgl Pengambilan: 2026-04-25');
        expect(result.summary).toContain('🔢 No Urut: 12');
    });

    test('routes FOODSTATION status checks and summary includes tgl pengambilan + jam', async () => {
        mockGetTodayRecapForSender.mockResolvedValue({
            ...defaultRecapResponse,
            validCount: 2,
            validItems: [
                makeRecapItem({ nama: 'Food A', lokasi: 'FOODSTATION' }),
                makeRecapItem({ nama: 'Pasar B', lokasi: 'PASARJAYA - Pasar Minggu', tanggal_lahir: '1985-02-02' }),
            ],
        });

        mockCheckFoodStationStatuses.mockImplementation(async (items: any[]) =>
            items.map((item) => ({
                item,
                state: 'BERHASIL' as const,
                detail: {
                    tanggalPengambilan: '25-04-2026',
                    jamPengambilan: '08.00 - 10.00 WIB',
                },
            })),
        );

        const result = await processProviderStatusCheckForTest('FOODSTATION', '628123', '2026-04-24', '2026-04-25');

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.lokasi).toBe('FOODSTATION');
        expect(mockCheckFoodStationStatuses).toHaveBeenCalledTimes(1);
        expect(mockCheckRegistrationStatuses).not.toHaveBeenCalled();
        expect(mockCheckPasarjayaStatuses).not.toHaveBeenCalled();
        expect(result.summary).toContain('📅 Tgl Pengambilan: 25-04-2026');
        expect(result.summary).toContain('🕐 Jam: 08.00 - 10.00 WIB');
    });

    test('provider filter returns only PASARJAYA items from mixed providers', async () => {
        mockGetTodayRecapForSender.mockResolvedValue({
            ...defaultRecapResponse,
            validCount: 5,
            validItems: [
                makeRecapItem({ nama: 'Dharma A', lokasi: 'DHARMAJAYA - Cakung' }),
                makeRecapItem({ nama: 'Pasar A', lokasi: 'PASARJAYA - Jakgrosir Kedoya', tanggal_lahir: '1981-10-10' }),
                makeRecapItem({ nama: 'Pasar B', lokasi: 'PASARJAYA - Pasar Minggu', tanggal_lahir: '1977-03-03' }),
                makeRecapItem({ nama: 'Food A', lokasi: 'FOODSTATION - Cipinang' }),
                makeRecapItem({ nama: 'Food B', lokasi: 'FOODSTATION' }),
            ],
        });

        const { items } = await resolveStatusSourceItemsForTest('628123', '2026-04-24', 'PASARJAYA');

        expect(items).toHaveLength(2);
        expect(items.every((item) => item.lokasi?.startsWith('PASARJAYA'))).toBe(true);
    });

    test('returns empty items when provider has no data', async () => {
        mockGetTodayRecapForSender.mockResolvedValue({
            ...defaultRecapResponse,
            validCount: 2,
            validItems: [
                makeRecapItem({ nama: 'Dharma A', lokasi: 'DHARMAJAYA - Pulogadung' }),
                makeRecapItem({ nama: 'Dharma B', lokasi: 'DHARMAJAYA - Cakung' }),
            ],
        });

        const { items } = await resolveStatusSourceItemsForTest('628123', '2026-04-24', 'PASARJAYA');

        expect(items).toEqual([]);
    });

    test('getStatusCheckProviderMapping excludes PASARJAYA when provider is blocked', async () => {
        mockIsProviderBlocked.mockImplementation(async (provider: string) => provider === 'PASARJAYA');

        const { getStatusCheckProviderMapping } = await import(`../config/messages.ts?${nextSuffix('messages')}`);
        const mapping = await getStatusCheckProviderMapping();
        const mappedProviders = Array.from(mapping.values());

        expect(mappedProviders).toContain('DHARMAJAYA');
        expect(mappedProviders).toContain('FOODSTATION');
        expect(mappedProviders).not.toContain('PASARJAYA');
    });
});
