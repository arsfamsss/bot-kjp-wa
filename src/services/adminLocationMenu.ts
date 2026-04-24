// src/services/adminLocationMenu.ts
// Unified admin location management menu handler.
// Handles all LOCATION_MGMT_* states for toggling location open/close and managing schedules.

import type { AdminFlowState } from '../state';
import type { ProviderType } from './locationGate';
import {
    isSpecificLocationClosed,
    closeSpecificLocation,
    openSpecificLocation,
    listAllProviderStatuses,
} from './locationGate';
import {
    closeLocationByProvider,
    openLocationByProvider,
    isProviderBlocked,
    createSchedule,
    deleteSchedule,
    listSchedulesByProvider,
} from '../supabase';
import type { LocationScheduleInput } from '../supabase';
import {
    PROVIDER_LIST,
    PASARJAYA_MAPPING,
    DHARMAJAYA_MAPPING,
    FOODSTATION_MAPPING,
    LOCATION_MGMT_MENU_TEXT,
} from '../config/messages';

const adminLocationProvider = new Map<string, ProviderType>();
const adminLocationSub = new Map<string, string>();
const adminScheduleType = new Map<string, 'one_time' | 'recurring'>();
const adminScheduleTime = new Map<string, string>();
const adminScheduleAction = new Map<string, 'open' | 'close'>();

/** Fallback when PROVIDER_LIST is unavailable (T6 parallel task not yet merged) */
const LOCAL_PROVIDER_LIST: Array<{ key: ProviderType; name: string; mapping: Record<string, string> }> = [
    { key: 'DHARMAJAYA', name: 'Dharmajaya', mapping: DHARMAJAYA_MAPPING },
    { key: 'PASARJAYA', name: 'Pasarjaya', mapping: PASARJAYA_MAPPING },
    { key: 'FOOD_STATION', name: 'Foodstation', mapping: FOODSTATION_MAPPING },
];

function getProviderList() {
    return (PROVIDER_LIST && PROVIDER_LIST.length > 0) ? PROVIDER_LIST : LOCAL_PROVIDER_LIST;
}

function getProviderByIndex(idx: number): { key: ProviderType; name: string; mapping: Record<string, string> } | undefined {
    const list = getProviderList();
    return list[idx - 1];
}

function getMappingForProvider(provider: ProviderType): Record<string, string> {
    const entry = getProviderList().find(p => p.key === provider);
    return entry?.mapping ?? {};
}

function getProviderName(provider: ProviderType): string {
    const entry = getProviderList().find(p => p.key === provider);
    return entry?.name ?? provider;
}

function cleanSessionMaps(phone: string): void {
    adminLocationProvider.delete(phone);
    adminLocationSub.delete(phone);
    adminScheduleType.delete(phone);
    adminScheduleTime.delete(phone);
    adminScheduleAction.delete(phone);
}

type HandlerResult = { replyText: string; nextState: AdminFlowState | null };

export async function handleLocationMgmt(
    state: AdminFlowState,
    message: string,
    phone: string,
): Promise<HandlerResult> {
    const input = message.trim();

    switch (state) {
        case 'LOCATION_MGMT_MENU':
            return handleMenu(input, phone);

        case 'LOCATION_MGMT_SELECT_PROVIDER':
            return handleMenu(input, phone);

        case 'LOCATION_MGMT_PROVIDER_ACTION':
            return handleProviderAction(input, phone);

        case 'LOCATION_MGMT_SELECT_SUB':
            return handleSelectSub(input, phone);

        case 'LOCATION_MGMT_CONFIRM_TOGGLE':
            return handleConfirmToggle(input, phone);

        case 'LOCATION_MGMT_SCHEDULE_MENU':
            return handleScheduleMenu(input, phone);

        case 'LOCATION_MGMT_SCHEDULE_TYPE':
            return handleScheduleType(input, phone);

        case 'LOCATION_MGMT_SCHEDULE_TIME':
            return handleScheduleTime(input, phone);

        case 'LOCATION_MGMT_SCHEDULE_CONFIRM':
            return handleScheduleConfirm(input, phone);

        default:
            cleanSessionMaps(phone);
            return { replyText: 'State tidak dikenali. Kembali ke menu admin.', nextState: null };
    }
}

