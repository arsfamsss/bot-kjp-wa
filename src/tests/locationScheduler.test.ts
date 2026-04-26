import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { createSchedule } from './helpers';

const mockGetActiveSchedules = mock(() => Promise.resolve([]));
const mockMarkScheduleExecuted = mock(() => Promise.resolve(true));
const mockCloseLocationByProvider = mock(() => Promise.resolve(true));
const mockOpenLocationByProvider = mock(() => Promise.resolve(true));

mock.module('../supabase', () => ({
    getActiveSchedules: mockGetActiveSchedules,
    markScheduleExecuted: mockMarkScheduleExecuted,
    closeLocationByProvider: mockCloseLocationByProvider,
    openLocationByProvider: mockOpenLocationByProvider,
}));

const mockCloseSpecificLocation = mock(() => Promise.resolve({ success: true, message: 'OK' }));
const mockOpenSpecificLocation = mock(() => Promise.resolve({ success: true, message: 'OK' }));

mock.module('../services/locationGate', () => ({
    closeSpecificLocation: mockCloseSpecificLocation,
    openSpecificLocation: mockOpenSpecificLocation,
    ProviderType: {},
}));

const mockGetWibParts = mock(() => ({
    year: 2026,
    month: 4,
    day: 24,
    hour: 17,
    minute: 0,
    second: 0,
}));
const mockGetWibIsoDate = mock(() => '2026-04-24');

mock.module('../time', () => ({
    getWibParts: mockGetWibParts,
    getWibIsoDate: mockGetWibIsoDate,
}));

const { startSchedulePoller, stopSchedulePoller } = await import('../services/locationScheduler');

async function waitForPollerTick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 60));
}

function resetMockFunctions(): void {
    (mockGetActiveSchedules as any).mockClear?.();
    (mockMarkScheduleExecuted as any).mockClear?.();
    (mockCloseLocationByProvider as any).mockClear?.();
    (mockOpenLocationByProvider as any).mockClear?.();
    (mockCloseSpecificLocation as any).mockClear?.();
    (mockOpenSpecificLocation as any).mockClear?.();
    (mockGetWibParts as any).mockClear?.();
    (mockGetWibIsoDate as any).mockClear?.();
}

