import { describe, it, expect, mock, beforeEach } from 'bun:test';

const actualSupabase = await import('../supabase');
const actualLocationGate = await import('../services/locationGate');
const actualMessages = await import('../config/messages');

const mockCloseLocationByProvider = mock(() => Promise.resolve(true));
const mockOpenLocationByProvider = mock(() => Promise.resolve(true));
const mockIsProviderBlocked = mock(() => Promise.resolve(false));
const mockCreateSchedule = mock(() => Promise.resolve({ id: 'test-uuid' }));
const mockDeleteSchedule = mock(() => Promise.resolve(true));
const mockListSchedulesByProvider = mock(() => Promise.resolve([]));

mock.module('../supabase', () => ({
    ...actualSupabase,
    closeLocationByProvider: mockCloseLocationByProvider,
    openLocationByProvider: mockOpenLocationByProvider,
    isProviderBlocked: mockIsProviderBlocked,
    createSchedule: mockCreateSchedule,
    deleteSchedule: mockDeleteSchedule,
    listSchedulesByProvider: mockListSchedulesByProvider,
}));

const mockIsSpecificLocationClosed = mock(() => Promise.resolve({ closed: false, reason: null }));
const mockCloseSpecificLocation = mock(() => Promise.resolve({ success: true, message: 'OK' }));
const mockOpenSpecificLocation = mock(() => Promise.resolve({ success: true, message: 'OK' }));
const mockListAllProviderStatuses = mock(() => Promise.resolve([
    { provider: 'DHARMAJAYA', name: 'Dharmajaya', closed: false },
    { provider: 'PASARJAYA', name: 'Pasarjaya', closed: false },
    { provider: 'FOODSTATION', name: 'Foodstation', closed: false },
]));

mock.module('../services/locationGate', () => ({
    ...actualLocationGate,
    isSpecificLocationClosed: mockIsSpecificLocationClosed,
    closeSpecificLocation: mockCloseSpecificLocation,
    openSpecificLocation: mockOpenSpecificLocation,
    listAllProviderStatuses: mockListAllProviderStatuses,
}));

mock.module('../config/messages', () => ({
    ...actualMessages,
    PROVIDER_LIST: [
        { key: 'DHARMAJAYA', name: 'Dharmajaya', mapping: { '1': 'Duri Kosambi', '2': 'Kapuk Jagal', '3': 'Pulogadung', '4': 'Cakung' } },
        { key: 'PASARJAYA', name: 'Pasarjaya', mapping: { '1': 'Jakgrosir Kedoya', '2': 'Gerai Rusun Pesakih', '3': 'Mini DC Kec. Cengkareng', '4': 'Jakmart Bambu Larangan' } },
        { key: 'FOODSTATION', name: 'Foodstation', mapping: { '1': 'FOODSTATION' } },
    ],
    PASARJAYA_MAPPING: { '1': 'Jakgrosir Kedoya', '2': 'Gerai Rusun Pesakih', '3': 'Mini DC Kec. Cengkareng', '4': 'Jakmart Bambu Larangan' },
    DHARMAJAYA_MAPPING: { '1': 'Duri Kosambi', '2': 'Kapuk Jagal', '3': 'Pulogadung', '4': 'Cakung' },
    FOODSTATION_MAPPING: { '1': 'FOODSTATION' },
    LOCATION_MGMT_MENU_TEXT: ({ dharmajayaStatus, pasarjayaStatus, foodStationStatus }: { dharmajayaStatus: string; pasarjayaStatus: string; foodStationStatus: string }) =>
        [`*📍 Kelola Buka/Tutup Lokasi*`, '', `1. Dharmajaya [${dharmajayaStatus}]`, `2. Pasarjaya [${pasarjayaStatus}]`, `3. Foodstation [${foodStationStatus}]`, '', '0. Kembali ke menu admin'].join('\n'),
}));

const { handleLocationMgmt } = await import('../services/adminLocationMenu');

let phoneSequence = 0;
function getPhone(prefix: string): string {
    phoneSequence += 1;
    return `${prefix}-${phoneSequence}`;
}

async function goToProviderAction(phone: string, providerChoice: '1' | '2' | '3' = '1') {
    return handleLocationMgmt('LOCATION_MGMT_MENU', providerChoice, phone);
}