async function handleMenu(input: string, phone: string): Promise<HandlerResult> {
    if (input === '0') {
        cleanSessionMaps(phone);
        return { replyText: '', nextState: null };
    }

    const choice = parseInt(input, 10);
    if (isNaN(choice) || choice < 1 || choice > getProviderList().length) {
        const menuText = await buildMenuText();
        return { replyText: `Pilihan tidak valid.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    const provider = getProviderByIndex(choice);
    if (!provider) {
        const menuText = await buildMenuText();
        return { replyText: `Provider tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    adminLocationProvider.set(phone, provider.key);
    const actionText = await buildProviderActionText(provider.key);
    return { replyText: actionText, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
}

async function handleProviderAction(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    if (!provider) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan. Silakan pilih ulang.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    if (input === '0') {
        const menuText = await buildMenuText();
        return { replyText: menuText, nextState: 'LOCATION_MGMT_MENU' };
    }

    const providerName = getProviderName(provider);

    if (input === '1') {
        try {
            const ok = await closeLocationByProvider(provider, 'Ditutup via menu admin');
            if (ok) {
                const menuText = await buildMenuText();
                return { replyText: `✅ Semua lokasi ${providerName} berhasil *ditutup*.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
            }
            return { replyText: `❌ Gagal menutup ${providerName}. Coba lagi.`, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
        } catch (err) {
            return { replyText: `❌ Error saat menutup ${providerName}: ${(err as Error).message}`, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
        }
    }

    if (input === '2') {
        try {
            const ok = await openLocationByProvider(provider);
            if (ok) {
                const menuText = await buildMenuText();
                return { replyText: `✅ Semua lokasi ${providerName} berhasil *dibuka*.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
            }
            return { replyText: `❌ Gagal membuka ${providerName}. Mungkin sudah terbuka.`, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
        } catch (err) {
            return { replyText: `❌ Error saat membuka ${providerName}: ${(err as Error).message}`, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
        }
    }

    if (input === '3') {
        const subText = await buildSelectSubText(provider);
        return { replyText: subText, nextState: 'LOCATION_MGMT_SELECT_SUB' };
    }

    if (input === '4') {
        const schedText = await buildScheduleMenuText(provider);
        return { replyText: schedText, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    }

    const actionText = await buildProviderActionText(provider);
    return { replyText: `Pilihan tidak valid.\n\n${actionText}`, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
}

async function handleSelectSub(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    if (!provider) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    if (input === '0') {
        const actionText = await buildProviderActionText(provider);
        return { replyText: actionText, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
    }

    const mapping = getMappingForProvider(provider);
    const subLocation = mapping[input];
    if (!subLocation) {
        const subText = await buildSelectSubText(provider);
        return { replyText: `Pilihan tidak valid.\n\n${subText}`, nextState: 'LOCATION_MGMT_SELECT_SUB' };
    }

    adminLocationSub.set(phone, subLocation);
    const confirmText = await buildConfirmToggleText(provider, subLocation);
    return { replyText: confirmText, nextState: 'LOCATION_MGMT_CONFIRM_TOGGLE' };
}

async function handleConfirmToggle(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    const subLocation = adminLocationSub.get(phone);
    if (!provider || !subLocation) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    if (input === '2') {
        const subText = await buildSelectSubText(provider);
        return { replyText: subText, nextState: 'LOCATION_MGMT_SELECT_SUB' };
    }

    if (input === '1') {
        try {
            const status = await isSpecificLocationClosed(provider, subLocation);
            const providerName = getProviderName(provider);

            if (status.closed) {
                const result = await openSpecificLocation(provider, subLocation);
                const subText = await buildSelectSubText(provider);
                if (result.success) {
                    return { replyText: `✅ ${providerName} - ${subLocation} berhasil *dibuka*.\n\n${subText}`, nextState: 'LOCATION_MGMT_SELECT_SUB' };
                }
                return { replyText: `❌ Gagal membuka: ${result.message}\n\n${subText}`, nextState: 'LOCATION_MGMT_SELECT_SUB' };
            } else {
                const result = await closeSpecificLocation(provider, subLocation, 'Ditutup via menu admin');
                const subText = await buildSelectSubText(provider);
                if (result.success) {
                    return { replyText: `✅ ${providerName} - ${subLocation} berhasil *ditutup*.\n\n${subText}`, nextState: 'LOCATION_MGMT_SELECT_SUB' };
                }
                return { replyText: `❌ Gagal menutup: ${result.message}\n\n${subText}`, nextState: 'LOCATION_MGMT_SELECT_SUB' };
            }
        } catch (err) {
            const subText = await buildSelectSubText(provider);
            return { replyText: `❌ Error: ${(err as Error).message}\n\n${subText}`, nextState: 'LOCATION_MGMT_SELECT_SUB' };
        }
    }

    const confirmText = await buildConfirmToggleText(provider, subLocation);
    return { replyText: `Pilihan tidak valid.\n\n${confirmText}`, nextState: 'LOCATION_MGMT_CONFIRM_TOGGLE' };
}

async function handleScheduleMenu(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    if (!provider) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    const normalized = input.toUpperCase();

    if (input === '0') {
        const actionText = await buildProviderActionText(provider);
        return { replyText: actionText, nextState: 'LOCATION_MGMT_PROVIDER_ACTION' };
    }

    if (normalized === 'T') {
        const typeText = buildScheduleTypeText();
        return { replyText: typeText, nextState: 'LOCATION_MGMT_SCHEDULE_TYPE' };
    }

    const schedules = await getActiveSchedulesForProvider(provider);
    const idx = parseInt(input, 10);
    if (isNaN(idx) || idx < 1 || idx > schedules.length) {
        const schedText = await buildScheduleMenuText(provider);
        return { replyText: `Pilihan tidak valid.\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    }

    const target = schedules[idx - 1];
    const scheduleId = String(target.id ?? '');
    if (!scheduleId) {
        const schedText = await buildScheduleMenuText(provider);
        return { replyText: `❌ ID jadwal tidak ditemukan.\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    }

    try {
        const ok = await deleteSchedule(scheduleId);
        const schedText = await buildScheduleMenuText(provider);
        if (ok) {
            return { replyText: `✅ Jadwal berhasil dihapus.\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
        }
        return { replyText: `❌ Gagal menghapus jadwal.\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    } catch (err) {
        const schedText = await buildScheduleMenuText(provider);
        return { replyText: `❌ Error: ${(err as Error).message}\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    }
}

async function handleScheduleType(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    if (!provider) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    if (input === '0') {
        const schedText = await buildScheduleMenuText(provider);
        return { replyText: schedText, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    }

    if (input === '1') {
        adminScheduleType.set(phone, 'one_time');
        return {
            replyText: buildScheduleTimePrompt('one_time'),
            nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
        };
    }

    if (input === '2') {
        adminScheduleType.set(phone, 'recurring');
        return {
            replyText: buildScheduleTimePrompt('recurring'),
            nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
        };
    }

    return { replyText: `Pilihan tidak valid.\n\n${buildScheduleTypeText()}`, nextState: 'LOCATION_MGMT_SCHEDULE_TYPE' };
}

async function handleScheduleTime(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    const schedType = adminScheduleType.get(phone);
    if (!provider || !schedType) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    if (input === '0') {
        return { replyText: buildScheduleTypeText(), nextState: 'LOCATION_MGMT_SCHEDULE_TYPE' };
    }

    if (schedType === 'recurring') {
        const match = input.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) {
            return {
                replyText: `Format tidak valid. Gunakan format HH:mm (contoh: 17:00).\n\n${buildScheduleTimePrompt('recurring')}`,
                nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
            };
        }
        const hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return {
                replyText: `Jam tidak valid. Pastikan jam 00-23 dan menit 00-59.\n\n${buildScheduleTimePrompt('recurring')}`,
                nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
            };
        }
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        adminScheduleTime.set(phone, timeStr);
        adminScheduleAction.set(phone, 'close');

        const confirmText = buildScheduleConfirmText(provider, schedType, timeStr, 'close');
        return { replyText: confirmText, nextState: 'LOCATION_MGMT_SCHEDULE_CONFIRM' };
    }

    const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
    const slashMatch = input.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);

    let dateTimeStr: string | null = null;

    if (isoMatch) {
        const [, y, m, d, hh, mm] = isoMatch;
        const hour = parseInt(hh, 10);
        const minute = parseInt(mm, 10);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return {
                replyText: `Jam tidak valid.\n\n${buildScheduleTimePrompt('one_time')}`,
                nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
            };
        }
        dateTimeStr = `${y}-${m}-${d} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else if (slashMatch) {
        const [, dd, mm, yyyy, hh, min] = slashMatch;
        const hour = parseInt(hh, 10);
        const minute = parseInt(min, 10);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            return {
                replyText: `Jam tidak valid.\n\n${buildScheduleTimePrompt('one_time')}`,
                nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
            };
        }
        dateTimeStr = `${yyyy}-${mm}-${dd} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    if (!dateTimeStr) {
        return {
            replyText: `Format tidak valid. Gunakan YYYY-MM-DD HH:mm atau DD/MM/YYYY HH:mm.\n\n${buildScheduleTimePrompt('one_time')}`,
            nextState: 'LOCATION_MGMT_SCHEDULE_TIME',
        };
    }

    adminScheduleTime.set(phone, dateTimeStr);
    adminScheduleAction.set(phone, 'close');

    const confirmText = buildScheduleConfirmText(provider, schedType, dateTimeStr, 'close');
    return { replyText: confirmText, nextState: 'LOCATION_MGMT_SCHEDULE_CONFIRM' };
}

async function handleScheduleConfirm(input: string, phone: string): Promise<HandlerResult> {
    const provider = adminLocationProvider.get(phone);
    const schedType = adminScheduleType.get(phone);
    const schedTime = adminScheduleTime.get(phone);
    const schedAction = adminScheduleAction.get(phone) ?? 'close';

    if (!provider || !schedType || !schedTime) {
        const menuText = await buildMenuText();
        return { replyText: `Sesi tidak ditemukan.\n\n${menuText}`, nextState: 'LOCATION_MGMT_MENU' };
    }

    if (input === '2') {
        const schedText = await buildScheduleMenuText(provider);
        return { replyText: schedText, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
    }

    if (input === '1') {
        try {
            const scheduleInput: LocationScheduleInput = {
                provider,
                sub_location: null,
                action: schedAction,
                schedule_type: schedType,
                scheduled_time: schedType === 'one_time' ? `${schedTime}:00+07:00` : new Date().toISOString(),
                recurring_time: schedType === 'recurring' ? schedTime : null,
                reason: `Dijadwalkan via menu admin`,
            };

            const result = await createSchedule(scheduleInput);
            adminScheduleType.delete(phone);
            adminScheduleTime.delete(phone);
            adminScheduleAction.delete(phone);

            const schedText = await buildScheduleMenuText(provider);
            if (result) {
                return { replyText: `✅ Jadwal berhasil dibuat.\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
            }
            return { replyText: `❌ Gagal membuat jadwal. Coba lagi.\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
        } catch (err) {
            const schedText = await buildScheduleMenuText(provider);
            return { replyText: `❌ Error: ${(err as Error).message}\n\n${schedText}`, nextState: 'LOCATION_MGMT_SCHEDULE_MENU' };
        }
    }

    const confirmText = buildScheduleConfirmText(provider, schedType, schedTime, schedAction);
    return { replyText: `Pilihan tidak valid.\n\n${confirmText}`, nextState: 'LOCATION_MGMT_SCHEDULE_CONFIRM' };
}

async function buildMenuText(): Promise<string> {
    try {
        const statuses = await listAllProviderStatuses();
        const statusMap: Record<string, string> = {};
        for (const s of statuses) {
            statusMap[s.provider] = s.closed ? 'TUTUP' : 'BUKA';
        }

        return LOCATION_MGMT_MENU_TEXT({
            dharmajayaStatus: statusMap['DHARMAJAYA'] ?? 'BUKA',
            pasarjayaStatus: statusMap['PASARJAYA'] ?? 'BUKA',
            foodStationStatus: statusMap['FOOD_STATION'] ?? 'BUKA',
        });
    } catch {
        return LOCATION_MGMT_MENU_TEXT({
            dharmajayaStatus: '?',
            pasarjayaStatus: '?',
            foodStationStatus: '?',
        });
    }
}

async function buildProviderActionText(provider: ProviderType): Promise<string> {
    const name = getProviderName(provider);
    let statusLabel = 'BUKA';
    try {
        const blocked = await isProviderBlocked(provider);
        statusLabel = blocked ? 'TUTUP' : 'BUKA';
    } catch {
        statusLabel = '?';
    }

    return [
        `*Provider: ${name}* [${statusLabel}]`,
        '',
        `1. Tutup semua ${name}`,
        `2. Buka semua ${name}`,
        '3. Kelola per sub-lokasi',
        '4. Kelola jadwal',
        '0. Kembali',
    ].join('\n');
}

async function buildSelectSubText(provider: ProviderType): Promise<string> {
    const name = getProviderName(provider);
    const mapping = getMappingForProvider(provider);
    const entries = Object.entries(mapping);

    if (entries.length === 0) {
        return `Tidak ada sub-lokasi untuk ${name}.\n\n0. Kembali`;
    }

    const lines: string[] = [`*Sub-lokasi ${name}:*`, ''];

    for (const [idx, subName] of entries) {
        let statusLabel = 'BUKA';
        try {
            const status = await isSpecificLocationClosed(provider, subName);
            statusLabel = status.closed ? 'TUTUP' : 'BUKA';
        } catch {
            statusLabel = '?';
        }
        lines.push(`${idx}. ${subName} [${statusLabel}]`);
    }

    lines.push('');
    lines.push('0. Kembali');
    return lines.join('\n');
}

async function buildConfirmToggleText(provider: ProviderType, subLocation: string): Promise<string> {
    const name = getProviderName(provider);
    let statusLabel = 'BUKA';
    let actionLabel = 'Tutup';
    try {
        const status = await isSpecificLocationClosed(provider, subLocation);
        if (status.closed) {
            statusLabel = 'TUTUP';
            actionLabel = 'Buka';
        } else {
            statusLabel = 'BUKA';
            actionLabel = 'Tutup';
        }
    } catch {
        statusLabel = '?';
        actionLabel = 'Toggle';
    }

    return [
        `*Lokasi:* ${name} - ${subLocation} [${statusLabel}]`,
        '',
        `1. ${actionLabel} lokasi ini`,
        '2. Batal',
    ].join('\n');
}

async function getActiveSchedulesForProvider(provider: ProviderType): Promise<Array<Record<string, unknown>>> {
    try {
        const all = await listSchedulesByProvider(provider);
        return all.filter(s => s.is_active === true);
    } catch {
        return [];
    }
}

async function buildScheduleMenuText(provider: ProviderType): Promise<string> {
    const name = getProviderName(provider);
    const schedules = await getActiveSchedulesForProvider(provider);

    const lines: string[] = [`*Jadwal aktif untuk ${name}:*`, ''];

    if (schedules.length === 0) {
        lines.push('(Tidak ada jadwal aktif)');
    } else {
        for (let i = 0; i < schedules.length; i++) {
            const s = schedules[i];
            const type = String(s.schedule_type ?? 'unknown');
            const action = String(s.action ?? 'close') === 'open' ? 'Buka' : 'Tutup';
            const sub = s.sub_location ? String(s.sub_location) : 'semua';

            let timeDisplay = '';
            if (type === 'recurring') {
                timeDisplay = `setiap hari ${String(s.recurring_time ?? '')}`;
            } else {
                timeDisplay = String(s.scheduled_time ?? '').replace('T', ' ').substring(0, 16);
            }

            lines.push(`${i + 1}. [${type}] ${action} ${sub} - ${timeDisplay}`);
        }
    }

    lines.push('');
    lines.push('T. Tambah jadwal baru');
    lines.push('[nomor]. Hapus jadwal');
    lines.push('0. Kembali');
    return lines.join('\n');
}

function buildScheduleTypeText(): string {
    return [
        '*Pilih tipe jadwal:*',
        '',
        '1. Sekali (one-time) — tutup/buka pada tanggal & jam tertentu',
        '2. Berulang (recurring) — tutup/buka setiap hari pada jam tertentu',
        '0. Kembali',
    ].join('\n');
}

function buildScheduleTimePrompt(type: 'one_time' | 'recurring'): string {
    if (type === 'recurring') {
        return [
            '*Masukkan jam (format: HH:mm)*',
            'Contoh: 17:00',
            '',
            'Ketik 0 untuk kembali',
        ].join('\n');
    }

    return [
        '*Masukkan tanggal & jam (format: YYYY-MM-DD HH:mm)*',
        'Contoh: 2026-04-25 17:00',
        '',
        'Atau format: DD/MM/YYYY HH:mm',
        'Contoh: 25/04/2026 17:00',
        '',
        'Ketik 0 untuk kembali',
    ].join('\n');
}

function buildScheduleConfirmText(
    provider: ProviderType,
    schedType: 'one_time' | 'recurring',
    time: string,
    action: 'open' | 'close',
): string {
    const name = getProviderName(provider);
    const actionLabel = action === 'close' ? 'Tutup' : 'Buka';
    const typeLabel = schedType === 'one_time' ? 'Sekali' : 'Berulang';
    const timeLabel = schedType === 'recurring' ? `Setiap hari ${time}` : time;

    return [
        '*Konfirmasi jadwal:*',
        '',
        `Provider: ${name}`,
        `Sub-lokasi: Semua`,
        `Aksi: ${actionLabel}`,
        `Tipe: ${typeLabel}`,
        `Waktu: ${timeLabel}`,
        '',
        '1. Konfirmasi',
        '2. Batal',
    ].join('\n');
}