describe('locationScheduler poller', () => {
    beforeEach(() => {
        stopSchedulePoller();
        resetMockFunctions();

        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([]));
        mockMarkScheduleExecuted.mockImplementation(() => Promise.resolve(true));
        mockCloseLocationByProvider.mockImplementation(() => Promise.resolve(true));
        mockOpenLocationByProvider.mockImplementation(() => Promise.resolve(true));
        mockCloseSpecificLocation.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
        mockOpenSpecificLocation.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
        mockGetWibParts.mockImplementation(() => ({
            year: 2026,
            month: 4,
            day: 24,
            hour: 17,
            minute: 0,
            second: 0,
        }));
        mockGetWibIsoDate.mockImplementation(() => '2026-04-24');
    });

    afterEach(() => {
        stopSchedulePoller();
    });

    it('executes one-time due schedule and deactivates it', async () => {
        const dueSchedule = createSchedule({
            id: 'one-time-due-1',
            schedule_type: 'one_time',
            action: 'close',
            provider: 'DHARMAJAYA',
            sub_location: null,
            reason: 'Auto close now',
            scheduled_time: new Date(Date.now() - 60_000).toISOString(),
        });

        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([dueSchedule]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockCloseLocationByProvider).toHaveBeenCalledWith('DHARMAJAYA', 'Auto close now');
        expect(mockMarkScheduleExecuted).toHaveBeenCalledWith('one-time-due-1', true);
    });

    it('skips one-time schedule when scheduled_time is in the future', async () => {
        const futureSchedule = createSchedule({
            id: 'one-time-future-1',
            schedule_type: 'one_time',
            action: 'close',
            provider: 'DHARMAJAYA',
            sub_location: null,
            scheduled_time: new Date(Date.now() + 5 * 60_000).toISOString(),
        });

        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([futureSchedule]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockCloseLocationByProvider).not.toHaveBeenCalled();
        expect(mockMarkScheduleExecuted).not.toHaveBeenCalled();
    });

    it('executes recurring schedule when due and not executed today, keeping it active', async () => {
        const recurringSchedule = createSchedule({
            id: 'recurring-due-1',
            schedule_type: 'recurring',
            action: 'open',
            provider: 'PASARJAYA',
            sub_location: null,
            recurring_time: '17:00',
            last_executed_at: '2026-04-23T10:00:00.000Z',
        });

        mockGetWibParts.mockImplementation(() => ({
            year: 2026,
            month: 4,
            day: 24,
            hour: 17,
            minute: 30,
            second: 0,
        }));
        mockGetWibIsoDate.mockImplementation((date: Date) => (date.getUTCDate() === 23 ? '2026-04-23' : '2026-04-24'));
        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([recurringSchedule]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockOpenLocationByProvider).toHaveBeenCalledWith('PASARJAYA');
        expect(mockMarkScheduleExecuted).toHaveBeenCalledWith('recurring-due-1', false);
    });

    it('skips recurring schedule when already executed today', async () => {
        const recurringAlreadyRan = createSchedule({
            id: 'recurring-skip-1',
            schedule_type: 'recurring',
            action: 'close',
            provider: 'DHARMAJAYA',
            recurring_time: '17:00',
            last_executed_at: '2026-04-24T02:00:00.000Z',
        });

        mockGetWibParts.mockImplementation(() => ({
            year: 2026,
            month: 4,
            day: 24,
            hour: 18,
            minute: 0,
            second: 0,
        }));
        mockGetWibIsoDate.mockImplementation(() => '2026-04-24');
        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([recurringAlreadyRan]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockCloseLocationByProvider).not.toHaveBeenCalled();
        expect(mockMarkScheduleExecuted).not.toHaveBeenCalled();
    });

    it('routes provider-level action when sub_location is null', async () => {
        const providerLevelSchedule = createSchedule({
            id: 'provider-close-1',
            schedule_type: 'one_time',
            action: 'close',
            provider: 'FOODSTATION',
            sub_location: null,
            reason: null,
            scheduled_time: new Date(Date.now() - 60_000).toISOString(),
        });

        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([providerLevelSchedule]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockCloseLocationByProvider).toHaveBeenCalledWith('FOODSTATION', 'Ditutup otomatis oleh jadwal');
        expect(mockCloseSpecificLocation).not.toHaveBeenCalled();
    });

    it('routes sub-location action when sub_location is present', async () => {
        const subLocationSchedule = createSchedule({
            id: 'sub-close-1',
            schedule_type: 'one_time',
            action: 'close',
            provider: 'DHARMAJAYA',
            sub_location: 'Cakung',
            reason: 'Sub location closed',
            scheduled_time: new Date(Date.now() - 60_000).toISOString(),
        });

        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([subLocationSchedule]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockCloseSpecificLocation).toHaveBeenCalledWith('DHARMAJAYA', 'Cakung', 'Sub location closed');
        expect(mockCloseLocationByProvider).not.toHaveBeenCalled();
    });

    it('continues processing remaining schedules when one schedule throws', async () => {
        const failingSchedule = createSchedule({
            id: 'error-1',
            schedule_type: 'one_time',
            action: 'close',
            provider: 'DHARMAJAYA',
            sub_location: null,
            scheduled_time: new Date(Date.now() - 120_000).toISOString(),
        });

        const succeedingSchedule = createSchedule({
            id: 'ok-1',
            schedule_type: 'one_time',
            action: 'open',
            provider: 'PASARJAYA',
            sub_location: null,
            scheduled_time: new Date(Date.now() - 60_000).toISOString(),
        });

        mockCloseLocationByProvider.mockImplementation(() => Promise.reject(new Error('close failed')));
        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([failingSchedule, succeedingSchedule]));

        startSchedulePoller(999_999);
        await waitForPollerTick();

        expect(mockOpenLocationByProvider).toHaveBeenCalledWith('PASARJAYA');
        expect(mockMarkScheduleExecuted).toHaveBeenCalledTimes(1);
        expect(mockMarkScheduleExecuted).toHaveBeenCalledWith('ok-1', true);
    });

    it('starts poller once and stopSchedulePoller cleans lifecycle state', async () => {
        mockGetActiveSchedules.mockImplementation(() => Promise.resolve([]));

        startSchedulePoller(999_999);
        await waitForPollerTick();
        expect(mockGetActiveSchedules).toHaveBeenCalledTimes(1);

        startSchedulePoller(999_999);
        await waitForPollerTick();
        expect(mockGetActiveSchedules).toHaveBeenCalledTimes(1);

        stopSchedulePoller();

        startSchedulePoller(999_999);
        await waitForPollerTick();
        expect(mockGetActiveSchedules).toHaveBeenCalledTimes(2);
    });
});
