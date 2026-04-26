import { beforeEach, describe, expect, it, mock } from 'bun:test';

const actualSupabase = await import('../supabase');
const actualMessages = await import('../config/messages');
const actualTime = await import('../time');

const isLocationBlockedMock = mock(() => Promise.resolve({ blocked: false, reason: null }));
const isProviderBlockedMock = mock(() => Promise.resolve(false));
const isGlobalLocationQuotaFullMock = mock(() => Promise.resolve({ full: false, used: 0, limit: 100 }));
const getBlockedLocationListMock = mock(() => Promise.resolve([]));
const closeLocationMock = mock(() => Promise.resolve({ success: true, message: 'OK' }));
const openLocationMock = mock(() => Promise.resolve({ success: true, message: 'OK' }));
const getProcessingDayKeyMock = mock(() => '2026-04-24');
const getProviderOverrideMock = mock(() => Promise.resolve(null));

let moduleSeq = 0;

async function loadLocationGateModule() {
    const supabaseResolved = new URL('../supabase.ts', import.meta.url).pathname;
    mock.module('../supabase', () => ({
        ...actualSupabase,
        isLocationBlocked: isLocationBlockedMock,
        isProviderBlocked: isProviderBlockedMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        getBlockedLocationList: getBlockedLocationListMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
        getProviderOverride: getProviderOverrideMock,
    }));
    mock.module('../supabase.ts', () => ({
        ...actualSupabase,
        isLocationBlocked: isLocationBlockedMock,
        isProviderBlocked: isProviderBlockedMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        getBlockedLocationList: getBlockedLocationListMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
        getProviderOverride: getProviderOverrideMock,
    }));
    mock.module(supabaseResolved, () => ({
        ...actualSupabase,
        isLocationBlocked: isLocationBlockedMock,
        isProviderBlocked: isProviderBlockedMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        getBlockedLocationList: getBlockedLocationListMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
        getProviderOverride: getProviderOverrideMock,
    }));

    mock.module('../config/messages', () => ({
        ...actualMessages,
        DHARMAJAYA_MAPPING: {
            '1': 'Duri Kosambi',
            '2': 'Kapuk Jagal',
        },
        PASARJAYA_MAPPING: {
            '1': 'Jakgrosir Kedoya',
            '2': 'Gerai Rusun Pesakih',
        },
        isProviderOpen: () => true,
        getProviderClosedLabel: () => 'buka jam 06.30',
    }));

    mock.module('../time', () => ({
        ...actualTime,
        getProcessingDayKey: getProcessingDayKeyMock,
    }));

    moduleSeq += 1;
    return import(`../services/locationGate.ts?location-gate-test=${moduleSeq}`);
}

function resetAllMocks() {
    isLocationBlockedMock.mockReset();
    isProviderBlockedMock.mockReset();
    isGlobalLocationQuotaFullMock.mockReset();
    getBlockedLocationListMock.mockReset();
    closeLocationMock.mockReset();
    openLocationMock.mockReset();
    getProcessingDayKeyMock.mockReset();
    getProviderOverrideMock.mockReset();

    isLocationBlockedMock.mockImplementation(() => Promise.resolve({ blocked: false, reason: null }));
    isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
    isGlobalLocationQuotaFullMock.mockImplementation(() => Promise.resolve({ full: false, used: 0, limit: 100 }));
    getBlockedLocationListMock.mockImplementation(() => Promise.resolve([]));
    closeLocationMock.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
    openLocationMock.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
    getProcessingDayKeyMock.mockImplementation(() => '2026-04-24');
    getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));
}