function resetAllMocks(): void {
    (mockCloseLocationByProvider as any).mockClear?.();
    (mockOpenLocationByProvider as any).mockClear?.();
    (mockIsProviderBlocked as any).mockClear?.();
    (mockCreateSchedule as any).mockClear?.();
    (mockDeleteSchedule as any).mockClear?.();
    (mockListSchedulesByProvider as any).mockClear?.();
    (mockIsSpecificLocationClosed as any).mockClear?.();
    (mockCloseSpecificLocation as any).mockClear?.();
    (mockOpenSpecificLocation as any).mockClear?.();
    (mockListAllProviderStatuses as any).mockClear?.();
}

describe('handleLocationMgmt', () => {
    beforeEach(() => {
        resetAllMocks();

        mockCloseLocationByProvider.mockImplementation(() => Promise.resolve(true));
        mockOpenLocationByProvider.mockImplementation(() => Promise.resolve(true));
        mockIsProviderBlocked.mockImplementation(() => Promise.resolve(false));
        mockCreateSchedule.mockImplementation(() => Promise.resolve({ id: 'test-uuid' }));
        mockDeleteSchedule.mockImplementation(() => Promise.resolve(true));
        mockListSchedulesByProvider.mockImplementation(() => Promise.resolve([]));

        mockIsSpecificLocationClosed.mockImplementation(() => Promise.resolve({ closed: false, reason: null }));
        mockCloseSpecificLocation.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
        mockOpenSpecificLocation.mockImplementation(() => Promise.resolve({ success: true, message: 'OK' }));
        mockListAllProviderStatuses.mockImplementation(() => Promise.resolve([
            { provider: 'DHARMAJAYA', name: 'Dharmajaya', closed: false },
            { provider: 'PASARJAYA', name: 'Pasarjaya', closed: false },
            { provider: 'FOODSTATION', name: 'Foodstation', closed: false },
        ]));
    });

    it('selects Dharmajaya from menu and goes to provider action', async () => {
        const res = await handleLocationMgmt('LOCATION_MGMT_MENU', '1', getPhone('menu-dj'));
        expect(res.nextState).toBe('LOCATION_MGMT_PROVIDER_ACTION');
        expect(res.replyText).toContain('Provider: Dharmajaya');
    });

    it('selects Pasarjaya from menu and goes to provider action', async () => {
        const res = await handleLocationMgmt('LOCATION_MGMT_MENU', '2', getPhone('menu-pj'));
        expect(res.nextState).toBe('LOCATION_MGMT_PROVIDER_ACTION');
        expect(res.replyText).toContain('Provider: Pasarjaya');
    });

    it('selects Food Station from menu and goes to provider action', async () => {
        const res = await handleLocationMgmt('LOCATION_MGMT_SELECT_PROVIDER', '3', getPhone('menu-fs'));
        expect(res.nextState).toBe('LOCATION_MGMT_PROVIDER_ACTION');
        expect(res.replyText).toContain('Provider: Foodstation');
    });

    it('exits to admin root on input 0 at menu', async () => {
        const res = await handleLocationMgmt('LOCATION_MGMT_MENU', '0', getPhone('menu-exit'));
        expect(res.nextState).toBeNull();
        expect(res.replyText).toBe('');
    });

    it('returns invalid message and stays in menu for invalid menu input', async () => {
        const res = await handleLocationMgmt('LOCATION_MGMT_MENU', 'abc', getPhone('menu-invalid'));
        expect(res.nextState).toBe('LOCATION_MGMT_MENU');
        expect(res.replyText).toContain('Pilihan tidak valid');
    });

    it('provider action 1 closes provider and returns to menu', async () => {
        const phone = getPhone('action-close');
        await goToProviderAction(phone, '1');
        const res = await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '1', phone);

        expect(mockCloseLocationByProvider).toHaveBeenCalledWith('DHARMAJAYA', 'Ditutup via menu admin');
        expect(res.nextState).toBe('LOCATION_MGMT_MENU');
        expect(res.replyText).toContain('berhasil *ditutup*');
    });

    it('provider action 2 opens provider and returns to menu', async () => {
        const phone = getPhone('action-open');
        await goToProviderAction(phone, '2');
        const res = await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '2', phone);

        expect(mockOpenLocationByProvider).toHaveBeenCalledWith('PASARJAYA');
        expect(res.nextState).toBe('LOCATION_MGMT_MENU');
        expect(res.replyText).toContain('berhasil *dibuka*');
    });

    it('provider action 3 enters sub-location menu and can select a sub-location', async () => {
        const phone = getPhone('action-sub');
        await goToProviderAction(phone, '1');

        const selectSub = await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '3', phone);
        expect(selectSub.nextState).toBe('LOCATION_MGMT_SELECT_SUB');
        expect(selectSub.replyText).toContain('Sub-lokasi Dharmajaya');

        const chooseSub = await handleLocationMgmt('LOCATION_MGMT_SELECT_SUB', '2', phone);
        expect(chooseSub.nextState).toBe('LOCATION_MGMT_CONFIRM_TOGGLE');
        expect(chooseSub.replyText).toContain('Kapuk Jagal');
    });

    it('food station sub-location menu has single sub-location and proceeds to confirm', async () => {
        const phone = getPhone('foodstation-sub');
        await goToProviderAction(phone, '3');

        const selectSub = await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '3', phone);
        expect(selectSub.nextState).toBe('LOCATION_MGMT_SELECT_SUB');
        expect(selectSub.replyText).toContain('1. FOODSTATION');

        const chooseSub = await handleLocationMgmt('LOCATION_MGMT_SELECT_SUB', '1', phone);
        expect(chooseSub.nextState).toBe('LOCATION_MGMT_CONFIRM_TOGGLE');
        expect(chooseSub.replyText).toContain('FOODSTATION');
    });

    it('confirm toggle auto-opens when current status is closed', async () => {
        const phone = getPhone('toggle-open');
        mockIsSpecificLocationClosed.mockImplementation(() => Promise.resolve({ closed: true, reason: 'Manual close' }));

        await goToProviderAction(phone, '1');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '3', phone);
        await handleLocationMgmt('LOCATION_MGMT_SELECT_SUB', '1', phone);

        const res = await handleLocationMgmt('LOCATION_MGMT_CONFIRM_TOGGLE', '1', phone);

        expect(mockOpenSpecificLocation).toHaveBeenCalledWith('DHARMAJAYA', 'Duri Kosambi');
        expect(res.nextState).toBe('LOCATION_MGMT_SELECT_SUB');
        expect(res.replyText).toContain('berhasil *dibuka*');
    });

    it('confirm toggle auto-closes when current status is open', async () => {
        const phone = getPhone('toggle-close');

        await goToProviderAction(phone, '1');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '3', phone);
        await handleLocationMgmt('LOCATION_MGMT_SELECT_SUB', '4', phone);

        const res = await handleLocationMgmt('LOCATION_MGMT_CONFIRM_TOGGLE', '1', phone);

        expect(mockCloseSpecificLocation).toHaveBeenCalledWith('DHARMAJAYA', 'Cakung', 'Ditutup via menu admin');
        expect(res.nextState).toBe('LOCATION_MGMT_SELECT_SUB');
        expect(res.replyText).toContain('berhasil *ditutup*');
    });

    it('schedule menu supports add (T) and delete by number', async () => {
        const phone = getPhone('schedule-menu');
        mockListSchedulesByProvider.mockImplementation(() => Promise.resolve([
            {
                id: 'sched-1',
                provider: 'DHARMAJAYA',
                schedule_type: 'one_time',
                action: 'close',
                sub_location: null,
                scheduled_time: '2026-04-25T17:00:00+07:00',
                is_active: true,
            },
        ]));

        await goToProviderAction(phone, '1');
        const toSchedule = await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phone);
        expect(toSchedule.nextState).toBe('LOCATION_MGMT_SCHEDULE_MENU');

        const addFlow = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_MENU', 'T', phone);
        expect(addFlow.nextState).toBe('LOCATION_MGMT_SCHEDULE_TYPE');

        const deleteFlow = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_MENU', '1', phone);
        expect(mockDeleteSchedule).toHaveBeenCalledWith('sched-1');
        expect(deleteFlow.nextState).toBe('LOCATION_MGMT_SCHEDULE_MENU');
        expect(deleteFlow.replyText).toContain('Jadwal berhasil dihapus');
    });

    it('schedule type chooses one_time and recurring and supports back navigation', async () => {
        const phoneOneTime = getPhone('sched-type-1');
        await goToProviderAction(phoneOneTime, '2');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phoneOneTime);

        const oneTime = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TYPE', '1', phoneOneTime);
        expect(oneTime.nextState).toBe('LOCATION_MGMT_SCHEDULE_TIME');
        expect(oneTime.replyText).toContain('YYYY-MM-DD HH:mm');

        const phoneRecurring = getPhone('sched-type-2');
        await goToProviderAction(phoneRecurring, '2');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phoneRecurring);

        const recurring = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TYPE', '2', phoneRecurring);
        expect(recurring.nextState).toBe('LOCATION_MGMT_SCHEDULE_TIME');
        expect(recurring.replyText).toContain('format: HH:mm');

        const back = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TYPE', '0', phoneRecurring);
        expect(back.nextState).toBe('LOCATION_MGMT_SCHEDULE_MENU');
    });

    it('schedule time validates input and builds confirmation for one_time', async () => {
        const phone = getPhone('sched-time-ot');
        await goToProviderAction(phone, '1');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phone);
        await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TYPE', '1', phone);

        const invalid = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TIME', '2026/04/25 17:00', phone);
        expect(invalid.nextState).toBe('LOCATION_MGMT_SCHEDULE_TIME');
        expect(invalid.replyText).toContain('Format tidak valid');

        const valid = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TIME', '25/04/2026 17:00', phone);
        expect(valid.nextState).toBe('LOCATION_MGMT_SCHEDULE_CONFIRM');
        expect(valid.replyText).toContain('Waktu: 2026-04-25 17:00');
    });

    it('schedule time validates recurring HH:mm format', async () => {
        const phone = getPhone('sched-time-rec');
        await goToProviderAction(phone, '1');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phone);
        await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TYPE', '2', phone);

        const invalid = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TIME', '24:00', phone);
        expect(invalid.nextState).toBe('LOCATION_MGMT_SCHEDULE_TIME');
        expect(invalid.replyText).toContain('Jam tidak valid');

        const valid = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TIME', '7:05', phone);
        expect(valid.nextState).toBe('LOCATION_MGMT_SCHEDULE_CONFIRM');
        expect(valid.replyText).toContain('Setiap hari 07:05');
    });

    it('schedule confirm creates schedule and returns to schedule menu', async () => {
        const phone = getPhone('sched-confirm');

        await goToProviderAction(phone, '1');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phone);
        await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TYPE', '1', phone);
        await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_TIME', '2026-04-25 17:00', phone);

        const confirmed = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_CONFIRM', '1', phone);
        expect(confirmed.nextState).toBe('LOCATION_MGMT_SCHEDULE_MENU');
        expect(confirmed.replyText).toContain('Jadwal berhasil dibuat');

        expect(mockCreateSchedule).toHaveBeenCalledTimes(1);
        const [scheduleArg] = mockCreateSchedule.mock.calls[0] as [Record<string, unknown>];
        expect(scheduleArg.provider).toBe('DHARMAJAYA');
        expect(scheduleArg.sub_location).toBeNull();
        expect(scheduleArg.action).toBe('close');
        expect(scheduleArg.schedule_type).toBe('one_time');
        expect(scheduleArg.scheduled_time).toBe('2026-04-25 17:00:00+07:00');
    });

    it('back navigation works on provider action, sub select, confirm, and schedule menu', async () => {
        const phone = getPhone('backs');

        await goToProviderAction(phone, '1');
        const backFromAction = await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '0', phone);
        expect(backFromAction.nextState).toBe('LOCATION_MGMT_MENU');

        await goToProviderAction(phone, '1');
        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '3', phone);
        const backFromSub = await handleLocationMgmt('LOCATION_MGMT_SELECT_SUB', '0', phone);
        expect(backFromSub.nextState).toBe('LOCATION_MGMT_PROVIDER_ACTION');

        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '3', phone);
        await handleLocationMgmt('LOCATION_MGMT_SELECT_SUB', '1', phone);
        const backFromConfirm = await handleLocationMgmt('LOCATION_MGMT_CONFIRM_TOGGLE', '2', phone);
        expect(backFromConfirm.nextState).toBe('LOCATION_MGMT_SELECT_SUB');

        await handleLocationMgmt('LOCATION_MGMT_PROVIDER_ACTION', '4', phone);
        const backFromSchedule = await handleLocationMgmt('LOCATION_MGMT_SCHEDULE_MENU', '0', phone);
        expect(backFromSchedule.nextState).toBe('LOCATION_MGMT_PROVIDER_ACTION');
    });
});
