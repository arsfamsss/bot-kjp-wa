import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.restore();

const actualSupabase = await import('../supabase');
const actualMessages = await import('../config/messages');
const actualTime = await import('../time');

const getWibPartsMock = mock(() => ({
    year: 2026,
    month: 4,
    day: 26,
    hour: 8,
    minute: 0,
    second: 0,
}));

const isProviderBlockedMock = mock(() => Promise.resolve(false));
const getProviderOverrideMock = mock(() => Promise.resolve(null));
const isProviderOpenMock = mock(() => true);

const isLocationBlockedMock = mock(() => Promise.resolve({ blocked: false, reason: null }));
const isGlobalLocationQuotaFullMock = mock(() => Promise.resolve({ full: false, used: 0, limit: 100 }));
const getBlockedLocationListMock = mock(() => Promise.resolve([]));
const closeLocationMock = mock(() => Promise.resolve({ success: true, message: 'OK' }));
const openLocationMock = mock(() => Promise.resolve({ success: true, message: 'OK' }));

let moduleSeq = 0;

function setMockTime(hour: number, minute: number): void {
    getWibPartsMock.mockImplementation(() => ({
        year: 2026,
        month: 4,
        day: 26,
        hour,
        minute,
        second: 0,
    }));
}

function resetAllMocks(): void {
    getWibPartsMock.mockReset();
    isProviderBlockedMock.mockReset();
    getProviderOverrideMock.mockReset();
    isProviderOpenMock.mockReset();
    isLocationBlockedMock.mockReset();
    isGlobalLocationQuotaFullMock.mockReset();
    getBlockedLocationListMock.mockReset();
    closeLocationMock.mockReset();
    openLocationMock.mockReset();

    setMockTime(8, 0);
    isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
    getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));
    isProviderOpenMock.mockImplementation(() => true);
    isLocationBlockedMock.mockImplementation(() => Promise.resolve({ blocked: false, reason: null }));
    isGlobalLocationQuotaFullMock.mockImplementation(() => Promise.resolve({ full: false, used: 0, limit: 100 }));
    getBlockedLocationListMock.mockImplementation(() => Promise.resolve([]));
    closeLocationMock.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
    openLocationMock.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
}

async function loadMessagesModule() {
    const timeResolved = new URL('../time.ts', import.meta.url).pathname;
    const supabaseResolved = new URL('../supabase.ts', import.meta.url).pathname;

    mock.module('../time', () => ({
        ...actualTime,
        getWibParts: getWibPartsMock,
    }));
    mock.module('../time.ts', () => ({
        ...actualTime,
        getWibParts: getWibPartsMock,
    }));
    mock.module(timeResolved, () => ({
        ...actualTime,
        getWibParts: getWibPartsMock,
    }));

    mock.module('../supabase', () => ({
        ...actualSupabase,
        isProviderBlocked: isProviderBlockedMock,
        getProviderOverride: getProviderOverrideMock,
    }));
    mock.module('../supabase.ts', () => ({
        ...actualSupabase,
        isProviderBlocked: isProviderBlockedMock,
        getProviderOverride: getProviderOverrideMock,
    }));
    mock.module(supabaseResolved, () => ({
        ...actualSupabase,
        isProviderBlocked: isProviderBlockedMock,
        getProviderOverride: getProviderOverrideMock,
    }));

    moduleSeq += 1;
    return import(`../config/messages.ts?provider-hours-messages-test=${moduleSeq}`);
}

async function loadLocationGateModule() {
    const supabaseResolved = new URL('../supabase.ts', import.meta.url).pathname;
    const messagesResolved = new URL('../config/messages.ts', import.meta.url).pathname;

    mock.module('../supabase', () => ({
        ...actualSupabase,
        getProviderOverride: getProviderOverrideMock,
        isLocationBlocked: isLocationBlockedMock,
        isProviderBlocked: isProviderBlockedMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        getBlockedLocationList: getBlockedLocationListMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
    }));
    mock.module('../supabase.ts', () => ({
        ...actualSupabase,
        getProviderOverride: getProviderOverrideMock,
        isLocationBlocked: isLocationBlockedMock,
        isProviderBlocked: isProviderBlockedMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        getBlockedLocationList: getBlockedLocationListMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
    }));
    mock.module(supabaseResolved, () => ({
        ...actualSupabase,
        getProviderOverride: getProviderOverrideMock,
        isLocationBlocked: isLocationBlockedMock,
        isProviderBlocked: isProviderBlockedMock,
        isGlobalLocationQuotaFull: isGlobalLocationQuotaFullMock,
        getBlockedLocationList: getBlockedLocationListMock,
        closeLocation: closeLocationMock,
        openLocation: openLocationMock,
    }));

    mock.module('../config/messages', () => ({
        ...actualMessages,
        isProviderOpen: isProviderOpenMock,
        REGISTRATION_HOURS: actualMessages.REGISTRATION_HOURS,
    }));
    mock.module('../config/messages.ts', () => ({
        ...actualMessages,
        isProviderOpen: isProviderOpenMock,
        REGISTRATION_HOURS: actualMessages.REGISTRATION_HOURS,
    }));
    mock.module(messagesResolved, () => ({
        ...actualMessages,
        isProviderOpen: isProviderOpenMock,
        REGISTRATION_HOURS: actualMessages.REGISTRATION_HOURS,
    }));

    moduleSeq += 1;
    return import(`../services/locationGate.ts?provider-hours-location-gate-test=${moduleSeq}`);
}