describe('locationGate - isSpecificLocationClosed', () => {
    beforeEach(() => {
        resetAllMocks();
    });

    it('DHARMAJAYA: returns open when no sub-location/provider/quota block', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();

        const result = await isSpecificLocationClosed('DHARMAJAYA', 'Cakung');
        expect(result).toEqual({ closed: false, reason: null });
        expect(isLocationBlockedMock).toHaveBeenCalledWith('DHARMAJAYA - Cakung');
        expect(isProviderBlockedMock).toHaveBeenCalledWith('DHARMAJAYA');
        expect(isGlobalLocationQuotaFullMock).toHaveBeenCalledWith('2026-04-24', 'DHARMAJAYA - Cakung');
    });

    it('DHARMAJAYA: returns closed when sub-location is blocked', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isLocationBlockedMock.mockImplementation(() => Promise.resolve({ blocked: true, reason: 'Sub ditutup' }));

        const result = await isSpecificLocationClosed('DHARMAJAYA', 'Cakung');

        expect(result).toEqual({ closed: true, reason: 'Sub ditutup' });
        expect(isProviderBlockedMock).not.toHaveBeenCalled();
        expect(isGlobalLocationQuotaFullMock).not.toHaveBeenCalled();
    });

    it('DHARMAJAYA: returns closed when provider-level is blocked', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isProviderBlockedMock.mockImplementation(() => Promise.resolve(true));

        const result = await isSpecificLocationClosed('DHARMAJAYA', 'Pulogadung');

        expect(result).toEqual({ closed: true, reason: 'Provider ditutup' });
        expect(isGlobalLocationQuotaFullMock).not.toHaveBeenCalled();
    });

    it('PASARJAYA: returns open when no sub-location/provider block', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();

        const result = await isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');

        expect(result).toEqual({ closed: false, reason: null });
        expect(isLocationBlockedMock).toHaveBeenCalledWith('PASARJAYA - Jakgrosir Kedoya');
        expect(isProviderBlockedMock).toHaveBeenCalledWith('PASARJAYA');
        expect(isGlobalLocationQuotaFullMock).not.toHaveBeenCalled();
    });

    it('PASARJAYA: returns closed when sub-location is blocked', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isLocationBlockedMock.mockImplementation(() => Promise.resolve({ blocked: true, reason: 'Sub PJ tutup' }));

        const result = await isSpecificLocationClosed('PASARJAYA', 'Gerai Rusun Pesakih');

        expect(result).toEqual({ closed: true, reason: 'Sub PJ tutup' });
        expect(isProviderBlockedMock).not.toHaveBeenCalled();
    });

    it('PASARJAYA: returns closed when provider-level is blocked', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isProviderBlockedMock.mockImplementation(() => Promise.resolve(true));

        const result = await isSpecificLocationClosed('PASARJAYA', 'Gerai Rusun Pesakih');

        expect(result).toEqual({ closed: true, reason: 'Provider ditutup' });
    });

    it('FOODSTATION: returns open when no sub-location/provider block', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();

        const result = await isSpecificLocationClosed('FOODSTATION', 'FOODSTATION');

        expect(result).toEqual({ closed: false, reason: null });
        expect(isLocationBlockedMock).toHaveBeenCalledWith('FOODSTATION - FOODSTATION');
        expect(isProviderBlockedMock).toHaveBeenCalledWith('FOODSTATION');
        expect(isGlobalLocationQuotaFullMock).not.toHaveBeenCalled();
    });

    it('FOODSTATION: returns closed when sub-location is blocked', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isLocationBlockedMock.mockImplementation(() => Promise.resolve({ blocked: true, reason: 'Food station tutup' }));

        const result = await isSpecificLocationClosed('FOODSTATION', 'FOODSTATION');

        expect(result).toEqual({ closed: true, reason: 'Food station tutup' });
        expect(isProviderBlockedMock).not.toHaveBeenCalled();
    });

    it('FOODSTATION: returns closed when provider-level is blocked', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isProviderBlockedMock.mockImplementation(() => Promise.resolve(true));

        const result = await isSpecificLocationClosed('FOODSTATION', 'FOODSTATION');

        expect(result).toEqual({ closed: true, reason: 'Provider ditutup' });
    });

    it('DHARMAJAYA: returns closed when global quota is full', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();
        isGlobalLocationQuotaFullMock.mockImplementation(() => Promise.resolve({ full: true, used: 100, limit: 100 }));

        const result = await isSpecificLocationClosed('DHARMAJAYA', 'Cakung');

        expect(result.closed).toBe(true);
        expect(result.reason).toContain('Kuota global harian sudah penuh (100/100).');
    });

    it('Foodstation no early-return: still checks DB blocker', async () => {
        const { isSpecificLocationClosed } = await loadLocationGateModule();

        await isSpecificLocationClosed('FOODSTATION', 'FOODSTATION');
        expect(isLocationBlockedMock).toHaveBeenCalledTimes(1);
        expect(isLocationBlockedMock).toHaveBeenCalledWith('FOODSTATION - FOODSTATION');
    });
});

describe('locationGate - status/menu helpers', () => {
    beforeEach(() => {
        resetAllMocks();
    });

    it('buildProviderMenuWithStatus marks closed sub-location and quota-full sub-location with (TUTUP)', async () => {
        const { buildProviderMenuWithStatus } = await loadLocationGateModule();

        getBlockedLocationListMock.mockImplementation(() => Promise.resolve([
            { location_key: 'DHARMAJAYA - Duri Kosambi' },
            { location_key: 'PASARJAYA - Jakgrosir Kedoya' },
        ]));

        isGlobalLocationQuotaFullMock.mockImplementation((_dayKey: string, locationKey: string) => Promise.resolve({
            full: locationKey === 'DHARMAJAYA - Kapuk Jagal',
            used: locationKey === 'DHARMAJAYA - Kapuk Jagal' ? 50 : 0,
            limit: 50,
        }));

        const menu = await buildProviderMenuWithStatus('DHARMAJAYA', {
            '1': 'Duri Kosambi',
            '2': 'Kapuk Jagal',
        });

        expect(menu).toContain('*1.* Duri Kosambi (TUTUP)');
        expect(menu).toContain('*2.* Kapuk Jagal (TUTUP)');
    });

    it('listClosedLocationsByProvider filters by provider prefix', async () => {
        const { listClosedLocationsByProvider } = await loadLocationGateModule();

        getBlockedLocationListMock.mockImplementation(() => Promise.resolve([
            { location_key: 'DHARMAJAYA - Cakung' },
            { location_key: 'DHARMAJAYA - Pulogadung' },
            { location_key: 'PASARJAYA - Jakgrosir Kedoya' },
        ]));

        const closed = await listClosedLocationsByProvider('DHARMAJAYA');
        expect(closed).toEqual(['DHARMAJAYA - Cakung', 'DHARMAJAYA - Pulogadung']);
    });

    it('listAllProviderStatuses returns all 3 providers with closed flags', async () => {
        const { listAllProviderStatuses } = await loadLocationGateModule();

        isProviderBlockedMock
            .mockImplementationOnce(() => Promise.resolve(true))
            .mockImplementationOnce(() => Promise.resolve(false))
            .mockImplementationOnce(() => Promise.resolve(true));

        const rows = await listAllProviderStatuses();

        expect(rows).toEqual([
            { provider: 'DHARMAJAYA', name: 'Dharmajaya', closed: true },
            { provider: 'PASARJAYA', name: 'Pasarjaya', closed: false },
            { provider: 'FOODSTATION', name: 'Foodstation', closed: true },
        ]);
    });
});