describe('provider hours - messages + locationGate integration', () => {
    beforeEach(() => {
        resetAllMocks();
    });

    afterEach(() => {
        mock.restore();
    });

    describe('A. isProviderOpen()', () => {
        it('Dharmajaya at 08:00 returns true', async () => {
            setMockTime(8, 0);
            const { isProviderOpen } = await loadMessagesModule();
            expect(isProviderOpen('DHARMAJAYA')).toBe(true);
        });

        it('Dharmajaya at 05:00 returns false', async () => {
            setMockTime(5, 0);
            const { isProviderOpen } = await loadMessagesModule();
            expect(isProviderOpen('DHARMAJAYA')).toBe(false);
        });

        it('Pasarjaya at 10:00 returns true', async () => {
            setMockTime(10, 0);
            const { isProviderOpen } = await loadMessagesModule();
            expect(isProviderOpen('PASARJAYA')).toBe(true);
        });

        it('Pasarjaya at 06:00 returns false', async () => {
            setMockTime(6, 0);
            const { isProviderOpen } = await loadMessagesModule();
            expect(isProviderOpen('PASARJAYA')).toBe(false);
        });

        it('Foodstation at 10:00 returns true', async () => {
            setMockTime(10, 0);
            const { isProviderOpen } = await loadMessagesModule();
            expect(isProviderOpen('FOODSTATION')).toBe(true);
        });

        it('Foodstation at 16:00 returns false', async () => {
            setMockTime(16, 0);
            const { isProviderOpen } = await loadMessagesModule();
            expect(isProviderOpen('FOODSTATION')).toBe(false);
        });
    });

    describe('B. getProviderClosedLabel()', () => {
        it('returns Dharmajaya opening label', async () => {
            const { getProviderClosedLabel } = await loadMessagesModule();
            expect(getProviderClosedLabel('DHARMAJAYA')).toBe('buka jam 06.05');
        });

        it('returns Pasarjaya opening label', async () => {
            const { getProviderClosedLabel } = await loadMessagesModule();
            expect(getProviderClosedLabel('PASARJAYA')).toBe('buka jam 07.10');
        });

        it('returns Foodstation opening label', async () => {
            const { getProviderClosedLabel } = await loadMessagesModule();
            expect(getProviderClosedLabel('FOODSTATION')).toBe('buka jam 06.30');
        });
    });

    describe('C. REGISTRATION_HOURS config', () => {
        it('contains correct Dharmajaya hours', async () => {
            const { REGISTRATION_HOURS } = await loadMessagesModule();
            expect(REGISTRATION_HOURS.DHARMAJAYA).toEqual({
                startHour: 6,
                startMinute: 5,
                endHour: 23,
                endMinute: 59,
                label: '06.05 - 23.59',
            });
        });

        it('contains correct Pasarjaya hours', async () => {
            const { REGISTRATION_HOURS } = await loadMessagesModule();
            expect(REGISTRATION_HOURS.PASARJAYA).toEqual({
                startHour: 7,
                startMinute: 10,
                endHour: 23,
                endMinute: 59,
                label: '07.10 - 23.59',
            });
        });

        it('contains correct Foodstation hours', async () => {
            const { REGISTRATION_HOURS } = await loadMessagesModule();
            expect(REGISTRATION_HOURS.FOODSTATION).toEqual({
                startHour: 6,
                startMinute: 30,
                endHour: 15,
                endMinute: 0,
                label: '06.30 - 15.00',
            });
        });
    });

    describe('D. Phase 0 in isSpecificLocationClosed()', () => {
        it('within hours returns open and proceeds to Phase 1 checks', async () => {
            isProviderOpenMock.mockImplementation(() => true);
            getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));

            const { isSpecificLocationClosed } = await loadLocationGateModule();
            const result = await isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');

            expect(result).toEqual({ closed: false, reason: null });
            expect(isLocationBlockedMock).toHaveBeenCalledWith('PASARJAYA - Jakgrosir Kedoya');
        });

        it('outside hours returns closed with operational-hours reason', async () => {
            isProviderOpenMock.mockImplementation(() => false);
            getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));

            const { isSpecificLocationClosed } = await loadLocationGateModule();
            const result = await isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');

            expect(result).toEqual({
                closed: true,
                reason: 'Di luar jam operasional (07.10 - 23.59 WIB)',
            });
            expect(isLocationBlockedMock).not.toHaveBeenCalled();
        });

        it('outside hours + open override returns open', async () => {
            isProviderOpenMock.mockImplementation(() => false);
            getProviderOverrideMock.mockImplementation(() => Promise.resolve({
                provider: 'PASARJAYA',
                override_type: 'open',
                expires_at: null,
            }));

            const { isSpecificLocationClosed } = await loadLocationGateModule();
            const result = await isSpecificLocationClosed('PASARJAYA', 'Jakgrosir Kedoya');

            expect(result).toEqual({ closed: false, reason: null });
            expect(isLocationBlockedMock).not.toHaveBeenCalled();
        });

        it('within hours + active close override returns closed by admin reason', async () => {
            isProviderOpenMock.mockImplementation(() => true);
            const start = new Date(Date.now() - 60_000).toISOString();
            const end = new Date(Date.now() + 60_000).toISOString();
            getProviderOverrideMock.mockImplementation(() => Promise.resolve({
                provider: 'DHARMAJAYA',
                override_type: 'close',
                manual_close_start: start,
                manual_close_end: end,
            }));

            const { isSpecificLocationClosed } = await loadLocationGateModule();
            const result = await isSpecificLocationClosed('DHARMAJAYA', 'Cakung');

            expect(result).toEqual({
                closed: true,
                reason: 'Ditutup sementara oleh admin',
            });
            expect(isLocationBlockedMock).not.toHaveBeenCalled();
        });

        it('expired open override falls back to default hours', async () => {
            isProviderOpenMock.mockImplementation(() => false);
            const past = new Date(Date.now() - 60_000).toISOString();
            getProviderOverrideMock.mockImplementation(() => Promise.resolve({
                provider: 'FOODSTATION',
                override_type: 'open',
                expires_at: past,
            }));

            const { isSpecificLocationClosed } = await loadLocationGateModule();
            const result = await isSpecificLocationClosed('FOODSTATION', 'FOODSTATION');

            expect(result).toEqual({
                closed: true,
                reason: 'Di luar jam operasional (06.30 - 15.00 WIB)',
            });
            expect(isLocationBlockedMock).not.toHaveBeenCalled();
        });
    });

    describe('E. isProviderAvailable()', () => {
        it('returns false when provider is blocked', async () => {
            isProviderBlockedMock.mockImplementation(() => Promise.resolve(true));
            setMockTime(10, 0);

            const { isProviderAvailable } = await loadMessagesModule();
            const result = await isProviderAvailable('PASARJAYA');

            expect(result).toBe(false);
            expect(getProviderOverrideMock).not.toHaveBeenCalled();
        });

        it('returns false when time-closed and no open override', async () => {
            isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
            getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));
            setMockTime(16, 0);

            const { isProviderAvailable } = await loadMessagesModule();
            const result = await isProviderAvailable('FOODSTATION');

            expect(result).toBe(false);
        });

        it('returns true when within hours and not blocked', async () => {
            isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
            setMockTime(10, 0);

            const { isProviderAvailable } = await loadMessagesModule();
            const result = await isProviderAvailable('PASARJAYA');

            expect(result).toBe(true);
        });

        it('returns true when outside hours but open override is active', async () => {
            isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
            setMockTime(16, 0);
            const future = new Date(Date.now() + 3_600_000).toISOString();
            getProviderOverrideMock.mockImplementation(() => Promise.resolve({
                provider: 'FOODSTATION',
                override_type: 'open',
                expires_at: future,
            }));

            const { isProviderAvailable } = await loadMessagesModule();
            const result = await isProviderAvailable('FOODSTATION');

            expect(result).toBe(true);
        });
    });

    describe('F. buildFormatDaftarMessage() with time-closed labels', () => {
        it('outside provider hours shows closed label (buka jam X)', async () => {
            isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
            getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));
            setMockTime(16, 0);

            const { buildFormatDaftarMessage } = await loadMessagesModule();
            const message = await buildFormatDaftarMessage();

            expect(message).toContain('*Foodstation* (TUTUP - buka jam 06.30)');
            expect(message).toContain('*PASARJAYA*');
            expect(message).toContain('*DHARMAJAYA*');
        });

        it('all providers within hours are shown normally without closed label', async () => {
            isProviderBlockedMock.mockImplementation(() => Promise.resolve(false));
            getProviderOverrideMock.mockImplementation(() => Promise.resolve(null));
            setMockTime(10, 0);

            const { buildFormatDaftarMessage } = await loadMessagesModule();
            const message = await buildFormatDaftarMessage();

            expect(message).toContain('*PASARJAYA*');
            expect(message).toContain('*DHARMAJAYA*');
            expect(message).toContain('*Foodstation*');
            expect(message).not.toContain('(TUTUP - ');
        });
    });
});
