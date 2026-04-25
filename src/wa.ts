// src/wa.ts

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    WASocket,
    jidNormalizedUser,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { makeInMemoryStore } from './store';

// --- IMPORT LOGIC DARI FILE LAIN ---
import { processRawMessageToLogJson, parseRawMessageToLines, normalizeNameForDedup } from './parser';
import {
    buildReplyForTodayRecap,
    buildReplyForInvalidDetails,
    getTodayRecapForSender,
    extractChildName,
    ValidItemDetail,
    getGlobalRecap,
    generateExportData,
    generateRegionTxtExport,
    getEditableItemsForSender
} from './recap';
import {
    buildReplyForNewData,
} from './reply';
import { generateKJPExcel } from './services/excelService';
import {
    saveLogAndOkItems,
    supabase,
    deleteDataByNameOrCard,
    clearDatabaseForProcessingDayKey,
    getPhoneByLidJid,
    upsertLidPhoneMap,
    getNameFromLidPhoneMap,
    deleteLidPhoneMap,
    getAllLidPhoneMap,
    initRegisteredUsersCache,
    initWhitelistedPhonesCache,
    getRegisteredUserNameSync,
    deleteLastSubmission,
    getStatistics,
    deleteDailyDataByIndex,
    deleteDailyDataByIndices, // NEW
    deleteAllDailyDataForSender, // NEW
    getRegisteredUserByPhone,
    updateLidForPhone,
    getPhoneFromLidSync,
    getTotalDataTodayForSender,
    getTotalDataTodayForSenderByLocation,
    getBotSettings,
    updateBotSettings,
    formatCloseTimeString,
    renderCloseMessage,
    clearBotSettingsCache,
    updateDailyDataField, // PATCH 2
    getBlockedKjpList,
    getBlockedKkList,
    getBlockedKtpList,
    addBlockedKjp,
    addBlockedKtp,
    removeBlockedKtp,
    changeBlockedKtpType,
    removeBlockedKjp,
    addBlockedKk,
    removeBlockedKk,
    getBlockedPhoneList,
    addBlockedPhone,
    removeBlockedPhone,
    isPhoneBlocked,
    getWhitelistedPhoneList,
    addWhitelistedPhone,
    removeWhitelistedPhone,
    updateWhitelistedPhoneName,
    updateWhitelistedPhone,
    hasProcessedMessageById,
    disableGlobalLocationQuotaLimit,
    setGlobalLocationQuotaLimit,
    listGlobalLocationQuotaLimits,
    reserveGlobalLocationQuota,
    releaseGlobalLocationQuotaReservation,
    reconcileGlobalLocationQuotaDay,
    type GlobalLocationQuotaReservation,
    isProviderBlocked,
} from './supabase';
import { getProcessingDayKey, getWibIsoDate, shiftIsoDate, isSystemClosed, getWibParts } from './time';
import { getContactName } from './contacts_data';
import { parseFlexibleDate, looksLikeDate } from './utils/dateParser';
import { resolveCardTypeLabel } from './utils/cardType';
import { deleteCardPrefix, getCardPrefixMap, upsertCardPrefix } from './utils/cardPrefixConfig';
import { getCardTypeChoicesText, normalizeCardTypeName } from './utils/cardTypeRules';
import {
    buildDharmajayaMenuWithStatus,
    closeSpecificLocation,
    isSpecificLocationClosed,
    listClosedLocationsByProvider,
    openSpecificLocation,
} from './services/locationGate';
import {
    disableLocationQuotaLimit,
    getLocationQuotaLimit,
    listAllDharmajayaLocations,
    listLocationQuotaLimits,
    resolveDharmajayaLocationByChoice,
    setLocationQuotaLimit,
} from './services/locationQuota';
import {
    buildFailedDataCopyMessage,
    buildStatusSummaryMessage,
    checkRegistrationStatuses,
} from './services/statusCheckService';
import { warmupKtpMasterCsvLookup } from './services/ktpMasterLookup';
import { isAdminPhone, resolveSenderAccess } from './services/whitelistGate';
import {
    MENU_MESSAGE,
    buildFormatDaftarMessage,
    getActiveProviderMapping,
    FORMAT_DAFTAR_PASARJAYA,
    FORMAT_DAFTAR_DHARMAJAYA,
    FORMAT_DAFTAR_FOOD_STATION,
    FAQ_MESSAGE,
    ADMIN_LAUNCHER_LINE,
    ADMIN_MENU_MESSAGE,
    ADMIN_PHONES_RAW,
    CLOSE_MESSAGE_TEMPLATE_UNIFIED,
    MENU_PASARJAYA_LOCATIONS, // NEW
    PASARJAYA_MAPPING, // NEW
    DHARMAJAYA_MAPPING,
    UNDERAGE_CONFIRMATION_MESSAGE,
    UNDERAGE_CONFIRMATION_REMINDER,
    UNDERAGE_CONFIRMATION_CANCEL_MESSAGE,
    UNKNOWN_REGION_CONFIRMATION_MESSAGE,
    UNKNOWN_REGION_CONFIRMATION_REMINDER,
    UNKNOWN_REGION_CONFIRMATION_CANCEL_MESSAGE,
    STATUS_CHECK_PROVIDER_MENU,
    getStatusCheckProviderMapping,
    isStatusCheckOpen,
    getStatusCheckClosedMessage,
    STATUS_CHECK_NO_DATA_TEXT,
    STATUS_CHECK_PROCESSING_TEXT,
} from './config/messages';
import {
    normalizePhone,
    normalizeManualPhone,
    extractManualPhone,
    isLidJid,
} from './utils/contactUtils';
import { sanitizeInboundText } from './utils/textSanitizer';
import {
    UserFlowState,
    AdminFlowState,
    BroadcastDraft,
    userFlowByPhone,
    userLocationChoice, // IMPORTED
    userSpecificLocationChoice, // NEW - Lokasi spesifik (contoh: "PASARJAYA - Jakgrosir Kedoya")
    adminFlowByPhone,
    pendingDelete,
    broadcastDraftMap,
    adminContactCache,
    adminUserListCache,
    pendingRegistrationData, // NEW
    editSessionByPhone, // NEW
    EditSession,
    editSessionByPhone as editSessionMap,
    contactSessionByPhone, // NEW: Kelola Kontak
    whitelistSessionByPhone,
    closeWindowDraftByPhone,
    locationQuotaDraftByPhone,
    globalLocationQuotaDraftByPhone,
    statusCheckSelectionByPhone,
    statusCheckInProgressByPhone,
    pendingUnderageConfirmationByPhone,
    pendingUnknownRegionConfirmationByPhone,
    pendingLocationCandidates,
} from './state';
import type {
    PendingUnderageConfirmationSession,
    PendingUnknownRegionConfirmationSession,
} from './state';
import type { LogJson } from './types';

const AUTH_FOLDER = 'auth_info_baileys';
const STORE_FILE = 'baileys_store.json';

// --- STORE SETUP (Hubungkan ke file JSON) ---
const store = makeInMemoryStore({
    logger: pino({ level: 'silent' })
});

// Baca file store jika ada
store.readFromFile(STORE_FILE);

// Simpan ke file setiap 10 detik (agar tidak terlalu sering write disk)
setInterval(() => {
    store.writeToFile(STORE_FILE);
}, 10_000);

let sock!: WASocket;

const pendingKtpTypeChange = new Map<string, { noKtp: string; currentType: 'permanent' | 'temporary'; newType: 'permanent' | 'temporary' }>();

// --- EXPONENTIAL BACKOFF RECONNECT ---
let retryCount = 0;
const BASE_DELAY_MS = 3000;
const MAX_BACKOFF_DELAY_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 60_000;
const CONNECTING_STALE_MS = 180_000;

let reconnectTimeout: NodeJS.Timeout | null = null;
let storePersistenceInterval: NodeJS.Timeout | null = null;
let connectionWatchdogInterval: NodeJS.Timeout | null = null;
let isConnecting = false;
let lastConnectionState = 'idle';
let reconnectSuspended = false;
let connectAttemptStartedAt = 0;
let lastConnectionUpdateAt = 0;
let connectSequence = 0;

function clearPendingReconnect(): void {
    if (!reconnectTimeout) {
        return;
    }

    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
}

function reconnectWithBackoff(reason = 'unknown', force = false): void {
    if (reconnectSuspended && !force) {
        console.log('⛔ Reconnect sedang disuspend (logout/invalid), skip auto-reconnect.');
        return;
    }

    if (lastConnectionState === 'open' && !force) {
        return;
    }

    if (reconnectTimeout) {
        console.log('⏳ Reconnect sudah dijadwalkan, skip jadwal baru.');
        return;
    }

    const exponentialFactor = Math.min(retryCount, 10);
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, exponentialFactor), MAX_BACKOFF_DELAY_MS);
    retryCount = Math.min(retryCount + 1, 10);
    console.log(`🔄 Reconnect percobaan ke-${retryCount} dalam ${delay / 1000}s (trigger: ${reason})...`);

    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        void connectToWhatsApp().catch((error) => {
            console.error('❌ Reconnect gagal dijalankan:', error);
            reconnectWithBackoff('retry-after-failure', force);
        });
    }, delay);
}

function startConnectionWatchdog(): void {
    if (connectionWatchdogInterval) {
        return;
    }

    connectionWatchdogInterval = setInterval(() => {
        if (isConnecting || reconnectTimeout) {
            return;
        }

        if (reconnectSuspended) {
            return;
        }

        const now = Date.now();
        const timeSinceUpdateMs = now - lastConnectionUpdateAt;
        const wsIsOpen = Boolean(sock?.ws?.isOpen);
        const wsIsConnecting = Boolean(sock?.ws?.isConnecting);

        if (lastConnectionState === 'open' && wsIsOpen) {
            return;
        }

        const stillWithinConnectingGrace =
            lastConnectionState === 'connecting' &&
            wsIsConnecting &&
            now - connectAttemptStartedAt < CONNECTING_STALE_MS;
        if (stillWithinConnectingGrace) {
            return;
        }

        if (sock && (lastConnectionState === 'connecting' || wsIsConnecting)) {
            try {
                sock.end(new Error('Watchdog detected stale WA connect attempt'));
            } catch (error) {
                console.warn('⚠️ Watchdog gagal menutup socket stale:', error);
            }
        }

        reconnectWithBackoff(`watchdog state=${lastConnectionState}, staleMs=${timeSinceUpdateMs}`);
    }, WATCHDOG_INTERVAL_MS);
}

export function scheduleReconnectNow(reason = 'manual-trigger'): void {
    reconnectSuspended = false;
    retryCount = 0;
    reconnectWithBackoff(reason, true);
}



// --- UTILS: LID LOOKUP VIA STORE ---
// Cari nomor HP asli dari database kontak Baileys (store)
function getPhoneFromLid(lidJid: string): string | null {
    const directContact: any = (store.contacts as any)?.[lidJid];
    if (directContact && directContact.id && directContact.id !== lidJid) {
        return directContact.id;
    }

    const allContacts = Object.entries((store.contacts as any) || {});
    for (const [jid, contactAny] of allContacts) {
        const contact: any = contactAny;
        if (contact?.lid !== lidJid) continue;

        if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
            return jid;
        }

        if (typeof contact?.id === 'string' && contact.id.endsWith('@s.whatsapp.net')) {
            return contact.id;
        }
    }

    return null;
}

const DEFAULT_CLOSE_START_HOUR = 0;
const DEFAULT_CLOSE_START_MINUTE = 0;
const DEFAULT_CLOSE_END_HOUR = 6;
const DEFAULT_CLOSE_END_MINUTE = 5;

const inFlightMessageKeys = new Set<string>();

function buildMessageIdempotencyKey(senderPhone: string, processingDayKey: string, messageId: string): string {
    return `${senderPhone}|${processingDayKey}|${messageId}`;
}

async function buildSelectLocationFirstPromptText(): Promise<string> {
    const providerMap = await getActiveProviderMapping();

    if (providerMap.size === 0) {
        return [
            '⛔ *SEMUA LOKASI SEDANG TUTUP*',
            '',
            'Mohon maaf, saat ini semua lokasi pengambilan sedang ditutup.',
            'Silakan coba lagi nanti. 🙏'
        ].join('\n');
    }

    const providerLabels: Record<string, string> = {
        'PASARJAYA': 'Pasarjaya',
        'DHARMAJAYA': 'Dharmajaya',
        'FOOD_STATION': 'Foodstation',
    };

    const optionParts = [...providerMap.entries()].map(([num, key]) => `*${num}. ${providerLabels[key] || key}*`);
    const locationOptionText = `Saat ini yang tersedia:\n${optionParts.join('\n')}`;

    const dharmajayaNum = [...providerMap.entries()].find(([, v]) => v === 'DHARMAJAYA')?.[0];

    let availableSection = '';
    if (dharmajayaNum) {
        const options = await Promise.all(
            Object.entries(DHARMAJAYA_MAPPING).map(async ([idx, name]) => {
                const status = await isSpecificLocationClosed('DHARMAJAYA', name);
                return { idx, name, available: !status.closed };
            })
        );
        const availableSubLocations = options
            .filter((item) => item.available)
            .map((item) => `   ${item.idx}. ${item.name}`);
        availableSection = availableSubLocations.length > 0
            ? availableSubLocations.join('\n')
            : '   - Saat ini semua sub-lokasi DHARMAJAYA sedang TUTUP.';
    }

    const nums = [...providerMap.keys()].join(', ');
    const firstStepText = `1) Ketik ${nums} untuk pilih lokasi`;

    const lines = [
        '⚠️ *Mohon Pilih Lokasi Dulu*',
        '',
        'Data Anda sudah valid, tapi lokasi pengambilan belum dipilih.',
        'Silakan pilih lokasi dulu agar data bisa diproses.',
        '',
        locationOptionText,
    ];

    lines.push('');
    lines.push(`Ketik ${nums} untuk pilih lokasi.`);
    lines.push('');
    lines.push('_Ketik 0 untuk batal._');

    return lines.join('\n');
}

function formatOperationStatus(settings: {
    close_hour_start: number;
    close_minute_start: number;
    close_hour_end: number;
    close_minute_end: number;
}): string {
    const start = settings.close_hour_start * 60 + settings.close_minute_start;
    const end = settings.close_hour_end * 60 + settings.close_minute_end;
    if (start === end) return '24 jam (tanpa jam tutup)';
    const startText = `${String(settings.close_hour_start).padStart(2, '0')}.${String(settings.close_minute_start).padStart(2, '0')}`;
    const endText = `${String(settings.close_hour_end).padStart(2, '0')}.${String(settings.close_minute_end).padStart(2, '0')}`;
    return `${startText} - ${endText} WIB`;
}

function parseAdminWibDateTimeToIso(input: string): { iso: string; display: string } | null {
    const cleaned = sanitizeInboundText(input)
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
        .replace(/[\uA789\u2236\uFF1A]/g, ':')
        .replace(/[/.]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    const m = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;

    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);

    if (day < 1 || day > 31) return null;
    if (month < 1 || month > 12) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;

    const maxDayInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > maxDayInMonth) return null;

    const utcMs = Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0);
    const dt = new Date(utcMs);
    if (isNaN(dt.getTime())) return null;

    return {
        iso: dt.toISOString(),
        display: `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year).padStart(4, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    };
}

// --- HELPER: BUILD DATABASE ERROR MESSAGE ---
// Menghasilkan pesan error yang mudah dipahami user berdasarkan error database
function buildDatabaseErrorMessage(dataError: any, logJson?: any): string {
    // Handle constraint violation (duplicate key)
    if (dataError?.code === '23505') {
        const details = (dataError?.details || '').toString();
        const fields: string[] = [];
        if (details.includes('no_kjp')) fields.push('No Kartu');
        if (details.includes('no_ktp')) fields.push('KTP');
        if (details.includes('nama')) fields.push('Nama');

        const conflicted = Array.isArray(logJson?.items)
            ? logJson.items.filter((it: any) => it?.status === 'OK')
            : [];

        const lines = [
            '⚠️ *DATA SAMA TERDETEKSI*',
            '',
            `❌ Maaf, ada data yang sudah masuk hari ini${fields.length ? ` (yang sama: ${fields.join(', ')})` : ''}.`,
        ];

        if (conflicted.length > 0) {
            lines.push('');
            lines.push('📝 *Cek lagi data berikut:*');
            conflicted.slice(0, 5).forEach((it: any) => {
                const nama = it?.parsed?.nama || '-';
                const kartu = it?.parsed?.no_kjp || '-';
                const ktp = it?.parsed?.no_ktp || '-';
                const kk = it?.parsed?.no_kk || '-';
                lines.push(`• ${nama}`);
                lines.push(`  Kartu: ${kartu} | KTP: ${ktp} | KK: ${kk}`);
            });
            if (conflicted.length > 5) {
                lines.push(`• ...dan ${conflicted.length - 5} data lainnya`);
            }
        }

        lines.push('');
        lines.push('💡 Silakan hapus data yang sama, lalu kirim ulang yang belum masuk.');
        lines.push('Ketik *CEK* untuk lihat data yang sudah masuk ya.');

        return lines.join('\n');
    }

    // Default error message
    return '❌ *GAGAL MENYIMPAN DATA*\n\nTerjadi kesalahan sistem saat menyimpan.\nSilakan kirim ulang data Anda atau hubungi Admin.';
}

// --- KIRIM MENU TEKS ---
async function sendMainMenu(sock: WASocket, remoteJid: string, isAdmin: boolean) {
    let finalMenu = MENU_MESSAGE;
    if (isAdmin) finalMenu += `\n\n${ADMIN_LAUNCHER_LINE}`;
    await sock.sendMessage(remoteJid, { text: finalMenu });
    console.log(`✅ Menu teks terkirim ke ${remoteJid} (isAdmin: ${isAdmin})`);
}

function buildBlockedKtpMenuText(): string {
    return [
        '🛡️ *KELOLA BLOKIR NO KTP*',
        '',
        '1️⃣ Tambah Blokir Permanen',
        '2️⃣ Tambah Blokir Sementara',
        '3️⃣ Lihat Daftar Blokir',
        '4️⃣ Buka Blokir (Hapus)',
        '5️⃣ Ubah Jenis Blokir',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

type BlockedBulkAddItem = { nomor: string; alasan?: string };

const MAX_BLOCKED_BULK_LINES = 50;
const MAX_BLOCKED_BULK_TOTAL_CHARS = 5000;

function validateBlockedBulkAddInput(rawText: string): string | null {
    if (rawText.length > MAX_BLOCKED_BULK_TOTAL_CHARS) {
        return `⚠️ Maksimal ${MAX_BLOCKED_BULK_TOTAL_CHARS} karakter per kiriman.`;
    }

    const lineCount = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0).length;

    if (lineCount > MAX_BLOCKED_BULK_LINES) {
        return `⚠️ Maksimal ${MAX_BLOCKED_BULK_LINES} baris per kiriman.`;
    }

    return null;
}

function parseBlockedBulkAddInput(rawText: string): BlockedBulkAddItem[] {
    return rawText
        .split(/\r?\n/)
        .map((line) => line.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const commaIndex = line.indexOf(',');
            const nomor = (commaIndex >= 0 ? line.slice(0, commaIndex) : line).trim();
            const alasan = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';
            return {
                nomor,
                ...(alasan ? { alasan } : {}),
            };
        });
}

async function buildBlockedBulkAddSummary(
    title: string,
    items: BlockedBulkAddItem[],
    addItem: (nomor: string, alasan?: string) => Promise<{ success: boolean; message: string }>
): Promise<string> {
    const results: Array<{ nomor: string; success: boolean; message: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const item of items) {
        if (!item.nomor) {
            results.push({ nomor: '', success: false, message: 'Nomor tidak boleh kosong.' });
            failureCount += 1;
            continue;
        }

        const result = await addItem(item.nomor, item.alasan);
        results.push({ nomor: item.nomor, success: result.success, message: result.message });
        if (result.success) {
            successCount += 1;
        } else {
            failureCount += 1;
        }
    }

    const lines = [
        `🛡️ *${title}*`,
        `Berhasil: ${successCount}`,
        `Gagal: ${failureCount}`,
        '',
    ];

    results.forEach((result, index) => {
        lines.push(`${index + 1}. ${result.nomor || '(kosong)'} — ${result.success ? '✅' : '❌'} ${result.message}`);
    });

    return lines.join('\n');
}

function buildBlockedKjpMenuText(): string {
    return [
        '🛡️ *KELOLA BLOKIR NO KJP*',
        '',
        '1️⃣ Tambah No KJP ke blokir',
        '2️⃣ Lihat daftar No KJP terblokir',
        '3️⃣ Buka blokir No KJP',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

function buildBlockedKkMenuText(): string {
    return [
        '🛡️ *KELOLA BLOKIR NO KK*',
        '',
        '1️⃣ Tambah No KK ke blokir',
        '2️⃣ Lihat daftar No KK terblokir',
        '3️⃣ Buka blokir No KK',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

function buildBlockedPhoneMenuText(): string {
    return [
        '🚫 *KELOLA BLOKIR NO HP*',
        '',
        '1️⃣ Tambah No HP ke blokir',
        '2️⃣ Lihat daftar No HP terblokir',
        '3️⃣ Buka blokir No HP',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

function buildWhitelistMenuText(): string {
    return [
        '✅ *KELOLA WHITELIST NO HP*',
        '',
        '1️⃣ Lihat daftar whitelist',
        '2️⃣ Tambah nomor whitelist',
        '3️⃣ Ubah data whitelist',
        '4️⃣ Hapus nomor whitelist',
        '5️⃣ Bulk tambah whitelist',
        '6️⃣ Bulk hapus whitelist',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

function formatWhitelistedPhoneDisplay(phoneNumber: string): string {
    return phoneNumber.startsWith('62') ? `0${phoneNumber.slice(2)}` : phoneNumber;
}

function buildWhitelistDetailText(entry: { phone_number: string; name: string | null }): string {
    const displayPhone = formatWhitelistedPhoneDisplay(entry.phone_number);
    return [
        '👤 *DETAIL WHITELIST*',
        '━━━━━━━━━━━━━━━━━━━━━',
        `📱 Nomor: *${displayPhone}*`,
        `🪪 Nama: *${entry.name || '(Tanpa Nama)'}*`,
        `🔢 Canonical: ${entry.phone_number}`,
        '━━━━━━━━━━━━━━━━━━━━━',
        '',
        '1️⃣ ✏️ Edit nama',
        '2️⃣ 📱 Edit nomor HP',
        '3️⃣ 🗑️ Hapus dari whitelist',
        '',
        '0️⃣ 🔙 Kembali',
    ].join('\n');
}

function buildWhitelistSelectionListText(
    title: string,
    list: { phone_number: string; name: string | null }[],
    promptLine: string,
    page: number = 0
): string {
    const safePage = clampWhitelistPage(page, list.length);
    const totalPages = getWhitelistTotalPages(list.length);
    const startIndex = safePage * WHITELIST_PAGE_SIZE;
    const endIndexExclusive = Math.min(startIndex + WHITELIST_PAGE_SIZE, list.length);
    const lines = [
        `📂 *${title} (${list.length})*`,
        `📄 Halaman ${safePage + 1}/${totalPages}`,
        '',
    ];

    for (let index = startIndex; index < endIndexExclusive; index += 1) {
        const item = list[index];
        const phoneDisplay = formatWhitelistedPhoneDisplay(item.phone_number);
        lines.push(`${index + 1}. ${item.name || '(Tanpa Nama)'} (${phoneDisplay})`);
    }

    lines.push('');
    lines.push(promptLine);
    if (totalPages > 1) {
        lines.push('Ketik *NEXT* untuk halaman berikutnya, *BACK* untuk halaman sebelumnya.');
    }
    lines.push('_Ketik 0 untuk kembali._');
    return lines.join('\n');
}

function buildCardPrefixMenuText(): string {
    return [
        '🏷️ *KELOLA PREFIX KARTU*',
        '',
        '1️⃣ Lihat daftar prefix',
        '2️⃣ Tambah/Ubah prefix',
        '3️⃣ Hapus prefix',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

type WhitelistBulkAddItem = { nomor: string; nama?: string };
type WhitelistBulkDeleteItem = { nomor: string };

const MAX_WHITELIST_BULK_LINES = 50;
const MAX_WHITELIST_BULK_TOTAL_CHARS = 5000;
const WHITELIST_PAGE_SIZE = 100;

function getWhitelistTotalPages(listLength: number): number {
    return Math.max(1, Math.ceil(listLength / WHITELIST_PAGE_SIZE));
}

function clampWhitelistPage(page: number, listLength: number): number {
    const totalPages = getWhitelistTotalPages(listLength);
    if (!Number.isFinite(page)) return 0;
    return Math.min(Math.max(0, page), totalPages - 1);
}

function validateWhitelistBulkInput(rawText: string): string | null {
    if (rawText.length > MAX_WHITELIST_BULK_TOTAL_CHARS) {
        return `⚠️ Maksimal ${MAX_WHITELIST_BULK_TOTAL_CHARS} karakter per kiriman.`;
    }

    const lineCount = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0).length;

    if (lineCount > MAX_WHITELIST_BULK_LINES) {
        return `⚠️ Maksimal ${MAX_WHITELIST_BULK_LINES} baris per kiriman.`;
    }

    return null;
}

function parseWhitelistBulkAddInput(rawText: string): WhitelistBulkAddItem[] {
    return rawText
        .split(/\r?\n/)
        .map((line) => line.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const commaIndex = line.indexOf(',');
            const nomor = (commaIndex >= 0 ? line.slice(0, commaIndex) : line).trim();
            const nama = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';
            return {
                nomor,
                ...(nama ? { nama } : {}),
            };
        });
}

function parseWhitelistBulkDeleteInput(rawText: string): WhitelistBulkDeleteItem[] {
    return rawText
        .split(/\r?\n/)
        .map((line) => line.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .map((line) => ({ nomor: line }));
}

async function buildWhitelistBulkAddSummary(title: string, items: WhitelistBulkAddItem[]): Promise<string> {
    const results: Array<{ nomor: string; status: 'success' | 'fail' | 'skip'; message: string }> = [];
    const seen = new Set<string>();
    let successCount = 0;
    let failureCount = 0;
    let skipCount = 0;

    for (const item of items) {
        const normalizedPhone = normalizeManualPhone(item.nomor);
        if (!normalizedPhone) {
            results.push({ nomor: item.nomor || '(kosong)', status: 'fail', message: 'Nomor HP tidak valid.' });
            failureCount += 1;
            continue;
        }

        if (seen.has(normalizedPhone)) {
            results.push({ nomor: formatWhitelistedPhoneDisplay(normalizedPhone), status: 'skip', message: 'Duplikat di dalam input.' });
            skipCount += 1;
            continue;
        }
        seen.add(normalizedPhone);

        const result = await addWhitelistedPhone(normalizedPhone, item.nama || null);
        results.push({ nomor: formatWhitelistedPhoneDisplay(normalizedPhone), status: result.success ? 'success' : 'fail', message: result.message });
        if (result.success) {
            successCount += 1;
        } else {
            failureCount += 1;
        }
    }

    const lines = [
        `✅ *${title}*`,
        `Berhasil: ${successCount}`,
        `Gagal: ${failureCount}`,
        `Dilewati: ${skipCount}`,
        '',
    ];

    results.forEach((result, index) => {
        const icon = result.status === 'success' ? '✅' : result.status === 'skip' ? '⏭️' : '❌';
        lines.push(`${index + 1}. ${result.nomor} — ${icon} ${result.message}`);
    });

    return lines.join('\n');
}

async function buildWhitelistBulkDeleteSummary(title: string, items: WhitelistBulkDeleteItem[]): Promise<string> {
    const results: Array<{ nomor: string; status: 'success' | 'fail' | 'skip'; message: string }> = [];
    const seen = new Set<string>();
    let successCount = 0;
    let failureCount = 0;
    let skipCount = 0;

    for (const item of items) {
        const normalizedPhone = normalizeManualPhone(item.nomor);
        if (!normalizedPhone) {
            results.push({ nomor: item.nomor || '(kosong)', status: 'fail', message: 'Nomor HP tidak valid.' });
            failureCount += 1;
            continue;
        }

        if (seen.has(normalizedPhone)) {
            results.push({ nomor: formatWhitelistedPhoneDisplay(normalizedPhone), status: 'skip', message: 'Duplikat di dalam input.' });
            skipCount += 1;
            continue;
        }
        seen.add(normalizedPhone);

        const result = await removeWhitelistedPhone(normalizedPhone);
        results.push({ nomor: formatWhitelistedPhoneDisplay(normalizedPhone), status: result.success ? 'success' : 'fail', message: result.message });
        if (result.success) {
            successCount += 1;
        } else {
            failureCount += 1;
        }
    }

    const lines = [
        `✅ *${title}*`,
        `Berhasil: ${successCount}`,
        `Gagal: ${failureCount}`,
        `Dilewati: ${skipCount}`,
        '',
    ];

    results.forEach((result, index) => {
        const icon = result.status === 'success' ? '✅' : result.status === 'skip' ? '⏭️' : '❌';
        lines.push(`${index + 1}. ${result.nomor} — ${icon} ${result.message}`);
    });

    return lines.join('\n');
}

function buildBlockedLocationMenuText(): string {
    return [
        '📍 *KELOLA LOKASI PENUH (DHARMAJAYA)*',
        '',
        '1️⃣ Tandai Lokasi Penuh',
        '2️⃣ Lihat Daftar Lokasi Penuh',
        '3️⃣ Buka Kembali Lokasi',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

const CLOSED_MODE_MENU_5_ALLOWLIST = new Set([
    '5',
    'STATUS',
    'CEK STATUS',
    'STATUS PENDAFTARAN',
    'CEK STATUS PENDAFTARAN',
]);

function normalizeIncomingCommand(raw: string): string {
    const normalizedRaw = sanitizeInboundText(raw).trim();
    const up = normalizedRaw
        .toUpperCase()
        .split(/\s+/)
        .filter(Boolean)
        .join(' ');
    if (up === 'MENU_DAFTAR') return '1';
    if (up === 'MENU_CEK') return '2';
    if (up === 'MENU_HAPUS') return '3';
    if (up === 'MENU_STATUS') return '5';
    if (up === 'MENU_BANTUAN') return '6';
    if (up === 'HAPUS') return '3'; // Support keyword "HAPUS" langsung
    return up;
}

function isValidIdPhone(phoneRaw: string): boolean {
    const normalized = normalizePhone(phoneRaw);
    return normalized.startsWith('62') && normalized.length >= 10 && normalized.length <= 15;
}

function isAllowedWhenClosed(normalizedCommand: string, currentUserFlow: string): boolean {
    if (currentUserFlow === 'CHECK_STATUS_PICK_ITEMS') {
        return true;
    }

    return CLOSED_MODE_MENU_5_ALLOWLIST.has(normalizedCommand);
}

function buildLocationQuotaMenuText(): string {
    return [
        '📊 *BATAS PER LOKASI (PER USER/HARI)*',
        '',
        '1️⃣ Set batas lokasi',
        '2️⃣ Lihat batas lokasi',
        '3️⃣ Nonaktifkan batas lokasi',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

function buildLocationQuotaListText(): string {
    const lines: string[] = ['📊 *DAFTAR BATAS PER LOKASI (PER USER/HARI)*', ''];
    const limits = listLocationQuotaLimits();

    limits.forEach((item, index) => {
        const locationLabel = item.locationKey.replace('DHARMAJAYA - ', '');
        const value = item.enabled ? `${item.limit}` : 'OFF';
        lines.push(`${index + 1}. ${locationLabel}: ${value}`);
    });

    lines.push('');
    lines.push('Ketik *0* untuk kembali.');
    return lines.join('\n');
}

function buildGlobalLocationQuotaMenuText(): string {
    return [
        '🌐 *KUOTA GLOBAL PER LOKASI (SEMUA USER/HARI)*',
        '',
        '1️⃣ Set kuota global lokasi',
        '2️⃣ Lihat kuota global lokasi',
        '3️⃣ Nonaktifkan kuota global lokasi',
        '',
        '0️⃣ Kembali ke Menu Admin',
    ].join('\n');
}

async function buildGlobalLocationQuotaListText(): Promise<string> {
    const lines: string[] = ['🌐 *DAFTAR KUOTA GLOBAL PER LOKASI (SEMUA USER/HARI)*', ''];
    const locationKeys = listAllDharmajayaLocations();
    const limits = await listGlobalLocationQuotaLimits(locationKeys);
    const byLocation = new Map(limits.map(item => [item.locationKey, item]));

    locationKeys.forEach((locationKey, index) => {
        const locationLabel = locationKey.replace('DHARMAJAYA - ', '');
        const item = byLocation.get(locationKey);
        const value = item && item.enabled && item.limit !== null ? `${item.limit}` : 'OFF';
        lines.push(`${index + 1}. ${locationLabel}: ${value}`);
    });

    lines.push('');
    lines.push('Ketik *0* untuk kembali.');
    return lines.join('\n');
}

function collectPendingOkItemsPerLocation(logJson: LogJson): Map<string, number> {
    const pendingPerLocation = new Map<string, number>();
    const okItems = (logJson?.items || []).filter((it: unknown) => {
        if (!it || typeof it !== 'object') return false;
        const data = it as Record<string, unknown>;
        return data.status === 'OK';
    });

    okItems.forEach((it: unknown) => {
        if (!it || typeof it !== 'object') return;
        const data = it as Record<string, unknown>;
        const parsed = data.parsed as Record<string, unknown> | undefined;
        const lokasi = (parsed?.lokasi || '').toString().trim();
        if (!lokasi) return;
        pendingPerLocation.set(lokasi, (pendingPerLocation.get(lokasi) || 0) + 1);
    });

    return pendingPerLocation;
}

async function checkGlobalLocationQuotaBeforeSave(
    logJson: LogJson,
    messageId: string
): Promise<{ allowed: boolean; message?: string; reservation?: GlobalLocationQuotaReservation }> {
    const pendingPerLocation = collectPendingOkItemsPerLocation(logJson);
    if (pendingPerLocation.size === 0) return { allowed: true };

    const processingDayKey = (logJson?.processing_day_key || '').toString();
    if (!processingDayKey) return { allowed: true };

    const reserveResult = await reserveGlobalLocationQuota({
        processingDayKey,
        messageId,
        pendingByLocation: pendingPerLocation,
    });

    if (!reserveResult.success) {
        return {
            allowed: false,
            message: reserveResult.message || '⚠️ Kuota global lokasi sedang bermasalah. Silakan coba lagi beberapa saat.',
        };
    }

    return {
        allowed: true,
        reservation: reserveResult.reservation,
    };
}

async function releaseGlobalQuotaReservationIfNeeded(reservation?: GlobalLocationQuotaReservation): Promise<void> {
    if (!reservation) return;
    await releaseGlobalLocationQuotaReservation(reservation);
}

async function checkLocationQuotaBeforeSave(logJson: LogJson, senderPhone: string): Promise<{ allowed: boolean; message?: string }> {
    const okItems = (logJson?.items || []).filter((it: any) => it?.status === 'OK');
    if (okItems.length === 0) return { allowed: true };

    const processingDayKey = (logJson?.processing_day_key || '').toString();
    if (!processingDayKey) return { allowed: true };

    const pendingPerLocation = new Map<string, number>();
    okItems.forEach((it: any) => {
        const lokasi = (it?.parsed?.lokasi || '').toString().trim();
        if (!lokasi) return;
        pendingPerLocation.set(lokasi, (pendingPerLocation.get(lokasi) || 0) + 1);
    });

    for (const [locationKey, pendingCount] of pendingPerLocation.entries()) {
        const limit = getLocationQuotaLimit(locationKey);
        if (limit === null) continue;

        const used = await getTotalDataTodayForSenderByLocation(senderPhone, processingDayKey, locationKey);
        if (used < 0) {
            return {
                allowed: false,
                message: '⚠️ Sistem kuota sedang bermasalah. Silakan coba lagi beberapa saat.',
            };
        }
        const after = used + pendingCount;

        if (after > limit) {
            const locationLabel = locationKey.replace(/^DHARMAJAYA\s*-\s*/i, '').trim() || locationKey;
            const mustReduce = after - limit;
            return {
                allowed: false,
                message: [
                    '⛔ *Limit kirim data lokasi tercapai*',
                    `Limit Kirim Data ${locationLabel}: *${limit}*`,
                    `Sudah terpakai: *${used} data*`,
                    `Data yang Anda kirim sekarang: *${pendingCount} data*`,
                    `Kurangi *${mustReduce} data* agar bisa diproses.`,
                    '',
                    'Silakan kirim lagi besok atau pilih lokasi lain.',
                ].join('\n'),
            };
        }
    }

    return { allowed: true };
}

function getUnderageOkItems(logJson: LogJson) {
    return logJson.items.filter((item) => item.status === 'OK' && item.parsed.underage_warning === true);
}

function removeUnderageOkItems(logJson: LogJson): LogJson {
    const items = logJson.items.filter((item) => !(item.status === 'OK' && item.parsed.underage_warning === true));
    const okCount = items.filter((item) => item.status === 'OK').length;
    const skipFormatCount = items.filter((item) => item.status === 'SKIP_FORMAT').length;
    const skipDuplicateCount = items.filter((item) => item.status === 'SKIP_DUPLICATE').length;

    return {
        ...logJson,
        items,
        stats: {
            total_blocks: items.length,
            ok_count: okCount,
            skip_format_count: skipFormatCount,
            skip_duplicate_count: skipDuplicateCount,
        },
    };
}

function clearUnderageConfirmationSession(senderPhone: string): void {
    pendingUnderageConfirmationByPhone.delete(senderPhone);
    userFlowByPhone.delete(senderPhone);
}

async function queueUnderageConfirmationIfNeeded(params: {
    sockInstance: WASocket;
    remoteJid: string;
    senderPhone: string;
    logJson: LogJson;
    originalText: string;
    locationContext: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION';
    processingDayKey: string;
}): Promise<boolean> {
    const underageItems = getUnderageOkItems(params.logJson);
    if (underageItems.length === 0) return false;

    const pendingSession: PendingUnderageConfirmationSession = {
        logJson: params.logJson,
        originalText: params.originalText,
        locationContext: params.locationContext,
        processingDayKey: params.processingDayKey,
    };

    pendingUnderageConfirmationByPhone.set(params.senderPhone, pendingSession);
    userFlowByPhone.set(params.senderPhone, 'UNDERAGE_CONFIRMATION');

    const previewLines = underageItems.slice(0, 5).map((item, index) => {
        const name = item.parsed.nama || 'Tanpa nama';
        const ageText = typeof item.parsed.nik_age_years === 'number'
            ? `${item.parsed.nik_age_years} tahun`
            : '<17 tahun';
        return `${index + 1}. ${name} (${ageText})`;
    });

    const moreLine = underageItems.length > 5
        ? `...dan ${underageItems.length - 5} data lainnya.`
        : '';

    const detailSection = [
        'Data yang perlu konfirmasi:',
        ...previewLines,
        moreLine,
    ].filter(Boolean).join('\n');

    const warningText = [
        UNDERAGE_CONFIRMATION_MESSAGE,
        '',
        detailSection,
        '',
        UNDERAGE_CONFIRMATION_REMINDER,
    ].join('\n');

    await params.sockInstance.sendMessage(params.remoteJid, { text: warningText });
    return true;
}

function getUnknownRegionOkItems(logJson: LogJson) {
    return logJson.items.filter((item) => item.status === 'OK' && item.parsed.unknown_region_warning === true);
}

function removeUnknownRegionOkItems(logJson: LogJson): LogJson {
    const items = logJson.items.filter((item) => !(item.status === 'OK' && item.parsed.unknown_region_warning === true));
    const okCount = items.filter((item) => item.status === 'OK').length;
    const skipFormatCount = items.filter((item) => item.status === 'SKIP_FORMAT').length;
    const skipDuplicateCount = items.filter((item) => item.status === 'SKIP_DUPLICATE').length;

    return {
        ...logJson,
        items,
        stats: {
            total_blocks: items.length,
            ok_count: okCount,
            skip_format_count: skipFormatCount,
            skip_duplicate_count: skipDuplicateCount,
        },
    };
}

function clearUnknownRegionConfirmationSession(senderPhone: string): void {
    pendingUnknownRegionConfirmationByPhone.delete(senderPhone);
    userFlowByPhone.delete(senderPhone);
}

function clearTransientSessionContext(
    senderPhone: string,
    options?: { clearFlows?: boolean; clearPendingConfirmations?: boolean; clearLocationChoice?: boolean }
): void {
    pendingRegistrationData.delete(senderPhone);
    editSessionMap.delete(senderPhone);
    contactSessionByPhone.delete(senderPhone);
    whitelistSessionByPhone.delete(senderPhone);
    broadcastDraftMap.delete(senderPhone);
    locationQuotaDraftByPhone.delete(senderPhone);
    globalLocationQuotaDraftByPhone.delete(senderPhone);
    closeWindowDraftByPhone.delete(senderPhone);
    adminContactCache.delete(senderPhone);
    adminContactCache.delete(senderPhone + '_data');
    adminUserListCache.delete(senderPhone);
    adminUserListCache.delete(senderPhone + '_selected');
    statusCheckSelectionByPhone.delete(senderPhone);
    statusCheckInProgressByPhone.delete(senderPhone);
    pendingLocationCandidates.delete(senderPhone);
    pendingDelete.delete(senderPhone);

    if (options?.clearPendingConfirmations) {
        pendingUnderageConfirmationByPhone.delete(senderPhone);
        pendingUnknownRegionConfirmationByPhone.delete(senderPhone);
    }

    if (options?.clearLocationChoice) {
        userLocationChoice.delete(senderPhone);
        userSpecificLocationChoice.delete(senderPhone);
    }

    if (options?.clearFlows) {
        userFlowByPhone.delete(senderPhone);
        adminFlowByPhone.delete(senderPhone);
    }
}

async function queueUnknownRegionConfirmationIfNeeded(params: {
    sockInstance: WASocket;
    remoteJid: string;
    senderPhone: string;
    logJson: LogJson;
    originalText: string;
    locationContext: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION';
    processingDayKey: string;
}): Promise<boolean> {
    const unknownRegionItems = getUnknownRegionOkItems(params.logJson);
    if (unknownRegionItems.length === 0) return false;

    const pendingSession: PendingUnknownRegionConfirmationSession = {
        logJson: params.logJson,
        originalText: params.originalText,
        locationContext: params.locationContext,
        processingDayKey: params.processingDayKey,
    };

    pendingUnknownRegionConfirmationByPhone.set(params.senderPhone, pendingSession);
    userFlowByPhone.set(params.senderPhone, 'UNKNOWN_REGION_CONFIRMATION');

    const previewLines = unknownRegionItems.slice(0, 5).map((item, index) => {
        const name = item.parsed.nama || 'Tanpa nama';
        const ktp = item.parsed.no_ktp || '-';
        return `${index + 1}. ${name} (KTP: ${ktp})`;
    });

    const moreLine = unknownRegionItems.length > 5
        ? `...dan ${unknownRegionItems.length - 5} data lainnya.`
        : '';

    const detailSection = [
        'Data yang perlu konfirmasi:',
        ...previewLines,
        moreLine,
    ].filter(Boolean).join('\n');

    const warningText = [
        UNKNOWN_REGION_CONFIRMATION_MESSAGE,
        '',
        detailSection,
        '',
        UNKNOWN_REGION_CONFIRMATION_REMINDER,
    ].join('\n');

    await params.sockInstance.sendMessage(params.remoteJid, { text: warningText });
    return true;
}


function getMessageDate(msg: any): Date {
    const ts: any = msg?.messageTimestamp;
    try {
        if (typeof ts === 'number') return new Date(ts * 1000);
        if (typeof ts === 'string') return new Date(Number(ts) * 1000);
        if (ts && typeof ts.toNumber === 'function') return new Date(ts.toNumber() * 1000);
    } catch {
        // ignore
    }
    return new Date();
}

function unwrapMessageContent(message: any): any {
    let current = message;
    for (let depth = 0; depth < 6; depth += 1) {
        if (!current || typeof current !== 'object') break;

        const next =
            current?.ephemeralMessage?.message ||
            current?.viewOnceMessage?.message ||
            current?.viewOnceMessageV2?.message ||
            current?.viewOnceMessageV2Extension?.message ||
            current?.documentWithCaptionMessage?.message ||
            current?.editedMessage?.message;

        if (!next || next === current) break;
        current = next;
    }
    return current;
}

// --- HELPER FILTER ---
function shouldIgnoreMessage(msg: any): boolean {
    const jid = msg.key?.remoteJid;
    if (!jid) {
        console.log('[IGNORED] missing remoteJid');
        return true;
    }
    if (jid === 'status@broadcast') {
        console.log('[IGNORED] status broadcast');
        return true;
    }
    if (jid.endsWith('@newsletter')) {
        console.log(`[IGNORED] newsletter: ${jid}`);
        return true;
    }
    if (jid.endsWith('@broadcast')) {
        console.log('[IGNORED] broadcast system');
        return true;
    }
    if (jid.endsWith('@g.us')) {
        console.log(`[IGNORED] group: ${jid}`);
        return true;
    }
    if (!msg.message) {
        console.log(`[IGNORED] empty message payload: ${jid}`);
        return true;
    }
    return false;
}

export async function connectToWhatsApp() {
    if (isConnecting) {
        console.log('⏳ Koneksi WhatsApp masih berjalan, skip connect paralel.');
        return;
    }

    isConnecting = true;
    clearPendingReconnect();
    startConnectionWatchdog();
    lastConnectionState = 'connecting';
    connectAttemptStartedAt = Date.now();
    lastConnectionUpdateAt = Date.now();

    const attemptSequence = ++connectSequence;

    try {
    warmupKtpMasterCsvLookup();
    await initRegisteredUsersCache(); // Inisialisasi cache user terdaftar
    await initWhitelistedPhonesCache();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`🔗 Menghubungkan ke WA v${version.join('.')}...`);

    if (sock) {
        try {
            sock.end(new Error('Reinitializing WhatsApp socket'));
        } catch (error) {
            console.warn('⚠️ Gagal menutup socket sebelumnya:', error);
        }
    }

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'], // Ubah browser info agar support pairing code
        generateHighQualityLinkPreview: true,
    });

    // --- PAIRING CODE LOGIC ---
    // --- PAIRING CODE LOGIC (DISABLED - USE QR) ---
    /*
    if (!sock.authState.creds.registered) {
       const phoneNumber = '6287776960445'; 
       setTimeout(async () => {
           try {
               const code = await sock.requestPairingCode(phoneNumber);
               console.log(`\n================================`);
               console.log(`PAIRING CODE: ${code}`);
               console.log(`================================\n`);
           } catch (err) {
               console.error('Gagal request pairing code:', err);
           }
       }, 4000);
    }
    */

    // Hubungkan store dengan event socket agar kontak terus terupdate
    store.bind(sock.ev);

    // FIX: Load & Save Store agar LID mapping awet (Persistent Store)
    const MULTI_STORE_FILE = 'baileys_store_multi.json';
    store.readFromFile(MULTI_STORE_FILE);

    // Save store setiap 10 detik agar data tidak hilang saat restart
    if (storePersistenceInterval) {
        clearInterval(storePersistenceInterval);
    }
    storePersistenceInterval = setInterval(() => {
        store.writeToFile(MULTI_STORE_FILE);
    }, 10_000);

    sock.ev.on('connection.update', (update) => {
        if (attemptSequence !== connectSequence) {
            return;
        }

        lastConnectionUpdateAt = Date.now();

        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('SCAN QR CODE DI BAWAH INI:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            lastConnectionState = 'close';
            const err = lastDisconnect?.error as Boom;
            const statusCode = err?.output?.statusCode;
            const noReconnectCodes = [DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.connectionReplaced, DisconnectReason.badSession];
            const shouldReconnect = !noReconnectCodes.includes(statusCode as number);
            console.log('❌ Koneksi terputus:', err?.message ?? err);
            console.log('👉 Status Code:', statusCode);
            console.log('🔄 Reconnect?', shouldReconnect);
            if (shouldReconnect) {
                reconnectSuspended = false;
                reconnectWithBackoff(`connection-close status=${statusCode ?? 'unknown'}`);
            } else {
                reconnectSuspended = true;
                retryCount = 0;
                clearPendingReconnect();
                console.log('⛔ Sesi logout/invalid. Hapus folder auth_info_baileys dan scan ulang.');
            }
        } else if (connection === 'open') {
            reconnectSuspended = false;
            retryCount = 0; // Reset backoff counter saat koneksi berhasil
            clearPendingReconnect();
            lastConnectionState = 'open';
            console.log('✅ WhatsApp Terhubung! Siap menerima pesan.');
        } else if (connection) {
            lastConnectionState = connection;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // (Code listener manual contacts.upsert/update KITA HAPUS karena sudah di-handle oleh store.bind)

    // --- LOGIC UTAMA PROSES PESAN ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' && type !== 'append') {
            console.log(`[IGNORED] upsert type=${type} count=${messages?.length || 0}`);
            return;
        }

        for (const msg of messages) {
            if (msg.key.fromMe) continue;
            if (shouldIgnoreMessage(msg)) continue;

            let senderPhoneForLock = '';
            let processingDayKeyForLock = '';

            try {
                const rawRemoteJid = msg.key.remoteJid;
                if (!rawRemoteJid) continue;

                // 🔄 IDENTITAS PENGIRIM & JID CHAT
                // chatJid: selalu dipakai untuk balas (biar aman walau incoming @lid)
                const chatJid = jidNormalizedUser(rawRemoteJid);

                // senderPhone: dipakai untuk identitas/DB/admin. Kalau @lid, ambil dari Supabase mapping (manual input).
                let senderPhone = chatJid.replace('@s.whatsapp.net', '').replace('@lid', '');

                if (isLidJid(chatJid) || !chatJid.includes('@s.whatsapp.net')) {
                    // 1) Cek Cache Supabase (LID -> Phone) - FASTEST & MOST ACCURATE
                    const cachedPhone = getPhoneFromLidSync(chatJid);
                    if (cachedPhone) {
                        senderPhone = cachedPhone;
                        // console.log(`⚡ Hit Cache LID: ${chatJid} -> ${senderPhone}`);
                    } else {
                        // 2) Cek Store Baileys (Fallback)
                        const storePhone = getPhoneFromLid(chatJid);
                        if (storePhone) {
                            senderPhone = storePhone.replace('@s.whatsapp.net', '');
                            // Simpan ke Supabase agar persistent
                            upsertLidPhoneMap({ lid_jid: chatJid, phone_number: senderPhone, push_name: null }).catch(() => { });
                        } else {
                            // 3) Fallback ke Supabase Async (siapa tahu cache belum ke-load sempurna)
                            const mapped = await getPhoneByLidJid(chatJid);
                            if (mapped) {
                                senderPhone = mapped;
                            }
                        }
                    }
                }
                senderPhoneForLock = senderPhone;

                // helper flag
                const senderIsLid = isLidJid(chatJid);

                // remoteJid dipakai oleh logic lama untuk kirim balasan
                const remoteJid = chatJid;

                // Cek log jika ada perubahan JID (Artinya mapping berhasil)
                if (rawRemoteJid !== remoteJid) {
                    console.log(`🔄 Mapping LID detect: ${rawRemoteJid} -> ${remoteJid} (${senderPhone})`);
                }

                const mAny: any = unwrapMessageContent(msg.message as any);

                const messageText =
                    mAny?.conversation ||
                    mAny?.extendedTextMessage?.text ||
                    mAny?.imageMessage?.caption ||
                    mAny?.videoMessage?.caption ||
                    '';

                const selectedRowId = mAny?.listResponseMessage?.singleSelectReply?.selectedRowId;
                const selectedButtonId =
                    mAny?.buttonsResponseMessage?.selectedButtonId ||
                    mAny?.templateButtonReplyMessage?.selectedId;

                const rawInput = selectedRowId || selectedButtonId || messageText;
                let senderAccess = await resolveSenderAccess(senderPhone);
                const isAdminEarly = senderAccess.via === 'admin';

                const receivedAt = getMessageDate(msg);
                const tanggalWib = getWibIsoDate(receivedAt);

                const processingDayKey = getProcessingDayKey(receivedAt);
                processingDayKeyForLock = processingDayKey;

                const senderPhoneAtEarlyCheck = senderPhone;

                if (!isAdminEarly) {
                    const blockedPhoneEarly = await isPhoneBlocked(senderPhone);
                    if (blockedPhoneEarly.blocked) {
                        const reasonText = blockedPhoneEarly.reason ? `\nAlasan: ${blockedPhoneEarly.reason}` : '';
                        await sock.sendMessage(remoteJid, {
                            text: `⛔ *NOMOR ANDA DIBLOKIR SYSTEM*\n\nPesan Anda tidak dapat diproses.${reasonText}`
                        });
                        continue;
                    }
                }

                if (!isAdminEarly && !senderAccess.allowed) {
                    const unresolvedLidSender = senderIsLid && !isValidIdPhone(senderPhone);

                    if (unresolvedLidSender) {
                        const candidatePhone = extractManualPhone(String(rawInput || '').trim());

                        if (!candidatePhone) {
                            console.log(`⛔ Ignored unresolved LID sender without whitelisted phone: ${chatJid}`);
                            continue;
                        }

                        const candidateAccess = await resolveSenderAccess(candidatePhone);
                        if (!candidateAccess.allowed) {
                            console.log(`⛔ Ignored non-whitelisted verification phone: ${candidatePhone}`);
                            continue;
                        }

                        senderPhone = candidatePhone;
                        senderAccess = candidateAccess;
                        await upsertLidPhoneMap({
                            lid_jid: chatJid,
                            phone_number: candidatePhone,
                            push_name: candidateAccess.name || msg.pushName || null,
                        });
                    } else {
                        console.log(`⛔ Ignored non-whitelisted sender: ${senderPhone}`);
                        continue;
                    }
                }

                // Helper untuk membersihkan input user
                // (Variables normalized, rawTrim are declared later)

                // Jika pesan adalah gambar/video tanpa caption, beritahu user
                if (!rawInput && (mAny?.imageMessage || mAny?.videoMessage)) {
                    await sock.sendMessage(remoteJid, {
                        text: `⚠️ Maaf, saya tidak bisa membaca gambar/foto\n\nFormat yang diterima seperti ini:\nKirim data dengan urutan 4 baris ke bawah:\n\n1. Nama\n2. Jenis Kartu + Nomor Kartu\n3. KTP + Nomor KTP (NIK)\n4. KK + Nomor KK\n\n✅ Contoh 1 (KJP):\nBudi\nKJP 5049488500001111\nKTP 3173444455556666\nKK 3173555566667777\n\n✅ Contoh 2 (LANSIA):\nBudi\nLANSIA 5049441234567890\nKTP 3173444455556666\nKK 3173555566667777\n\nJenis kartu yang didukung:\nKJP · LANSIA · RUSUN · DISABILITAS · DASAWISMA\nPEKERJA · GURU HONORER · PJLP · KAJ\n\nSilakan ketik pesan teks atau kirim MENU untuk melihat pilihan.`
                    });
                    continue;
                }

                if (!rawInput) {
                    const keys = Object.keys(mAny || {}).join(',') || 'none';
                    console.log(`⚠️ Ignored empty rawInput from ${senderPhone} (jid=${chatJid}, keys=${keys})`);
                    continue;
                }

                // ✅ KHUSUS AKUN @lid: kalau belum ada mapping nomor, minta user ketik nomor manual
                // PENTING: Hanya proses jika input SATU BARIS (bukan data sembako multi-baris)
                const inputLines = String(rawInput).trim().split('\n').filter(l => l.trim());
                const isSingleLineInput = inputLines.length === 1;

                if (senderIsLid && (!senderPhone || senderPhone === chatJid.replace('@lid', '')) && isSingleLineInput) {
                    // Cek format NAMA#NOMOR atau NAMA NOMOR (Space)
                    let candidatePhone: string | null = null;
                    let candidateName: string | null = msg.pushName || null;

                    const text = String(rawInput).trim();
                    const phoneFound = extractManualPhone(text);

                    if (phoneFound) {
                        const candidateAccess = await resolveSenderAccess(phoneFound);
                        if (!candidateAccess.allowed) {
                            console.log(`⛔ Ignored non-whitelisted verification phone: ${phoneFound}`);
                            continue;
                        }

                        // Cek apakah nomor ini sudah terdaftar
                        const existingUser = await getRegisteredUserByPhone(phoneFound);
                        if (existingUser && existingUser.lid_jid && existingUser.lid_jid !== chatJid) {
                            // Nomor sudah ada tapi LID berbeda - ini kemungkinan user pindah device/bot ganti nomor
                            // UPDATE LID-nya agar user bisa lanjut pakai
                            await updateLidForPhone(phoneFound, chatJid);

                            // Kirim pesan selamat datang + MENU UTAMA
                            const welcomeBackMsg = [
                                `✅ *Selamat datang kembali!*`,
                                `Nomor Anda (${phoneFound}) sudah dikenali.`,
                                '',
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                '',
                                MENU_MESSAGE,
                            ].join('\n');
                            await sock.sendMessage(remoteJid, { text: welcomeBackMsg });
                            // PENTING: continue di sini, agar pada pesan berikutnya LID sudah ter-mapping
                            continue;
                        }

                        candidatePhone = phoneFound;
                        // Ambil nama: hapus nomor dari text (termasuk format 08xxx dan 628xxx)
                        const phoneOriginal = phoneFound.replace('62', '0'); // 6285xxx -> 085xxx
                        let cleanName = text
                            .replace(phoneOriginal, '') // Hapus format 08xxx
                            .replace(phoneFound, '')    // Hapus format 62xxx (jika user ketik begitu)
                            .replace(/\d{8,}/g, '')     // Hapus sisa digit panjang
                            .replace(/[#\-]/g, '')      // Hapus delimiter
                            .replace(/\s+/g, ' ')       // Rapikan spasi
                            .trim();
                        if (cleanName) {
                            candidateName = cleanName;
                        }
                        candidateName = existingUser?.push_name || candidateAccess.name || candidateName;
                    }

                    if (candidatePhone) {
                        try {
                            await upsertLidPhoneMap({ lid_jid: chatJid, phone_number: candidatePhone, push_name: candidateName });
                            senderPhone = candidatePhone;
                            senderAccess = await resolveSenderAccess(senderPhone);
                            await sock.sendMessage(remoteJid, { text: `✅ Nomor kamu sudah dicatat: ${candidatePhone}\nSilakan lanjut.` });
                            // lanjutkan proses setelah nomor ada (tidak continue)
                        } catch (e: any) {
                            await sock.sendMessage(remoteJid, { text: `❌ Gagal menyimpan nomor. Coba lagi.` });
                            continue;
                        }
                    } else {
                        await sock.sendMessage(remoteJid, { text: `Nomor HP kamu belum terdaftar di sistem.\n\nSilakan masukkan NAMA dan NOMOR HP kamu (bisa pisah spasi) agar otomatis tersimpan.\n\nContoh:\n*Budi 085988880000*` });
                        continue;
                    }
                }

                // --- 🛡️ CEK REGISTRASI WAJIB (BLOCKING FILTER) ---
                // Cek apakah user sudah punya nama di database
                // PRIORITAS: 1) Cache, 2) Direct DB query by phone (untuk fix setelah ganti nomor bot)
                let existingName = getRegisteredUserNameSync(senderPhone) || senderAccess.name || null;

                // Jika cache miss, coba query langsung ke DB by phone_number (fix untuk LID yang berubah setelah ganti nomor bot)
                if (!existingName && senderPhone) {
                    const dbLookup = await getRegisteredUserByPhone(senderPhone);
                    if (dbLookup) {
                        existingName = dbLookup.push_name || senderAccess.name || existingName;
                        console.log(`✅ User ditemukan via DB lookup: ${senderPhone} -> ${existingName}`);

                        // Auto-update LID jika berubah 
                        if (dbLookup.lid_jid && dbLookup.lid_jid !== chatJid && chatJid.includes('@lid')) {
                            await updateLidForPhone(senderPhone, chatJid);
                        }
                    }
                }

                // Helper for command normalization
                const normalized = normalizeIncomingCommand(rawInput);
                const rawTrim = (rawInput || '').toString().trim();

                // --- LOGIC VERIFIKASI USER BARU ---
                // Jika belum terdaftar, cek apakah user kirim Nomor HP untuk verifikasi?
                if (!existingName) {
                    // Cek input apakah murni angka/nomor hp?
                    const possiblePhoneVerify = extractManualPhone(rawTrim.split('\n')[0]);

                    // Syarat: Input adalah nomor HP, hanya 1 baris, dan pendek (bukan setoran)
                    if (possiblePhoneVerify && rawTrim.split('\n').length === 1 && rawTrim.length < 50) {
                        // Validasi format nomor
                        if (isValidIdPhone(possiblePhoneVerify)) {
                            const verifiedAccess = await resolveSenderAccess(possiblePhoneVerify);
                            if (!verifiedAccess.allowed) {
                                console.log(`⛔ Ignored non-whitelisted verification phone: ${possiblePhoneVerify}`);
                                continue;
                            }

                            // Cek apakah nomor ini ada di DB?
                            const targetUser = await getRegisteredUserByPhone(possiblePhoneVerify);

                            let finalName = verifiedAccess.name || msg.pushName || 'User Baru';
                            if (targetUser && targetUser.push_name) {
                                finalName = targetUser.push_name;
                                console.log(`♻️ Verifikasi LID (Existing): ${chatJid} -> ${possiblePhoneVerify} (${finalName})`);
                            } else {
                                console.log(`🆕 Verifikasi LID (New): ${chatJid} -> ${possiblePhoneVerify} (Name: ${finalName})`);
                            }

                            // SIMPAN / UPDATE MAPPING
                            await upsertLidPhoneMap({
                                lid_jid: chatJid,
                                phone_number: possiblePhoneVerify,
                                push_name: finalName
                            });

                            // Update Context Saat Ini
                            senderPhone = possiblePhoneVerify;
                            senderAccess = verifiedAccess;
                            existingName = finalName;

                            // Reply Sukses & Panduan Input
                            await sock.sendMessage(remoteJid, {
                                text: `✅ *Nomor kamu sudah dicatat: ${possiblePhoneVerify}*\nSilakan lanjut.\n\n` +
                                    `📋 *Selanjutnya silakan kirim data yang akan didaftarkan:*\n\n` +
                                    `1. Nama\n2. Jenis Kartu + Nomor Kartu\n3. KTP + Nomor KTP (NIK)\n4. KK + Nomor KK\n\n` +
                                    `*Contoh 1 (KJP):*\n` +
                                    `Budi\nKJP 5049488500001111\nKTP 3173444455556666\nKK 3173555566667777\n\n` +
                                    `*Contoh 2 (LANSIA):*\n` +
                                    `Budi\nLANSIA 5049441234567890\nKTP 3173444455556666\nKK 3173555566667777\n\n` +
                                    `Jenis kartu yang didukung:\nKJP · LANSIA · RUSUN · DISABILITAS · DASAWISMA · PEKERJA · GURU HONORER · PJLP · KAJ`
                            });
                            return; // Stop disini agar user baca panduan
                        }
                    }
                }

                // --- AUTO-REGISTER LOGIC (STRICT) ---
                if (!existingName) {
                    // KASUS 1: Sender Phone VALID (Misal user chat biasa/android)
                    if (senderPhone && isValidIdPhone(senderPhone)) {
                        if (!senderAccess.allowed) {
                            console.log(`⛔ Ignored non-whitelisted sender after verification: ${senderPhone}`);
                            continue;
                        }

                        const autoName = senderAccess.name || msg.pushName || 'User Baru';
                        await upsertLidPhoneMap({
                            lid_jid: chatJid,
                            phone_number: senderPhone,
                            push_name: autoName
                        });
                        existingName = autoName;
                    }
                    // KASUS 2: Sender Phone TIDAK VALID (LID 7933...) -> BLOKIR & MINTA VERIF
                    else {
                        console.log(`⛔ Blocked unknown LID: ${senderPhone}`);
                        await sock.sendMessage(remoteJid, {
                            text: `⛔ *SISTEM TIDAK MENGENALI PERANGKAT ANDA*\n\nMohon ketik **NOMOR HP ANDA** (Contoh: 08123456789) satu kali untuk verifikasi.\n\n_Agar sistem bisa memproses data pendaftaran kartu Anda._`
                        });
                        return; // STOP PROCESSING
                    }
                }

                senderAccess = await resolveSenderAccess(senderPhone);
                const isAdminByCurrentPhone = isAdminPhone(senderPhone);
                const isAdmin = isAdminByCurrentPhone;
                const currentUserFlow = userFlowByPhone.get(senderPhone) || 'NONE';
                if (!isAdminByCurrentPhone && senderPhone !== senderPhoneAtEarlyCheck) {
                    const blockedPhone = await isPhoneBlocked(senderPhone);
                    if (blockedPhone.blocked) {
                        const reasonText = blockedPhone.reason ? `\nAlasan: ${blockedPhone.reason}` : '';
                        await sock.sendMessage(remoteJid, {
                            text: `⛔ *NOMOR ANDA DIBLOKIR SYSTEM*\n\nPesan Anda tidak dapat diproses.${reasonText}`
                        });
                        continue;
                    }
                }

                if (!isAdminByCurrentPhone && !senderAccess.allowed) {
                    console.log(`⛔ Ignored non-whitelisted sender after phone update: ${senderPhone}`);
                    continue;
                }

                // Ambil pengaturan bot dari database
                const botSettings = await getBotSettings();
                const closed = isSystemClosed(receivedAt, botSettings);

                // 🛑 CEK JAM TUTUP (PRIORITAS UTAMA)
                // Jika tutup, langsung tolak (kecuali Admin)
                const allowWhenClosed = isAllowedWhenClosed(normalized, currentUserFlow);
                if (closed && !isAdminByCurrentPhone && !allowWhenClosed) {
                    await sock.sendMessage(remoteJid, { text: renderCloseMessage(botSettings) });
                    continue; // STOP PROCESSING
                }

                let replyText = '';

                // Helper for Date Parsing
                const toIsoFromDMY = (dmy: string): string | null => {
                    const m = (dmy || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
                    if (!m) return null;
                    const dd = m[1]; const mm = m[2]; const yyyy = m[3];
                    return `${yyyy}-${mm}-${dd}`;
                };

                const exactMenuWords = new Set([
                    'HALO', 'HI', 'P', 'TEST', 'PING', 'ASSALAMUALAIKUM', 'START', 'MENU', 'INFO', 'BANTUAN'
                ]);

                const isGreetingOrMenu = (text: string) => {
                    const up = (text || '').trim().toUpperCase();
                    if (exactMenuWords.has(up)) return true;
                    if (up.startsWith('SELAMAT')) return true;
                    return false;
                };

                const linesForData = parseRawMessageToLines(messageText);
                const looksLikeRegistrationData = linesForData.length >= 4 && linesForData.length % 4 === 0;

                const messageId = msg.key.id || '';
                let inFlightMessageKey: string | null = null;
                if (messageId && linesForData.length >= 4) {
                    inFlightMessageKey = buildMessageIdempotencyKey(senderPhone, processingDayKey, messageId);

                    if (inFlightMessageKeys.has(inFlightMessageKey)) {
                        await sock.sendMessage(remoteJid, {
                            text: '⏳ Pesan data ini sedang diproses. Mohon tunggu sebentar ya.',
                        });
                        continue;
                    }

                    const alreadyProcessed = await hasProcessedMessageById({
                        senderPhone,
                        processingDayKey,
                        messageId,
                    });

                    if (alreadyProcessed) {
                        await sock.sendMessage(remoteJid, {
                            text: 'ℹ️ Pesan data ini sudah pernah diproses sebelumnya. Ketik *CEK* untuk lihat rekap terbaru.',
                        });
                        continue;
                    }

                    inFlightMessageKeys.add(inFlightMessageKey);
                }

                // --- MENU USER LOGIC ---
                // Helper to render check data result
                const renderCheckDataResult = async (targetDate: string, dateLabel: string) => {
                    try {
                        const { validCount, totalInvalid, detailItems, validItems } = await getTodayRecapForSender(
                            senderPhone,
                            targetDate
                        );
                        const dDate = targetDate.split('-').reverse().join('-');
                        if (validCount > 0 || totalInvalid > 0) {
                            return buildReplyForTodayRecap(validCount, totalInvalid, validItems, targetDate).replace('REKAP INPUT DATA HARI INI', `REKAP INPUT DATA (${dateLabel} ${dDate})`);
                        } else {
                            return `📄 *CEK DATA (${dateLabel} ${dDate})*\n\nAnda belum kirim data pada tanggal tersebut.`;
                        }
                    } catch (err) {
                        console.error(err);
                        return '❌ Gagal mengambil data.';
                    }
                };

                const formatLongIndonesianDate = (isoDate: string): string => {
                    const dt = new Date(`${isoDate}T12:00:00+07:00`);
                    return dt.toLocaleDateString('id-ID', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'Asia/Jakarta',
                    });
                };

                const parseStatusSelectionIndices = (input: string, max: number): { indices: number[]; error?: string } => {
                    const cleaned = (input || '').trim().toUpperCase();
                    if (!cleaned) return { indices: [], error: 'empty' };
                    if (cleaned === 'CEK SEMUA' || cleaned === 'SEMUA' || cleaned === 'ALL') {
                        return { indices: Array.from({ length: max }, (_, i) => i + 1) };
                    }

                    const parts = cleaned
                        .split(/[\s,]+/)
                        .map((x) => x.trim())
                        .filter((x) => x.length > 0);

                    if (parts.length === 0) return { indices: [], error: 'empty' };

                    const unique = new Set<number>();
                    for (const part of parts) {
                        if (!/^\d+$/.test(part)) {
                            return { indices: [], error: 'invalid' };
                        }
                        const value = Number(part);
                        if (value < 1 || value > max) {
                            return { indices: [], error: 'out_of_range' };
                        }
                        unique.add(value);
                    }

                    return { indices: Array.from(unique).sort((a, b) => a - b) };
                };

                const resolveStatusSourceItems = async (
                    sourceDate: string,
                    providerFilter?: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION'
                ) => {
                    const { validItems } = await getTodayRecapForSender(senderPhone, sourceDate, 'received_at');
                    const items = validItems.map((item) => ({
                        nama: item.nama,
                        no_kjp: item.no_kjp,
                        no_ktp: item.no_ktp || '-',
                        no_kk: item.no_kk || '-',
                        jenis_kartu: item.jenis_kartu || null,
                        lokasi: item.lokasi || undefined,
                        tanggal_lahir: item.tanggal_lahir || null,
                    }));

                    if (!providerFilter) return { sourceDate, items };

                    const filtered = items.filter((item) => {
                        if (!item.lokasi) return false;
                        if (providerFilter === 'PASARJAYA') return item.lokasi.startsWith('PASARJAYA');
                        if (providerFilter === 'DHARMAJAYA') return item.lokasi.startsWith('DHARMAJAYA');
                        // FOOD_STATION: lokasi bisa 'FOD STATION' atau 'FOOD_STATION'
                        return item.lokasi.startsWith('FOD STATION') || item.lokasi.startsWith('FOOD_STATION');
                    });

                    return { sourceDate, items: filtered };
                };

                // --- STATUS CHECK: shared helper for provider-based status check ---
                const processProviderStatusCheck = async (providerKey: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION'): Promise<{ text: string | null; done: boolean }> => {
                    // Food Station: cek data hari ini. Dharmajaya & Pasarjaya: cek data kemarin.
                    const sourceDateDefault = providerKey === 'FOOD_STATION'
                        ? processingDayKey
                        : shiftIsoDate(processingDayKey, -1);
                    const targetDate = shiftIsoDate(processingDayKey, 1);
                    const { sourceDate, items } = await resolveStatusSourceItems(sourceDateDefault, providerKey);

                    if (!items.length) {
                        const { validCount: todayCount } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                        if (todayCount > 0) {
                            const displayDate = sourceDateDefault.split('-').reverse().join('-');
                            return {
                                text: [
                                    '⚠️ Data hari ini belum bisa dicek statusnya sekarang.',
                                    '✅ Data hari ini baru bisa dicek besok lewat menu CEK STATUS PENDAFTARAN.',
                                    `📌 Sumber cek status saat ini: data kemarin (${displayDate}).`,
                                    '',
                                    '_Ketik 0 untuk kembali atau ketik MENU untuk menu utama._',
                                ].join('\n'),
                                done: false,
                            };
                        }
                        return { text: STATUS_CHECK_NO_DATA_TEXT(providerKey), done: false };
                    }

                    statusCheckInProgressByPhone.set(senderPhone, true);
                    userFlowByPhone.delete(senderPhone);
                    try {
                        await sock.sendMessage(remoteJid, { text: STATUS_CHECK_PROCESSING_TEXT(providerKey, items.length) });

                        if (providerKey === 'DHARMAJAYA') {
                            const results = await checkRegistrationStatuses(items, targetDate);
                            const summary = buildStatusSummaryMessage(results, targetDate);
                            const failedData = buildFailedDataCopyMessage(results);
                            await sock.sendMessage(remoteJid, { text: summary });
                            if (failedData) {
                                await sock.sendMessage(remoteJid, { text: failedData.header });
                                await sock.sendMessage(remoteJid, { text: failedData.body });
                            }
                        } else if (providerKey === 'PASARJAYA') {
                            const { checkPasarjayaStatuses } = await import('./services/pasarjayaStatusCheck');
                            const { buildPasarjayaStatusSummary, buildPasarjayaFailedCopy } = await import('./services/statusCheckFormatter');
                            const results = await checkPasarjayaStatuses(items);
                            const summary = buildPasarjayaStatusSummary(results, sourceDate);
                            const failedData = buildPasarjayaFailedCopy(results);
                            await sock.sendMessage(remoteJid, { text: summary });
                            if (failedData) {
                                await sock.sendMessage(remoteJid, { text: failedData.header });
                                await sock.sendMessage(remoteJid, { text: failedData.body });
                            }
                        } else if (providerKey === 'FOOD_STATION') {
                            const { checkFoodStationStatuses } = await import('./services/foodStationStatusCheck');
                            const { buildFoodStationStatusSummary, buildFoodStationFailedCopy } = await import('./services/statusCheckFormatter');
                            const results = await checkFoodStationStatuses(items);
                            const summary = buildFoodStationStatusSummary(results, sourceDate);
                            const failedData = buildFoodStationFailedCopy(results);
                            await sock.sendMessage(remoteJid, { text: summary });
                            if (failedData) {
                                await sock.sendMessage(remoteJid, { text: failedData.header });
                                await sock.sendMessage(remoteJid, { text: failedData.body });
                            }
                        }
                    } catch (error) {
                        console.error('status check flow error:', error);
                        await sock.sendMessage(remoteJid, { text: '❌ Gagal cek status pendaftaran. Silakan coba lagi.' });
                    } finally {
                        statusCheckInProgressByPhone.delete(senderPhone);
                    }
                    return { text: null, done: true };
                };

                const currentLocation = userLocationChoice.get(senderPhone) || 'DHARMAJAYA'; // Default to old style (Dharmajaya) if unknown

                // --- EDIT FLOW HANDLER (PATCH 1 START) ---
                if (currentUserFlow === 'EDIT_PICK_RECORD') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL') {
                        replyText = '✅ Edit dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        // User input nomor urut
                        const idx = parseInt(normalized);
                        if (isNaN(idx) || idx < 1 || idx > session.recordsToday.length) {
                            replyText = '⚠️ Nomor tidak valid. Ketik sesuai angka di daftar, atau 0 batal.';
                        } else {
                            // Valid Index -> Move to Pick Field
                            const record = session.recordsToday[idx - 1];
                            session.selectedIndex = idx;
                            session.selectedRecordId = record.id;

                            // Determine Type (Food Station vs Pasarjaya vs Dharmajaya)
                            const isFoodStation = record.lokasi?.startsWith('FOOD STATION');
                            const isPasarjaya = !isFoodStation && ((record.lokasi && record.lokasi.startsWith('PASARJAYA')) || !!record.tanggal_lahir);
                            if (isFoodStation) {
                                session.selectedType = 'FOOD_STATION';
                            } else if (isPasarjaya) {
                                session.selectedType = 'PASARJAYA';
                            } else {
                                session.selectedType = 'DHARMAJAYA';
                            }

                            // Determine Display Location
                            // Determine Display Location
                            // FIX: Gunakan lokasi asli jika ada, jangan default ke Duri Kosambi
                            let displayLocation = record.lokasi || '';
                            if (displayLocation.includes('-')) {
                                displayLocation = displayLocation.split('-')[1].trim();
                            }
                            if (!displayLocation) {
                                displayLocation = isPasarjaya ? 'Pasarjaya' : isFoodStation ? 'Foodstation' : 'Duri Kosambi';
                            }

                            editSessionMap.set(senderPhone, session); // update session
                            userFlowByPhone.set(senderPhone, 'EDIT_PICK_FIELD');

                            // Build Menu Fields (PATCH 3: Tambah opsi Lokasi)
                            const isP = session.selectedType === 'PASARJAYA';
                            const fields = isP ? [
                                '1️⃣ Nama',
                                '2️⃣ Nomor Kartu',
                                '3️⃣ Nomor KTP (NIK)',
                                '4️⃣ Nomor KK',
                                '5️⃣ Tanggal Lahir',
                                '6️⃣ Lokasi',
                                '7️⃣ BATAL'
                            ] : [
                                '1️⃣ Nama',
                                '2️⃣ Nomor Kartu',
                                '3️⃣ Nomor KTP (NIK)',
                                '4️⃣ Nomor KK',
                                '5️⃣ Lokasi',
                                '6️⃣ BATAL'
                            ];

                            replyText = [
                                `📝 *EDIT DATA KE-${idx}*`,
                                `👤 Nama: ${extractChildName(record.nama)}`,
                                `📍 Lokasi: ${displayLocation}`,
                                '',
                                'Pilih data yang ingin diubah:',
                                ...fields,
                                '',
                                '_Ketik angka pilihanmu._'
                            ].join('\n');
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'EDIT_PICK_FIELD') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else {
                        const isPasarjaya = session.selectedType === 'PASARJAYA';
                        const choice = parseInt(normalized);

                        // Mapping Choice -> Field Key (PATCH 3: Tambah Lokasi)
                        let fieldKey = '';
                        let isCancel = false;

                        if (choice === 1) fieldKey = 'nama';
                        else if (choice === 2) fieldKey = 'no_kjp';
                        else if (choice === 3) fieldKey = 'no_ktp';
                        else if (choice === 4) fieldKey = 'no_kk';
                        else if (choice === 5) {
                            if (isPasarjaya) fieldKey = 'tanggal_lahir';
                            else fieldKey = 'lokasi'; // Dharmajaya: 5 = Lokasi
                        }
                        else if (choice === 6) {
                            if (isPasarjaya) fieldKey = 'lokasi'; // Pasarjaya: 6 = Lokasi
                            else isCancel = true; // Dharmajaya: 6 = BATAL
                        }
                        else if (choice === 7 && isPasarjaya) isCancel = true; // Pasarjaya: 7 = BATAL
                        else if (choice === 0) isCancel = true;
                        else {
                            // Invalid choice
                            replyText = '⚠️ Pilihan salah. Ketik angka menu.';
                        }

                        if (isCancel) {
                            replyText = '✅ Edit dibatalkan.';
                            userFlowByPhone.set(senderPhone, 'NONE');
                            editSessionMap.delete(senderPhone);
                        } else if (fieldKey === 'lokasi' && session.selectedType === 'FOOD_STATION') {
                            const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                            let displayLocation = record?.lokasi || '';
                            if (displayLocation.includes('-')) {
                                displayLocation = displayLocation.split('-')[1].trim();
                            }
                            if (!displayLocation) displayLocation = 'Foodstation';

                            const fields = [
                                '1️⃣ Nama',
                                '2️⃣ Nomor Kartu',
                                '3️⃣ Nomor KTP (NIK)',
                                '4️⃣ Nomor KK',
                                '5️⃣ Lokasi',
                                '6️⃣ BATAL'
                            ];
                            replyText = [
                                '⚠️ Lokasi Foodstation tidak bisa diubah (tetap FOOD STATION).',
                                '',
                                `📝 *EDIT DATA KE-${session.selectedIndex}*`,
                                `👤 Nama: ${extractChildName(record?.nama || '')}`,
                                `📍 Lokasi: ${displayLocation}`,
                                '',
                                'Pilih data yang ingin diubah:',
                                ...fields,
                                '',
                                '_Ketik angka pilihanmu._'
                            ].join('\n');
                        } else if (fieldKey === 'lokasi') {
                            // PATCH 3: SPECIAL HANDLER FOR LOKASI - Redirect ke EDIT_PICK_LOCATION
                            session.selectedFieldKey = fieldKey;
                            editSessionMap.set(senderPhone, session);
                            userFlowByPhone.set(senderPhone, 'EDIT_PICK_LOCATION');

                            // Show location menu based on type
                            if (isPasarjaya) {
                                replyText = [
                                    '📍 *EDIT LOKASI PENGAMBILAN*',
                                    '',
                                    '*1.* Jakgrosir Kedoya',
                                    '*2.* Gerai Rusun Pesakih',
                                    '*3.* Mini DC Kec. Cengkareng',
                                    '*4.* Jakmart Bambu Larangan',
                                    '*5.* Lokasi Lain...',
                                    '',
                                    'Ketik angka lokasi baru:',
                                    '_(Ketik 0 untuk batal)_'
                                ].join('\n');
                            } else {
                                const dharmajayaMenu = await buildDharmajayaMenuWithStatus();
                                replyText = [
                                    '📍 *EDIT LOKASI PENGAMBILAN*',
                                    '',
                                    dharmajayaMenu,
                                    '',
                                    'Ketik angka lokasi baru:'
                                ].join('\n');
                            }
                        } else if (fieldKey) {
                            // VALID FIELD SELECTED (non-lokasi)
                            session.selectedFieldKey = fieldKey;

                            const fieldLabel = {
                                'nama': 'Nama',
                                'no_kjp': 'Nomor Kartu',
                                'no_ktp': 'Nomor KTP',
                                'no_kk': 'Nomor KK',
                                'tanggal_lahir': 'Tanggal Lahir'
                            }[session.selectedFieldKey!] || session.selectedFieldKey!;
                            const fieldInputPrompt = {
                                'nama': 'Ketik *Nama baru*.',
                                'no_kjp': 'Ketik *Nomor Kartu baru* (16-18 angka).',
                                'no_ktp': 'Ketik *Nomor KTP baru* (16 angka).',
                                'no_kk': 'Ketik *Nomor KK baru* (16 angka).',
                                'tanggal_lahir': 'Ketik *Tanggal Lahir baru* (DD-MM-YYYY).'
                            }[session.selectedFieldKey!] || `Ketik *${fieldLabel} baru*.`;

                            // UPDATE SESSION
                            editSessionMap.set(senderPhone, session);
                            userFlowByPhone.set(senderPhone, 'EDIT_INPUT_VALUE');

                            replyText = [
                                `📝 *EDIT ${(fieldLabel || 'DATA').toUpperCase()}*`,
                                '',
                                fieldInputPrompt,
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        }
                    }

                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                // PATCH 2: INPUT VALUE & CONFIRMATION
                else if (currentUserFlow === 'EDIT_INPUT_VALUE') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL') {
                        replyText = '✅ Edit dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        // VALIDASI INPUT NILAI BARU
                        const rawVal = rawTrim;
                        let cleanVal = rawVal;
                        let isValid = true;
                        let errorMsg = '';

                        // Clean Value based on field type
                        if (session.selectedFieldKey === 'nama') {
                            // Validasi Nama: Minimal 3 huruf
                            cleanVal = rawVal.replace(/^\d+[\.\)\s]+\s*/, '') // Hapus nomor urut di depan
                                .replace(/[0-9]/g, '') // Hapus angka saja, sisakan karakter lain termasuk kurung
                                .trim().toUpperCase();
                            if (cleanVal.length < 3) {
                                isValid = false;
                                errorMsg = '⚠️ Nama terlalu pendek. Minimal 3 huruf.';
                            }
                        } else if (['no_kjp', 'no_ktp', 'no_kk'].includes(session.selectedFieldKey!)) {
                            // Validasi Angka
                            cleanVal = rawVal.replace(/\D/g, ''); // Ambil angka saja
                            const len = cleanVal.length;

                            if (session.selectedFieldKey === 'no_kjp') {
                                if (len < 16 || len > 18) {
                                    isValid = false;
                                    errorMsg = '⚠️ Nomor Kartu harus 16-18 angka.';
                                } else if (!cleanVal.startsWith('504948')) {
                                    isValid = false;
                                    errorMsg = '⚠️ Nomor Kartu harus diawali 504948.';
                                }
                            } else {
                                // KTP / KK
                                if (len !== 16) {
                                    isValid = false;
                                    errorMsg = `⚠️ Nomor ${session.selectedFieldKey === 'no_ktp' ? 'KTP' : 'KK'} harus 16 angka.`;
                                }
                            }
                        } else if (session.selectedFieldKey === 'tanggal_lahir') {
                            // Validasi Tanggal
                            const iso = parseFlexibleDate(rawVal); // returns YYYY-MM-DD or null
                            if (!iso) {
                                isValid = false;
                                errorMsg = '⚠️ Format tanggal salah. Gunakan DD-MM-YYYY (Contoh: 15-05-2005).';
                            } else {
                                cleanVal = iso; // Simpan format ISO untuk display/db (tapi user input DMY)
                            }
                        }

                        // DUPLICATE NAME CHECK (EDIT FLOW)
                        if (isValid && session.selectedFieldKey === 'nama') {
                            const newCanonical = normalizeNameForDedup(cleanVal);
                            if (newCanonical) {
                                // Check against other records from same sender today (exclude the record being edited)
                                const otherRecords = session.recordsToday.filter(
                                    (r: any) => r.id !== session.selectedRecordId
                                );
                                const duplicateRecord = otherRecords.find((r: any) => {
                                    const existingCanonical = normalizeNameForDedup(r.nama || '');
                                    return existingCanonical === newCanonical;
                                });

                                if (duplicateRecord) {
                                    const dupIndex = session.recordsToday.findIndex(
                                        (r: any) => r.id === duplicateRecord.id
                                    ) + 1;
                                    isValid = false;
                                    errorMsg = `⚠️ Nama *${cleanVal}* sudah digunakan di data no. ${dupIndex} Anda hari ini.\n\nTidak bisa menggunakan nama yang sama dalam satu hari.`;
                                }
                            }
                        }

                        if (!isValid) {
                            replyText = `${errorMsg}\n\nSilakan ketik ulang atau 0 untuk batal.`;
                        } else {
                            // VALIDASI LOLOS -> KONFIRMASI
                            session.newValue = cleanVal;
                            editSessionMap.set(senderPhone, session);
                            userFlowByPhone.set(senderPhone, 'EDIT_CONFIRMATION');

                            const fieldLabel = {
                                'nama': 'Nama',
                                'no_kjp': 'Nomor Kartu',
                                'no_ktp': 'Nomor KTP',
                                'no_kk': 'Nomor KK',
                                'tanggal_lahir': 'Tanggal Lahir'
                            }[session.selectedFieldKey!];

                            // Ambil nilai lama untuk display
                            const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                            let oldValue = record ? record[session.selectedFieldKey!] : '(Tidak diketahui)';

                            // Format Tanggal Display
                            if (session.selectedFieldKey === 'tanggal_lahir' && oldValue && oldValue !== '(Tidak diketahui)') {
                                oldValue = oldValue.split('-').reverse().join('-');
                            }
                            let newValueDisplay = session.newValue!;
                            if (session.selectedFieldKey === 'tanggal_lahir') {
                                newValueDisplay = newValueDisplay.split('-').reverse().join('-');
                            }

                            replyText = [
                                '📝 *KONFIRMASI PERUBAHAN*',
                                '',
                                `Field: *${fieldLabel}*`,
                                '',
                                `🔻 *Data Lama:*`,
                                `${oldValue}`,
                                '',
                                `🔺 *Data Baru:*`,
                                `${newValueDisplay}`,
                                '',
                                'Apakah Anda yakin ingin menyimpan perubahan ini?',
                                '',
                                'Ketik *1* atau *OK* untuk SIMPAN',
                                'Ketik *0* atau *BATAL* untuk membatalkan'
                            ].join('\n');
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'EDIT_CONFIRMATION') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL' || normalized === 'TIDAK') {
                        replyText = '✅ Perubahan dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else if (normalized === '1' || normalized === 'OK' || normalized === 'YA' || normalized === 'SIAP') {
                        if (session.selectedFieldKey === 'lokasi') {
                            const targetLocation = (session.newValue || '').toString().trim();
                            const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                            const currentLocation = (record?.lokasi || '').toString().trim();
                            const normalizedTarget = targetLocation.replace(/\s+/g, ' ');
                            const normalizedCurrent = currentLocation.replace(/\s+/g, ' ');

                            if (normalizedTarget && normalizedTarget !== normalizedCurrent) {
                                const limitTarget = getLocationQuotaLimit(normalizedTarget);
                                if (limitTarget !== null) {
                                    const usedTarget = await getTotalDataTodayForSenderByLocation(
                                        senderPhone,
                                        processingDayKey,
                                        normalizedTarget
                                    );

                                    if (usedTarget < 0) {
                                        replyText = '⚠️ Sistem kuota sedang bermasalah. Silakan coba lagi beberapa saat.';
                                        await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    if (usedTarget >= limitTarget) {
                                        const locationLabel = normalizedTarget.replace(/^DHARMAJAYA\s*-\s*/i, '').trim() || normalizedTarget;
                                        replyText = [
                                            `⛔ Limit Kirim Data ${locationLabel} sudah penuh.`,
                                            `Limit: *${limitTarget}*`,
                                            `Sudah terpakai: *${usedTarget} data*`,
                                            '',
                                            'Ketik *0* untuk batal, lalu EDIT lagi dengan lokasi lain.'
                                        ].join('\n');
                                        await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }
                                }
                            }
                        }

                        // EKSEKUSI SIMPAN KE DB
                        const { success, error } = await updateDailyDataField(
                            session.selectedRecordId!,
                            session.selectedFieldKey!,
                            session.newValue!,
                            {
                                senderPhone,
                                processingDayKey,
                            }
                        );

                        // Ambil fieldLabel untuk reply (PATCH 3: Tambah lokasi)
                        const fieldLabel = {
                            'nama': 'Nama',
                            'no_kjp': 'Nomor Kartu',
                            'no_ktp': 'Nomor KTP',
                            'no_kk': 'Nomor KK',
                            'tanggal_lahir': 'Tanggal Lahir',
                            'lokasi': 'Lokasi'
                        }[session.selectedFieldKey!] || session.selectedFieldKey!;

                        // Ambil oldValue dari session records untuk reply
                        const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                        let oldValue = record ? record[session.selectedFieldKey!] : '(Tidak diketahui)';
                        if (session.selectedFieldKey === 'tanggal_lahir' && oldValue && oldValue !== '(Tidak diketahui)') {
                            oldValue = oldValue.split('-').reverse().join('-');
                        }

                        // Ambil newValueDisplay dari session untuk reply
                        let newValueDisplay = session.newValue!;
                        if (session.selectedFieldKey === 'tanggal_lahir') {
                            newValueDisplay = newValueDisplay.split('-').reverse().join('-');
                        }

                        if (success) {
                            replyText = [
                                '✨ *DATA BERHASIL DISIMPAN!* ✨',
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                `📂 Field: *${(fieldLabel || '').toUpperCase()}*`,
                                `🔻 Lama: ${oldValue}`,
                                `✅ Baru: *${newValueDisplay}*`,
                                '',
                                '👇 *MENU LAINNYA*',
                                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                                '🔹 Ketik *CEK*   → 🧐 Lihat Data',
                                '🔹 Ketik *EDIT*  → Ganti Data Salah',
                                '🔹 Ketik *HAPUS* → 🗑️ Hapus Data',
                                '🔹 Ketik *MENU*  → 🏠 Menu Utama'
                            ].join('\n');
                        } else {
                            console.error('Gagal update data:', error);
                            const errorCode = typeof error === 'object' && error !== null && 'code' in error
                                ? String((error as { code?: unknown }).code || '')
                                : '';
                            const errorMessage = typeof error === 'object' && error !== null && 'message' in error
                                ? String((error as { message?: unknown }).message || '')
                                : '';

                            if (
                                errorCode === 'LOCATION_QUOTA_EXCEEDED' ||
                                errorCode === 'LOCATION_QUOTA_CHECK_FAILED' ||
                                errorCode === 'UPDATE_CONFLICT' ||
                                errorCode === 'PROCESSING_DAY_MISMATCH' ||
                                errorCode === 'EDIT_OWNER_MISMATCH' ||
                                errorCode === 'LOCATION_QUOTA_CONTEXT_MISSING'
                            ) {
                                replyText = errorMessage || '❌ Gagal menyimpan perubahan. Silakan cek ulang lalu coba lagi.';
                            } else {
                                replyText = '❌ Gagal menyimpan perubahan. Silakan coba lagi nanti.';
                            }
                        }

                        // Bersihkan sesi
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        replyText = '⚠️ Ketik *1* untuk SIMPAN atau *0* untuk BATAL.';
                    }

                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                // --- END PATCH 2 ---

                // --- PATCH 3: EDIT LOKASI HANDLERS ---
                else if (currentUserFlow === 'EDIT_PICK_LOCATION') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL') {
                        replyText = '✅ Edit lokasi dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else {
                        const isPasarjaya = session.selectedType === 'PASARJAYA';

                        // Check for manual input option (Pasarjaya only)
                        if (normalized === '5' && isPasarjaya) {
                            userFlowByPhone.set(senderPhone, 'EDIT_INPUT_MANUAL_LOCATION');
                            replyText = [
                                '📝 *INPUT LOKASI MANUAL*',
                                '',
                                'Silakan ketik nama lokasinya saja.',
                                '(Contoh: *Pasar Rumput*)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else {
                            // Check mapping
                            const mapping = isPasarjaya ? PASARJAYA_MAPPING : DHARMAJAYA_MAPPING;
                            if (mapping[normalized]) {
                                const lokasiName = mapping[normalized];

                                if (!isPasarjaya) {
                                    const locationStatus = await isSpecificLocationClosed('DHARMAJAYA', lokasiName);
                                    if (locationStatus.closed) {
                                        const statusReason = locationStatus.reason ? `\nAlasan: ${locationStatus.reason}` : '';
                                        const dharmajayaMenu = await buildDharmajayaMenuWithStatus();
                                        replyText = [
                                            `⛔ Lokasi *${lokasiName}* sedang tidak tersedia.${statusReason}`,
                                            '',
                                            'Silakan pilih lokasi DHARMAJAYA lain:',
                                            '',
                                            dharmajayaMenu,
                                        ].join('\n');
                                        if (replyText) {
                                            await sock.sendMessage(remoteJid, { text: replyText });
                                            continue;
                                        }
                                    }
                                }

                                const prefix = isPasarjaya ? 'PASARJAYA' : 'DHARMAJAYA';
                                session.newValue = `${prefix} - ${lokasiName}`;
                                session.selectedFieldKey = 'lokasi';
                                editSessionMap.set(senderPhone, session);

                                // Get old location for confirmation display
                                const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                                const oldValue = record?.lokasi || '(Tidak diketahui)';

                                // Go to confirmation
                                userFlowByPhone.set(senderPhone, 'EDIT_CONFIRMATION');
                                replyText = [
                                    '📝 *KONFIRMASI PERUBAHAN*',
                                    '',
                                    'Field: *Lokasi*',
                                    '',
                                    '🔻 *Data Lama:*',
                                    `${oldValue}`,
                                    '',
                                    '🔺 *Data Baru:*',
                                    `${session.newValue}`,
                                    '',
                                    'Apakah Anda yakin ingin menyimpan perubahan ini?',
                                    '',
                                    'Ketik *1* atau *OK* untuk SIMPAN',
                                    'Ketik *0* atau *BATAL* untuk membatalkan'
                                ].join('\n');
                            } else {
                                // Invalid choice
                                const maxChoice = isPasarjaya ? '5' : '4';
                                replyText = `⚠️ Pilihan salah. Ketik 1-${maxChoice}, atau 0 batal.`;
                            }
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'EDIT_INPUT_MANUAL_LOCATION') {
                    const session = editSessionMap.get(senderPhone);
                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '0' || normalized === 'BATAL') {
                        replyText = '✅ Edit lokasi dibatalkan.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        editSessionMap.delete(senderPhone);
                    } else if (rawTrim.length < 3) {
                        replyText = '⚠️ Nama lokasi terlalu pendek. Minimal 3 karakter.\n\n_Ketik ulang atau 0 untuk batal._';
                    } else {
                        // Resolve lokasi dari database referensi
                        let matches: any[] = [];
                        let MAX_CANDIDATES = 10;
                        try {
                            const resolver = await import('./services/locationResolver');
                            MAX_CANDIDATES = resolver.MAX_CANDIDATES;
                            matches = resolver.resolveLocation(rawTrim);
                        } catch (resolverErr) {
                            console.error('[locationResolver] Gagal load/resolve (EDIT):', resolverErr);
                            replyText = '⚠️ Terjadi kesalahan saat mencari lokasi. Silakan coba lagi atau ketik 0 untuk batal.';
                            if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                            continue;
                        }

                        if (matches.length === 0) {
                            replyText = '❌ Lokasi "' + rawTrim + '" tidak ditemukan di database Pasarjaya.\n\nSilakan ketik ulang nama lokasi yang lebih spesifik, atau ketik 0 untuk batal.';
                            // State tetap EDIT_INPUT_MANUAL_LOCATION
                        } else if (matches.length === 1) {
                            // Single match — langsung pakai nama resmi
                            session.newValue = `PASARJAYA - ${matches[0].nama}`;
                            session.selectedFieldKey = 'lokasi';
                            editSessionMap.set(senderPhone, session);

                            // Get old location for confirmation display
                            const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                            const oldValue = record?.lokasi || '(Tidak diketahui)';

                            userFlowByPhone.set(senderPhone, 'EDIT_CONFIRMATION');
                            replyText = [
                                '📝 *KONFIRMASI PERUBAHAN*',
                                '',
                                'Field: *Lokasi*',
                                '',
                                '🔻 *Data Lama:*',
                                `${oldValue}`,
                                '',
                                '🔺 *Data Baru:*',
                                `${session.newValue}`,
                                '',
                                'Apakah Anda yakin ingin menyimpan perubahan ini?',
                                '',
                                'Ketik *1* atau *OK* untuk SIMPAN',
                                'Ketik *0* atau *BATAL* untuk membatalkan'
                            ].join('\n');
                        } else if (matches.length > MAX_CANDIDATES) {
                            replyText = '⚠️ Ditemukan ' + matches.length + ' lokasi yang cocok. Coba ketik nama lokasi yang lebih spesifik.\n\nKetik 0 untuk batal.';
                            // State tetap EDIT_INPUT_MANUAL_LOCATION
                        } else {
                            // 2-10 matches — disambiguation
                            pendingLocationCandidates.set(senderPhone, matches);
                            userFlowByPhone.set(senderPhone, 'EDIT_INPUT_MANUAL_LOCATION_CONFIRM');

                            const listItems = matches.map((m, i) => `${i + 1}. [${m.wilayahNama}] ${m.nama}`).join('\n');
                            replyText = [
                                '📍 Ditemukan ' + matches.length + ' lokasi yang cocok:',
                                '',
                                listItems,
                                '',
                                'Balas dengan angka pilihanmu (1-' + matches.length + '), atau ketik 0 untuk batal.'
                            ].join('\n');
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'EDIT_INPUT_MANUAL_LOCATION_CONFIRM') {
                    const session = editSessionMap.get(senderPhone);
                    const candidates = pendingLocationCandidates.get(senderPhone);

                    if (!session) {
                        replyText = '❌ Sesi edit kedaluwarsa. Ulangi ketik EDIT.';
                        userFlowByPhone.set(senderPhone, 'NONE');
                        pendingLocationCandidates.delete(senderPhone);
                    } else if (!candidates || candidates.length === 0) {
                        replyText = '❌ Sesi kedaluwarsa. Silakan ketik ulang nama lokasi.';
                        userFlowByPhone.set(senderPhone, 'EDIT_INPUT_MANUAL_LOCATION');
                        pendingLocationCandidates.delete(senderPhone);
                    } else {
                        const choice = parseInt(normalized, 10);
                        if (choice === 0) {
                            pendingLocationCandidates.delete(senderPhone);
                            userFlowByPhone.set(senderPhone, 'EDIT_PICK_FIELD');
                            replyText = '❌ Dibatalkan. Silakan pilih field yang ingin diedit.';
                        } else if (isNaN(choice) || choice < 1 || choice > candidates.length) {
                            replyText = '❌ Pilihan tidak valid. Balas angka 1-' + candidates.length + ' atau ketik 0 untuk batal.';
                        } else {
                            const selected = candidates[choice - 1];
                            pendingLocationCandidates.delete(senderPhone);

                            session.newValue = `PASARJAYA - ${selected.nama}`;
                            session.selectedFieldKey = 'lokasi';
                            editSessionMap.set(senderPhone, session);

                            const record = session.recordsToday.find(r => r.id === session.selectedRecordId);
                            const oldValue = record?.lokasi || '(Tidak diketahui)';

                            userFlowByPhone.set(senderPhone, 'EDIT_CONFIRMATION');
                            replyText = [
                                '📝 *KONFIRMASI PERUBAHAN*',
                                '',
                                'Field: *Lokasi*',
                                '',
                                '🔻 *Data Lama:*',
                                `${oldValue}`,
                                '',
                                '🔺 *Data Baru:*',
                                `${session.newValue}`,
                                '',
                                'Apakah Anda yakin ingin menyimpan perubahan ini?',
                                '',
                                'Ketik *1* atau *OK* untuk SIMPAN',
                                'Ketik *0* atau *BATAL* untuk membatalkan'
                            ].join('\n');
                        }
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                // --- END PATCH 3 ---

                const pendingUnknownRegionSession = pendingUnknownRegionConfirmationByPhone.get(senderPhone);
                if (currentUserFlow === 'UNKNOWN_REGION_CONFIRMATION' || pendingUnknownRegionSession) {
                    if (!pendingUnknownRegionSession) {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        await sock.sendMessage(remoteJid, {
                            text: '⚠️ Sesi konfirmasi kode wilayah sudah berakhir. Silakan kirim ulang data.',
                        });
                        continue;
                    }

                    if (normalized === 'YA' || normalized === 'LANJUT' || normalized === 'BATAL' || normalized === '0') {
                        const isCancelUnknownRegion = normalized === 'BATAL' || normalized === '0';
                        const logJsonToSave = isCancelUnknownRegion
                            ? removeUnknownRegionOkItems(pendingUnknownRegionSession.logJson)
                            : pendingUnknownRegionSession.logJson;

                        if (logJsonToSave.stats.ok_count <= 0) {
                            clearUnknownRegionConfirmationSession(senderPhone);
                            await sock.sendMessage(remoteJid, { text: UNKNOWN_REGION_CONFIRMATION_CANCEL_MESSAGE });
                            continue;
                        }

                        const quotaCheck = await checkLocationQuotaBeforeSave(logJsonToSave, senderPhone);
                        if (!quotaCheck.allowed) {
                            clearUnknownRegionConfirmationSession(senderPhone);
                            await sock.sendMessage(remoteJid, {
                                text: quotaCheck.message || '⛔ Batas lokasi tercapai.',
                            });
                            continue;
                        }

                        clearUnknownRegionConfirmationSession(senderPhone);
                        const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                            sockInstance: sock,
                            remoteJid,
                            senderPhone,
                            logJson: logJsonToSave,
                            originalText: pendingUnknownRegionSession.originalText,
                            locationContext: pendingUnknownRegionSession.locationContext,
                            processingDayKey: pendingUnknownRegionSession.processingDayKey,
                        });
                        if (hasPendingUnderage) {
                            continue;
                        }

                        const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                            logJsonToSave,
                            msg.key.id || `${senderPhone}-${Date.now()}`
                        );
                        if (!globalQuotaCheck.allowed) {
                            clearUnknownRegionConfirmationSession(senderPhone);
                            await sock.sendMessage(remoteJid, {
                                text: globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.',
                            });
                            continue;
                        }

                        const saveResult = await saveLogAndOkItems(logJsonToSave, pendingUnknownRegionSession.originalText);
                        if (!saveResult.success) {
                            await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                            console.error('❌ Gagal simpan ke database (UNKNOWN REGION CONFIRM):', saveResult.dataError);
                            const errorMsg = buildDatabaseErrorMessage(saveResult.dataError, logJsonToSave);
                            await sock.sendMessage(remoteJid, { text: errorMsg });
                            continue;
                        }

                        const todayRecap = await getTodayRecapForSender(
                            senderPhone,
                            pendingUnknownRegionSession.processingDayKey,
                            'received_at'
                        );
                        const replyDataText = buildReplyForNewData(
                            logJsonToSave,
                            todayRecap.validCount,
                            pendingUnknownRegionSession.locationContext,
                            todayRecap.validItems
                        );
                        const finalReplyText = isCancelUnknownRegion
                            ? `✅ Data kode wilayah KTP tidak dikenal dibatalkan.\n\n${replyDataText}`
                            : replyDataText;

                        await sock.sendMessage(remoteJid, { text: finalReplyText });
                        continue;
                    }

                    await sock.sendMessage(remoteJid, { text: UNKNOWN_REGION_CONFIRMATION_REMINDER });
                    continue;
                }

                const pendingUnderageSession = pendingUnderageConfirmationByPhone.get(senderPhone);
                if (currentUserFlow === 'UNDERAGE_CONFIRMATION' || pendingUnderageSession) {
                    if (!pendingUnderageSession) {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        await sock.sendMessage(remoteJid, {
                            text: '⚠️ Sesi konfirmasi usia sudah berakhir. Silakan kirim ulang data.',
                        });
                        continue;
                    }

                    if (normalized === 'LANJUT' || normalized === 'BATAL' || normalized === '0') {
                        const isCancelUnderage = normalized === 'BATAL' || normalized === '0';
                        const logJsonToSave = isCancelUnderage
                            ? removeUnderageOkItems(pendingUnderageSession.logJson)
                            : pendingUnderageSession.logJson;

                        if (logJsonToSave.stats.ok_count <= 0) {
                            clearUnderageConfirmationSession(senderPhone);
                            await sock.sendMessage(remoteJid, { text: UNDERAGE_CONFIRMATION_CANCEL_MESSAGE });
                            continue;
                        }

                        const quotaCheck = await checkLocationQuotaBeforeSave(logJsonToSave, senderPhone);
                        if (!quotaCheck.allowed) {
                            clearUnderageConfirmationSession(senderPhone);
                            await sock.sendMessage(remoteJid, {
                                text: quotaCheck.message || '⛔ Batas lokasi tercapai.',
                            });
                            continue;
                        }

                        const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                            logJsonToSave,
                            msg.key.id || `${senderPhone}-${Date.now()}`
                        );
                        if (!globalQuotaCheck.allowed) {
                            clearUnderageConfirmationSession(senderPhone);
                            await sock.sendMessage(remoteJid, {
                                text: globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.',
                            });
                            continue;
                        }

                        const saveResult = await saveLogAndOkItems(logJsonToSave, pendingUnderageSession.originalText);
                        if (!saveResult.success) {
                            await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                            console.error('❌ Gagal simpan ke database (UNDERAGE CONFIRM):', saveResult.dataError);
                            const errorMsg = buildDatabaseErrorMessage(saveResult.dataError, logJsonToSave);
                            await sock.sendMessage(remoteJid, { text: errorMsg });
                            clearUnderageConfirmationSession(senderPhone);
                            continue;
                        }

                        const todayRecap = await getTodayRecapForSender(
                            senderPhone,
                            pendingUnderageSession.processingDayKey,
                            'received_at'
                        );
                        const replyDataText = buildReplyForNewData(
                            logJsonToSave,
                            todayRecap.validCount,
                            pendingUnderageSession.locationContext,
                            todayRecap.validItems
                        );
                        const finalReplyText = isCancelUnderage
                            ? `✅ Data usia di bawah 17 tahun dibatalkan.\n\n${replyDataText}`
                            : replyDataText;

                        await sock.sendMessage(remoteJid, { text: finalReplyText });
                        clearUnderageConfirmationSession(senderPhone);
                        continue;
                    }

                    await sock.sendMessage(remoteJid, { text: UNDERAGE_CONFIRMATION_REMINDER });
                    continue;
                }

                // ===== STRICT LOGIC PENDAFTARAN =====

                // 1. Apakah ini terlihat seperti data pendaftaran (minimal 4 baris)?
                const dataLines = parseRawMessageToLines(messageText);

                // DEBUG: Trace Incoming Message & State
                const currentSpecificLoc = userSpecificLocationChoice.get(senderPhone);
                console.log(`[DEBUG] MSG from ${senderPhone} | Flow: ${currentUserFlow} | LocChoice: ${currentLocation} | SpecificLoc: ${currentSpecificLoc} | MsgShort: ${messageText.slice(0, 20).replace(/\n/g, ' ')}...`);

                // Basic check: Minimal 4 baris
                const potentialData = dataLines.length >= 4;
                const isTemplateCommand = rawTrim.toUpperCase().startsWith('#TEMPLATE');
                const activeAdminFlow = adminFlowByPhone.get(senderPhone) ?? 'NONE';

                // Skip validation block jika user sedang dalam flow yang butuh memilih sub-lokasi
                // Biar handler flow yang proses data-nya
                const skipDataValidation = (currentUserFlow as string) === 'SELECT_PASARJAYA_SUB' || (currentUserFlow as string) === 'SELECT_DHARMAJAYA_SUB' || (currentUserFlow as string) === 'INPUT_MANUAL_LOCATION' || (currentUserFlow as string) === 'INPUT_MANUAL_LOCATION_CONFIRM' || (currentUserFlow as string) === 'EDIT_INPUT_MANUAL_LOCATION_CONFIRM';

                if (potentialData && !skipDataValidation && !isTemplateCommand && activeAdminFlow === 'NONE') {
                    const existingLocation = userLocationChoice.get(senderPhone);


                    // --- ATURAN 1: WAJIB PILIH LOKASI DULU ---
                    // EXCEPTION: Jika user sedang dalam flow SELECT_PASARJAYA_SUB atau INPUT_MANUAL_LOCATION,
                    // biarkan handler flow yang proses (jangan intercept di sini)
                    if (!existingLocation && currentUserFlow !== 'SELECT_PASARJAYA_SUB' && currentUserFlow !== 'SELECT_DHARMAJAYA_SUB' && currentUserFlow !== 'INPUT_MANUAL_LOCATION') {
                        // SIMPAN DATA SEMENTARA
                        pendingRegistrationData.set(senderPhone, messageText);

                        const locationPromptText = await buildSelectLocationFirstPromptText();

                        // Minta pilih lokasi (Format Lama) tapi nanti 1 akan trigger menu baru
                        await sock.sendMessage(remoteJid, {
                            text: locationPromptText
                        });
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        return; // Selesai
                    }

                    // --- ATURAN 2: VALIDASI FORMAT BERDASARKAN LOKASI ---
                    let isValidFormat = false;
                    let detectedFormat = existingLocation; // 'PASARJAYA' or 'DHARMAJAYA'
                    let rejectionReason = '';

                    // const looksLikeDatePatternCheck = ... (REMOVED: logic moved to looksLikeDate())

                    if (existingLocation === 'PASARJAYA') {
                        // WAJIB 5 BARIS per orang
                        // 1. Cek kelipatan 5
                        if (dataLines.length % 5 !== 0) {
                            isValidFormat = false;
                            // Cek apakah mungkin dia kirim 4 baris (kasus salah format umum)
                            if (dataLines.length % 4 === 0) {
                                rejectionReason = [
                                    '❌ *FORMAT TIDAK COCOK*',
                                    '',
                                    'Anda sedang di mode: *PASARJAYA (Wajib 5 Baris)*',
                                    'Tapi data yang dikirim formatnya *4 Baris*.',
                                    '',
                                    '💡 *SOLUSI:*',
                                    '1. Jika ingin ganti lokasi, ketik *0* (Batal), lalu pilih lokasi ulang.',
                                    '2. Jika tetap di *Pasarjaya*, lengkapi baris ke-5 dengan *Tanggal Lahir*.'
                                ].join('\n');
                            } else {
                                rejectionReason = [
                                    '❌ *JUMLAH BARIS SALAH*',
                                    'Untuk *Pasarjaya*, format harus 5 baris per orang:',
                                    '1. Nama',
                                    '2. Kartu',
                                    '3. KTP',
                                    '4. KK',
                                    '5. Tanggal Lahir',
                                    '',
                                    'Silakan periksa kembali ketikan Anda.'
                                ].join('\n');
                            }
                        } else {
                            // Cek apakah baris ke-5 adalah tanggal?
                            let allDatesValid = true;
                            for (let i = 4; i < dataLines.length; i += 5) {
                                // Use shared robust date checker
                                if (!looksLikeDate(dataLines[i])) {
                                    allDatesValid = false;
                                    console.log(`[DEBUG] Date validation failed for: ${dataLines[i]}`);
                                    break;
                                }
                            }
                            if (!allDatesValid) {
                                isValidFormat = false;
                                rejectionReason = '❌ *Format Tanggal Salah*\nBaris ke-5 harus berupa Tanggal Lahir (Contoh: 23-04-2020).';
                            } else {
                                isValidFormat = true;
                            }
                        }
                    } else if (existingLocation === 'DHARMAJAYA' || existingLocation === 'FOOD_STATION') {
                        // WAJIB 4 BARIS per orang
                        const locationLabel = existingLocation === 'FOOD_STATION' ? 'FOOD STATION' : 'DHARMAJAYA';
                        if (dataLines.length % 4 !== 0) {
                            isValidFormat = false;
                            if (dataLines.length % 5 === 0) {
                                rejectionReason = [
                                    '❌ *FORMAT TIDAK COCOK*',
                                    '',
                                    `Anda sedang di mode: *${locationLabel} (Wajib 4 Baris)*`,
                                    'Tapi data yang dikirim formatnya *5 Baris* (ada Tanggal Lahir?).',
                                    '',
                                    '💡 *SOLUSI:*',
                                    '1. Jika ingin ganti lokasi, ketik *0* (Batal), lalu pilih lokasi ulang.',
                                    `2. Jika tetap di *${locationLabel}*, hapus baris tanggal lahirnya.`
                                ].join('\n');
                            } else {
                                rejectionReason = [
                                    '❌ *JUMLAH BARIS SALAH*',
                                    `Untuk *${locationLabel}*, format harus 4 baris per orang:`,
                                    '1. Nama',
                                    '2. Kartu',
                                    '3. KTP',
                                    '4. KK',
                                    '',
                                    'Silakan periksa kembali ketikan Anda.'
                                ].join('\n');
                            }
                        } else {
                            isValidFormat = true;
                        }
                    }

                    if (isValidFormat) {
                        // PROSES SAVE DATA

                        // Reset flow state agar tidak mengganggu
                        userFlowByPhone.set(senderPhone, 'NONE');

                        // Ambil lokasi spesifik dari session (jika ada)
                        const storedSpecificLocation = userSpecificLocationChoice.get(senderPhone);

                        const logJson = await processRawMessageToLogJson({
                            text: messageText,
                            senderPhone,
                            messageId: msg.key.id,
                            receivedAt,
                            tanggal: tanggalWib,
                            processingDayKey,
                            locationContext: existingLocation, // MUST MATCH existingLocation
                            specificLocation: storedSpecificLocation // Pass stored specific location
                        });

                        // INJECT SENDER NAME
                        logJson.sender_name = existingName || undefined;

                        if (logJson.stats.total_blocks > 0 || (logJson.failed_remainder_lines && logJson.failed_remainder_lines.length > 0)) {
                            const quotaCheck = await checkLocationQuotaBeforeSave(logJson, senderPhone);
                            if (!quotaCheck.allowed) {
                                await sock.sendMessage(remoteJid, { text: quotaCheck.message || '⛔ Batas lokasi tercapai.' });
                                continue;
                            }

                            const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                sockInstance: sock,
                                remoteJid,
                                senderPhone,
                                logJson,
                                originalText: messageText,
                                locationContext: existingLocation || 'DHARMAJAYA',
                                processingDayKey,
                            });
                            if (hasPendingUnknownRegion) {
                                continue;
                            }

                            const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                sockInstance: sock,
                                remoteJid,
                                senderPhone,
                                logJson,
                                originalText: messageText,
                                locationContext: existingLocation || 'DHARMAJAYA',
                                processingDayKey,
                            });
                            if (hasPendingUnderage) {
                                continue;
                            }

                            const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                logJson,
                                msg.key.id || `${senderPhone}-${Date.now()}`
                            );
                            if (!globalQuotaCheck.allowed) {
                                await sock.sendMessage(remoteJid, {
                                    text: globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.',
                                });
                                continue;
                            }

                            const saveResult = await saveLogAndOkItems(logJson, messageText);

                            if (!saveResult.success) {
                                await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                console.error('❌ Gagal simpan ke database:', saveResult.dataError);
                                const errorMsg = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                await sock.sendMessage(remoteJid, { text: errorMsg });
                            } else {
                                // Hitung total data hari ini SETELAH data disimpan
                                // Sort by received_at (urutan masuk) untuk balasan data baru
                                const todayRecap = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                const replyDataText = buildReplyForNewData(logJson, todayRecap.validCount, existingLocation, todayRecap.validItems);
                                await sock.sendMessage(remoteJid, { text: replyDataText });
                                console.log(`📤 Data pendaftaran (${existingLocation}) berhasil diproses untuk ${senderPhone}`);
                            }
                        } else {
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *Gagal Membaca Data*\nPastikan format penulisan sudah benar sesuai contoh.`
                            });
                        }
                        continue;
                    } else {
                        // REJECT DENGAN PESAN ERROR SPESIFIK
                        await sock.sendMessage(remoteJid, {
                            text: rejectionReason || '⚠️ *Format Data Tidak Sesuai Lokasi*'
                        });
                        continue;
                    }
                }

                // Handle Reset Flow jika user ketik Menu/Greeting
                if (currentUserFlow !== 'NONE' && (normalized === '0' || isGreetingOrMenu(normalized))) {
                    if ((currentUserFlow as string) === 'CHECK_STATUS_PICK_ITEMS') {
                        statusCheckSelectionByPhone.delete(senderPhone);
                        statusCheckInProgressByPhone.delete(senderPhone);
                    }
                    clearTransientSessionContext(senderPhone, { clearFlows: true, clearPendingConfirmations: true, clearLocationChoice: true });
                    // Lanjut ke handler menu utama di bawah
                }

                if (currentUserFlow === 'CHECK_DATA_MENU') {
                    if (normalized === '1') {
                        // CEK HARI INI
                        replyText = await renderCheckDataResult(processingDayKey, 'HARI INI');
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '2') {
                        // CEK KEMARIN
                        const yesterday = shiftIsoDate(processingDayKey, -1);
                        replyText = await renderCheckDataResult(yesterday, 'KEMARIN');
                        userFlowByPhone.set(senderPhone, 'NONE');
                    } else if (normalized === '3') {
                        // CEK TANGGAL LAIN
                        userFlowByPhone.set(senderPhone, 'CHECK_DATA_SPECIFIC_DATE');
                        replyText = '📅 Silakan ketik tanggal yang ingin dicek (Format: DD-MM-YYYY):';
                    } else {
                        replyText = '⚠️ Pilih 1, 2, atau 3.';
                    }
                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'CHECK_DATA_SPECIFIC_DATE') {
                    const iso = toIsoFromDMY(rawTrim);
                    if (!iso) {
                        replyText = '⚠️ Format tanggal salah. Gunakan DD-MM-YYYY (Contoh: 14-01-2026).';
                    } else {
                        replyText = await renderCheckDataResult(iso, 'TANGGAL');
                        userFlowByPhone.set(senderPhone, 'NONE');
                    }
                    await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'CHECK_STATUS_PICK_ITEMS') {
                    const selectionSession = statusCheckSelectionByPhone.get(senderPhone);
                    if (!selectionSession) {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        replyText = '⚠️ Sesi cek status sudah kedaluwarsa. Silakan ulangi dari menu.';
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }

                    if (normalized === '0' || normalized === 'BATAL') {
                        statusCheckSelectionByPhone.delete(senderPhone);
                        statusCheckInProgressByPhone.delete(senderPhone);
                        userFlowByPhone.set(senderPhone, 'NONE');
                        replyText = '✅ Cek status pendaftaran dibatalkan.';
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }

                    if (statusCheckInProgressByPhone.get(senderPhone)) {
                        await sock.sendMessage(remoteJid, {
                            text: '⏳ Permintaan cek status sebelumnya masih diproses. Mohon tunggu sampai selesai.'
                        });
                        continue;
                    }

                    const parsedSelection = parseStatusSelectionIndices(rawTrim, selectionSession.items.length);
                    if (parsedSelection.error || parsedSelection.indices.length === 0) {
                        await sock.sendMessage(remoteJid, {
                            text: '⚠️ Format pilihan tidak valid. Balas *1*, *1,2,3*, *CEK SEMUA*, atau *0* untuk batal.'
                        });
                        continue;
                    }

                    const selectedItems = parsedSelection.indices.map((idx) => selectionSession.items[idx - 1]).filter(Boolean);
                    if (selectedItems.length === 0) {
                        await sock.sendMessage(remoteJid, { text: '⚠️ Data yang dipilih tidak ditemukan. Silakan ulangi pilihan.' });
                        continue;
                    }

                    statusCheckInProgressByPhone.set(senderPhone, true);
                    try {
                        const dateDisplayLong = formatLongIndonesianDate(selectionSession.targetDate);
                        await sock.sendMessage(remoteJid, {
                            text: `⏳ Sedang cek status pendaftaran (${selectedItems.length} data) untuk pengambilan ${dateDisplayLong}. Mohon tunggu...`
                        });

                        const results = await checkRegistrationStatuses(selectedItems, selectionSession.targetDate);
                        const summary = buildStatusSummaryMessage(results, selectionSession.targetDate);
                        const failedData = buildFailedDataCopyMessage(results);

                        await sock.sendMessage(remoteJid, { text: summary });
                        if (failedData) {
                            await sock.sendMessage(remoteJid, { text: failedData.header });
                            await sock.sendMessage(remoteJid, { text: failedData.body });
                        }
                    } catch (error) {
                        console.error('status check flow error:', error);
                        await sock.sendMessage(remoteJid, { text: '❌ Gagal cek status pendaftaran. Silakan coba lagi.' });
                    } finally {
                        statusCheckSelectionByPhone.delete(senderPhone);
                        statusCheckInProgressByPhone.delete(senderPhone);
                        userFlowByPhone.set(senderPhone, 'NONE');
                    }
                    continue;
                }
                else if (currentUserFlow === 'CHECK_STATUS_SELECT_PROVIDER') {
                    if (normalized === '0') {
                        userFlowByPhone.delete(senderPhone);
                        replyText = MENU_MESSAGE;
                    } else {
                        const providerMap = await getStatusCheckProviderMapping();
                        const providerKey = providerMap.get(normalized) as 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION' | undefined;

                        if (!providerKey) {
                            replyText = await STATUS_CHECK_PROVIDER_MENU();
                        } else if (!isStatusCheckOpen(providerKey)) {
                            replyText = getStatusCheckClosedMessage(providerKey);
                        } else if (statusCheckInProgressByPhone.get(senderPhone)) {
                            replyText = '⏳ Permintaan cek status sebelumnya masih diproses. Mohon tunggu sampai selesai.';
                        } else {
                            const result = await processProviderStatusCheck(providerKey);
                            if (result.done) continue;
                            replyText = result.text!;
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'DELETE_DATA') {
                    const input = normalized;

                    if (input === '0') {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        replyText = '✅ Penghapusan data dibatalkan.';
                    } else if (input === 'ALL' || input === 'SEMUA') {
                        // Hapus SEMUA
                        const res = await deleteAllDailyDataForSender(senderPhone, processingDayKey);
                        if (res.success) {
                            const namesStr = res.deletedNames && res.deletedNames.length > 0
                                ? `: *${res.deletedNames.map(extractChildName).join(', ')}*`
                                : '';
                            replyText = `✅ Sukses menghapus *${res.deletedCount}* data (SEMUA)${namesStr}.`;
                            userFlowByPhone.set(senderPhone, 'NONE');
                        } else {
                            replyText = '❌ Gagal menghapus data. Silakan coba lagi.';
                        }
                    } else {
                        // Coba parse angka (bisa 1 atau 1,2,3)
                        // Split by comma or space
                        const parts = input.split(/[\s,]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));

                        if (parts.length === 0) {
                            replyText = '⚠️ Input tidak valid. \nKetik nomor urut (contoh: *1* atau *1,2*) atau *ALL* untuk hapus semua. Ketik *0* untuk batal.';
                        } else {
                            const indices = parts.map(Number);
                            const res = await deleteDailyDataByIndices(senderPhone, processingDayKey, indices);
                            if (res.success && res.deletedCount > 0) {
                                const namesStr = res.deletedNames && res.deletedNames.length > 0
                                    ? `: *${res.deletedNames.map(extractChildName).join(', ')}*`
                                    : '';
                                replyText = `✅ Sukses menghapus *${res.deletedCount}* data${namesStr}.`;
                                userFlowByPhone.set(senderPhone, 'NONE');

                                // Cek sisa data
                                const { validCount } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                if (validCount > 0) {
                                    replyText += `\n\nSisa data: ${validCount}`;
                                }
                            } else {
                                replyText = '❌ Gagal menghapus. Pastikan nomor urut benar.';
                            }
                        }
                    }

                    if (replyText) {
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }
                else if (currentUserFlow === 'SELECT_LOCATION') {
                    const providerMap = await getActiveProviderMapping();
                    const selectedProvider = providerMap.get(normalized);
                    const pasarjayaNum = [...providerMap.entries()].find(([, v]) => v === 'PASARJAYA')?.[0];
                    const dharmajayaNum = [...providerMap.entries()].find(([, v]) => v === 'DHARMAJAYA')?.[0];
                    const foodstationNum = [...providerMap.entries()].find(([, v]) => v === 'FOOD_STATION')?.[0];

                    if (normalized === '0') {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        pendingRegistrationData.delete(senderPhone);
                        replyText = '✅ Pendaftaran dibatalkan.';
                    } else if (!selectedProvider) {
                        if (providerMap.size === 0) {
                            replyText = '⛔ Semua lokasi sedang tutup. Silakan coba lagi nanti.';
                        } else {
                            const validNums = [...providerMap.keys()].join(', ');
                            replyText = `⚠️ Pilihan tidak dikenali. Ketik ${validNums} untuk pilih lokasi, atau 0 untuk batal.`;
                        }
                    } else if (selectedProvider === 'PASARJAYA') {
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        let rejectPasarjaya = false;

                        if (pendingData) {
                            const lines = parseRawMessageToLines(pendingData);
                            if (lines.length > 0 && lines.length % 4 === 0 && lines.length % 5 !== 0) {
                                rejectPasarjaya = true;
                                const solusiLines: string[] = [];
                                if (dharmajayaNum) solusiLines.push(`• Jika ingin ke Dharmajaya, ketik *${dharmajayaNum}*.`);
                                if (foodstationNum) solusiLines.push(`• Jika ingin ke Foodstation, ketik *${foodstationNum}*.`);
                                solusiLines.push('• Jika tetap Pasarjaya, kirim ulang data dengan *5 baris* per orang (tambahkan Tanggal Lahir).');

                                replyText = [
                                    '⚠️ *DATA TIDAK COCOK DENGAN LOKASI*',
                                    '',
                                    `Anda memilih: *${normalized}. PASARJAYA*`,
                                    'Pasarjaya butuh *5 baris* per orang:',
                                    'Nama, No Kartu, No KTP, No KK, Tanggal Lahir.',
                                    '',
                                    `Data Anda: *${lines.length} baris* (format 4 baris per orang).`,
                                    '',
                                    '💡 *SOLUSI:*',
                                    ...solusiLines,
                                    '',
                                    '_Ketik 0 untuk batal._'
                                ].join('\n');
                            }
                        }

                        if (!rejectPasarjaya) {
                            replyText = MENU_PASARJAYA_LOCATIONS;
                            userFlowByPhone.set(senderPhone, 'SELECT_PASARJAYA_SUB');
                        }
                    } else if (selectedProvider === 'DHARMAJAYA') {
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        let rejectDharmajaya = false;

                        if (pendingData) {
                            const lines = parseRawMessageToLines(pendingData);
                            if (lines.length > 0 && lines.length % 5 === 0 && lines.length % 4 !== 0) {
                                rejectDharmajaya = true;
                                replyText = [
                                    '⚠️ *DATA TERTOLAK (SALAH FORMAT)*',
                                    '',
                                    `Anda memilih: *${normalized}. DHARMAJAYA*`,
                                    'Syarat: *Wajib 4 Baris* (Nama, Kartu, KTP, KK).',
                                    '',
                                    `Data Anda: *${lines.length} baris* (Terdeteksi format Pasarjaya / ada Tanggal Lahir).`,
                                    '',
                                    '💡 *SOLUSI:*',
                                    pasarjayaNum
                                        ? `• Jika ingin ke Pasarjaya, ketik *${pasarjayaNum}*.`
                                        : '• Pasarjaya sedang tutup.',
                                    '• Jika tetap Dharmajaya, mohon hapus Tanggal Lahir dan kirim ulang.',
                                    '',
                                    '_Ketik 0 untuk batal._'
                                ].join('\n');
                            }
                        }

                        if (!rejectDharmajaya) {
                            replyText = await buildDharmajayaMenuWithStatus();
                            userFlowByPhone.set(senderPhone, 'SELECT_DHARMAJAYA_SUB');
                        }
                    } else if (selectedProvider === 'FOOD_STATION') {
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        let rejectFoodStation = false;

                        if (pendingData) {
                            const lines = parseRawMessageToLines(pendingData);
                            if (lines.length > 0 && lines.length % 5 === 0 && lines.length % 4 !== 0) {
                                rejectFoodStation = true;
                                replyText = [
                                    '⚠️ *DATA TERTOLAK (SALAH FORMAT)*',
                                    '',
                                    `Anda memilih: *${normalized}. FOOD STATION*`,
                                    'Syarat: *Wajib 4 Baris* (Nama, Kartu, KTP, KK).',
                                    '',
                                    `Data Anda: *${lines.length} baris* (Terdeteksi format Pasarjaya / ada Tanggal Lahir).`,
                                    '',
                                    '💡 *SOLUSI:*',
                                    pasarjayaNum
                                        ? `• Jika ingin ke Pasarjaya, ketik *${pasarjayaNum}*.`
                                        : '• Pasarjaya sedang tutup.',
                                    '• Jika tetap Foodstation, mohon hapus Tanggal Lahir dan kirim ulang.',
                                    '',
                                    '_Ketik 0 untuk batal._'
                                ].join('\n');
                            }
                        }

                        if (!rejectFoodStation) {
                            userLocationChoice.set(senderPhone, 'FOOD_STATION');
                            userSpecificLocationChoice.set(senderPhone, 'FOOD STATION');
                            console.log(`[DEBUG] SET Specific Location for ${senderPhone}: FOOD STATION`);

                            if (pendingData) {
                                await sock.sendMessage(remoteJid, { text: '🔄 Memproses data untuk Foodstation...' });

                                const logJson = await processRawMessageToLogJson({
                                    text: pendingData,
                                    senderPhone,
                                    messageId: msg.key.id,
                                    receivedAt,
                                    tanggal: tanggalWib,
                                    processingDayKey,
                                    locationContext: 'FOOD_STATION',
                                    specificLocation: 'FOOD STATION'
                                });
                                logJson.sender_name = existingName || undefined;

                                if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                    const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                        sockInstance: sock,
                                        remoteJid,
                                        senderPhone,
                                        logJson,
                                        originalText: pendingData,
                                        locationContext: 'FOOD_STATION',
                                        processingDayKey,
                                    });
                                    if (hasPendingUnknownRegion) {
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                        sockInstance: sock,
                                        remoteJid,
                                        senderPhone,
                                        logJson,
                                        originalText: pendingData,
                                        locationContext: 'FOOD_STATION',
                                        processingDayKey,
                                    });
                                    if (hasPendingUnderage) {
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                        logJson,
                                        msg.key.id || `${senderPhone}-${Date.now()}`
                                    );
                                    if (!globalQuotaCheck.allowed) {
                                        replyText = globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.';
                                        userFlowByPhone.set(senderPhone, 'NONE');
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const saveResult = await saveLogAndOkItems(logJson, pendingData);
                                    if (!saveResult.success) {
                                        await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                        console.error('❌ Gagal simpan ke database (FOOD STATION):', saveResult.dataError);
                                        replyText = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                    } else {
                                        const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                        replyText = buildReplyForNewData(logJson, validCount, 'FOOD_STATION', validItems);
                                    }
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                } else {
                                    replyText = [
                                        '❌ *DATA BELUM BISA DIPROSES*',
                                        '',
                                        'Lokasi: *Foodstation*',
                                        'Syarat: *4 baris* per orang.',
                                        '',
                                        '👇 *CONTOH YANG BENAR:*',
                                        'Siti Aminah',
                                        '5049488500001234',
                                        '3171234567890123',
                                        '3171098765432109',
                                        '',
                                        'Mohon kirim ulang ya Bu/Pak 🙏',
                                    ].join('\n');
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                }
                            } else {
                                userFlowByPhone.set(senderPhone, 'NONE');
                                replyText = FORMAT_DAFTAR_FOOD_STATION;
                            }
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'SELECT_PASARJAYA_SUB') {
                    if (await isProviderBlocked('PASARJAYA')) {
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        replyText = '⚠️ PasarJaya sementara ditutup.\n' + await buildFormatDaftarMessage();
                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                    // HANDLER MENU PASARJAYA (1-5)
                    if (normalized === '0') {
                        // Back to None
                        userFlowByPhone.set(senderPhone, 'NONE');
                        pendingRegistrationData.delete(senderPhone);
                        replyText = '✅ Batal pilih lokasi.';
                    } else if (normalized === '5') {
                        // MANUAL INPUT
                        userFlowByPhone.set(senderPhone, 'INPUT_MANUAL_LOCATION');
                        replyText = '📝 Silakan ketik nama lokasinya saja (Contoh: *Pasar Rumput*):';
                    } else if (PASARJAYA_MAPPING[normalized]) {
                        // PILIHAN 1-4 (VALID)
                        const lokasiName = PASARJAYA_MAPPING[normalized];
                        userLocationChoice.set(senderPhone, 'PASARJAYA');
                        userSpecificLocationChoice.set(senderPhone, `PASARJAYA - ${lokasiName}`); // STORE SPECIFIC LOCATION
                        console.log(`[DEBUG] SET Specific Location for ${senderPhone}: PASARJAYA - ${lokasiName}`);

                        // CEK PENDING DATA
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        if (pendingData) {
                            await sock.sendMessage(remoteJid, { text: `🔄 Memproses data untuk Pasarjaya (${lokasiName})...` });

                            // PROSES DATA PENDING + PASS SPECIFIC LOCATION
                            // Logic Baru: Jangan inject text, tapi pass parameter specificLocation

                            const logJson = await processRawMessageToLogJson({
                                text: pendingData,
                                senderPhone,
                                messageId: msg.key.id,
                                receivedAt,
                                tanggal: tanggalWib,
                                processingDayKey,
                                locationContext: 'PASARJAYA',
                                specificLocation: `PASARJAYA - ${lokasiName}` // PASS SPECIFIC LOCATION HERE
                            });
                            logJson.sender_name = existingName || undefined;

                            // Logic Save & Reply (Copied for safety)
                            if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                const quotaCheck = await checkLocationQuotaBeforeSave(logJson, senderPhone);
                                if (!quotaCheck.allowed) {
                                    replyText = quotaCheck.message || '⛔ Batas lokasi tercapai.';
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                    sockInstance: sock,
                                    remoteJid,
                                    senderPhone,
                                    logJson,
                                    originalText: pendingData,
                                    locationContext: 'PASARJAYA',
                                    processingDayKey,
                                });
                                if (hasPendingUnknownRegion) {
                                    pendingRegistrationData.delete(senderPhone);
                                    continue;
                                }

                                const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                    sockInstance: sock,
                                    remoteJid,
                                    senderPhone,
                                    logJson,
                                    originalText: pendingData,
                                    locationContext: 'PASARJAYA',
                                    processingDayKey,
                                });
                                if (hasPendingUnderage) {
                                    pendingRegistrationData.delete(senderPhone);
                                    continue;
                                }

                                const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                    logJson,
                                    msg.key.id || `${senderPhone}-${Date.now()}`
                                );
                                if (!globalQuotaCheck.allowed) {
                                    replyText = globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.';
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                const saveResult = await saveLogAndOkItems(logJson, pendingData);
                                if (!saveResult.success) {
                                    await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                    console.error('❌ Gagal simpan ke database (PASARJAYA SUB):', saveResult.dataError);
                                    replyText = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                } else {
                                    // FIX: Sort by received_at (Kronologis)
                                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                    replyText = buildReplyForNewData(logJson, validCount, 'PASARJAYA', validItems);
                                }
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            } else {
                                // Gagal (Mungkin kurang tanggal lahir / baris)
                                replyText = [
                                    '❌ *DATA BELUM BISA DIPROSES*',
                                    '',
                                    'Lokasi: *Pasarjaya*',
                                    'Syarat: *5 baris* per orang.',
                                    '',
                                    '👇 *CONTOH YANG BENAR:*',
                                    'Siti Aminah',
                                    '5049488500001234',
                                    '3171234567890123',
                                    '3171098765432109',
                                    '15-08-1975',
                                    '',
                                    'Mohon kirim ulang ya Bu/Pak 🙏',
                                ].join('\n');
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            }
                        } else {
                            // User pilih lokasi manual (tanpa pending data) -> Kirim Format Panduan
                            userFlowByPhone.set(senderPhone, 'NONE');
                            replyText = FORMAT_DAFTAR_PASARJAYA;
                        }
                    } else {
                        // Cek apakah user kirim data langsung (5+ baris) bukan pilihan angka
                        const inputLines = parseRawMessageToLines(messageText);
                        if (inputLines.length >= 5 && inputLines.length % 5 === 0) {
                            // User kirim data Pasarjaya langsung, simpan pending dan tanya sub-lokasi lagi
                            pendingRegistrationData.set(senderPhone, messageText);
                            replyText = [
                                '📍 *PILIH LOKASI PENGAMBILAN DULU*',
                                '',
                                '✅ Data Anda sudah tersimpan sementara.',
                                'Silakan pilih lokasi pengambilannya:',
                                '',
                                '1. 🏭 Jakgrosir Kedoya',
                                '2. 🏙️ Gerai Rusun Pesakih',
                                '3. 🏪 Mini DC Kec. Cengkareng',
                                '4. 🛒 Jakmart Bambu Larangan',
                                '5. 📝 Lokasi Lain...',
                                '',
                                '_Ketik angka pilihanmu! (1-5)_',
                                '_(Ketik 0 untuk batal)_'
                            ].join('\n');
                            // Flow tetap SELECT_PASARJAYA_SUB
                        } else {
                            replyText = '⚠️ Pilihan salah. Ketik 1-5, atau 0 batal.';
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'INPUT_MANUAL_LOCATION') {
                    if (await isProviderBlocked('PASARJAYA')) {
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        replyText = '⚠️ PasarJaya sementara ditutup.\n' + await buildFormatDaftarMessage();
                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                    // HANDLER INPUT LOKASI MANUAL
                    const lokasiName = rawTrim; // Ambil input user sebagai nama lokasi
                    // Validasi minimal panjang
                    if (lokasiName.length < 3) {
                        replyText = '⚠️ Nama lokasi terlalu pendek. Coba lagi atau ketik 0 batal.';
                        if (rawTrim === '0') {
                            userFlowByPhone.set(senderPhone, 'NONE');
                            pendingRegistrationData.delete(senderPhone);
                            replyText = '✅ Batal.';
                        }
                    } else {
                        // Resolve lokasi dari database referensi
                        let matches: any[] = [];
                        let MAX_CANDIDATES = 10;
                        try {
                            const resolver = await import('./services/locationResolver');
                            MAX_CANDIDATES = resolver.MAX_CANDIDATES;
                            matches = resolver.resolveLocation(lokasiName);
                        } catch (resolverErr) {
                            console.error('[locationResolver] Gagal load/resolve:', resolverErr);
                            replyText = '⚠️ Terjadi kesalahan saat mencari lokasi. Silakan coba lagi atau ketik 0 untuk batal.';
                            if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                            continue;
                        }

                        if (matches.length === 0) {
                            // No match
                            replyText = '❌ Lokasi "' + lokasiName + '" tidak ditemukan di database Pasarjaya.\n\nSilakan ketik ulang nama lokasi yang lebih spesifik, atau ketik 0 untuk batal.';
                            // State tetap INPUT_MANUAL_LOCATION — user bisa retry
                        } else if (matches.length === 1) {
                            // Single match — langsung pakai nama resmi
                            const officialName = matches[0].nama;
                            userLocationChoice.set(senderPhone, 'PASARJAYA');
                            userSpecificLocationChoice.set(senderPhone, `PASARJAYA - ${officialName}`);
                            console.log(`[DEBUG] SET Specific Location (Manual-Resolved) for ${senderPhone}: PASARJAYA - ${officialName}`);

                            // CEK PENDING DATA
                            const pendingData = pendingRegistrationData.get(senderPhone);
                            if (pendingData) {
                                await sock.sendMessage(remoteJid, { text: `🔄 Memproses data untuk Pasarjaya (${officialName})...` });

                                const logJson = await processRawMessageToLogJson({
                                    text: pendingData,
                                    senderPhone,
                                    messageId: msg.key.id,
                                    receivedAt,
                                    tanggal: tanggalWib,
                                    processingDayKey,
                                    locationContext: 'PASARJAYA',
                                    specificLocation: `PASARJAYA - ${officialName}`
                                });
                                logJson.sender_name = existingName || undefined;

                                if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                    const quotaCheck = await checkLocationQuotaBeforeSave(logJson, senderPhone);
                                    if (!quotaCheck.allowed) {
                                        replyText = quotaCheck.message || '⛔ Batas lokasi tercapai.';
                                        userFlowByPhone.set(senderPhone, 'NONE');
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                        sockInstance: sock,
                                        remoteJid,
                                        senderPhone,
                                        logJson,
                                        originalText: pendingData,
                                        locationContext: 'PASARJAYA',
                                        processingDayKey,
                                    });
                                    if (hasPendingUnknownRegion) {
                                        pendingRegistrationData.delete(senderPhone);
                                        continue;
                                    }

                                    const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                        sockInstance: sock,
                                        remoteJid,
                                        senderPhone,
                                        logJson,
                                        originalText: pendingData,
                                        locationContext: 'PASARJAYA',
                                        processingDayKey,
                                    });
                                    if (hasPendingUnderage) {
                                        pendingRegistrationData.delete(senderPhone);
                                        continue;
                                    }

                                    const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                        logJson,
                                        msg.key.id || `${senderPhone}-${Date.now()}`
                                    );
                                    if (!globalQuotaCheck.allowed) {
                                        replyText = globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.';
                                        userFlowByPhone.set(senderPhone, 'NONE');
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const saveResult = await saveLogAndOkItems(logJson, pendingData);
                                    if (!saveResult.success) {
                                        await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                        console.error('❌ Gagal simpan ke database (MANUAL LOCATION):', saveResult.dataError);
                                        replyText = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                    } else {
                                        // FIX: Sort by received_at (Kronologis)
                                        const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                        replyText = buildReplyForNewData(logJson, validCount, 'PASARJAYA', validItems);
                                    }
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                } else {
                                    replyText = [
                                        '❌ *DATA BELUM BISA DIPROSES*',
                                        '',
                                        'Lokasi: *Pasarjaya*',
                                        'Syarat: *5 baris* per orang.',
                                        '',
                                        '👇 *CONTOH YANG BENAR:*',
                                        'Siti Aminah',
                                        '5049488500001234',
                                        '3171234567890123',
                                        '3171098765432109',
                                        '15-08-1975',
                                        '',
                                        'Mohon kirim ulang ya Bu/Pak 🙏',
                                    ].join('\n');
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                }
                            } else {
                                // User pilih lokasi manual (tanpa pending data) -> Format panduan Pasarjaya
                                userFlowByPhone.set(senderPhone, 'NONE');
                                replyText = FORMAT_DAFTAR_PASARJAYA;
                            }
                        } else if (matches.length > MAX_CANDIDATES) {
                            // Too many matches
                            replyText = '⚠️ Ditemukan ' + matches.length + ' lokasi yang cocok. Coba ketik nama lokasi yang lebih spesifik.\n\nKetik 0 untuk batal.';
                            // State tetap INPUT_MANUAL_LOCATION
                        } else {
                            // 2-10 matches — show disambiguation list
                            pendingLocationCandidates.set(senderPhone, matches);
                            userFlowByPhone.set(senderPhone, 'INPUT_MANUAL_LOCATION_CONFIRM');

                            const listItems = matches.map((m: { wilayahNama: string; nama: string }, i: number) => `${i + 1}. [${m.wilayahNama}] ${m.nama}`).join('\n');
                            replyText = [
                                '📍 Ditemukan ' + matches.length + ' lokasi yang cocok:',
                                '',
                                listItems,
                                '',
                                'Balas dengan angka pilihanmu (1-' + matches.length + '), atau ketik 0 untuk batal.'
                            ].join('\n');
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'INPUT_MANUAL_LOCATION_CONFIRM') {
                    if (await isProviderBlocked('PASARJAYA')) {
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        pendingLocationCandidates.delete(senderPhone);
                        replyText = '⚠️ PasarJaya sementara ditutup.\n' + await buildFormatDaftarMessage();
                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }

                    const candidates = pendingLocationCandidates.get(senderPhone);
                    if (!candidates || candidates.length === 0) {
                        replyText = '❌ Sesi kedaluwarsa. Silakan ketik ulang nama lokasi.';
                        userFlowByPhone.set(senderPhone, 'INPUT_MANUAL_LOCATION');
                        pendingLocationCandidates.delete(senderPhone);
                    } else {
                        const choice = parseInt(normalized, 10);
                        if (isNaN(choice) || choice < 1 || choice > candidates.length) {
                            replyText = '❌ Pilihan tidak valid. Balas angka 1-' + candidates.length + ' atau ketik 0 untuk batal.';
                        } else {
                            const selected = candidates[choice - 1];
                            pendingLocationCandidates.delete(senderPhone);

                            userLocationChoice.set(senderPhone, 'PASARJAYA');
                            userSpecificLocationChoice.set(senderPhone, `PASARJAYA - ${selected.nama}`);
                            console.log(`[DEBUG] SET Specific Location (Manual-Disambiguated) for ${senderPhone}: PASARJAYA - ${selected.nama}`);

                            const pendingData = pendingRegistrationData.get(senderPhone);
                            if (pendingData) {
                                await sock.sendMessage(remoteJid, { text: `🔄 Memproses data untuk Pasarjaya (${selected.nama})...` });

                                const logJson = await processRawMessageToLogJson({
                                    text: pendingData,
                                    senderPhone,
                                    messageId: msg.key.id,
                                    receivedAt,
                                    tanggal: tanggalWib,
                                    processingDayKey,
                                    locationContext: 'PASARJAYA',
                                    specificLocation: `PASARJAYA - ${selected.nama}`
                                });
                                logJson.sender_name = existingName || undefined;

                                if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                    const quotaCheck = await checkLocationQuotaBeforeSave(logJson, senderPhone);
                                    if (!quotaCheck.allowed) {
                                        replyText = quotaCheck.message || '⛔ Batas lokasi tercapai.';
                                        userFlowByPhone.set(senderPhone, 'NONE');
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                        sockInstance: sock,
                                        remoteJid,
                                        senderPhone,
                                        logJson,
                                        originalText: pendingData,
                                        locationContext: 'PASARJAYA',
                                        processingDayKey,
                                    });
                                    if (hasPendingUnknownRegion) {
                                        pendingRegistrationData.delete(senderPhone);
                                        continue;
                                    }

                                    const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                        sockInstance: sock,
                                        remoteJid,
                                        senderPhone,
                                        logJson,
                                        originalText: pendingData,
                                        locationContext: 'PASARJAYA',
                                        processingDayKey,
                                    });
                                    if (hasPendingUnderage) {
                                        pendingRegistrationData.delete(senderPhone);
                                        continue;
                                    }

                                    const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                        logJson,
                                        msg.key.id || `${senderPhone}-${Date.now()}`
                                    );
                                    if (!globalQuotaCheck.allowed) {
                                        replyText = globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.';
                                        userFlowByPhone.set(senderPhone, 'NONE');
                                        pendingRegistrationData.delete(senderPhone);
                                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                        continue;
                                    }

                                    const saveResult = await saveLogAndOkItems(logJson, pendingData);
                                    if (!saveResult.success) {
                                        await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                        console.error('❌ Gagal simpan ke database (MANUAL LOCATION CONFIRM):', saveResult.dataError);
                                        replyText = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                    } else {
                                        const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                        replyText = buildReplyForNewData(logJson, validCount, 'PASARJAYA', validItems);
                                    }
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                } else {
                                    replyText = [
                                        '❌ *DATA BELUM BISA DIPROSES*',
                                        '',
                                        'Lokasi: *Pasarjaya*',
                                        'Syarat: *5 baris* per orang.',
                                        '',
                                        '👇 *CONTOH YANG BENAR:*',
                                        'Siti Aminah',
                                        '5049488500001234',
                                        '3171234567890123',
                                        '3171098765432109',
                                        '15-08-1975',
                                        '',
                                        'Mohon kirim ulang ya Bu/Pak 🙏',
                                    ].join('\n');
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                }
                            } else {
                                userFlowByPhone.set(senderPhone, 'NONE');
                                replyText = FORMAT_DAFTAR_PASARJAYA;
                            }
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                else if (currentUserFlow === 'SELECT_DHARMAJAYA_SUB') {
                    // HANDLER MENU DHARMAJAYA (1-4)
                    if (normalized === '0') {
                        userFlowByPhone.set(senderPhone, 'NONE');
                        pendingRegistrationData.delete(senderPhone);
                        replyText = '✅ Batal pilih lokasi.';
                    } else if (DHARMAJAYA_MAPPING[normalized]) {
                        // PILIHAN 1-4 (VALID)
                        const lokasiName = DHARMAJAYA_MAPPING[normalized];
                        const closeStatus = await isSpecificLocationClosed('DHARMAJAYA', lokasiName);
                        if (closeStatus.closed) {
                            const reasonSuffix = closeStatus.reason ? `\nAlasan: ${closeStatus.reason}` : '';
                            const statusMenuText = await buildDharmajayaMenuWithStatus();
                            replyText = `⚠️ Lokasi *${lokasiName}* sedang penuh dan ditutup sementara.${reasonSuffix}\nSilakan pilih lokasi lain yang tersedia.\n\n${statusMenuText}`;
                            if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                            continue;
                        }

                        userLocationChoice.set(senderPhone, 'DHARMAJAYA');
                        userSpecificLocationChoice.set(senderPhone, `DHARMAJAYA - ${lokasiName}`);
                        console.log(`[DEBUG] SET Specific Location for ${senderPhone}: DHARMAJAYA - ${lokasiName}`);

                        // CEK PENDING DATA
                        const pendingData = pendingRegistrationData.get(senderPhone);
                        if (pendingData) {
                            await sock.sendMessage(remoteJid, { text: `🔄 Memproses data untuk Dharmajaya (${lokasiName})...` });

                            const logJson = await processRawMessageToLogJson({
                                text: pendingData,
                                senderPhone,
                                messageId: msg.key.id,
                                receivedAt,
                                tanggal: tanggalWib,
                                processingDayKey,
                                locationContext: 'DHARMAJAYA',
                                specificLocation: `DHARMAJAYA - ${lokasiName}`
                            });
                            logJson.sender_name = existingName || undefined;

                            if (logJson.stats.total_blocks > 0 && (!logJson.failed_remainder_lines || logJson.failed_remainder_lines.length === 0)) {
                                const quotaCheck = await checkLocationQuotaBeforeSave(logJson, senderPhone);
                                if (!quotaCheck.allowed) {
                                    replyText = quotaCheck.message || '⛔ Batas lokasi tercapai.';
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                    sockInstance: sock,
                                    remoteJid,
                                    senderPhone,
                                    logJson,
                                    originalText: pendingData,
                                    locationContext: 'DHARMAJAYA',
                                    processingDayKey,
                                });
                                if (hasPendingUnknownRegion) {
                                    pendingRegistrationData.delete(senderPhone);
                                    continue;
                                }

                                const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                    sockInstance: sock,
                                    remoteJid,
                                    senderPhone,
                                    logJson,
                                    originalText: pendingData,
                                    locationContext: 'DHARMAJAYA',
                                    processingDayKey,
                                });
                                if (hasPendingUnderage) {
                                    pendingRegistrationData.delete(senderPhone);
                                    continue;
                                }

                                const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                    logJson,
                                    msg.key.id || `${senderPhone}-${Date.now()}`
                                );
                                if (!globalQuotaCheck.allowed) {
                                    replyText = globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.';
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                    pendingRegistrationData.delete(senderPhone);
                                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                const saveResult = await saveLogAndOkItems(logJson, pendingData);
                                if (!saveResult.success) {
                                    await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                    console.error('❌ Gagal simpan ke database (DHARMAJAYA SUB):', saveResult.dataError);
                                    replyText = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                } else {
                                    // FIX: Sort by received_at (Kronologis)
                                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                    replyText = buildReplyForNewData(logJson, validCount, 'DHARMAJAYA', validItems);
                                }
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            } else {
                                replyText = [
                                    '❌ *DATA BELUM BISA DIPROSES*',
                                    '',
                                    'Lokasi: *Dharmajaya*',
                                    'Syarat: *4 baris* per orang.',
                                    '',
                                    '👇 *CONTOH YANG BENAR:*',
                                    'Siti Aminah',
                                    '5049488500001234',
                                    '3171234567890123',
                                    '3171098765432109',
                                    '',
                                    'Mohon kirim ulang ya Bu/Pak 🙏',
                                ].join('\n');
                                userFlowByPhone.set(senderPhone, 'NONE');
                                pendingRegistrationData.delete(senderPhone);
                            }
                        } else {
                            userFlowByPhone.set(senderPhone, 'NONE');
                            replyText = FORMAT_DAFTAR_DHARMAJAYA.replace('✅ *LOKASI TERPILIH: DHARMAJAYA*', '✅ *LOKASI TERPILIH: DHARMAJAYA ' + lokasiName.toUpperCase() + '*');
                        }
                    } else {
                        // Cek apakah user kirim data langsung (4+ baris)
                        const inputLines = parseRawMessageToLines(messageText);
                        if (inputLines.length >= 4 && inputLines.length % 4 === 0) {
                            pendingRegistrationData.set(senderPhone, messageText);
                            const statusMenuText = await buildDharmajayaMenuWithStatus();
                            replyText = [
                                '📍 *PILIH LOKASI PENGAMBILAN DULU*',
                                '',
                                '✅ Data Anda sudah tersimpan sementara.',
                                'Silakan pilih lokasi pengambilannya:',
                                '',
                                statusMenuText,
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan salah. Ketik 1-4, atau 0 batal.';
                        }
                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }

                if (pendingDelete.has(senderPhone)) {
                    const isMenuOrCommand =
                        normalized === '0' ||
                        normalized === '1' ||
                        normalized === '2' ||
                        normalized === '3' ||
                        normalized === '4' ||
                        normalized === '5' ||
                        normalized === '6' ||
                        normalized.startsWith('ADMIN') ||
                        isGreetingOrMenu(normalized);

                    if (isMenuOrCommand || looksLikeRegistrationData) {
                        pendingDelete.delete(senderPhone);
                    } else {
                        const query = rawTrim;
                        const { success: delOk, count, mode, error: delErr } = await deleteDataByNameOrCard(
                            senderPhone,
                            processingDayKey,
                            query
                        );
                        pendingDelete.delete(senderPhone);

                        if (!delOk) {
                            console.error("Gagal hapus:", delErr);
                            replyText = '❌ *GAGAL MENGHAPUS DATA*\nTerjadi kendala saat menghapus data. Mohon coba lagi.';
                        } else if (count > 0) {
                            replyText = ['✅ *DATA BERHASIL DIHAPUS*', '', 'Data pendaftaran telah berhasil dihapus.', 'Terima kasih 🙏'].join('\n');
                        } else {
                            const hint = mode === 'number' ? 'Pastikan nomor sama persis.' : 'Pastikan nama mengandung kata kunci tersebut.';
                            replyText = [
                                '❌ *DATA TIDAK DITEMUKAN*',
                                '',
                                'Mohon maaf, data yang Anda maksudkan tidak ditemukan di pendaftaran hari ini.',
                                hint,
                                'Silakan periksa kembali (Gunakan Menu 2 Cek Data).',
                                '',
                                'Atau gunakan menu *3. HAPUS* untuk memilih dari daftar.'
                            ].join('\n');
                        }
                        if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }
                }

                // Prioritas Cek Admin Flow agar tidak tertabrak menu user
                let currentAdminFlow = adminFlowByPhone.get(senderPhone) ?? 'NONE';

                const rawUpper = rawTrim.toUpperCase();

                if (isAdmin && rawUpper === '#TEMPLATE RESET') {
                    const ok = await updateBotSettings({ close_message_template: CLOSE_MESSAGE_TEMPLATE_UNIFIED });
                    if (ok) {
                        adminFlowByPhone.set(senderPhone, 'MENU');
                        await sock.sendMessage(remoteJid, {
                            text: [
                                '✅ *TEMPLATE PESAN TUTUP BERHASIL DI-RESET*',
                                '',
                                'Template sudah kembali ke versi default.',
                                '',
                                'Ketik *#TEMPLATE* untuk ubah lagi, atau ketik *0* untuk kembali ke menu utama.'
                            ].join('\n')
                        });
                    } else {
                        await sock.sendMessage(remoteJid, {
                            text: '❌ Gagal reset template pesan tutup. Silakan coba lagi.'
                        });
                    }
                    continue;
                }

                if (isAdmin && rawUpper === '#TEMPLATE') {
                    adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TEMPLATE');
                    await sock.sendMessage(remoteJid, {
                        text: [
                            '📝 *EDIT TEMPLATE PESAN TUTUP*',
                            '',
                            'Silakan kirim teks template baru untuk pesan tutup.',
                            'Gunakan placeholder berikut agar jam terisi otomatis:',
                            '• *{JAM_TUTUP}*',
                            '• *{JAM_BUKA}*',
                            '',
                            'Contoh:',
                            '⛔ Layanan sedang tutup',
                            'Jam tutup: {JAM_TUTUP}',
                            'Buka kembali: Pukul {JAM_BUKA} WIB',
                            '',
                            '_Ketik 0 untuk batal. Ketik #TEMPLATE RESET untuk kembali ke default._'
                        ].join('\n')
                    });
                    continue;
                }

                if (isAdmin && rawUpper.startsWith('#TEMPLATE ')) {
                    const templateText = rawTrim.slice('#TEMPLATE'.length).trim();
                    if (!templateText) {
                        await sock.sendMessage(remoteJid, {
                            text: '⚠️ Template kosong. Ketik *#TEMPLATE* lalu kirim isi template Anda.'
                        });
                        continue;
                    }

                    const ok = await updateBotSettings({ close_message_template: templateText });
                    if (ok) {
                        adminFlowByPhone.set(senderPhone, 'MENU');
                        await sock.sendMessage(remoteJid, {
                            text: [
                                '✅ *TEMPLATE PESAN TUTUP BERHASIL DIUBAH*',
                                '',
                                'Perubahan sudah tersimpan.',
                                'Ketik *#TEMPLATE RESET* jika ingin kembali ke default.',
                            ].join('\n')
                        });
                    } else {
                        await sock.sendMessage(remoteJid, {
                            text: '❌ Gagal menyimpan template. Silakan coba lagi.'
                        });
                    }
                    continue;
                }

                const shouldExitAdminFlowToUserMenu =
                    isAdmin &&
                    currentAdminFlow !== 'NONE' &&
                    (
                        rawUpper === 'HAPUS' ||
                        rawUpper.startsWith('HAPUS ') ||
                        rawUpper === 'CEK' ||
                        rawUpper.startsWith('CEK ') ||
                        rawUpper === 'EDIT' ||
                        rawUpper.startsWith('EDIT ') ||
                        rawUpper === 'DAFTAR' ||
                        rawUpper.startsWith('DAFTAR ') ||
                        rawUpper === 'MENU_HAPUS' ||
                        rawUpper === 'MENU_CEK' ||
                        rawUpper === 'MENU_DAFTAR'
                    );

                if (shouldExitAdminFlowToUserMenu) {
                    adminFlowByPhone.set(senderPhone, 'NONE');
                    currentAdminFlow = 'NONE';
                }

                // MENU HANDLER: 3 (HAPUS)
                // Kita pindahkan ke sini agar tidak "kalah" sama logic lain
                // FIX: Tambah syarat currentAdminFlow === 'NONE'
                if (normalized === '3' && currentUserFlow === 'NONE' && currentAdminFlow === 'NONE') {
                    // 1. Ambil data hari ini untuk ditampilkan
                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                    if (validCount === 0) {
                        replyText = '⚠️ *DATA KOSONG*\n\nBelum ada data pendaftaran hari ini yang bisa dihapus.';
                    } else {
                        // Build List
                        const listRows: string[] = [];
                        listRows.push('🗑️ *HAPUS DATA PENDAFTARAN*');
                        listRows.push('');
                        listRows.push('📋 Pilih data yang ingin dihapus:');
                        listRows.push('');

                        validItems.forEach((item, idx) => {
                            // Format: 1. AGUS
                            listRows.push(`${idx + 1}. ${item.nama.toUpperCase()}`);
                        });

                        listRows.push('');
                        listRows.push('👇 *Cara hapus:*');
                        listRows.push('• Ketik *1* untuk hapus satu data');
                        listRows.push('• Ketik *1,2,3* untuk hapus beberapa sekaligus');
                        listRows.push('• Ketik *ALL* untuk hapus semua data');
                        listRows.push('• Ketik *0* untuk batal');
                        listRows.push('');
                        listRows.push('_Contoh: Ketik 2 untuk hapus data nomor 2_');

                        replyText = listRows.join('\n');
                        userFlowByPhone.set(senderPhone, 'DELETE_DATA');
                    }

                    await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }
                // --- MENU ADMIN ---
                const dmyExample = processingDayKey.split('-').reverse().join('-');

                const getPastKey = (daysBack: number) => shiftIsoDate(processingDayKey, -daysBack);


                const openAdminMenu = async () => {
                    clearTransientSessionContext(senderPhone, { clearFlows: true });
                    adminFlowByPhone.set(senderPhone, 'MENU');
                    await sock.sendMessage(remoteJid, { text: ADMIN_MENU_MESSAGE });
                };

                if (isAdmin && (normalized === '0' || normalized === 'ADMIN' || normalized === 'ADMIN MENU')) {
                    await openAdminMenu();
                    continue;
                }

                if (isAdmin && currentAdminFlow !== 'NONE') {
                    if ((normalized === '0' && !currentAdminFlow.startsWith('CONTACT_') && !currentAdminFlow.startsWith('BLOCKED_KK_') && !currentAdminFlow.startsWith('BLOCKED_PHONE_') && !currentAdminFlow.startsWith('BLOCKED_LOCATION_') && !currentAdminFlow.startsWith('LOCATION_MGMT_') && !currentAdminFlow.startsWith('SETTING_') && currentAdminFlow !== 'BLOCK_NUMBER_MENU' && currentAdminFlow !== 'QUOTA_MENU' && currentAdminFlow !== 'REPORT_MENU' && currentAdminFlow !== 'REKAP_MENU') || isGreetingOrMenu(normalized)) {
                        clearTransientSessionContext(senderPhone, { clearFlows: true, clearPendingConfirmations: true });
                        await sendMainMenu(sock, remoteJid, isAdmin);
                        continue;
                    }

                    const lookupName = (phone: string) => {
                        const jid = phone + '@s.whatsapp.net';
                        const c = store.contacts[jid];
                        return c?.name || c?.notify || null;
                    };

                    if (currentAdminFlow === 'SETTING_CLOSE_TEMPLATE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else {
                            const templateText = rawInput.trim();
                            if (!templateText) {
                                replyText = '⚠️ Template tidak boleh kosong. Silakan kirim teks template, atau ketik 0 untuk batal.';
                            } else {
                                const ok = await updateBotSettings({ close_message_template: templateText });
                                if (ok) {
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                    replyText = [
                                        '✅ *TEMPLATE PESAN TUTUP BERHASIL DIUBAH*',
                                        '',
                                        'Perubahan sudah tersimpan.',
                                        'Ketik *#TEMPLATE RESET* jika ingin kembali ke default.'
                                    ].join('\n');
                                } else {
                                    replyText = '❌ Gagal menyimpan template. Silakan coba lagi.';
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCK_NUMBER_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_MENU');
                            replyText = buildBlockedKjpMenuText();
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            replyText = buildBlockedKtpMenuText();
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_MENU');
                            replyText = buildBlockedKkMenuText();
                        } else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_MENU');
                            replyText = buildBlockedPhoneMenuText();
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-4 atau 0 untuk kembali.';
                        }
                    } else if (currentAdminFlow === 'QUOTA_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            locationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_MENU');
                            replyText = buildLocationQuotaMenuText();
                        } else if (normalized === '2') {
                            globalLocationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_MENU');
                            replyText = buildGlobalLocationQuotaMenuText();
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-2 atau 0 untuk kembali.';
                        }
                    } else if (currentAdminFlow === 'REPORT_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            const stats = await getStatistics(processingDayKey);
                            const displayDate = processingDayKey.split('-').reverse().join('-');

                            const lines = [
                                '📊 *STATISTIK DASHBOARD*',
                                `📅 Per Tanggal: ${displayDate}`,
                                '',
                                '📈 *RINGKASAN DATA:*',
                                `├ Hari Ini: *${stats.todayCount}* data`,
                                `└ Bulan Ini: *${stats.monthCount}* data`,
                                '',
                                '👥 *PENGGUNA AKTIF:*',
                                `├ Hari Ini: *${stats.activeUsersToday}* orang`,
                                `└ Total Terdaftar: *${stats.totalRegisteredUsers}* orang`,
                            ];

                            if (stats.topUsers.length > 0) {
                                lines.push('');
                                lines.push('🏆 *TOP 20 PENGIRIM HARI INI:*');
                                stats.topUsers.forEach((u, i) => {
                                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
                                    lines.push(`${medal} ${i + 1}. ${u.name} (${u.count} data)`);
                                });
                            }

                            replyText = lines.join('\n');
                        } else if (normalized === '2') {
                            const { data: logs, error } = await supabase
                                .from('log_pesan_wa')
                                .select('*')
                                .eq('processing_day_key', processingDayKey)
                                .order('received_at', { ascending: false })
                                .limit(50);

                            if (error || !logs || logs.length === 0) {
                                replyText = '📋 Belum ada aktivitas hari ini.';
                            } else {
                                const dateDisplay = processingDayKey.split('-').reverse().join('-');
                                const lines = [
                                    '📋 *LOG AKTIVITAS HARI INI*',
                                    `📅 Tanggal: ${dateDisplay}`,
                                    `📊 Menampilkan: ${logs.length} aktivitas terakhir`,
                                    ''
                                ];

                                (logs as any[]).forEach((log, i) => {
                                    const timeStr = new Date(log.received_at).toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'Asia/Jakarta'
                                    });
                                    const senderName = getContactName(log.sender_phone) || getRegisteredUserNameSync(log.sender_phone) || log.sender_phone;

                                    const okCount = log.stats_ok_count ?? 0;
                                    const totalBlocks = log.stats_total_blocks ?? 0;
                                    const failCount = totalBlocks - okCount;

                                    let statusIcon = '✅';
                                    if (failCount > 0 && okCount === 0) statusIcon = '❌';
                                    else if (failCount > 0) statusIcon = '⚠️';

                                    lines.push(`${i + 1}. ${statusIcon} *${senderName}* (${timeStr})`);
                                    lines.push(`   📥 ${totalBlocks} data | ✅ ${okCount} OK | ❌ ${failCount} Gagal`);
                                });

                                replyText = lines.join('\n');
                            }
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'SEARCH_DATA');
                            replyText = [
                                '🔍 *CARI DATA*',
                                '',
                                'Ketik keyword pencarian:',
                                '• Nama penerima (contoh: Budi)',
                                '• Nama pengirim WA (contoh: Tari)',
                                '• No Kartu (contoh: 5049488500001111)',
                                '• No HP (contoh: 628123456789)',
                                '',
                                '_Pencarian di SEMUA tanggal._',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_SELECT');
                            replyText = [
                                '📢 *BROADCAST INFO*',
                                '',
                                'Pilih target pengiriman:',
                                '',
                                '1️⃣ Kirim ke SEMUA kontak',
                                '2️⃣ Kirim ke nomor tertentu',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-4 atau 0 untuk kembali.';
                        }
                    } else if (currentAdminFlow === 'REKAP_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            replyText = await getGlobalRecap(processingDayKey, undefined, lookupName);
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'RECAP_SPECIFIC_MENU');
                            replyText = [
                                '📅 *REKAP TANGGAL TERTENTU*',
                                '',
                                '1️⃣ Rekap Kemarin',
                                '2️⃣ Input Tanggal Manual',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'ASK_RANGE');
                            replyText = ['📅 *REKAP RENTANG*', '', `Contoh: *01-01-2026 ${dmyExample}*`, '', '_Ketik 0 untuk kembali._'].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-3 atau 0 untuk kembali.';
                        }
                    } else if (currentAdminFlow === 'MENU') {
                        if (normalized === '1') {
                            const currentSettings = await getBotSettings();
                            const currentTimeStr = formatOperationStatus(currentSettings);
                            adminFlowByPhone.set(senderPhone, 'SETTING_OPERATION_MENU');

                            replyText = [
                                '⏰ *ATUR STATUS BOT*',
                                '',
                                `📌 Status saat ini: *${currentTimeStr}*`,
                                '',
                                '1️⃣ Buka Sekarang',
                                '2️⃣ Tutup Sekarang',
                                '3️⃣ Kembali ke Default (00.00 - 06.00)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'EXPORT_SELECT_DATE');
                            replyText = [
                                '📤 *EXPORT DATA*',
                                '',
                                `📅 Default: Hari Ini (${dmyExample})`,
                                '',
                                '1️⃣ Export Hari Ini',
                                '2️⃣ Export Kemarin',
                                '3️⃣ Export Tanggal Lain',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'ADMIN_DELETE_SELECT_USER');
                            const recap = await getGlobalRecap(processingDayKey, undefined, lookupName);

                            const { data: users } = await supabase
                                .from('data_harian')
                                .select('sender_phone, sender_name')
                                .eq('processing_day_key', processingDayKey)
                                .order('sender_phone');

                            if (!users || users.length === 0) {
                                replyText = '📂 Belum ada data hari ini.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                const userMap = new Map<string, { name: string; count: number }>();
                                users.forEach((u: any) => {
                                    const existing = userMap.get(u.sender_phone);
                                    if (existing) {
                                        existing.count++;
                                    } else {
                                        userMap.set(u.sender_phone, {
                                            name: getContactName(u.sender_phone) || u.sender_name || getRegisteredUserNameSync(u.sender_phone) || u.sender_phone,
                                            count: 1
                                        });
                                    }
                                });

                                const userList = Array.from(userMap.entries())
                                    .map(([phone, info]) => ({
                                        phone,
                                        name: info.name,
                                        count: info.count
                                    }))
                                    .sort((a, b) => {
                                        const nameA = (a.name || '').trim().toLowerCase();
                                        const nameB = (b.name || '').trim().toLowerCase();
                                        return nameA.localeCompare(nameB);
                                    });
                                adminUserListCache.set(senderPhone, userList);

                                let msg = '🗑️ *HAPUS DATA USER*\n\n';
                                msg += `📅 Tanggal: ${dmyExample}\n\n`;
                                msg += 'Pilih user yang datanya ingin dihapus:\n\n';
                                userList.forEach((u, i) => {
                                    msg += `${i + 1}. ${u.name} (${u.count} data)\n`;
                                });
                                msg += '\n👇 Ketik nomor urut user.\n_Ketik 0 untuk batal._';
                                replyText = msg;
                            }
                        } else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'BLOCK_NUMBER_MENU');
                            replyText = [
                                '🔒 *KELOLA BLOKIR NOMOR*',
                                '',
                                '1️⃣ Blokir No KJP',
                                '2️⃣ Blokir No KTP',
                                '3️⃣ Blokir No KK',
                                '4️⃣ Blokir No HP',
                                '',
                                '0️⃣ Kembali ke Menu Admin',
                            ].join('\n');
                        } else if (normalized === '5') {
                            const { handleLocationMgmt } = await import('./services/adminLocationMenu');
                            const result = await handleLocationMgmt('LOCATION_MGMT_MENU', '', senderPhone);
                            adminFlowByPhone.set(senderPhone, result.nextState ?? 'NONE');
                            replyText = result.replyText;
                        } else if (normalized === '6') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_MENU');
                            replyText = [
                                '👥 *KELOLA KONTAK*',
                                '',
                                '1️⃣ 🔍 Cari Kontak',
                                '2️⃣ ➕ Tambah Kontak Baru',
                                '3️⃣ 📂 Lihat Semua Kontak',
                                '4️⃣ 🗑️ Hapus Kontak',
                                '',
                                '0️⃣ 🔙 Kembali ke Menu Admin',
                            ].join('\n');
                        } else if (normalized === '7') {
                            adminFlowByPhone.set(senderPhone, 'QUOTA_MENU');
                            replyText = [
                                '📊 *KELOLA KUOTA LOKASI*',
                                '',
                                '1️⃣ Batas per Lokasi (per user/hari)',
                                '2️⃣ Kuota Global per Lokasi (semua user/hari)',
                                '',
                                '0️⃣ Kembali ke Menu Admin',
                            ].join('\n');
                        } else if (normalized === '8') {
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_MENU');
                            replyText = buildCardPrefixMenuText();
                        } else if (normalized === '9') {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = buildWhitelistMenuText();
                        } else if (normalized === '10') {
                            adminFlowByPhone.set(senderPhone, 'REPORT_MENU');
                            replyText = [
                                '📊 *LAPORAN & ANALITIK*',
                                '',
                                '1️⃣ Statistik Dashboard',
                                '2️⃣ Log Aktivitas',
                                '3️⃣ Cari Data',
                                '4️⃣ Broadcast Informasi',
                                '',
                                '0️⃣ Kembali ke Menu Admin',
                            ].join('\n');
                        } else if (normalized === '11') {
                            adminFlowByPhone.set(senderPhone, 'REKAP_MENU');
                            replyText = [
                                '📋 *REKAP DATA*',
                                '',
                                '1️⃣ Rekap Hari Ini',
                                '2️⃣ Rekap Tanggal Tertentu',
                                '3️⃣ Rekap Rentang Tanggal',
                                '',
                                '0️⃣ Kembali ke Menu Admin',
                            ].join('\n');
                        } else replyText = '⚠️ Pilihan tidak dikenali.';
                    } else if (currentAdminFlow === 'SETTING_OPERATION_MENU') {
                        if (normalized === '0') {
                            closeWindowDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            const ok = await updateBotSettings({
                                close_hour_start: 0,
                                close_minute_start: 0,
                                close_hour_end: 0,
                                close_minute_end: 0,
                                manual_close_start: null,
                                manual_close_end: null,
                            });

                            clearBotSettingsCache();
                            closeWindowDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'SETTING_OPERATION_MENU');

                            replyText = ok
                                ? [
                                    '✅ *BOT BERHASIL DIBUKA SEKARANG*',
                                    '',
                                    'Status sekarang: *24 jam buka* (tanpa jam tutup).',
                                    'Untuk mengaktifkan lagi jadwal normal, pilih:',
                                    '3️⃣ *Kembali ke Default (00.00 - 06.05)*',
                                    '',
                                    '_Ketik 0 untuk kembali ke menu admin._',
                                ].join('\n')
                                : '❌ Gagal membuka bot. Coba lagi.';
                        } else if (normalized === '2') {
                            closeWindowDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'SETTING_MANUAL_CLOSE_START');
                            replyText = [
                                '🔴 *TUTUP SEKARANG (PERIODE MANUAL)*',
                                '',
                                'Masukkan *Tanggal & Jam MULAI tutup*.',
                                'Format: *DD-MM-YYYY HH:mm*',
                                'Contoh: *22-02-2026 00:01*',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else if (normalized === '3') {
                            const ok = await updateBotSettings({
                                close_hour_start: DEFAULT_CLOSE_START_HOUR,
                                close_minute_start: DEFAULT_CLOSE_START_MINUTE,
                                close_hour_end: DEFAULT_CLOSE_END_HOUR,
                                close_minute_end: DEFAULT_CLOSE_END_MINUTE,
                                manual_close_start: null,
                                manual_close_end: null,
                            });

                            clearBotSettingsCache();
                            closeWindowDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'SETTING_OPERATION_MENU');

                            replyText = ok
                                ? [
                                    '✅ *JADWAL DEFAULT BERHASIL DIAKTIFKAN*',
                                    '',
                                    'Jam operasional sekarang:',
                                    '🟢 BUKA: *06.05 - 23.59 WIB*',
                                    '🔴 TUTUP: *00.00 - 06.05 WIB*',
                                    '',
                                    '_Ketik 0 untuk kembali ke menu admin._',
                                ].join('\n')
                                : '❌ Gagal mengaktifkan jadwal default. Coba lagi.';
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'SETTING_MANUAL_CLOSE_START') {
                        if (normalized === '0') {
                            closeWindowDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'SETTING_OPERATION_MENU');
                            const currentSettings = await getBotSettings();
                            const currentTimeStr = formatOperationStatus(currentSettings);
                            replyText = [
                                '⏰ *ATUR STATUS BOT*',
                                '',
                                `📌 Status saat ini: *${currentTimeStr}*`,
                                '',
                                '1️⃣ Buka Sekarang',
                                '2️⃣ Tutup Sekarang',
                                '3️⃣ Kembali ke Default (00.00 - 06.05)',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else {
                            const parsed = parseAdminWibDateTimeToIso(rawTrim);
                            if (!parsed) {
                                replyText = '⚠️ Format salah. Gunakan *DD-MM-YYYY HH:mm* (contoh: 22-02-2026 00:01).';
                            } else {
                                closeWindowDraftByPhone.set(senderPhone, {
                                    startIso: parsed.iso,
                                    startDisplay: parsed.display,
                                });
                                adminFlowByPhone.set(senderPhone, 'SETTING_MANUAL_CLOSE_END');
                                replyText = [
                                    `✅ Mulai tutup diset: *${parsed.display} WIB*`,
                                    '',
                                    'Sekarang masukkan *Tanggal & Jam SELESAI tutup*.',
                                    'Format: *DD-MM-YYYY HH:mm*',
                                    'Contoh: *22-02-2026 23:59*',
                                    '',
                                    '_Ketik 0 untuk batal._',
                                ].join('\n');
                            }
                        }
                    } else if (currentAdminFlow === 'SETTING_MANUAL_CLOSE_END') {
                        if (normalized === '0') {
                            closeWindowDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'SETTING_OPERATION_MENU');
                            const currentSettings = await getBotSettings();
                            const currentTimeStr = formatOperationStatus(currentSettings);
                            replyText = [
                                '⏰ *ATUR STATUS BOT*',
                                '',
                                `📌 Status saat ini: *${currentTimeStr}*`,
                                '',
                                '1️⃣ Buka Sekarang',
                                '2️⃣ Tutup Sekarang',
                                '3️⃣ Kembali ke Default (00.00 - 06.00)',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else {
                            const draft = closeWindowDraftByPhone.get(senderPhone);
                            if (!draft) {
                                adminFlowByPhone.set(senderPhone, 'SETTING_MANUAL_CLOSE_START');
                                replyText = '⚠️ Sesi pengaturan hilang. Ulangi input tanggal mulai tutup.';
                            } else {
                                const parsedEnd = parseAdminWibDateTimeToIso(rawTrim);
                                if (!parsedEnd) {
                                    replyText = '⚠️ Format salah. Gunakan *DD-MM-YYYY HH:mm* (contoh: 22-02-2026 23:59).';
                                } else {
                                    const startMs = new Date(draft.startIso).getTime();
                                    const endMs = new Date(parsedEnd.iso).getTime();

                                    if (endMs <= startMs) {
                                        replyText = '⚠️ Tanggal/jam selesai harus lebih besar dari mulai tutup.';
                                    } else {
                                        const ok = await updateBotSettings({
                                            manual_close_start: draft.startIso,
                                            manual_close_end: parsedEnd.iso,
                                        });

                                        clearBotSettingsCache();
                                        closeWindowDraftByPhone.delete(senderPhone);
                                        adminFlowByPhone.set(senderPhone, 'MENU');

                                        replyText = ok
                                            ? [
                                                '✅ *TUTUP MANUAL BERHASIL DIAKTIFKAN*',
                                                '',
                                                `🕒 Mulai: *${draft.startDisplay} WIB*`,
                                                `🕒 Sampai: *${parsedEnd.display} WIB*`,
                                                '',
                                                'User tidak bisa input data pada periode tersebut.',
                                            ].join('\n')
                                            : '❌ Gagal menyimpan periode tutup manual. Coba lagi.';
                                    }
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'RECAP_SPECIFIC_MENU') {
                        // SUB-MENU REKAP TANGGAL TERTENTU
                        if (normalized === '1') {
                            // Rekap Kemarin
                            const yesterday = shiftIsoDate(processingDayKey, -1);
                            await sock.sendMessage(remoteJid, { text: '⏳ Mengambil data kemarin...' });
                            replyText = await getGlobalRecap(yesterday, undefined, lookupName);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '2') {
                            // Input Tanggal Manual
                            adminFlowByPhone.set(senderPhone, 'ASK_DATE');
                            replyText = ['📅 *INPUT TANGGAL MANUAL*', '', `Contoh: *${dmyExample}*`, '', '_Ketik 0 untuk batal._'].join('\n');
                        } else {
                            // Batal
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = '✅ Dibatalkan.';
                        }
                    } else if (currentAdminFlow === 'SEARCH_DATA') {
                        // SEARCH ALL DATA
                        const q = rawTrim;
                        const qUpper = q.toUpperCase();
                        const digits = q.replace(/\D/g, '');

                        // Cari nomor HP dari nama kontak WA yang cocok
                        const matchedPhones: string[] = [];
                        const allContacts = await getAllLidPhoneMap();
                        allContacts.forEach(c => {
                            if (c.push_name && c.push_name.toUpperCase().includes(qUpper)) {
                                matchedPhones.push(c.phone_number);
                            }
                        });

                        let query = supabase
                            .from('data_harian')
                            .select('*')
                            .order('received_at', { ascending: false })
                            .limit(30);

                        // Build OR condition
                        const orParts: string[] = [];
                        if (q.length >= 2) orParts.push(`nama.ilike.%${qUpper}%`);
                        if (digits.length >= 4) {
                            orParts.push(`no_kjp.eq.${digits}`);
                            orParts.push(`no_ktp.eq.${digits}`);
                            orParts.push(`sender_phone.eq.${digits}`);
                        }
                        // Tambahkan pencarian berdasarkan nama pengirim WA
                        matchedPhones.forEach(phone => {
                            orParts.push(`sender_phone.eq.${phone}`);
                        });

                        if (orParts.length === 0) {
                            replyText = '⚠️ Keyword terlalu pendek. Minimal 2 huruf atau 4 digit.';
                        } else {
                            const { data, error } = await query.or(orParts.join(','));

                            if (error || !data || data.length === 0) {
                                replyText = `❌ *DATA TIDAK DITEMUKAN*\nKeyword: "${q}"`;
                            } else {
                                const lines = [
                                    `🔍 *HASIL PENCARIAN: "${q}"*`,
                                    `📊 Ditemukan: ${data.length} data (max 30)`,
                                    ''
                                ];

                                (data as any[]).forEach((row, i) => {
                                    const dateDisplay = String(row.processing_day_key).split('-').reverse().join('-');
                                    const senderName = getContactName(row.sender_phone) || getRegisteredUserNameSync(row.sender_phone) || row.sender_phone;
                                    const jenisKartu = resolveCardTypeLabel(row.no_kjp, row.jenis_kartu);
                                    lines.push(`${i + 1}. *${row.nama}* (${dateDisplay})`);
                                    lines.push(`   💳 ${jenisKartu}: ${row.no_kjp}`);
                                    lines.push(`   📱 Pengirim: ${senderName}`);
                                    lines.push('');
                                });

                                replyText = lines.join('\n');
                            }
                        }
                        adminFlowByPhone.set(senderPhone, 'MENU');
                    } else if (currentAdminFlow === 'ASK_DATE') {
                        const iso = toIsoFromDMY(rawTrim);
                        replyText = !iso ? '⚠️ Format salah.' : await getGlobalRecap(iso, undefined, lookupName);
                        if (iso) adminFlowByPhone.set(senderPhone, 'MENU');
                    } else if (currentAdminFlow === 'ASK_RANGE') {
                        const parts = rawTrim.split(/\s+/);
                        const d1 = toIsoFromDMY(parts[0]);
                        const d2 = toIsoFromDMY(parts[1]);
                        replyText = (!d1 || !d2) ? '⚠️ Format salah.' : await getGlobalRecap(d1, d2, lookupName);
                        if (d1 && d2) adminFlowByPhone.set(senderPhone, 'MENU');
                    } else if (currentAdminFlow === 'RESET_CONFIRM') {
                        if (normalized === '1') {
                            await sock.sendMessage(remoteJid, { text: '⏳ Menghapus...' });
                            replyText = (await clearDatabaseForProcessingDayKey(processingDayKey)) ? '✅ Berhasil.' : '❌ Gagal.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = '✅ Dibatalkan.';
                        } else replyText = '⚠️ Pilih 1 atau 2.';
                    } else if (currentAdminFlow === 'ADD_CONTACT' || currentAdminFlow === 'EDIT_CONTACT') {
                        const phoneInput = extractManualPhone(rawTrim);
                        if (phoneInput) {
                            const nameInput = rawTrim.replace(phoneInput, '')
                                .replace(phoneInput.replace('62', '0'), '')
                                .replace(/\d{9,}/g, '')
                                .replace(/[#\-]/g, '')
                                .trim();
                            if (nameInput.length > 2) {
                                // Assume LID JID is just phone@s.whatsapp.net for manual entry if we don't know the LID
                                const targetJid = phoneInput + '@s.whatsapp.net';
                                await upsertLidPhoneMap({
                                    lid_jid: targetJid,
                                    phone_number: phoneInput,
                                    push_name: nameInput
                                });
                                replyText = `✅ Sukses simpan: ${nameInput} (${phoneInput})`;
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                replyText = '⚠️ Nama terlalu pendek/kosong. Ulangi format: Nama Nomor';
                            }
                        } else {
                            replyText = '⚠️ Nomor HP tidak terbaca. Ulangi format: Nama Nomor';
                        }
                    } else if (currentAdminFlow === 'CHECK_CONTACT') {
                        const phoneInput = extractManualPhone(rawTrim);
                        if (phoneInput) {
                            const name = await getNameFromLidPhoneMap(phoneInput);
                            replyText = name ? `👤 Nama: *${name}*\n📱 HP: ${phoneInput}` : `❌ Nomor ${phoneInput} belum terdaftar.`;
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            replyText = '⚠️ Format nomor salah.';
                        }
                    } else if (currentAdminFlow === 'DELETE_CONTACT') {
                        if (rawTrim === '0') {
                            replyText = '✅ Hapus kontak dibatalkan.';
                            adminContactCache.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            // Coba parse index: "1, 2, 5" atau "1 2 5"
                            const parts = rawTrim.split(/[,\s]+/);
                            const indices = parts.map((p: string) => parseInt(p.trim())).filter((n: number) => !isNaN(n) && n > 0);

                            // Jika input terlihat seperti daftar angka (index), gunakan logic delete by index
                            // Syarat: minimal 1 angka valid dan input tidak terlalu panjang (bukan nomor HP)
                            const looksLikeIndex = indices.length > 0 && (indices.length > 1 || String(indices[0]).length < 5);

                            if (looksLikeIndex) {
                                // AMBIL DARI CACHE (SNAPSHOT) AGAR INDEX TIDAK BERGESER
                                let contactsList = adminContactCache.get(senderPhone);

                                // Fallback: Jika cache kosong (misal bot restart), fetch baru
                                if (!contactsList || contactsList.length === 0) {
                                    contactsList = await getAllLidPhoneMap();
                                }

                                let successCount = 0;
                                let deletedNames: string[] = [];

                                for (const idx of indices) {
                                    const target = contactsList[idx - 1]; // 0-based
                                    if (target) {
                                        // Delete by phone number (Idempotent: aman kalau dipanggil 2x)
                                        const ok = await deleteLidPhoneMap(target.phone_number);
                                        if (ok) {
                                            successCount++;
                                            deletedNames.push(target.push_name || target.phone_number);
                                        }
                                    }
                                }

                                if (successCount > 0) {
                                    replyText = `✅ Berhasil menghapus ${successCount} kontak:\n- ${deletedNames.join('\n- ')}`;
                                } else {
                                    replyText = '❌ Gagal menghapus atau nomor urut salah/sudah terhapus.';
                                }

                                // Bersihkan cache setelah selesai
                                adminContactCache.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                // Fallback: mungkin user input nomor HP manual (legacy support)
                                const phoneInput = extractManualPhone(rawTrim);
                                if (phoneInput) {
                                    const deleted = await deleteLidPhoneMap(phoneInput);
                                    replyText = deleted ? `✅ Berhasil menghapus data ${phoneInput}` : `❌ Gagal/Data tidak ditemukan.`;
                                    adminContactCache.delete(senderPhone);
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                } else {
                                    replyText = '⚠️ Input tidak valid. Masukkan angka nomor urut (contoh: 1, 3). Ketik 0 untuk batal.';
                                }
                            }
                        }
                        // ===== NEW: KELOLA KONTAK FLOW =====
                    } else if (currentAdminFlow === 'CONTACT_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            contactSessionByPhone.delete(senderPhone);
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_SEARCH');
                            replyText = ['🔍 *CARI KONTAK*', '', '👇 Ketik nama atau nomor HP yang dicari:', '(Contoh: Budi atau 0812)', '', '_Ketik 0 untuk kembali._'].join('\n');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_ADD_NAME');
                            replyText = ['➕ *TAMBAH KONTAK BARU*', '', '👇 Ketik nama kontak baru:', '(Contoh: Budi Pasarjaya)', '', '_Ketik 0 untuk batal._'].join('\n');
                        } else if (normalized === '3') {
                            const allContacts = await getAllLidPhoneMap();
                            if (allContacts.length === 0) {
                                replyText = '📂 Belum ada kontak terdaftar.';
                            } else {
                                contactSessionByPhone.set(senderPhone, { searchResults: allContacts });
                                adminFlowByPhone.set(senderPhone, 'CONTACT_SELECT');
                                let msg = `📂 *SEMUA KONTAK (${allContacts.length})*\n\n`;
                                for (let i = 0; i < allContacts.length; i++) {
                                    const c = allContacts[i];
                                    msg += `${i + 1}. ${c.push_name || '(Tanpa Nama)'} (${c.phone_number})\n`;
                                    if (msg.length > 3500) { msg += '\n...(List dipotong)...\n'; break; }
                                }
                                msg += '\n👇 Ketik nomor urut untuk pilih kontak.\n_Ketik 0 untuk kembali._';
                                replyText = msg;
                            }
                        } else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'DELETE_CONTACT');
                            const allContacts = await getAllLidPhoneMap();

                            adminContactCache.set(senderPhone, allContacts);

                            if (allContacts.length === 0) {
                                replyText = '📂 Tidak ada kontak untuk dihapus.';
                                adminFlowByPhone.set(senderPhone, 'CONTACT_MENU');
                            } else {
                                let msg = '🗑️ *HAPUS KONTAK*\n\n';
                                for (let i = 0; i < allContacts.length; i++) {
                                    const c = allContacts[i];
                                    msg += `${i + 1}. ${c.push_name || '(Tanpa Nama)'} (${c.phone_number})\n`;
                                    if (msg.length > 3500) {
                                        msg += '\n...(List dipotong, terlalu panjang)...';
                                        break;
                                    }
                                }
                                msg += '\n👇 *Ketik nomor urut yg ingin dihapus (bisa banyak, pisah koma/spasi)*\nContoh: 1, 3, 5\n\n_Ketik 0 untuk batal._';
                                replyText = msg;
                            }
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-4 atau 0 untuk kembali.';
                        }
                    } else if (currentAdminFlow === 'CONTACT_SEARCH') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_MENU');
                            replyText = ['👥 *KELOLA KONTAK*', '', '1️⃣ 🔍 Cari Kontak', '2️⃣ ➕ Tambah Kontak Baru', '3️⃣ 📂 Lihat Semua Kontak', '4️⃣ 🗑️ Hapus Kontak', '', '0️⃣ 🔙 Kembali ke Menu Admin'].join('\n');
                        } else {
                            const keyword = rawTrim.toUpperCase();
                            const digitsOnly = rawTrim.replace(/\D/g, '');
                            const allContacts = await getAllLidPhoneMap();
                            const results = allContacts.filter(c => {
                                const nameMatch = c.push_name && c.push_name.toUpperCase().includes(keyword);
                                const phoneMatch = digitsOnly.length >= 4 && c.phone_number.includes(digitsOnly);
                                return nameMatch || phoneMatch;
                            });
                            if (results.length === 0) {
                                replyText = `❌ Tidak ditemukan kontak "${rawTrim}".\n\n👇 Coba keyword lain atau ketik 0 untuk kembali.`;
                            } else {
                                contactSessionByPhone.set(senderPhone, { searchResults: results });
                                adminFlowByPhone.set(senderPhone, 'CONTACT_SELECT');
                                let msg = `🔍 *HASIL PENCARIAN: "${rawTrim}"*\n📊 Ditemukan: ${results.length} kontak\n\n`;
                                for (let i = 0; i < results.length; i++) {
                                    const c = results[i];
                                    msg += `${i + 1}. ${c.push_name || '(Tanpa Nama)'} (${c.phone_number})\n`;
                                    if (msg.length > 3500) { msg += '\n...(List dipotong)...\n'; break; }
                                }
                                msg += '\n👇 Ketik nomor urut untuk pilih kontak.\n_Ketik 0 untuk kembali._';
                                replyText = msg;
                            }
                        }
                    } else if (currentAdminFlow === 'CONTACT_SELECT') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_MENU');
                            contactSessionByPhone.delete(senderPhone);
                            replyText = ['👥 *KELOLA KONTAK*', '', '1️⃣ 🔍 Cari Kontak', '2️⃣ ➕ Tambah Kontak Baru', '3️⃣ 📂 Lihat Semua Kontak', '4️⃣ 🗑️ Hapus Kontak', '', '0️⃣ 🔙 Kembali ke Menu Admin'].join('\n');
                        } else {
                            const session = contactSessionByPhone.get(senderPhone);
                            const choice = parseInt(normalized);
                            if (!session || !session.searchResults) {
                                replyText = '❌ Sesi hilang. Silakan ulangi dari Menu Kelola Kontak.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else if (isNaN(choice) || choice < 1 || choice > session.searchResults.length) {
                                replyText = `⚠️ Nomor urut tidak valid (1 - ${session.searchResults.length}).\n_Ketik 0 untuk kembali._`;
                            } else {
                                const selected = session.searchResults[choice - 1];
                                session.selectedContact = selected;
                                contactSessionByPhone.set(senderPhone, session);
                                adminFlowByPhone.set(senderPhone, 'CONTACT_DETAIL');
                                const ph = selected.phone_number.startsWith('62') ? '0' + selected.phone_number.slice(2) : selected.phone_number;
                                replyText = ['👤 *DETAIL KONTAK*', '━━━━━━━━━━━━━━━━━━━━━', `📛 Nama : *${selected.push_name || '(Tanpa Nama)'}*`, `📱 Nomor: ${ph}`, '━━━━━━━━━━━━━━━━━━━━━', '', '👇 *Pilih Aksi:*', '1️⃣ ✏️ Edit Nama', '2️⃣ 📱 Edit Nomor HP', '3️⃣ 🗑️ Hapus Kontak', '', '0️⃣ 🔙 Kembali'].join('\n');
                            }
                        }
                    } else if (currentAdminFlow === 'CONTACT_DETAIL') {
                        const session = contactSessionByPhone.get(senderPhone);
                        if (!session || !session.selectedContact) {
                            replyText = '❌ Sesi hilang. Ulangi dari Menu Admin.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_SELECT');
                            const results = session.searchResults || [];
                            let msg = `📂 *DAFTAR KONTAK (${results.length})*\n\n`;
                            for (let i = 0; i < results.length; i++) {
                                const c = results[i];
                                msg += `${i + 1}. ${c.push_name || '(Tanpa Nama)'} (${c.phone_number})\n`;
                                if (msg.length > 3500) { msg += '\n...(List dipotong)...\n'; break; }
                            }
                            msg += '\n👇 Ketik nomor urut.\n_Ketik 0 untuk kembali._';
                            replyText = msg;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_EDIT_NAME');
                            replyText = ['✏️ *EDIT NAMA*', `Nama Saat Ini: *${session.selectedContact.push_name || '(Tanpa Nama)'}*`, '', '👇 Ketik nama baru:', '', '_Ketik 0 untuk batal._'].join('\n');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_EDIT_PHONE');
                            const ph = session.selectedContact.phone_number.startsWith('62') ? '0' + session.selectedContact.phone_number.slice(2) : session.selectedContact.phone_number;
                            replyText = ['📱 *EDIT NOMOR HP*', `Nomor Saat Ini: *${ph}*`, '', '👇 Ketik nomor HP baru:', '(Contoh: 08123456789)', '', '_Ketik 0 untuk batal._'].join('\n');
                        } else if (normalized === '3') {
                            const target = session.selectedContact;
                            const ok = await deleteLidPhoneMap(target.phone_number);
                            replyText = ok ? `✅ Kontak *${target.push_name || target.phone_number}* berhasil dihapus.` : '❌ Gagal menghapus kontak.';
                            contactSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, atau 3.';
                        }
                    } else if (currentAdminFlow === 'CONTACT_EDIT_NAME') {
                        const session = contactSessionByPhone.get(senderPhone);
                        if (!session || !session.selectedContact) {
                            replyText = '❌ Sesi hilang.'; adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_DETAIL');
                            const s = session.selectedContact;
                            const ph = s.phone_number.startsWith('62') ? '0' + s.phone_number.slice(2) : s.phone_number;
                            replyText = ['👤 *DETAIL KONTAK*', '━━━━━━━━━━━━━━━━━━━━━', `📛 Nama : *${s.push_name || '(Tanpa Nama)'}*`, `📱 Nomor: ${ph}`, '━━━━━━━━━━━━━━━━━━━━━', '', '1️⃣ ✏️ Edit Nama', '2️⃣ 📱 Edit Nomor HP', '3️⃣ 🗑️ Hapus Kontak', '0️⃣ 🔙 Kembali'].join('\n');
                        } else {
                            const newName = rawTrim;
                            if (newName.length < 2) {
                                replyText = '⚠️ Nama terlalu pendek (min 2 karakter). Coba lagi.';
                            } else {
                                const target = session.selectedContact;
                                await upsertLidPhoneMap({ lid_jid: target.phone_number + '@s.whatsapp.net', phone_number: target.phone_number, push_name: newName });
                                replyText = `✅ Nama berhasil diubah!\n\n📛 *${target.push_name}* ➜ *${newName}*\n📱 Nomor: ${target.phone_number}`;
                                contactSessionByPhone.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }
                    } else if (currentAdminFlow === 'CONTACT_EDIT_PHONE') {
                        const session = contactSessionByPhone.get(senderPhone);
                        if (!session || !session.selectedContact) {
                            replyText = '❌ Sesi hilang.'; adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_DETAIL');
                            const s = session.selectedContact;
                            const ph = s.phone_number.startsWith('62') ? '0' + s.phone_number.slice(2) : s.phone_number;
                            replyText = ['👤 *DETAIL KONTAK*', '━━━━━━━━━━━━━━━━━━━━━', `📛 Nama : *${s.push_name || '(Tanpa Nama)'}*`, `📱 Nomor: ${ph}`, '━━━━━━━━━━━━━━━━━━━━━', '', '1️⃣ ✏️ Edit Nama', '2️⃣ 📱 Edit Nomor HP', '3️⃣ 🗑️ Hapus Kontak', '0️⃣ 🔙 Kembali'].join('\n');
                        } else {
                            const newPhone = extractManualPhone(rawTrim);
                            if (!newPhone) {
                                replyText = '⚠️ Format nomor HP tidak valid. Contoh: 08123456789';
                            } else {
                                const target = session.selectedContact;
                                await deleteLidPhoneMap(target.phone_number);
                                await upsertLidPhoneMap({ lid_jid: newPhone + '@s.whatsapp.net', phone_number: newPhone, push_name: target.push_name });
                                const oldD = target.phone_number.startsWith('62') ? '0' + target.phone_number.slice(2) : target.phone_number;
                                const newD = newPhone.startsWith('62') ? '0' + newPhone.slice(2) : newPhone;
                                replyText = `✅ Nomor berhasil diubah!\n\n📛 Nama: *${target.push_name}*\n📱 *${oldD}* ➜ *${newD}*`;
                                contactSessionByPhone.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }
                    } else if (currentAdminFlow === 'CONTACT_ADD_NAME') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_MENU');
                            contactSessionByPhone.delete(senderPhone);
                            replyText = ['👥 *KELOLA KONTAK*', '', '1️⃣ 🔍 Cari Kontak', '2️⃣ ➕ Tambah Kontak Baru', '3️⃣ 📂 Lihat Semua Kontak', '4️⃣ 🗑️ Hapus Kontak', '', '0️⃣ 🔙 Kembali ke Menu Admin'].join('\n');
                        } else {
                            if (rawTrim.length < 2) {
                                replyText = '⚠️ Nama terlalu pendek (min 2 karakter). Coba lagi.';
                            } else {
                                contactSessionByPhone.set(senderPhone, { newContactName: rawTrim });
                                adminFlowByPhone.set(senderPhone, 'CONTACT_ADD_PHONE');
                                replyText = ['➕ *TAMBAH KONTAK BARU*', `📛 Nama: *${rawTrim}*`, '', '👇 Sekarang ketik nomor HP:', '(Contoh: 08123456789)', '', '_Ketik 0 untuk batal._'].join('\n');
                            }
                        }
                    } else if (currentAdminFlow === 'CONTACT_ADD_PHONE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CONTACT_MENU');
                            contactSessionByPhone.delete(senderPhone);
                            replyText = ['👥 *KELOLA KONTAK*', '', '1️⃣ 🔍 Cari Kontak', '2️⃣ ➕ Tambah Kontak Baru', '3️⃣ 📂 Lihat Semua Kontak', '4️⃣ 🗑️ Hapus Kontak', '', '0️⃣ 🔙 Kembali ke Menu Admin'].join('\n');
                        } else {
                            const session = contactSessionByPhone.get(senderPhone);
                            const newPhone = extractManualPhone(rawTrim);
                            if (!newPhone) {
                                replyText = '⚠️ Format nomor HP tidak valid. Contoh: 08123456789';
                            } else {
                                const contactName = session?.newContactName || 'Kontak Baru';
                                await upsertLidPhoneMap({ lid_jid: newPhone + '@s.whatsapp.net', phone_number: newPhone, push_name: contactName });
                                replyText = `✅ Kontak baru ditambahkan!\n\n📛 Nama: *${contactName}*\n📱 Nomor: ${newPhone}`;
                                contactSessionByPhone.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }

                    } else if (currentAdminFlow === 'BLOCKED_KJP_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_ADD');
                            replyText = [
                                '🛡️ *TAMBAH BLOKIR NO KJP*',
                                '',
                                'Ketik satu atau beberapa baris.',
                                'Format tiap baris: nomor, alasan (opsional)',
                                'Contoh:',
                                '5049489000000001, KJP bermasalah',
                                '5049489000000002',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            const list = await getBlockedKjpList(200);
                            if (list.length === 0) {
                                replyText = '📂 Belum ada No KJP yang diblokir.';
                            } else {
                                const lines = ['📋 *DAFTAR NO KJP TERBLOKIR*', ''];
                                list.forEach((row, idx) => {
                                    const reasonText = row.reason ? ` - ${row.reason}` : '';
                                    lines.push(`${idx + 1}. ${row.no_kjp}${reasonText}`);
                                });
                                lines.push('');
                                lines.push('_Ketik 3 untuk buka blokir._');
                                replyText = lines.join('\n');
                            }
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_DELETE');
                            replyText = [
                                '♻️ *BUKA BLOKIR NO KJP*',
                                '',
                                'Ketik No KJP yang ingin dibuka blokirnya (16-18 digit).',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KJP_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_MENU');
                            replyText = buildBlockedKjpMenuText();
                        } else {
                            const bulkValidationError = validateBlockedBulkAddInput(rawTrim);
                            if (bulkValidationError) {
                                replyText = `${bulkValidationError}\n\n${buildBlockedKjpMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_MENU');
                            } else {
                                const items = parseBlockedBulkAddInput(rawTrim);
                                if (items.length === 0) {
                                    replyText = [
                                        '⚠️ Tidak ada baris yang bisa diproses.',
                                        '',
                                        'Ketik satu atau beberapa baris.',
                                        'Format tiap baris: nomor, alasan (opsional)',
                                        '',
                                        '_Ketik 0 untuk kembali._'
                                    ].join('\n');
                                } else {
                                    const summary = await buildBlockedBulkAddSummary('HASIL TAMBAH BLOKIR NO KJP', items, addBlockedKjp);
                                    replyText = `${summary}\n\n${buildBlockedKjpMenuText()}`;
                                    adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KJP_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_MENU');
                            replyText = buildBlockedKjpMenuText();
                        } else {
                            const result = await removeBlockedKjp(rawTrim);
                            replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                            replyText += '\n\n' + buildBlockedKjpMenuText();
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KJP_MENU');
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KTP_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_ADD_PERMANENT');
                            replyText = [
                                '🛡️ *TAMBAH BLOKIR PERMANEN NO KTP*',
                                '',
                                'Ketik satu atau beberapa baris.',
                                'Format tiap baris: nomor, alasan (opsional)',
                                'Contoh:',
                                '3173010202020001, KTP bermasalah',
                                '3173010202020002',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_ADD_TEMPORARY');
                            replyText = [
                                '🛡️ *TAMBAH BLOKIR SEMENTARA NO KTP*',
                                '',
                                'Ketik satu atau beberapa baris.',
                                'Format tiap baris: nomor, alasan (opsional)',
                                'Contoh:',
                                '3173010202020001, KTP bermasalah',
                                '3173010202020002',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '3') {
                            const list = await getBlockedKtpList(200);
                            const permanent = list.filter((r: { block_type?: string }) => r.block_type === 'permanent');
                            const temporary = list.filter((r: { block_type?: string }) => (r.block_type || 'temporary') === 'temporary');
                            const lines = ['📋 *DAFTAR BLOKIR NO KTP*', ''];
                            lines.push(`🔴 *BLOKIR PERMANEN* (${permanent.length})`);
                            if (permanent.length === 0) {
                                lines.push('Belum ada.');
                            } else {
                                permanent.forEach((row, idx) => {
                                    lines.push(`${idx + 1}. ${row.no_ktp}${row.reason ? ` - ${row.reason}` : ''}`);
                                });
                            }
                            lines.push('');
                            lines.push(`🟡 *BLOKIR SEMENTARA* (${temporary.length})`);
                            if (temporary.length === 0) {
                                lines.push('Belum ada.');
                            } else {
                                temporary.forEach((row, idx) => {
                                    lines.push(`${idx + 1}. ${row.no_ktp}${row.reason ? ` - ${row.reason}` : ''}`);
                                });
                            }
                            replyText = lines.join('\n');
                            replyText += '\n\n' + buildBlockedKtpMenuText();
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                        } else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_DELETE');
                            replyText = [
                                '🛡️ *HAPUS BLOKIR NO KTP*',
                                '',
                                'Ketik No KTP yang ingin dihapus blokirnya.',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '5') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_CHANGE_TYPE');
                            replyText = [
                                '🔄 *UBAH JENIS BLOKIR NO KTP*',
                                '',
                                'Masukkan No KTP yang ingin diubah jenis blokirnya:',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-5 atau 0.';
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KTP_ADD_PERMANENT') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            replyText = buildBlockedKtpMenuText();
                        } else {
                            const bulkValidationError = validateBlockedBulkAddInput(rawTrim);
                            if (bulkValidationError) {
                                replyText = `${bulkValidationError}\n\n${buildBlockedKtpMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            } else {
                                const items = parseBlockedBulkAddInput(rawTrim);
                                if (items.length === 0) {
                                    replyText = [
                                        '⚠️ Tidak ada baris yang bisa diproses.',
                                        '',
                                        'Ketik satu atau beberapa baris.',
                                        'Format tiap baris: nomor, alasan (opsional)',
                                        '',
                                        '_Ketik 0 untuk kembali._'
                                    ].join('\n');
                                } else {
                                    const summary = await buildBlockedBulkAddSummary(
                                        'HASIL TAMBAH BLOKIR PERMANEN NO KTP',
                                        items,
                                        (nomor: string, alasan?: string) => addBlockedKtp(nomor, alasan, 'permanent')
                                    );
                                    replyText = `${summary}\n\n${buildBlockedKtpMenuText()}`;
                                    adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KTP_ADD_TEMPORARY') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            replyText = buildBlockedKtpMenuText();
                        } else {
                            const bulkValidationError = validateBlockedBulkAddInput(rawTrim);
                            if (bulkValidationError) {
                                replyText = `${bulkValidationError}\n\n${buildBlockedKtpMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            } else {
                                const items = parseBlockedBulkAddInput(rawTrim);
                                if (items.length === 0) {
                                    replyText = [
                                        '⚠️ Tidak ada baris yang bisa diproses.',
                                        '',
                                        'Ketik satu atau beberapa baris.',
                                        'Format tiap baris: nomor, alasan (opsional)',
                                        '',
                                        '_Ketik 0 untuk kembali._'
                                    ].join('\n');
                                } else {
                                    const summary = await buildBlockedBulkAddSummary(
                                        'HASIL TAMBAH BLOKIR SEMENTARA NO KTP',
                                        items,
                                        (nomor: string, alasan?: string) => addBlockedKtp(nomor, alasan, 'temporary')
                                    );
                                    replyText = `${summary}\n\n${buildBlockedKtpMenuText()}`;
                                    adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KTP_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            replyText = buildBlockedKtpMenuText();
                        } else {
                            const result = await removeBlockedKtp(rawTrim);
                            if (result.success) {
                                replyText = `✅ ${result.message}`;
                            } else {
                                replyText = `❌ ${result.message}`;
                            }
                            replyText += '\n\n' + buildBlockedKtpMenuText();
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KTP_CHANGE_TYPE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            replyText = buildBlockedKtpMenuText();
                        } else {
                            const noKtp = rawTrim.replace(/\D/g, '');
                            if (noKtp.length !== 16) {
                                replyText = '⚠️ No KTP harus 16 digit. Silakan coba lagi.\n\n_Ketik 0 untuk kembali._';
                            } else {
                                const { data: existing } = await supabase.from('blocked_ktp').select('no_ktp, block_type').eq('no_ktp', noKtp).maybeSingle();
                                if (!existing) {
                                    replyText = `❌ KTP ${noKtp} tidak ditemukan di daftar blokir.\n\n_Ketik 0 untuk kembali._`;
                                } else {
                                    const currentType: 'permanent' | 'temporary' = existing.block_type === 'permanent' ? 'permanent' : 'temporary';
                                    const newType: 'permanent' | 'temporary' = currentType === 'permanent' ? 'temporary' : 'permanent';
                                    const currentLabel = currentType === 'permanent' ? 'Permanen' : 'Sementara';
                                    const newLabel = newType === 'permanent' ? 'Permanen' : 'Sementara';
                                    pendingKtpTypeChange.set(senderPhone, { noKtp, currentType, newType });
                                    adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_CHANGE_TYPE_CONFIRM');
                                    replyText = [
                                        `KTP *${noKtp}* saat ini berstatus *${currentLabel}*.`,
                                        `Ubah ke *${newLabel}*?`,
                                        '',
                                        'Ketik *YA* atau *TIDAK*'
                                    ].join('\n');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KTP_CHANGE_TYPE_CONFIRM') {
                        if (normalized === '0') {
                            pendingKtpTypeChange.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            replyText = buildBlockedKtpMenuText();
                        } else {
                            const pending = pendingKtpTypeChange.get(senderPhone);
                            if (!pending) {
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                                replyText = '⚠️ Sesi telah berakhir.\n\n' + buildBlockedKtpMenuText();
                            } else if (normalized === 'YA') {
                                const result = await changeBlockedKtpType(pending.noKtp, pending.newType);
                                replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                                replyText += '\n\n' + buildBlockedKtpMenuText();
                                pendingKtpTypeChange.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            } else if (normalized === 'TIDAK') {
                                replyText = 'Dibatalkan.\n\n' + buildBlockedKtpMenuText();
                                pendingKtpTypeChange.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KTP_MENU');
                            } else {
                                replyText = '⚠️ Ketik *YA* atau *TIDAK*.';
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KK_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_ADD');
                            replyText = [
                                '🛡️ *TAMBAH BLOKIR NO KK*',
                                '',
                                'Ketik satu atau beberapa baris.',
                                'Format tiap baris: nomor, alasan (opsional)',
                                'Contoh:',
                                '3173010202020001, KK bermasalah',
                                '3173010202020002',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            const list = await getBlockedKkList(200);
                            if (list.length === 0) {
                                replyText = '📂 Belum ada No KK yang diblokir.';
                            } else {
                                const lines = ['📋 *DAFTAR NO KK TERBLOKIR*', ''];
                                list.forEach((row, idx) => {
                                    const reasonText = row.reason ? ` - ${row.reason}` : '';
                                    lines.push(`${idx + 1}. ${row.no_kk}${reasonText}`);
                                });
                                lines.push('');
                                lines.push('_Ketik 3 untuk buka blokir._');
                                replyText = lines.join('\n');
                            }
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_DELETE');
                            replyText = [
                                '♻️ *BUKA BLOKIR NO KK*',
                                '',
                                'Ketik No KK yang ingin dibuka blokirnya (16 digit).',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KK_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_MENU');
                            replyText = buildBlockedKkMenuText();
                        } else {
                            const bulkValidationError = validateBlockedBulkAddInput(rawTrim);
                            if (bulkValidationError) {
                                replyText = `${bulkValidationError}\n\n${buildBlockedKkMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_MENU');
                            } else {
                                const items = parseBlockedBulkAddInput(rawTrim);
                                if (items.length === 0) {
                                    replyText = [
                                        '⚠️ Tidak ada baris yang bisa diproses.',
                                        '',
                                        'Ketik satu atau beberapa baris.',
                                        'Format tiap baris: nomor, alasan (opsional)',
                                        '',
                                        '_Ketik 0 untuk kembali._'
                                    ].join('\n');
                                } else {
                                    const summary = await buildBlockedBulkAddSummary('HASIL TAMBAH BLOKIR NO KK', items, addBlockedKk);
                                    replyText = `${summary}\n\n${buildBlockedKkMenuText()}`;
                                    adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_KK_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_MENU');
                            replyText = buildBlockedKkMenuText();
                        } else {
                            const result = await removeBlockedKk(rawTrim);
                            if (result.success) {
                                replyText = `✅ ${result.message}`;
                            } else {
                                replyText = `❌ ${result.message}`;
                            }
                            replyText += '\n\n' + buildBlockedKkMenuText();
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_KK_MENU');
                        }
                    } else if (currentAdminFlow === 'CARD_PREFIX_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            const map = getCardPrefixMap();
                            const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
                            if (entries.length === 0) {
                                replyText = '📂 Belum ada prefix tersimpan.';
                            } else {
                                const lines = ['📋 *DAFTAR PREFIX KARTU*', ''];
                                entries.forEach(([prefix, jenis], idx) => {
                                    lines.push(`${idx + 1}. ${prefix} -> ${jenis}`);
                                });
                                replyText = lines.join('\n');
                            }
                            replyText += '\n\n' + buildCardPrefixMenuText();
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_MENU');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_ADD');
                            replyText = [
                                '➕ *TAMBAH/UBAH PREFIX KARTU*',
                                '',
                                'Format: *PREFIX|JENIS*',
                                'Contoh: *50494890|RUSUN*',
                                '',
                                `Jenis valid: ${getCardTypeChoicesText()}`,
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_DELETE');
                            replyText = [
                                '🗑️ *HAPUS PREFIX KARTU*',
                                '',
                                'Ketik prefix 8 digit yang mau dihapus.',
                                'Contoh: *50494890*',
                                '',
                                '_Prefix 50494885 tidak bisa dihapus._',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'CARD_PREFIX_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_MENU');
                            replyText = buildCardPrefixMenuText();
                        } else {
                            const [rawPrefix, rawJenis] = rawTrim.split('|').map((x: string) => (x || '').trim());
                            if (!rawPrefix || !rawJenis) {
                                replyText = '⚠️ Format salah. Gunakan *PREFIX|JENIS*. Contoh: 50494890|RUSUN';
                            } else {
                                const normalizedJenis = normalizeCardTypeName(rawJenis);
                                if (!normalizedJenis) {
                                    replyText = `❌ Jenis kartu tidak valid. Pilih salah satu: ${getCardTypeChoicesText()}`;
                                } else {
                                    const result = upsertCardPrefix(rawPrefix, normalizedJenis);
                                    replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                                    replyText += '\n\n' + buildCardPrefixMenuText();
                                    adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'CARD_PREFIX_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_MENU');
                            replyText = buildCardPrefixMenuText();
                        } else {
                            const result = deleteCardPrefix(rawTrim);
                            replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                            replyText += '\n\n' + buildCardPrefixMenuText();
                            adminFlowByPhone.set(senderPhone, 'CARD_PREFIX_MENU');
                        }
                    } else if (currentAdminFlow === 'BLOCKED_PHONE_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_ADD');
                            replyText = [
                                '🚫 *TAMBAH BLOKIR NO HP*',
                                '',
                                'Ketik No HP yang ingin diblokir.',
                                'Anda bisa tambah alasan setelah tanda |',
                                'Contoh: 08123456789 | Spam',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            const list = await getBlockedPhoneList(200);
                            if (list.length === 0) {
                                replyText = '📂 Belum ada No HP yang diblokir.';
                            } else {
                                const lines = ['📋 *DAFTAR NO HP TERBLOKIR*', ''];
                                list.forEach((row, idx) => {
                                    const reasonText = row.reason ? ` - ${row.reason}` : '';
                                    lines.push(`${idx + 1}. ${row.phone_number}${reasonText}`);
                                });
                                lines.push('');
                                lines.push('_Ketik 3 untuk buka blokir._');
                                replyText = lines.join('\n');
                            }
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_DELETE');
                            replyText = [
                                '♻️ *BUKA BLOKIR NO HP*',
                                '',
                                'Ketik No HP yang ingin dibuka blokirnya.',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'BLOCKED_PHONE_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_MENU');
                            replyText = buildBlockedPhoneMenuText();
                        } else {
                            const [rawPhone, ...reasonParts] = rawTrim.split('|');
                            const reason = reasonParts.join('|').trim();
                            const result = await addBlockedPhone(rawPhone, reason);
                            replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                            replyText += '\n\n' + buildBlockedPhoneMenuText();
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_MENU');
                        }
                    } else if (currentAdminFlow === 'BLOCKED_PHONE_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_MENU');
                            replyText = buildBlockedPhoneMenuText();
                        } else {
                            const result = await removeBlockedPhone(rawTrim);
                            replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                            replyText += '\n\n' + buildBlockedPhoneMenuText();
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_PHONE_MENU');
                        }
                    } else if (currentAdminFlow === 'WHITELIST_MENU') {
                        if (normalized === '0') {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1' || normalized === '3') {
                            const list = await getWhitelistedPhoneList(200);
                            if (list.length === 0) {
                                replyText = '📂 Belum ada nomor di whitelist.';
                            } else {
                                whitelistSessionByPhone.set(senderPhone, { searchResults: list, currentPage: 0 });
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_SELECT');
                                const promptLine = normalized === '1'
                                    ? '👇 Ketik nomor urut untuk melihat detail.'
                                    : '👇 Ketik nomor urut untuk mengubah data.';
                                replyText = buildWhitelistSelectionListText('DAFTAR WHITELIST', list, promptLine, 0);
                            }
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_ADD');
                            replyText = [
                                '➕ *TAMBAH WHITELIST*',
                                '',
                                'Ketik nomor HP yang ingin dimasukkan ke whitelist.',
                                'Opsional nama dapat ditulis setelah koma.',
                                'Contoh:',
                                '08123456789, Budi',
                                '6281234567890, Admin Lapangan',
                                '08123456789',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else if (normalized === '4') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_DELETE');
                            replyText = [
                                '🗑️ *HAPUS WHITELIST*',
                                '',
                                'Ketik nomor HP yang ingin dihapus dari whitelist.',
                                'Contoh: 08123456789',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else if (normalized === '5') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_BULK_ADD');
                            replyText = [
                                '📥 *BULK TAMBAH WHITELIST*',
                                '',
                                'Kirim beberapa baris sekaligus.',
                                'Format per baris: nomor, nama (nama opsional)',
                                'Contoh:',
                                '08123456789, Budi',
                                '6281234567890, Admin Lapangan',
                                '08123456789',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else if (normalized === '6') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_BULK_DELETE');
                            replyText = [
                                '📤 *BULK HAPUS WHITELIST*',
                                '',
                                'Kirim beberapa nomor HP dalam baris terpisah.',
                                'Contoh:',
                                '08123456789',
                                '6281234567890',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1-6 atau 0.';
                        }
                    } else if (currentAdminFlow === 'WHITELIST_SELECT') {
                        const session = whitelistSessionByPhone.get(senderPhone);
                        if (normalized === '0') {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = buildWhitelistMenuText();
                        } else if (!session || !session.searchResults || session.searchResults.length === 0) {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = '❌ Sesi whitelist hilang. Silakan buka ulang menu whitelist.';
                        } else if (normalized === 'NEXT') {
                            const nextPage = clampWhitelistPage((session.currentPage ?? 0) + 1, session.searchResults.length);
                            session.currentPage = nextPage;
                            whitelistSessionByPhone.set(senderPhone, session);
                            replyText = buildWhitelistSelectionListText('DAFTAR WHITELIST', session.searchResults, '👇 Ketik nomor urut untuk melihat detail.', nextPage);
                        } else if (normalized === 'BACK') {
                            const prevPage = clampWhitelistPage((session.currentPage ?? 0) - 1, session.searchResults.length);
                            session.currentPage = prevPage;
                            whitelistSessionByPhone.set(senderPhone, session);
                            replyText = buildWhitelistSelectionListText('DAFTAR WHITELIST', session.searchResults, '👇 Ketik nomor urut untuk melihat detail.', prevPage);
                        } else {
                            const choice = Number.parseInt(normalized, 10);
                            if (Number.isNaN(choice) || choice < 1 || choice > session.searchResults.length) {
                                const currentPage = clampWhitelistPage(session.currentPage ?? 0, session.searchResults.length);
                                replyText = `⚠️ Nomor urut tidak valid (1 - ${session.searchResults.length}).\n\n${buildWhitelistSelectionListText('DAFTAR WHITELIST', session.searchResults, '👇 Ketik nomor urut untuk melihat detail.', currentPage)}`;
                            } else {
                                const selected = session.searchResults[choice - 1];
                                session.selectedWhitelist = selected;
                                whitelistSessionByPhone.set(senderPhone, session);
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_DETAIL');
                                replyText = buildWhitelistDetailText(selected);
                            }
                        }
                    } else if (currentAdminFlow === 'WHITELIST_DETAIL') {
                        const session = whitelistSessionByPhone.get(senderPhone);
                        if (!session || !session.selectedWhitelist) {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = '❌ Sesi whitelist hilang. Silakan buka ulang menu whitelist.';
                        } else if (normalized === '0') {
                            const list = session.searchResults || [];
                            if (list.length === 0) {
                                whitelistSessionByPhone.delete(senderPhone);
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                                replyText = buildWhitelistMenuText();
                            } else {
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_SELECT');
                                const currentPage = clampWhitelistPage(session.currentPage ?? 0, list.length);
                                session.currentPage = currentPage;
                                whitelistSessionByPhone.set(senderPhone, session);
                                replyText = buildWhitelistSelectionListText('DAFTAR WHITELIST', list, '👇 Ketik nomor urut untuk melihat detail.', currentPage);
                            }
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_EDIT_NAME');
                            replyText = [
                                '✏️ *EDIT NAMA WHITELIST*',
                                '',
                                `Nomor: *${formatWhitelistedPhoneDisplay(session.selectedWhitelist.phone_number)}*`,
                                `Nama saat ini: *${session.selectedWhitelist.name || '(Tanpa Nama)'}*`,
                                '',
                                'Ketik nama baru:',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else if (normalized === '2') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_EDIT_PHONE');
                            replyText = [
                                '📱 *EDIT NOMOR WHITELIST*',
                                '',
                                `Nomor saat ini: *${formatWhitelistedPhoneDisplay(session.selectedWhitelist.phone_number)}*`,
                                `Nama: *${session.selectedWhitelist.name || '(Tanpa Nama)'}*`,
                                '',
                                'Ketik nomor HP baru:',
                                'Contoh: 08123456789',
                                '',
                                '_Ketik 0 untuk batal._',
                            ].join('\n');
                        } else if (normalized === '3') {
                            const target = session.selectedWhitelist;
                            const result = await removeWhitelistedPhone(target.phone_number);
                            replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                            replyText += `\n\n${buildWhitelistMenuText()}`;
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'WHITELIST_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = buildWhitelistMenuText();
                        } else {
                            const [rawPhone, ...nameParts] = rawTrim.split(',');
                            const phoneInput = extractManualPhone(rawPhone || '') || normalizeManualPhone(rawPhone || '');
                            const name = nameParts.join(',').trim();
                            if (!phoneInput) {
                                replyText = '⚠️ Nomor HP tidak valid. Contoh: 08123456789, Budi';
                            } else {
                                const result = await addWhitelistedPhone(phoneInput, name || null);
                                replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                                replyText += `\n\n${buildWhitelistMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            }
                        }
                    } else if (currentAdminFlow === 'WHITELIST_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = buildWhitelistMenuText();
                        } else {
                            const phoneInput = extractManualPhone(rawTrim) || normalizeManualPhone(rawTrim);
                            if (!phoneInput) {
                                replyText = '⚠️ Nomor HP tidak valid. Contoh: 08123456789';
                            } else {
                                const result = await removeWhitelistedPhone(phoneInput);
                                replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                                replyText += `\n\n${buildWhitelistMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            }
                        }
                    } else if (currentAdminFlow === 'WHITELIST_EDIT_NAME') {
                        const session = whitelistSessionByPhone.get(senderPhone);
                        if (!session || !session.selectedWhitelist) {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = '❌ Sesi whitelist hilang. Silakan buka ulang menu whitelist.';
                        } else if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_DETAIL');
                            replyText = buildWhitelistDetailText(session.selectedWhitelist);
                        } else {
                            const newName = rawTrim.trim();
                            if (newName.length < 2) {
                                replyText = '⚠️ Nama terlalu pendek. Minimal 2 karakter.';
                            } else {
                                const result = await updateWhitelistedPhoneName(session.selectedWhitelist.phone_number, newName);
                                if (result.success) {
                                    session.selectedWhitelist = {
                                        ...session.selectedWhitelist,
                                        name: newName,
                                    };
                                    whitelistSessionByPhone.set(senderPhone, session);
                                    adminFlowByPhone.set(senderPhone, 'WHITELIST_DETAIL');
                                    replyText = `✅ ${result.message}\n\n${buildWhitelistDetailText(session.selectedWhitelist)}`;
                                } else {
                                    replyText = `❌ ${result.message}`;
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'WHITELIST_EDIT_PHONE') {
                        const session = whitelistSessionByPhone.get(senderPhone);
                        if (!session || !session.selectedWhitelist) {
                            whitelistSessionByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = '❌ Sesi whitelist hilang. Silakan buka ulang menu whitelist.';
                        } else if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_DETAIL');
                            replyText = buildWhitelistDetailText(session.selectedWhitelist);
                        } else {
                            const newPhone = extractManualPhone(rawTrim) || normalizeManualPhone(rawTrim);
                            if (!newPhone) {
                                replyText = '⚠️ Nomor HP baru tidak valid. Contoh: 08123456789';
                            } else {
                                const result = await updateWhitelistedPhone(session.selectedWhitelist.phone_number, newPhone, session.selectedWhitelist.name);
                                if (result.success) {
                                    session.selectedWhitelist = {
                                        phone_number: newPhone,
                                        name: session.selectedWhitelist.name,
                                    };
                                    whitelistSessionByPhone.set(senderPhone, session);
                                    adminFlowByPhone.set(senderPhone, 'WHITELIST_DETAIL');
                                    replyText = `✅ ${result.message}\n\n${buildWhitelistDetailText(session.selectedWhitelist)}`;
                                } else {
                                    replyText = `❌ ${result.message}`;
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'WHITELIST_BULK_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = buildWhitelistMenuText();
                        } else {
                            const bulkValidationError = validateWhitelistBulkInput(rawTrim);
                            if (bulkValidationError) {
                                replyText = `${bulkValidationError}\n\n${buildWhitelistMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            } else {
                                const items = parseWhitelistBulkAddInput(rawTrim);
                                if (items.length === 0) {
                                    replyText = [
                                        '⚠️ Tidak ada baris yang bisa diproses.',
                                        '',
                                        'Kirim beberapa baris sekaligus.',
                                        'Format per baris: nomor, nama (nama opsional)',
                                        '',
                                        '_Ketik 0 untuk kembali._',
                                    ].join('\n');
                                } else {
                                    const summary = await buildWhitelistBulkAddSummary('HASIL BULK TAMBAH WHITELIST', items);
                                    replyText = `${summary}\n\n${buildWhitelistMenuText()}`;
                                    adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'WHITELIST_BULK_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            replyText = buildWhitelistMenuText();
                        } else {
                            const bulkValidationError = validateWhitelistBulkInput(rawTrim);
                            if (bulkValidationError) {
                                replyText = `${bulkValidationError}\n\n${buildWhitelistMenuText()}`;
                                adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                            } else {
                                const items = parseWhitelistBulkDeleteInput(rawTrim);
                                if (items.length === 0) {
                                    replyText = [
                                        '⚠️ Tidak ada baris yang bisa diproses.',
                                        '',
                                        'Kirim beberapa nomor HP dalam baris terpisah.',
                                        '',
                                        '_Ketik 0 untuk kembali._',
                                    ].join('\n');
                                } else {
                                    const summary = await buildWhitelistBulkDeleteSummary('HASIL BULK HAPUS WHITELIST', items);
                                    replyText = `${summary}\n\n${buildWhitelistMenuText()}`;
                                    adminFlowByPhone.set(senderPhone, 'WHITELIST_MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'BLOCKED_LOCATION_MENU') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_LOCATION_ADD');
                            replyText = [
                                '🚫 *TANDAI LOKASI PENUH*',
                                '',
                                'Pilih nomor lokasi Dharmajaya, lalu opsional alasan.',
                                'Format: nomor | alasan',
                                'Contoh: 2 | Kuota hari ini sudah habis',
                                '',
                                '1. Duri Kosambi',
                                '2. Kapuk Jagal',
                                '3. Pulogadung',
                                '4. Cakung',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            const list = await listClosedLocationsByProvider('DHARMAJAYA');
                            if (list.length === 0) {
                                replyText = '📂 Tidak ada lokasi Dharmajaya yang ditutup.';
                            } else {
                                const lines = ['📋 *DAFTAR LOKASI PENUH (DHARMAJAYA)*', ''];
                                list.forEach((loc, idx) => {
                                    lines.push(`${idx + 1}. ${loc.replace('DHARMAJAYA - ', '')}`);
                                });
                                lines.push('');
                                lines.push('_Ketik 3 untuk buka kembali lokasi._');
                                replyText = lines.join('\n');
                            }
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_LOCATION_DELETE');
                            replyText = [
                                '♻️ *BUKA KEMBALI LOKASI*',
                                '',
                                'Ketik nomor lokasi Dharmajaya yang ingin dibuka.',
                                '',
                                '1. Duri Kosambi',
                                '2. Kapuk Jagal',
                                '3. Pulogadung',
                                '4. Cakung',
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'BLOCKED_LOCATION_ADD') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_LOCATION_MENU');
                            replyText = buildBlockedLocationMenuText();
                        } else {
                            const [rawChoice, ...reasonParts] = rawTrim.split('|');
                            const choice = (rawChoice || '').trim();
                            const reason = reasonParts.join('|').trim();
                            const locationName = DHARMAJAYA_MAPPING[choice];

                            if (!locationName) {
                                replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.\n\n' + buildBlockedLocationMenuText();
                            } else {
                                const result = await closeSpecificLocation('DHARMAJAYA', locationName, reason);
                                replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                                replyText += '\n\n' + buildBlockedLocationMenuText();
                            }
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_LOCATION_MENU');
                        }
                    } else if (currentAdminFlow === 'BLOCKED_LOCATION_DELETE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_LOCATION_MENU');
                            replyText = buildBlockedLocationMenuText();
                        } else {
                            const locationName = DHARMAJAYA_MAPPING[normalized];
                            if (!locationName) {
                                replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.\n\n' + buildBlockedLocationMenuText();
                            } else {
                                const result = await openSpecificLocation('DHARMAJAYA', locationName);
                                replyText = result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
                                replyText += '\n\n' + buildBlockedLocationMenuText();
                            }
                            adminFlowByPhone.set(senderPhone, 'BLOCKED_LOCATION_MENU');
                        }
                    } else if (currentAdminFlow.startsWith('LOCATION_MGMT_')) {
                        const { handleLocationMgmt } = await import('./services/adminLocationMenu');
                        const result = await handleLocationMgmt(currentAdminFlow as any, normalized, senderPhone);
                        if (result.nextState === null) {
                            adminFlowByPhone.set(senderPhone, 'NONE');
                        } else {
                            adminFlowByPhone.set(senderPhone, result.nextState);
                        }
                        replyText = result.replyText;
                    } else if (currentAdminFlow === 'LOCATION_QUOTA_MENU') {
                        if (normalized === '0') {
                            locationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            locationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_SET');
                            replyText = [
                                '✍️ *SET BATAS PER LOKASI (PER USER/HARI)*',
                                '',
                                'Ketik format: *nomor lokasi batas*',
                                'Contoh: *4 50* (Cakung = 50 data/user/hari)',
                                '',
                                'Daftar lokasi:',
                                ...listAllDharmajayaLocations().map((loc, idx) => `${idx + 1}. ${loc.replace('DHARMAJAYA - ', '')}`),
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            replyText = buildLocationQuotaListText() + '\n\n' + buildLocationQuotaMenuText();
                        } else if (normalized === '3') {
                            locationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_DISABLE');
                            replyText = [
                                '📴 *NONAKTIFKAN BATAS LOKASI*',
                                '',
                                'Ketik nomor lokasi yang ingin dinonaktifkan.',
                                '',
                                ...listAllDharmajayaLocations().map((loc, idx) => `${idx + 1}. ${loc.replace('DHARMAJAYA - ', '')}`),
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'LOCATION_QUOTA_SET') {
                        if (normalized === '0') {
                            locationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_MENU');
                            replyText = buildLocationQuotaMenuText();
                        } else {
                            const draft = locationQuotaDraftByPhone.get(senderPhone);
                            const parts = rawTrim.replace('|', ' ').split(/\s+/).filter(Boolean);

                            let locationChoice = parts[0] || '';
                            let limitPart = parts[1] || '';

                            if (draft?.locationKey && parts.length === 1) {
                                locationChoice = '';
                                limitPart = parts[0];
                            }

                            if (!draft?.locationKey && !limitPart) {
                                const locationKey = resolveDharmajayaLocationByChoice(locationChoice);
                                if (!locationKey) {
                                    replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.';
                                } else {
                                    locationQuotaDraftByPhone.set(senderPhone, { locationKey });
                                    replyText = `Lokasi *${locationKey.replace('DHARMAJAYA - ', '')}* dipilih.\nSekarang ketik batasnya (contoh: *50*).`;
                                }
                            } else {
                                const locationKey = draft?.locationKey || resolveDharmajayaLocationByChoice(locationChoice);
                                const limit = Number(limitPart);

                                if (!locationKey) {
                                    replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.';
                                } else if (!Number.isInteger(limit) || limit < 0) {
                                    replyText = '⚠️ Batas harus angka bulat minimal 0.';
                                } else {
                                    const result = setLocationQuotaLimit(locationKey, limit);
                                    locationQuotaDraftByPhone.delete(senderPhone);
                                    adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_MENU');
                                    replyText = `${result.success ? '✅' : '❌'} ${result.message}\n\n${buildLocationQuotaMenuText()}`;
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'LOCATION_QUOTA_DISABLE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_MENU');
                            replyText = buildLocationQuotaMenuText();
                        } else {
                            const locationKey = resolveDharmajayaLocationByChoice(normalized);
                            if (!locationKey) {
                                replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.';
                            } else {
                                const result = disableLocationQuotaLimit(locationKey);
                                adminFlowByPhone.set(senderPhone, 'LOCATION_QUOTA_MENU');
                                replyText = `${result.success ? '✅' : '❌'} ${result.message}\n\n${buildLocationQuotaMenuText()}`;
                            }
                        }
                    } else if (currentAdminFlow === 'GLOBAL_LOCATION_QUOTA_MENU') {
                        if (normalized === '0') {
                            globalLocationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            globalLocationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_SET');
                            replyText = [
                                '✍️ *SET KUOTA GLOBAL PER LOKASI (SEMUA USER/HARI)*',
                                '',
                                'Ketik format: *nomor lokasi batas*',
                                'Contoh: *2 220* (Kapuk Jagal = 220 data total/hari)',
                                '',
                                'Daftar lokasi:',
                                ...listAllDharmajayaLocations().map((loc, idx) => `${idx + 1}. ${loc.replace('DHARMAJAYA - ', '')}`),
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else if (normalized === '2') {
                            replyText = `${await buildGlobalLocationQuotaListText()}\n\n${buildGlobalLocationQuotaMenuText()}`;
                        } else if (normalized === '3') {
                            globalLocationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_DISABLE');
                            replyText = [
                                '📴 *NONAKTIFKAN KUOTA GLOBAL LOKASI*',
                                '',
                                'Ketik nomor lokasi yang ingin dinonaktifkan.',
                                '',
                                ...listAllDharmajayaLocations().map((loc, idx) => `${idx + 1}. ${loc.replace('DHARMAJAYA - ', '')}`),
                                '',
                                '_Ketik 0 untuk kembali._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilihan tidak dikenali. Ketik 1, 2, 3, atau 0.';
                        }
                    } else if (currentAdminFlow === 'GLOBAL_LOCATION_QUOTA_SET') {
                        if (normalized === '0') {
                            globalLocationQuotaDraftByPhone.delete(senderPhone);
                            adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_MENU');
                            replyText = buildGlobalLocationQuotaMenuText();
                        } else {
                            const draft = globalLocationQuotaDraftByPhone.get(senderPhone);
                            const parts = rawTrim.replace('|', ' ').split(/\s+/).filter(Boolean);

                            let locationChoice = parts[0] || '';
                            let limitPart = parts[1] || '';

                            if (draft?.locationKey && parts.length === 1) {
                                locationChoice = '';
                                limitPart = parts[0];
                            }

                            if (!draft?.locationKey && !limitPart) {
                                const locationKey = resolveDharmajayaLocationByChoice(locationChoice);
                                if (!locationKey) {
                                    replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.';
                                } else {
                                    globalLocationQuotaDraftByPhone.set(senderPhone, { locationKey });
                                    replyText = `Lokasi *${locationKey.replace('DHARMAJAYA - ', '')}* dipilih.\nSekarang ketik batas globalnya (contoh: *220*).`;
                                }
                            } else {
                                const locationKey = draft?.locationKey || resolveDharmajayaLocationByChoice(locationChoice);
                                const limit = Number(limitPart);

                                if (!locationKey) {
                                    replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.';
                                } else if (!Number.isInteger(limit) || limit < 0) {
                                    replyText = '⚠️ Batas harus angka bulat minimal 0.';
                                } else {
                                    const result = await setGlobalLocationQuotaLimit(locationKey, limit);
                                    globalLocationQuotaDraftByPhone.delete(senderPhone);
                                    adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_MENU');
                                    replyText = `${result.success ? '✅' : '❌'} ${result.message}\n\n${buildGlobalLocationQuotaMenuText()}`;
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'GLOBAL_LOCATION_QUOTA_DISABLE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_MENU');
                            replyText = buildGlobalLocationQuotaMenuText();
                        } else {
                            const locationKey = resolveDharmajayaLocationByChoice(normalized);
                            if (!locationKey) {
                                replyText = '⚠️ Nomor lokasi tidak valid. Pilih 1-4.';
                            } else {
                                const result = await disableGlobalLocationQuotaLimit(locationKey);
                                adminFlowByPhone.set(senderPhone, 'GLOBAL_LOCATION_QUOTA_MENU');
                                replyText = `${result.success ? '✅' : '❌'} ${result.message}\n\n${buildGlobalLocationQuotaMenuText()}`;
                            }
                        }
                    } else if (currentAdminFlow === 'BROADCAST_SELECT') {
                        if (normalized === '1') {
                            // SEMUA kontak
                            broadcastDraftMap.set(senderPhone, { targets: [], message: '' });
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_MSG');
                            replyText = ['📢 *BROADCAST KE SEMUA*', '', 'Ketik pesan yang akan dikirim:', '', '_(Ketik 0 untuk batal)_'].join('\n');
                        } else if (normalized === '2') {
                            // Nomor tertentu
                            broadcastDraftMap.set(senderPhone, { targets: [], message: '', isPendingNumbers: true });
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_MSG');
                            replyText = [
                                '📢 *BROADCAST KE NOMOR TERTENTU*',
                                '',
                                'Ketik nomor HP tujuan (pisahkan dengan koma/enter), lalu kirim pesan.',
                                '',
                                'Format:',
                                '08123456789, 08234567890',
                                'Pesan broadcast Anda...',
                                '',
                                '_(Ketik 0 untuk batal)_'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilih 1 (Semua) atau 2 (Nomor tertentu).';
                        }
                    } else if (currentAdminFlow === 'BROADCAST_MSG') {
                        if (rawTrim.length < 5) {
                            replyText = '⚠️ Pesan terlalu pendek. Batal broadcast tekan 0.';
                        } else {
                            const draft = broadcastDraftMap.get(senderPhone) || { targets: [], message: '' };

                            let targetsToSend: string[] = [];
                            let messageToSend = rawTrim;

                            // LOGIC PARSING TARGET
                            if (draft.isPendingNumbers) {
                                // User kirim "Nomor\nPesan"
                                const lines = rawTrim.split('\n');
                                const firstLine = lines[0] || '';

                                const phoneMatches = firstLine.match(/(?:\+?62|0)\s*8[\d\s\-\.]{8,15}/g) || [];
                                const normalizedPhones = phoneMatches.map((p: string) => {
                                    let s = p.replace(/[^\d]/g, '');
                                    if (s.startsWith('0')) s = '62' + s.slice(1);
                                    return s;
                                }).filter((p: string) => p.length >= 10);

                                if (normalizedPhones.length === 0) {
                                    replyText = '⚠️ Nomor HP tidak ditemukan. Ulangi format:\n08123, 08234\nPesan Anda...';
                                    await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                targetsToSend = normalizedPhones;
                                messageToSend = lines.slice(1).join('\n').trim();
                            } else {
                                // Kirim ke SEMUA
                                // Kita fetch semua sekarang untuk preview count
                                const allContacts = await getAllLidPhoneMap();
                                targetsToSend = allContacts.map(c => c.phone_number);
                            }

                            if (messageToSend.length < 5) {
                                replyText = '⚠️ Pesan kosong/terlalu pendek. Ulangi input.';
                                await sock.sendMessage(remoteJid, { text: replyText });
                                continue;
                            }

                            // UPDATE DRAFT
                            draft.targets = targetsToSend;
                            draft.message = messageToSend;
                            draft.isPendingNumbers = false;
                            broadcastDraftMap.set(senderPhone, draft);

                            // SHOW PREVIEW
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_PREVIEW');

                            replyText = [
                                '🔍 *PREVIEW BROADCAST*',
                                '',
                                `👥 *Penerima:* ${targetsToSend.length} Kontak`,
                                '📝 *Isi Pesan:*',
                                '------------------',
                                messageToSend,
                                '------------------',
                                '',
                                '1️⃣ Kirim Sekarang',
                                '2️⃣ Jadwalkan Kirim (WIP)',
                                '0️⃣ Batal'
                            ].join('\n');
                        }
                    } else if (currentAdminFlow === 'BROADCAST_PREVIEW') {
                        const draft = broadcastDraftMap.get(senderPhone);
                        if (!draft || draft.targets.length === 0) {
                            replyText = '❌ Data broadcast hilang. Silakan ulangi.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '1') {
                            // --- KIRIM SEKARANG ---
                            await executeBroadcast(sock, draft, remoteJid, senderPhone);
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            broadcastDraftMap.delete(senderPhone);
                        } else if (normalized === '2') {
                            // --- JADWALKAN ---
                            replyText = '📅 Masukkan Tanggal & Jam (Format: DD-MM-YYYY HH:mm)\nContoh: 15-01-2026 08:30';
                            adminFlowByPhone.set(senderPhone, 'BROADCAST_SCHEDULE');
                        } else {
                            replyText = '❌ Broadcast dibatalkan.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            broadcastDraftMap.delete(senderPhone);
                        }
                    } else if (currentAdminFlow === 'BROADCAST_SCHEDULE') {
                        // Parse Time
                        const targetTimeStr = rawTrim; // DD-MM-YYYY HH:mm
                        try {
                            const [datePart, timePart] = targetTimeStr.split(' ');
                            if (!datePart || !timePart) throw new Error('Format salah');

                            // Convert DD-MM-YYYY to YYYY-MM-DD
                            const [dd, mm, yyyy] = datePart.split('-');
                            if (!dd || !mm || !yyyy) throw new Error('Date format');

                            const isoDate = `${yyyy}-${mm}-${dd}T${timePart}:00`;
                            const targetDate = new Date(isoDate);

                            if (isNaN(targetDate.getTime())) throw new Error('Invalid Date');

                            const now = new Date();
                            const delay = targetDate.getTime() - now.getTime();

                            if (delay <= 0) {
                                replyText = '⚠️ Waktu sudah lewat. Masukkan waktu yang akan datang.';
                            } else {
                                const draft = broadcastDraftMap.get(senderPhone);
                                if (draft) {
                                    // Set Timeout
                                    replyText = `✅ Broadcast dijadwalkan pada *${targetTimeStr}*.\n\n⚠️ _(PERHATIAN: Jadwal akan hilang jika Bot restart)_`;

                                    setTimeout(() => {
                                        executeBroadcast(sock, draft, remoteJid, senderPhone).catch(console.error);
                                    }, delay);

                                    // Clear state but KEEP draft in memory (actually executeBroadcast will rely on passed draft object, so we can delete from map? No, closure keeps it. Safe to delete map entry if we don't need to edit it.)
                                    // Better: clone draft to closure.
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                    broadcastDraftMap.delete(senderPhone);
                                } else {
                                    replyText = '❌ Data draft hilang.';
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                }
                            }
                        } catch (e) {
                            replyText = '⚠️ Format salah. Gunakan DD-MM-YYYY HH:mm (Contoh: 15-01-2026 13:00). Ketik 0 untuk batal.';
                            if (normalized === '0') {
                                replyText = '❌ Penjadwalan dibatalkan.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }
                    } else if (currentAdminFlow === 'ADMIN_DELETE_SELECT_USER') {
                        // Admin memilih user mana yang datanya akan dihapus
                        const choice = parseInt(normalized);
                        const userList = adminUserListCache.get(senderPhone);

                        if (isNaN(choice) || choice < 0) {
                            replyText = '⚠️ Ketik nomor urut user. Ketik 0 untuk batal.';
                        } else if (choice === 0) {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            adminUserListCache.delete(senderPhone);
                            replyText = '✅ Dibatalkan.';
                        } else if (!userList || choice > userList.length) {
                            replyText = '⚠️ Nomor urut tidak valid.';
                        } else {
                            const selectedUser = userList[choice - 1];
                            // Simpan user yg dipilih dan tampilkan datanya
                            adminUserListCache.set(senderPhone + '_selected', [selectedUser]);

                            // Ambil data detail user tersebut (LENGKAP)
                            console.log(`[ADMIN DELETE] Querying data for user: phone=${selectedUser.phone}, name=${selectedUser.name}, processingDayKey=${processingDayKey}`);
                            const { data: userData, error: userDataError } = await supabase
                                .from('data_harian')
                                .select('id, nama, no_kjp, jenis_kartu, no_ktp, no_kk, lokasi')
                                .eq('processing_day_key', processingDayKey)
                                .eq('sender_phone', selectedUser.phone)
                                .order('nama', { ascending: true })  // Urutan A-Z konsisten
                                .order('id', { ascending: true });   // Secondary sort: tiebreaker

                            if (userDataError) {
                                console.error('[ADMIN DELETE] DB Error:', userDataError);
                            }
                            console.log(`[ADMIN DELETE] Result: ${userData?.length ?? 0} rows found`);

                            if (!userData || userData.length === 0) {
                                replyText = `❌ Data user tidak ditemukan.\n\n_Debug: phone=${selectedUser.phone}, key=${processingDayKey}_`;
                                adminUserListCache.delete(senderPhone + '_selected');
                                adminContactCache.delete(senderPhone + '_data');
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                // Cache data untuk delete
                                adminContactCache.set(senderPhone + '_data', userData.map((d: any) => ({
                                    phone_number: String(d.id),
                                    push_name: d.nama
                                })));

                                let msg = `🗑️ *DATA MILIK: ${selectedUser.name}*\n`;
                                msg += `📅 Tanggal: ${dmyExample}\n\n`;
                                userData.forEach((d: any, i: number) => {
                                    const jenisKartu = resolveCardTypeLabel(d.no_kjp, d.jenis_kartu);
                                    msg += `┌── ${i + 1}. *${d.nama}*\n`;
                                    msg += `│   💳 ${jenisKartu}: ${d.no_kjp}\n`;
                                    msg += `│   🪪 KTP  : ${d.no_ktp}\n`;
                                    msg += `│   🏠 KK   : ${d.no_kk}\n`;
                                    msg += `└── 📍 Loc  : ${d.specific_location || d.lokasi || '-'}\n\n`;
                                });
                                msg += '👇 Ketik nomor data yang mau dihapus.\n';
                                msg += 'Contoh: *1* atau *1,3,5*\n';
                                msg += 'Atau ketik *ALL* untuk HAPUS SEMUA data user ini.\n\n';
                                msg += '_Ketik 0 untuk batal._';
                                replyText = msg;
                                adminFlowByPhone.set(senderPhone, 'ADMIN_DELETE_USER_DATA');
                            }
                        }
                    } else if (currentAdminFlow === 'ADMIN_DELETE_USER_DATA') {
                        // Admin memilih data mana yang akan dihapus
                        if (normalized === '0') {
                            replyText = '✅ Penghapusan dibatalkan.';
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            adminContactCache.delete(senderPhone + '_data');
                        } else if (normalized === 'ALL' || normalized === 'SEMUA') {
                            // HAPUS SEMUA DATA USER TERSEBUT
                            const dataList = adminContactCache.get(senderPhone + '_data');

                            if (!dataList || dataList.length === 0) {
                                replyText = '❌ Cache data hilang. Ulangi dari menu admin.';
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                // Eksekusi Delete Loop untuk semua item (FIX: query lokasi & sesuaikan kuota)
                                let successCount = 0;
                                const deletedNames: string[] = [];

                                for (const target of dataList) {
                                    const dataId = target.phone_number;
                                    // Query lokasi sebelum delete untuk penyesuaian kuota
                                    const { data: rowData } = await supabase
                                        .from('data_harian')
                                        .select('lokasi, processing_day_key')
                                        .eq('id', dataId)
                                        .maybeSingle();

                                    const { error } = await supabase
                                        .from('data_harian')
                                        .delete()
                                        .eq('id', dataId);

                                    if (!error) {
                                        successCount++;
                                        deletedNames.push(target.push_name || 'Data User');
                                        // Sesuaikan kuota global setelah hapus
                                        if (rowData?.lokasi && rowData?.processing_day_key) {
                                            await supabase.rpc('apply_global_location_quota_delta', {
                                                p_processing_day_key: rowData.processing_day_key,
                                                p_location_key: rowData.lokasi,
                                                p_delta: -1,
                                            }).then(({ error: rpcErr }) => {
                                                if (rpcErr) console.error('Quota delta error (admin delete ALL):', rpcErr);
                                            });
                                        }
                                    }
                                }

                                if (successCount > 0) {
                                    replyText = `✅ Berhasil menghapus SEMUA (${successCount}) data milik user ini.`;
                                    // Reconcile kuota sebagai safety net
                                    reconcileGlobalLocationQuotaDay(processingDayKey).catch(console.error);
                                } else {
                                    replyText = '❌ Gagal menghapus data.';
                                }

                                adminContactCache.delete(senderPhone + '_data');
                                adminUserListCache.delete(senderPhone);
                                adminUserListCache.delete(senderPhone + '_selected');
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        } else {
                            const parts = rawTrim.split(/[,\s]+/);
                            const indices = parts.map((p: string) => parseInt(p.trim())).filter((n: number) => !isNaN(n) && n > 0);

                            if (indices.length === 0) {
                                replyText = '⚠️ Ketik nomor urut data (contoh: 1, 2) atau ketik ALL untuk hapus semua. Ketik 0 untuk batal.';
                            } else {
                                const dataList = adminContactCache.get(senderPhone + '_data');

                                if (!dataList || dataList.length === 0) {
                                    replyText = '❌ Cache data hilang. Ulangi dari menu admin.';
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                } else {
                                    let successCount = 0;
                                    const deletedNames: string[] = [];

                                    // Sort descending
                                    const sortedIndices = [...indices].sort((a, b) => b - a);

                                    for (const idx of sortedIndices) {
                                        const target = dataList[idx - 1];
                                        if (target) {
                                            const dataId = target.phone_number; // ID disimpan di phone_number
                                            // Query lokasi sebelum delete untuk penyesuaian kuota
                                            const { data: rowData } = await supabase
                                                .from('data_harian')
                                                .select('lokasi, processing_day_key')
                                                .eq('id', dataId)
                                                .maybeSingle();

                                            const { error } = await supabase
                                                .from('data_harian')
                                                .delete()
                                                .eq('id', dataId);

                                            if (!error) {
                                                successCount++;
                                                deletedNames.push(target.push_name || `Data ${idx}`);
                                                // Sesuaikan kuota global setelah hapus
                                                if (rowData?.lokasi && rowData?.processing_day_key) {
                                                    await supabase.rpc('apply_global_location_quota_delta', {
                                                        p_processing_day_key: rowData.processing_day_key,
                                                        p_location_key: rowData.lokasi,
                                                        p_delta: -1,
                                                    }).then(({ error: rpcErr }) => {
                                                        if (rpcErr) console.error('Quota delta error (admin delete idx):', rpcErr);
                                                    });
                                                }
                                            }
                                        }
                                    }

                                    if (successCount > 0) {
                                        replyText = `✅ Berhasil menghapus ${successCount} data:\n- ${deletedNames.join('\n- ')}`;
                                        // Reconcile kuota sebagai safety net
                                        reconcileGlobalLocationQuotaDay(processingDayKey).catch(console.error);
                                    } else {
                                        // JIKA 0 DATA TERHAPUS: Berarti gagal karena izin (RLS) atau data sudah hilang
                                        replyText = '❌ Gagal menghapus.\n\nKemungkinan penyebab:\n1. Izin database (RLS) memblokir bot.\n2. Data sudah dihapus sebelumnya.\n\n(Pastikan SERVICE_KEY sudah dipasang)';
                                    }

                                    adminContactCache.delete(senderPhone + '_data');
                                    adminUserListCache.delete(senderPhone);
                                    adminUserListCache.delete(senderPhone + '_selected');
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                }
                            }
                        }
                    } else if (currentAdminFlow === 'EXPORT_SELECT_DATE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else if (normalized === '1') {
                            await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file export...' });

                            const lookupNameFn = (ph: string) => getRegisteredUserNameSync(ph) || undefined;
                            const exportResult = await generateExportData(processingDayKey, lookupNameFn);

                            if (!exportResult || exportResult.count === 0) {
                                replyText = '📂 Belum ada data pendaftaran hari ini untuk diexport.';
                            } else {
                                const txtBuffer = Buffer.from(exportResult.txt, 'utf-8');
                                await sock.sendMessage(remoteJid, {
                                    document: txtBuffer,
                                    mimetype: 'text/plain',
                                    fileName: `${exportResult.filenameBase}.txt`,
                                    caption: `📄 Laporan Detail Data (${exportResult.count} data)`
                                });

                                const { data: excelDataRaw } = await supabase
                                    .from('data_harian')
                                    .select('*')
                                    .eq('processing_day_key', processingDayKey)
                                    .order('sender_phone', { ascending: true })
                                    .order('received_at', { ascending: true });

                                if (excelDataRaw && excelDataRaw.length > 0) {
                                    const enriched = excelDataRaw.map((row: any) => {
                                        const contactName = getContactName(row.sender_phone);
                                        const currentName = getRegisteredUserNameSync(row.sender_phone);
                                        const finalSender = contactName || currentName || row.sender_name || row.sender_phone;
                                        return { ...row, sender_name: finalSender };
                                    });

                                    enriched.sort((a, b) => {
                                        const nA = (a.sender_name || '').toUpperCase();
                                        const nB = (b.sender_name || '').toUpperCase();
                                        return nA.localeCompare(nB);
                                    });

                                    const excelBuffer = generateKJPExcel(enriched);
                                    await sock.sendMessage(remoteJid, {
                                        document: excelBuffer,
                                        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        fileName: `${exportResult.filenameBase}.xlsx`,
                                        caption: `📊 Laporan Excel (${enriched.length} data)`
                                    });
                                }

                                const regionExports: { keyword: string; filename: string; label: string; parentRegion: 'DHARMAJAYA' | 'PASARJAYA' | 'FOOD_STATION' }[] = [
                                    { keyword: 'KAPUK', filename: 'kjp_kapuk', label: 'Kapuk', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'DURI KOSAMBI', filename: 'kjp_durikosambi', label: 'Duri Kosambi', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'CAKUNG', filename: 'kjp_cakung', label: 'Cakung', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'PULOGADUNG', filename: 'kjp_pulogadung', label: 'Pulogadung', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'PASARJAYA', filename: 'kjp_pasarjaya', label: 'Pasarjaya', parentRegion: 'PASARJAYA' },
                                    { keyword: 'FOOD STATION', filename: 'kjp_foodstation', label: 'Foodstation', parentRegion: 'FOOD_STATION' },
                                ];

                                for (const region of regionExports) {
                                    const regionResult = await generateRegionTxtExport(
                                        processingDayKey,
                                        region.keyword,
                                        region.filename,
                                        lookupNameFn,
                                        region.parentRegion
                                    );
                                    if (!regionResult || regionResult.count === 0) {
                                        continue;
                                    }
                                    const regionTxtBuffer = Buffer.from(regionResult.txt, 'utf-8');
                                    await sock.sendMessage(remoteJid, {
                                        document: regionTxtBuffer,
                                        mimetype: 'text/plain',
                                        fileName: `${regionResult.filenameBase}.txt`,
                                        caption: `📄 ${regionResult.filenameBase}.txt (${regionResult.count} data)`
                                    });
                                }

                                replyText = '✅ Export data (TXT & Excel) selesai.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '2') {
                            const yesterday = shiftIsoDate(processingDayKey, -1);
                            await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file export kemarin...' });

                            const lookupNameFn = (ph: string) => getRegisteredUserNameSync(ph) || undefined;
                            const exportResult = await generateExportData(yesterday, lookupNameFn);

                            const displayDate = yesterday.split('-').reverse().join('-');
                            if (!exportResult || exportResult.count === 0) {
                                replyText = `📂 Tidak ada data pendaftaran kemarin (${displayDate}).`;
                            } else {
                                const txtBuffer = Buffer.from(exportResult.txt, 'utf-8');
                                await sock.sendMessage(remoteJid, {
                                    document: txtBuffer,
                                    mimetype: 'text/plain',
                                    fileName: `${exportResult.filenameBase}.txt`,
                                    caption: `📄 Laporan Detail Data ${displayDate} (${exportResult.count} data)`
                                });

                                const { data: excelDataRaw } = await supabase
                                    .from('data_harian')
                                    .select('*')
                                    .eq('processing_day_key', yesterday)
                                    .order('sender_phone', { ascending: true })
                                    .order('received_at', { ascending: true });

                                if (excelDataRaw && excelDataRaw.length > 0) {
                                    const enriched = excelDataRaw.map((row: any) => {
                                        const contactName = getContactName(row.sender_phone);
                                        const currentName = getRegisteredUserNameSync(row.sender_phone);
                                        const finalSender = contactName || currentName || row.sender_name || row.sender_phone;
                                        return { ...row, sender_name: finalSender };
                                    });

                                    enriched.sort((a, b) => {
                                        const nA = (a.sender_name || '').toUpperCase();
                                        const nB = (b.sender_name || '').toUpperCase();
                                        return nA.localeCompare(nB);
                                    });

                                    const excelBuffer = generateKJPExcel(enriched);
                                    await sock.sendMessage(remoteJid, {
                                        document: excelBuffer,
                                        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        fileName: `${exportResult.filenameBase}.xlsx`,
                                        caption: `📊 Laporan Excel ${displayDate} (${enriched.length} data)`
                                    });
                                }

                                const regionExports: { keyword: string; filename: string; label: string; parentRegion: 'DHARMAJAYA' | 'PASARJAYA' | 'FOOD_STATION' }[] = [
                                    { keyword: 'KAPUK', filename: 'kjp_kapuk', label: 'Kapuk', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'DURI KOSAMBI', filename: 'kjp_durikosambi', label: 'Duri Kosambi', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'CAKUNG', filename: 'kjp_cakung', label: 'Cakung', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'PULOGADUNG', filename: 'kjp_pulogadung', label: 'Pulogadung', parentRegion: 'DHARMAJAYA' },
                                    { keyword: 'PASARJAYA', filename: 'kjp_pasarjaya', label: 'Pasarjaya', parentRegion: 'PASARJAYA' },
                                    { keyword: 'FOOD STATION', filename: 'kjp_foodstation', label: 'Foodstation', parentRegion: 'FOOD_STATION' },
                                ];

                                for (const region of regionExports) {
                                    const regionResult = await generateRegionTxtExport(
                                        yesterday,
                                        region.keyword,
                                        region.filename,
                                        lookupNameFn,
                                        region.parentRegion
                                    );
                                    if (!regionResult || regionResult.count === 0) {
                                        continue;
                                    }
                                    const regionTxtBuffer = Buffer.from(regionResult.txt, 'utf-8');
                                    await sock.sendMessage(remoteJid, {
                                        document: regionTxtBuffer,
                                        mimetype: 'text/plain',
                                        fileName: `${regionResult.filenameBase}.txt`,
                                        caption: `📄 ${regionResult.filenameBase}.txt ${displayDate} (${regionResult.count} data)`
                                    });
                                }

                                replyText = '✅ Export data kemarin selesai.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else if (normalized === '3') {
                            adminFlowByPhone.set(senderPhone, 'EXPORT_CUSTOM_DATE');
                            replyText = [
                                '📅 *EXPORT TANGGAL LAIN*',
                                '',
                                'Ketik tanggal dengan format bebas:',
                                `• DD-MM-YYYY (${dmyExample})`,
                                '• DD/MM/YYYY (01/01/2026)',
                                '• DDMMYYYY (01012026)',
                                '• DD MMM YYYY (1 Januari 2026)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else {
                            replyText = '⚠️ Pilih 1, 2, atau 3. Ketik 0 untuk batal.';
                        }
                    } else if (currentAdminFlow === 'EXPORT_CUSTOM_DATE') {
                        if (normalized === '0') {
                            adminFlowByPhone.set(senderPhone, 'MENU');
                            replyText = ADMIN_MENU_MESSAGE;
                        } else {
                            const iso = parseFlexibleDate(rawTrim);
                            if (!iso) {
                                replyText = '⚠️ Format tanggal tidak dikenali.\n\nContoh format yang diterima:\n• 22-01-2026\n• 22/01/2026\n• 22012026\n• 22 Januari 2026\n\nKetik 0 untuk batal.';
                            } else {
                                await sock.sendMessage(remoteJid, { text: '⏳ Sedang menyiapkan file export...' });

                                const lookupNameFn = (ph: string) => getRegisteredUserNameSync(ph) || undefined;
                                const exportResult = await generateExportData(iso, lookupNameFn);

                                const displayDate = iso.split('-').reverse().join('-');
                                if (!exportResult || exportResult.count === 0) {
                                    replyText = `📂 Tidak ada data pendaftaran pada tanggal ${displayDate}.`;
                                } else {
                                    const txtBuffer = Buffer.from(exportResult.txt, 'utf-8');
                                    await sock.sendMessage(remoteJid, {
                                        document: txtBuffer,
                                        mimetype: 'text/plain',
                                        fileName: `${exportResult.filenameBase}.txt`,
                                        caption: `📄 Laporan Detail Data ${displayDate} (${exportResult.count} data)`
                                    });

                                    const { data: excelDataRaw } = await supabase
                                        .from('data_harian')
                                        .select('*')
                                        .eq('processing_day_key', iso)
                                        .order('sender_phone', { ascending: true })
                                        .order('received_at', { ascending: true });

                                    if (excelDataRaw && excelDataRaw.length > 0) {
                                        const enriched = excelDataRaw.map((row: any) => {
                                            const contactName = getContactName(row.sender_phone);
                                            const currentName = getRegisteredUserNameSync(row.sender_phone);
                                            const finalSender = contactName || currentName || row.sender_name || row.sender_phone;
                                            return { ...row, sender_name: finalSender };
                                        });

                                        enriched.sort((a, b) => {
                                            const nA = (a.sender_name || '').toUpperCase();
                                            const nB = (b.sender_name || '').toUpperCase();
                                            return nA.localeCompare(nB);
                                        });

                                        const excelBuffer = generateKJPExcel(enriched);
                                        await sock.sendMessage(remoteJid, {
                                            document: excelBuffer,
                                            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                            fileName: `${exportResult.filenameBase}.xlsx`,
                                            caption: `📊 Laporan Excel ${displayDate} (${enriched.length} data)`
                                        });
                                    }

                                    const regionExports: { keyword: string; filename: string; label: string; parentRegion: 'DHARMAJAYA' | 'PASARJAYA' | 'FOOD_STATION' }[] = [
                                        { keyword: 'KAPUK', filename: 'kjp_kapuk', label: 'Kapuk', parentRegion: 'DHARMAJAYA' },
                                        { keyword: 'DURI KOSAMBI', filename: 'kjp_durikosambi', label: 'Duri Kosambi', parentRegion: 'DHARMAJAYA' },
                                        { keyword: 'CAKUNG', filename: 'kjp_cakung', label: 'Cakung', parentRegion: 'DHARMAJAYA' },
                                        { keyword: 'PULOGADUNG', filename: 'kjp_pulogadung', label: 'Pulogadung', parentRegion: 'DHARMAJAYA' },
                                        { keyword: 'PASARJAYA', filename: 'kjp_pasarjaya', label: 'Pasarjaya', parentRegion: 'PASARJAYA' },
                                        { keyword: 'FOOD STATION', filename: 'kjp_foodstation', label: 'Foodstation', parentRegion: 'FOOD_STATION' },
                                    ];

                                    for (const region of regionExports) {
                                        const regionResult = await generateRegionTxtExport(
                                            iso,
                                            region.keyword,
                                            region.filename,
                                            lookupNameFn,
                                            region.parentRegion
                                        );
                                        if (!regionResult || regionResult.count === 0) {
                                            continue;
                                        }
                                        const regionTxtBuffer = Buffer.from(regionResult.txt, 'utf-8');
                                        await sock.sendMessage(remoteJid, {
                                            document: regionTxtBuffer,
                                            mimetype: 'text/plain',
                                            fileName: `${regionResult.filenameBase}.txt`,
                                            caption: `📄 ${regionResult.filenameBase}.txt ${displayDate} (${regionResult.count} data)`
                                        });
                                    }

                                    replyText = '✅ Export data (TXT & Excel) selesai.';
                                }
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }
                    } else if (currentAdminFlow === 'SETTING_CLOSE_TIME_MENU') {
                        // SUB-MENU JAM TUTUP (UPDATED)
                        if (normalized === '1') {
                            // 1. Manual -> Wizard Start (Harian)
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_START');
                            replyText = '⏰ *INPUT JAM TUTUP HARIAN*\n\nSilakan masukkan jam mulai tutup (Format HH:mm).\nContoh: *04:00*\n\n_Ketik 0 untuk batal._';
                        } else if (normalized === '2') {
                            // 2. Tutup Sekarang (Harian/Force)
                            // FIX TIMEZONE: Use getWibParts
                            const nowParts = getWibParts(new Date());
                            const timeNow = `${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}`;

                            // Simpan start time di broadcastDraftMap (temp)
                            broadcastDraftMap.set(senderPhone, { targets: [], message: timeNow }); // Store START_TIME

                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_END');
                            replyText = `⏰ *TUTUP SEKARANG (${timeNow})*\n\nOke, bot akan tutup mulai jam ${timeNow}.\n\nSekarang, jam berapa bot akan *BUKA KEMBALI* (besok/nanti)? (Format HH:mm)\nContoh: *08:00*\n\n_Ketik 0 untuk batal._`;
                        } else if (normalized === '3') {
                            // 3. Tutup Jangka Panjang (LIBUR) -- NEW FEATURE
                            adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_LONG_TERM');
                            replyText = [
                                '🗓️ *TUTUP JANGKA PANJANG (LIBUR)*',
                                '',
                                'Bot akan tutup mulai *SEKARANG*.',
                                'Silakan masukkan *Tanggal Buka Kembali*.',
                                '',
                                'Format yang diterima:',
                                '• Jumlah Hari (contoh: *3* artinya libur 3 hari)',
                                '• Tanggal (contoh: *05-02-2026*)',
                                '',
                                '_Ketik 0 untuk batal._'
                            ].join('\n');
                        } else if (normalized === '4') {
                            // 4. BUKA SEKARANG (Force Open / Cancel Maintenance)
                            // Matikan mode libur & Reset jam tutup harian ke 00:00 (Tidak ada maintenance)
                            const success = await updateBotSettings({
                                manual_close_start: null,
                                manual_close_end: null,
                                close_hour_start: 0,
                                close_minute_start: 0,
                                close_hour_end: 0,
                                close_minute_end: 0
                            });

                            if (success) {
                                clearBotSettingsCache();
                                replyText = `✅ *BOT BERHASIL DIBUKA*\n\nSemua mode tutup (Harian/Libur) telah dinonaktifkan.\nBot sekarang *ONLINE 24 JAM*.\n\n_Untuk mengaktifkan maintenance harian lagi, pilih menu 1._`;
                            } else {
                                replyText = '❌ Gagal update setting.';
                            }
                            adminFlowByPhone.set(senderPhone, 'MENU');
                        } else {
                            replyText = '⚠️ Pilih 1, 2, 3, atau 4. Ketik 0 untuk batal.';
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_LONG_TERM') {
                        // Handler Input Tutup Jangka Panjang
                        const input = rawTrim;

                        // Cek apakah angka (Jumlah Hari)
                        if (/^\d+$/.test(input)) {
                            const days = parseInt(input);
                            if (days > 0 && days < 365) {
                                // Hitung tanggal buka = NOW + Days
                                const now = new Date();
                                const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
                                // Set jam buka ke 06:00 WIB (Default start day) agar rapi? Atau jam saat ini?
                                // Biasanya libur selesai pagi hari. Kita set ke jam 00:00 atau jam 06:00?
                                // Mari set ke jam yang sama saat ini, atau default ke 00:00.
                                // Untuk keamanan, kita set ke jam saat ini.

                                const startIso = now.toISOString();
                                const endIso = endDate.toISOString();

                                const success = await updateBotSettings({
                                    manual_close_start: startIso,
                                    manual_close_end: endIso
                                });

                                if (success) {
                                    clearBotSettingsCache();
                                    replyText = `✅ *MODA LIBUR AKTIF*\n\nBot tutup selama *${days} hari*.\nBuka kembali: *${endDate.toLocaleDateString('id-ID')}*`;
                                } else {
                                    replyText = '❌ Gagal menyimpan pengaturan.';
                                }
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            } else {
                                replyText = '⚠️ Jumlah hari tidak wajar. Masukkan 1-30. Ketik 0 batal.';
                            }
                        }
                        // Cek apakah Tanggal (DD-MM-YYYY)
                        else {
                            const iso = parseFlexibleDate(input); // returns YYYY-MM-DD
                            if (iso) {
                                // ISO string from dateParser usually is YYYY-MM-DD.
                                // parseFlexibleDate usage:
                                // if input 05-02-2026 -> 2026-02-05
                                const startDate = new Date();
                                const targetDate = new Date(iso); // This defaults to UTC 00:00 usually
                                targetDate.setHours(6, 5, 0, 0);

                                // Validasi: Tanggal harus masa depan
                                if (targetDate <= startDate) {
                                    replyText = '⚠️ Tanggal harus di masa depan.';
                                } else {
                                    const success = await updateBotSettings({
                                        manual_close_start: startDate.toISOString(),
                                        manual_close_end: targetDate.toISOString()
                                    });

                                    if (success) {
                                        clearBotSettingsCache();
                                        const dateDisplay = targetDate.toLocaleDateString('id-ID');
                                        replyText = `✅ *MODA LIBUR AKTIF*\n\nBot tutup sampai tanggal *${dateDisplay}* (Pukul 06:05).`;
                                    } else {
                                        replyText = '❌ Gagal menyimpan.';
                                    }
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                }
                            } else {
                                if (input === '0') {
                                    replyText = '✅ Batal.';
                                    adminFlowByPhone.set(senderPhone, 'MENU');
                                } else {
                                    replyText = '⚠️ Format tidak dikenali. Masukkan jumlah hari (3) atau tanggal (25-02-2026).';
                                }
                            }
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_TIME_START') {
                        // Wizard Step 1: Input Start Time
                        const timePattern = /^(\d{1,2}):(\d{2})$/;
                        const match = rawTrim.match(timePattern);
                        if (!match) {
                            replyText = '⚠️ Format jam salah. Gunakan HH:mm (contoh: 04:01). Ketik 0 untuk batal.';
                        } else {
                            const h = parseInt(match[1]);
                            const m = parseInt(match[2]);
                            if (h > 23 || m > 59) {
                                replyText = '⚠️ Jam tidak valid (00-23, 00-59).';
                            } else {
                                // Valid. Simpan sementara di draft map
                                const validTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                broadcastDraftMap.set(senderPhone, { targets: [], message: validTime }); // Store START_TIME

                                adminFlowByPhone.set(senderPhone, 'SETTING_CLOSE_TIME_END');
                                replyText = `✅ Mulai tutup: *${validTime}*\n\nSelanjutnya, jam berapa bot akan *BUKA KEMBALI*? (Format HH:mm)\nContoh: *06:05*`;
                            }
                        }

                    } else if (currentAdminFlow === 'SETTING_CLOSE_TIME_END') {
                        // Wizard Step 2: Input End Time & Execute
                        const timePattern = /^(\d{1,2}):(\d{2})$/;
                        const match = rawTrim.match(timePattern);
                        if (!match) {
                            replyText = '⚠️ Format jam salah. Gunakan HH:mm (contoh: 06:05). Ketik 0 untuk batal.';
                        } else {
                            const hEnd = parseInt(match[1]);
                            const mEnd = parseInt(match[2]);
                            if (hEnd > 23 || mEnd > 59) {
                                replyText = '⚠️ Jam tidak valid (00-23, 00-59).';
                            } else {
                                // Ambil start time dari temp storage
                                const draft = broadcastDraftMap.get(senderPhone);
                                const startTimeStr = draft?.message || '00:00'; // Fallback unlikely
                                const [hStartStr, mStartStr] = startTimeStr.split(':');
                                const hStart = parseInt(hStartStr);
                                const mStart = parseInt(mStartStr);

                                // Saat set harian, matikan Manual Override (Libur) jika ada
                                const success = await updateBotSettings({
                                    close_hour_start: hStart,
                                    close_minute_start: mStart,
                                    close_hour_end: hEnd,
                                    close_minute_end: mEnd,
                                    manual_close_start: null, // Reset Long Term
                                    manual_close_end: null
                                });

                                if (success) {
                                    clearBotSettingsCache();
                                    const timeRange = `${startTimeStr} s.d ${String(hEnd).padStart(2, '0')}:${String(mEnd).padStart(2, '0')} WIB`;
                                    replyText = `✅ *JAM TUTUP HARIAN BERHASIL DIUBAH*\n\nBot akan tutup pada:\n🕒 *${timeRange}*\n\nUser tidak bisa input data pada jam tersebut.`;
                                } else {
                                    replyText = '❌ Gagal menyimpan pengaturan.';
                                }

                                broadcastDraftMap.delete(senderPhone); // Clean up
                                adminFlowByPhone.set(senderPhone, 'MENU');
                            }
                        }

                    }
                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                    continue;
                }

                // --- CUSTOMER MENU ---
                if (normalized === '1' || normalized.includes('DAFTAR')) {
                    // New Flow: Ask for Location -> Trigger Menu Bertingkat if 1 chosen
                    // RESET LOCATION STATE -> User harus pilih lokasi baru setiap sesi baru
                    pendingRegistrationData.delete(senderPhone);
                    userLocationChoice.delete(senderPhone);
                    userSpecificLocationChoice.delete(senderPhone);
                    console.log(`[DEBUG] DELETE Specific Location for ${senderPhone} (RESET MENU)`);

                    userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                    replyText = await buildFormatDaftarMessage();
                } else if (normalized === '2' || normalized.startsWith('CEK')) {
                    pendingDelete.delete(senderPhone);
                    const { validCount, totalInvalid, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                    replyText = buildReplyForTodayRecap(validCount, totalInvalid, validItems, processingDayKey);
                    if (validCount > 0) {
                        replyText += '\n💡 _Ketik *EDIT* untuk mengubah data._';
                        replyText += '\n💡 _Ketik *HAPUS 1* atau *HAPUS 1,2,3* untuk menghapus data._';
                    }
                } else if (normalized.startsWith('EDIT')) {
                    // --- HANDLER COMMAND EDIT (STRICT NO ARGS) ---
                    pendingDelete.delete(senderPhone);
                    const args = normalized.replace('EDIT', '').trim();

                    // BLOCK: Jika ada argumen (misal EDIT 1), tolak halus.
                    if (args.length > 0) {
                        replyText = '⚠️ *PERINTAH EDIT BERUBAH*\n\nMohon hanya ketik *EDIT* saja untuk memulai.\nNanti saya akan tampilkan daftar data yang bisa dipilih.';
                        await sock.sendMessage(remoteJid, { text: replyText });
                        continue;
                    }

                    // 1. Ambil data hari ini (Editable items with ID)
                    const items = await getEditableItemsForSender(senderPhone, processingDayKey);

                    if (items.length === 0) {
                        replyText = '⚠️ *DATA KOSONG*\nAnda belum mengirim data hari ini, tidak ada yang bisa diedit.';
                    } else {
                        // 2. Init Session
                        const session: EditSession = {
                            recordsToday: items,
                        };

                        // SHOW LIST TO PICK RECORD
                        editSessionMap.set(senderPhone, session);
                        userFlowByPhone.set(senderPhone, 'EDIT_PICK_RECORD');

                        const listRows = items.map((item, i) => {
                            const typeLabel = (item.lokasi && item.lokasi.startsWith('PASARJAYA')) ? '[PSJ]' : (item.lokasi && item.lokasi.startsWith('FOOD STATION')) ? '[FS]' : '[DHJ]';
                            return `${i + 1}. ${extractChildName(item.nama)} ${typeLabel}`;
                        });

                        replyText = [
                            '📝 *EDIT DATA HARI INI*',
                            '',
                            'Pilih nomor data yang mau diedit:',
                            '',
                            ...listRows,
                            '',
                            '_Ketik nomor urutnya (Contoh: 1)._',
                            '_Ketik 0 untuk batal._'
                        ].join('\n');
                    }

                } else if (normalized.startsWith('HAPUS')) {
                    // FITUR HAPUS DENGAN FORMAT: HAPUS 1 atau HAPUS 1,2,3
                    pendingDelete.delete(senderPhone);
                    const hapusArgs = normalized.replace('HAPUS', '').trim();

                    if (!hapusArgs) {
                        // Jika hanya ketik HAPUS tanpa angka, tampilkan daftar
                        const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                        if (validCount === 0) {
                            replyText = '⚠️ Anda belum mengirim data pendaftaran hari ini.';
                        } else {
                            const list = validItems.map((item, idx) => `${idx + 1}. ${extractChildName(item.nama)} (${item.no_kjp})`).join('\n');
                            replyText = [
                                '🗑️ *HAPUS DATA*',
                                '',
                                'Data Anda hari ini:',
                                list,
                                '',
                                'Ketik *HAPUS 1* untuk hapus data nomor 1',
                                'Ketik *HAPUS 1,2,3* untuk hapus beberapa data',
                                '',
                                '_Ketik MENU untuk kembali._'
                            ].join('\n');
                        }
                    } else {
                        // Parse angka dari HAPUS 1,2,3 atau HAPUS 1 2 3
                        const indices = hapusArgs.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);

                        if (indices.length === 0) {
                            replyText = '⚠️ Format salah. Contoh: *HAPUS 1* atau *HAPUS 1,2,3*';
                        } else {
                            // Hapus data berdasarkan index
                            let successCount = 0;
                            const deletedNames: string[] = [];

                            // Sort descending agar index tidak bergeser saat hapus
                            const sortedIndices = [...indices].sort((a, b) => b - a);

                            for (const idx of sortedIndices) {
                                const res = await deleteDailyDataByIndex(senderPhone, processingDayKey, idx);
                                if (res.success) {
                                    successCount++;
                                    deletedNames.push(res.deletedName || `Data ${idx}`);
                                }
                            }

                            // Cek apakah sukses
                            if (successCount > 0) {
                                // PERBAIKAN: Tampilkan nama yang dihapus
                                const deletedNameStr = deletedNames.length > 0 ? ` *${deletedNames.map(extractChildName).join(', ')}*` : '';
                                replyText = `✅ Sukses menghapus ${successCount} data${deletedNameStr}.`;

                                // Jika data habis, reset flow
                                const { validCount } = await getTodayRecapForSender(senderPhone, processingDayKey);
                                if (validCount === 0) {
                                    userFlowByPhone.set(senderPhone, 'NONE');
                                } else {
                                    // Tampilkan sisa data
                                    replyText += `\n\nSisa data: ${validCount}`;
                                }
                            } else {
                                replyText = '❌ Gagal menghapus data. Pastikan nomor urut benar.';
                            }
                        }
                    }
                } else if (normalized === '3' || normalized.includes('HAPUS DATA')) {
                    pendingDelete.delete(senderPhone); // disable old logic
                    const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);

                    if (validCount === 0) {
                        replyText = '⚠️ Anda belum mengirim data pendaftaran hari ini.';
                    } else {
                        userFlowByPhone.set(senderPhone, 'DELETE_DATA');
                        const list = validItems.map((item, idx) => `${idx + 1}. ${extractChildName(item.nama)} (Kartu: ...${item.no_kjp.slice(-4)})`).join('\n');
                        replyText = [
                            '🗑️ *HAPUS DATA PENDAFTARAN*',
                            '',
                            '📋 Pilih data yang ingin dihapus:',
                            '',
                            list,
                            '',
                            '👇 *Cara hapus:*',
                            '• Ketik *1* untuk hapus satu data',
                            '• Ketik *1,2,3* untuk hapus beberapa sekaligus',
                            '• Ketik *0* untuk batal',
                            '',
                            '_Contoh: Ketik 2 untuk hapus data nomor 2_'
                        ].join('\n');
                    }
                } else if (normalized === 'BATAL' || normalized === 'CANCEL' || normalized === 'UNDO') {
                    // FITUR BATAL: Hapus data terakhir dalam 30 menit
                    const result = await deleteLastSubmission(senderPhone, processingDayKey, 30);

                    if (result.success && result.count > 0) {
                        const namesStr = result.names.map(extractChildName).join(', ');
                        replyText = [
                            '✅ *DATA BERHASIL DIBATALKAN*',
                            '',
                            `Jumlah data dihapus: ${result.count}`,
                            `Nama: ${namesStr}`,
                            '',
                            '_Data pendaftaran terakhir Anda telah dibatalkan._'
                        ].join('\n');
                    } else {
                        replyText = [
                            '⚠️ *TIDAK ADA DATA YANG BISA DIBATALKAN*',
                            '',
                            'Kemungkinan penyebab:',
                            '• Anda belum mengirim data hari ini',
                            '• Data sudah lebih dari 30 menit yang lalu',
                            '',
                            '_Fitur BATAL hanya berlaku untuk data yang dikirim dalam 30 menit terakhir._'
                        ].join('\n');
                    }
                } else if (normalized === '4' || normalized === 'EDIT') {
                    // Handler EDIT dipindahkan dari blok 'EDIT' manual ke menu 4 agar konsisten
                    // (Logic handler 'EDIT' yang ada di bawah blok 'HAPUS' tetap bisa menangkap 'EDIT <args>' karena normalized.startsWith('EDIT'))
                    // Tapi jika user ketik '4', kita trigger EDIT flow
                    pendingDelete.delete(senderPhone);
                    const items = await getEditableItemsForSender(senderPhone, processingDayKey);

                    if (items.length === 0) {
                        replyText = '⚠️ *DATA KOSONG*\nAnda belum mengirim data hari ini, tidak ada yang bisa diedit.';
                    } else {
                        // Init Session
                        const session: EditSession = {
                            recordsToday: items,
                        };

                        // SHOW LIST TO PICK RECORD
                        editSessionMap.set(senderPhone, session);
                        userFlowByPhone.set(senderPhone, 'EDIT_PICK_RECORD');

                        const listRows = items.map((item, i) => {
                            const typeLabel = (item.lokasi && item.lokasi.startsWith('PASARJAYA')) ? '[PSJ]' : (item.lokasi && item.lokasi.startsWith('FOOD STATION')) ? '[FS]' : '[DHJ]';
                            return `${i + 1}. ${extractChildName(item.nama)} ${typeLabel}`;
                        });

                        replyText = [
                            '📝 *EDIT DATA HARI INI*',
                            '',
                            'Pilih nomor data yang mau diedit:',
                            '',
                            ...listRows,
                            '',
                            '_Ketik nomor urutnya (Contoh: 1)._',
                            '_Ketik 0 untuk batal._'
                        ].join('\n');
                    }
                } else if (
                    normalized === '5' ||
                    normalized === 'STATUS' ||
                    normalized === 'CEK STATUS' ||
                    normalized === 'STATUS PENDAFTARAN' ||
                    normalized === 'CEK STATUS PENDAFTARAN'
                ) {
                    if (statusCheckInProgressByPhone.get(senderPhone)) {
                        replyText = '⏳ Permintaan cek status sebelumnya masih diproses. Mohon tunggu sampai selesai.';
                    } else {
                        const providerMap = await getStatusCheckProviderMapping();
                        if (providerMap.size === 0) {
                            replyText = '⛔ Semua lokasi sedang tutup. Silakan coba lagi nanti.';
                        } else if (providerMap.size === 1) {
                            const providerKey = [...providerMap.values()][0] as 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION';
                            if (!isStatusCheckOpen(providerKey)) {
                                replyText = getStatusCheckClosedMessage(providerKey);
                            } else {
                                const result = await processProviderStatusCheck(providerKey);
                                if (result.done) continue;
                                replyText = result.text!;
                            }
                        } else {
                            replyText = await STATUS_CHECK_PROVIDER_MENU();
                            userFlowByPhone.set(senderPhone, 'CHECK_STATUS_SELECT_PROVIDER');
                        }
                    }
                } else if (normalized === '6' || normalized === 'BANTUAN') {
                    replyText = FAQ_MESSAGE;
                } else {

                    // Logic Baru: Terima Partial Success dengan AUTO-DETECT FORMAT
                    const lines = parseRawMessageToLines(messageText);

                    // AUTO-DETECT: Cek apakah baris ke-5 atau setiap baris ke-5 (dalam multi-data) adalah tanggal
                    // FIX: Use looksLikeDate() function instead of simple regex (handles labels like 'Tggl lahir : 12-11-2014')

                    // Deteksi format berdasarkan pattern data
                    let detectedFormat: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION' | null = null;

                    // Cek untuk single data (5 baris = Pasarjaya, 4 baris = Dharmajaya)
                    if (lines.length === 5 && looksLikeDate(lines[4] || '')) {
                        detectedFormat = 'PASARJAYA';
                    } else if (lines.length === 4) {
                        detectedFormat = 'DHARMAJAYA';
                    }
                    // Cek untuk multi data (kelipatan 5 dengan tanggal = Pasarjaya, kelipatan 4 = Dharmajaya) 
                    else if (lines.length >= 5 && lines.length % 5 === 0) {
                        // Cek apakah setiap baris ke-5 adalah tanggal
                        let allDates = true;
                        for (let i = 4; i < lines.length; i += 5) {
                            if (!looksLikeDate(lines[i] || '')) {
                                allDates = false;
                                break;
                            }
                        }
                        if (allDates) detectedFormat = 'PASARJAYA';
                    } else if (lines.length >= 4 && lines.length % 4 === 0) {
                        detectedFormat = 'DHARMAJAYA';
                    }

                    // STRICT LOGIC:
                    // 1. Cek User Choice Session (userLocationChoice)
                    const existingLocation = userLocationChoice.get(senderPhone);
                    const isNewUser = existingLocation === undefined;

                    // 2. Logic "Block jika format tidak sesuai user choice"
                    // - Pasarjaya (5 baris) dikirim 4 baris => TOLAK (detectedFormat=DHARMAJAYA)
                    // - Dharmajaya (4 baris) dikirim 5 baris => TOLAK (detectedFormat=PASARJAYA) -> Bisa debatable, tapi biar strict kita tolak
                    let blockStrictMismatch = false;

                    if (existingLocation === 'PASARJAYA' && detectedFormat === 'DHARMAJAYA') {
                        // User sudah pilih Pasarjaya, tapi input 4 baris (terdeteksi Dharmajaya)
                        blockStrictMismatch = true;
                    } else if (existingLocation === 'DHARMAJAYA' && detectedFormat === 'PASARJAYA') {
                        // User sudah pilih Dharmajaya (4 baris), tapi kirim format Pasarjaya (5 baris)
                        // Kita TOLAK juga agar konsisten
                        blockStrictMismatch = true;
                    } else if (existingLocation === 'FOOD_STATION' && detectedFormat === 'PASARJAYA') {
                        // User sudah pilih Food Station (4 baris), tapi kirim format Pasarjaya (5 baris)
                        blockStrictMismatch = true;
                    }

                    // 3. Logic "Tanya Dulu jika user baru"
                    // Jika user belum pernah pilih lokasi (isNewUser) dan langsung kirim data valid,
                    // KITA BLOCK DULU DAN TANYA LOKASI.
                    // Kecuali jika anda ingin auto-accept User Baru. Tapi requestnya adalah "Tanya dulu".
                    let blockAskLocation = false;
                    if (isNewUser && detectedFormat) {
                        blockAskLocation = true;
                    }

                    // --- EXECUTION BLOCKS ---

                    if (blockAskLocation) {
                        if ((await isProviderBlocked('PASARJAYA')) && detectedFormat === 'PASARJAYA') {
                            await sock.sendMessage(remoteJid, {
                                text: '⚠️ PasarJaya sementara ditutup.\nSilakan pilih lokasi lain dari menu.\n\n' + await buildFormatDaftarMessage()
                            });
                            userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                            continue;
                        }
                        const locationPromptText = await buildSelectLocationFirstPromptText();
                        // Tolak halus dan minta pilih lokasi
                        await sock.sendMessage(remoteJid, {
                            text: locationPromptText
                        });
                        userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                        // Jangan continue, biarkan logic bawah skip karena if (lines.length >= minLines) akan kita guard
                        // Tapi agar aman, kita return loop ini atau continue
                        continue;
                    }

                    if (blockStrictMismatch) {
                        if (existingLocation === 'PASARJAYA') {
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *DATA TERTOLAK (Salah Format)*\n\nAnda memilih **PASARJAYA**, maka wajib kirim **5 Baris** (termasuk Tanggal Lahir).\n\nAnda hanya mengirim 4 baris.\nSilakan lengkapi data Anda dengan Tanggal Lahir di baris ke-5.`
                            });
                        } else {
                            const locationLabel = existingLocation === 'FOOD_STATION' ? 'FOOD STATION' : 'DHARMAJAYA';
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *DATA TERTOLAK (Salah Format)*\n\nAnda memilih **${locationLabel}**, maka format data harus **4 Baris**.\n\nAnda mengirim 5 baris (dengan tanggal lahir).\nSilakan hapus baris tanggal lahir lalu kirim ulang.`
                            });
                        }
                        continue;
                    }

                    // Jika lolos semua block, tentukan final Context
                    // Jika user sudah punya choice, pakai choice. Jika baru (yg lolos), pakai detected.
                    // Tapi karena kita sudah blockAskLocation=true untuk user baru, maka di sini pasti existingLocation ada ATAU (jika kita disable blockAskLocation nanti).
                    // Untuk saat ini logicnya: Kita pakai existingLocation sebagai 'Truth'.
                    // Kalau user maksa kirim PASARJAYA format saat mode DHARMAJAYA, mungkin kita terima (upgrade)?
                    // Sesuai request: "Kalo sudah pilih Pasarjaya, HARUS 5 baris".

                    // Final decision logic:
                    let finalContext: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION' = existingLocation || detectedFormat || 'DHARMAJAYA';

                    // Update session biar sinkron (misal upgrade dari Dharmajaya ke Pasarjaya jika diperbolehkan, tapi strict mode melarang sebaliknya)
                    if (detectedFormat && !blockStrictMismatch && !isNewUser) {
                        // Allow switch context IF it matches strict rules (e.g. Dharmajaya user sends 5 lines -> maybe allow? or strict reject?)
                        // Request user hanya bilang "Kalau Pasarjaya harus 5 baris". Tidak bilang sebaliknya.
                        // Kita update aja jika valid.
                        userLocationChoice.set(senderPhone, detectedFormat);
                        finalContext = detectedFormat;
                    }

                    if (finalContext === 'FOOD_STATION') {
                        const fsCloseStatus = await isSpecificLocationClosed('FOOD_STATION', 'FOD STATION');
                        if (fsCloseStatus.closed) {
                            const reasonSuffix = fsCloseStatus.reason ? `\nAlasan: ${fsCloseStatus.reason}` : '';
                            userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                            await sock.sendMessage(remoteJid, {
                                text: `⚠️ *Foodstation* sedang ditutup sementara.${reasonSuffix}\nSilakan pilih lokasi lain.`
                            });
                            continue;
                        }
                    }

                    const minLines = finalContext === 'PASARJAYA' ? 5 : 4;

                    if (lines.length >= minLines) {
                        // Ambil lokasi spesifik dari session sebelumnya (jika ada)
                        const storedSpecificLocation = userSpecificLocationChoice.get(senderPhone);
                        console.log(`[DEBUG] GET Specific Location for ${senderPhone}: ${storedSpecificLocation}`);

                        // VALIDASI BARU: Jika PASARJAYA tapi belum pilih lokasi spesifik, minta pilih dulu
                        if (finalContext === 'PASARJAYA' && !storedSpecificLocation) {
                            if (await isProviderBlocked('PASARJAYA')) {
                                userLocationChoice.delete(senderPhone);
                                userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                                await sock.sendMessage(remoteJid, {
                                    text: '⚠️ PasarJaya sementara ditutup.\nSilakan pilih lokasi lain.\n\n' + await buildFormatDaftarMessage()
                                });
                                continue;
                            }
                            // Simpan data pending agar tidak perlu kirim ulang
                            pendingRegistrationData.set(senderPhone, messageText);
                            userFlowByPhone.set(senderPhone, 'SELECT_PASARJAYA_SUB');
                            await sock.sendMessage(remoteJid, {
                                text: [
                                    '📍 *PILIH LOKASI PENGAMBILAN DULU*',
                                    '',
                                    'Data Anda sudah terdeteksi format Pasarjaya (5 baris).',
                                    'Tapi saya perlu tahu lokasi pengambilannya dimana?',
                                    '',
                                    '1. 🏭 Jakgrosir Kedoya',
                                    '2. 🏙️ Gerai Rusun Pesakih',
                                    '3. 🏪 Mini DC Kec. Cengkareng',
                                    '4. 🛒 Jakmart Bambu Larangan',
                                    '5. 📝 Lokasi Lain...',
                                    '',
                                    '_Ketik angka pilihanmu! (1-5)_'
                                ].join('\n')
                            });
                            continue;
                        }

                        if (storedSpecificLocation && storedSpecificLocation.startsWith('DHARMAJAYA - ')) {
                            const subLocation = storedSpecificLocation.replace('DHARMAJAYA - ', '').trim();
                            const closeStatus = await isSpecificLocationClosed('DHARMAJAYA', subLocation);
                            if (closeStatus.closed) {
                                pendingRegistrationData.set(senderPhone, messageText);
                                userFlowByPhone.set(senderPhone, 'SELECT_DHARMAJAYA_SUB');
                                const reasonSuffix = closeStatus.reason ? `\nAlasan: ${closeStatus.reason}` : '';
                                const statusMenuText = await buildDharmajayaMenuWithStatus();
                                await sock.sendMessage(remoteJid, {
                                    text: `⚠️ Lokasi *${subLocation}* sedang penuh dan ditutup sementara.${reasonSuffix}\nSilakan pilih lokasi lain yang tersedia.\n\n${statusMenuText}`
                                });
                                continue;
                            }
                        }

                        if (storedSpecificLocation && storedSpecificLocation.startsWith('PASARJAYA - ')) {
                            const subLocation = storedSpecificLocation.replace('PASARJAYA - ', '').trim();
                            const closeStatus = await isSpecificLocationClosed('PASARJAYA', subLocation);
                            if (closeStatus.closed) {
                                pendingRegistrationData.set(senderPhone, messageText);
                                userFlowByPhone.set(senderPhone, 'SELECT_PASARJAYA_SUB');
                                const reasonSuffix = closeStatus.reason ? `\nAlasan: ${closeStatus.reason}` : '';
                                await sock.sendMessage(remoteJid, {
                                    text: `⚠️ Lokasi *${subLocation}* sedang ditutup sementara.${reasonSuffix}\nSilakan pilih lokasi lain.`
                                });
                                continue;
                            }
                        }

                        if (storedSpecificLocation && (storedSpecificLocation === 'FOD STATION' || storedSpecificLocation.startsWith('FOOD_STATION'))) {
                            const closeStatus = await isSpecificLocationClosed('FOOD_STATION', 'FOD STATION');
                            if (closeStatus.closed) {
                                const reasonSuffix = closeStatus.reason ? `\nAlasan: ${closeStatus.reason}` : '';
                                userFlowByPhone.set(senderPhone, 'SELECT_LOCATION');
                                await sock.sendMessage(remoteJid, {
                                    text: `⚠️ *Foodstation* sedang ditutup sementara.${reasonSuffix}\nSilakan pilih lokasi lain.`
                                });
                                continue;
                            }
                        }

                        const logJson = await processRawMessageToLogJson({
                            text: messageText,
                            senderPhone,
                            messageId: msg.key.id,
                            receivedAt,
                            tanggal: tanggalWib,
                            processingDayKey,
                            locationContext: finalContext, // PASS CONTEXT
                            specificLocation: storedSpecificLocation // PASS STORED SPECIFIC LOCATION
                        });

                        // INJECT SENDER NAME (untuk disimpan di tabe data_harian)
                        logJson.sender_name = existingName || undefined;

                        if (logJson.stats.total_blocks > 0) {
                            // Ambil detail data hari ini (fetch fresh data to show in reply)
                            const { validCount, validItems } = await getTodayRecapForSender(senderPhone, processingDayKey);
                            const totalTodayIncludingCurrent = validCount + (logJson.stats.ok_count || 0);

                            // STRICT VALIDATION:
                            // Jika ada sisa baris (remainder) yang gagal diparsing, TOLAK SELURUH PESAN.
                            // Jangan simpan partial clean data. User harus kirim ulang dengan benar.
                            if (logJson.failed_remainder_lines && logJson.failed_remainder_lines.length > 0) {
                                // REJECTION REPLY
                                const expectedLines = finalContext === 'PASARJAYA' ? 5 : 4;
                                replyText = [
                                    '❌ *DATA BELUM LENGKAP / FORMAT SALAH*',
                                    '',
                                    `⚠️ Anda mengirim data dengan jumlah baris yang tidak sesuai`,
                                    `Lokasi: *${finalContext}*`,
                                    `Syarat: *${expectedLines} baris per data*`,
                                    '',
                                    '❌ *MASALAH:*',
                                    'Ada baris data yang menggantung / tidak lengkap.',
                                    '',
                                    '💡 *SOLUSI:*',
                                    'Pastikan setiap 1 data orang terdiri dari ' + expectedLines + ' baris.',
                                    'Jika daftar banyak orang, pisahkan dengan baris kosong/enter.',
                                    '',
                                    '👇 *CONTOH YANG BENAR:*',
                                    finalContext === 'PASARJAYA'
                                        ? 'Siti Aminah\n5049488500001234\n3171234567890123\n3171098765432109\n15-08-1975'
                                        : 'Siti Aminah\n5049488500001234\n3171234567890123\n3171098765432109',
                                    '',
                                    'Mohon kirim ulang ya Bu/Pak 🙏'
                                ].join('\n');
                            } else {
                                // DATA BERSIH (Valid Blocks Only & No Remainder) -> PROSES SIMPAN
                                const quotaCheck = await checkLocationQuotaBeforeSave(logJson, senderPhone);
                                if (!quotaCheck.allowed) {
                                    replyText = quotaCheck.message || '⛔ Batas lokasi tercapai.';
                                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                const hasPendingUnknownRegion = await queueUnknownRegionConfirmationIfNeeded({
                                    sockInstance: sock,
                                    remoteJid,
                                    senderPhone,
                                    logJson,
                                    originalText: messageText,
                                    locationContext: finalContext,
                                    processingDayKey,
                                });
                                if (hasPendingUnknownRegion) {
                                    continue;
                                }

                                const hasPendingUnderage = await queueUnderageConfirmationIfNeeded({
                                    sockInstance: sock,
                                    remoteJid,
                                    senderPhone,
                                    logJson,
                                    originalText: messageText,
                                    locationContext: finalContext,
                                    processingDayKey,
                                });
                                if (hasPendingUnderage) {
                                    continue;
                                }

                                const globalQuotaCheck = await checkGlobalLocationQuotaBeforeSave(
                                    logJson,
                                    msg.key.id || `${senderPhone}-${Date.now()}`
                                );
                                if (!globalQuotaCheck.allowed) {
                                    replyText = globalQuotaCheck.message || '⛔ Kuota global lokasi tercapai.';
                                    if (replyText) await sock.sendMessage(remoteJid, { text: replyText });
                                    continue;
                                }

                                const saveResult = await saveLogAndOkItems(logJson, messageText);

                                if (!saveResult.success) {
                                    await releaseGlobalQuotaReservationIfNeeded(globalQuotaCheck.reservation);
                                    console.error('❌ Gagal simpan ke database (AUTO-DETECT):', saveResult.dataError);
                                    replyText = buildDatabaseErrorMessage(saveResult.dataError, logJson);
                                } else {
                                    // Refresh total after saving
                                    // FIX: Sort by received_at (Kronologis)
                                    const { validCount: finalTotalCount, validItems: finalItems } = await getTodayRecapForSender(senderPhone, processingDayKey, 'received_at');
                                    replyText = buildReplyForNewData(logJson, finalTotalCount, finalContext, finalItems);
                                }
                            }
                        } else {
                            // Kasus langka: >= 4 baris tapi tidak ada blok valid satu pun?
                            replyText = `⚠️ *Format Data Salah*\nPastikan format sesuai dengan lokasi **${finalContext}** (${minLines} baris per orang).`;
                        }
                    }
                }

                if (!replyText) {
                    if (isGreetingOrMenu(normalized)) {
                        pendingDelete.delete(senderPhone);
                        userLocationChoice.delete(senderPhone);
                        userSpecificLocationChoice.delete(senderPhone);

                        await sendMainMenu(sock, remoteJid, isAdmin);
                    } else {
                        // Cek apakah ini percobaan kirim data dengan format salah
                        const inputLineCount = parseRawMessageToLines(messageText).length;

                        if (inputLineCount >= 2 && inputLineCount <= 3) {
                            // 2-3 baris = kemungkinan data tidak lengkap
                            // Cek apakah ada angka panjang (nomor kartu/KTP) di salah satu baris
                            const hasLongNumbers = inputLines.some(line => {
                                const digits = line.replace(/\D/g, '');
                                return digits.length >= 10;
                            });

                            if (hasLongNumbers) {
                                // Kemungkinan user coba kirim data tapi tidak lengkap
                                const formatGuide = `⚠️ *DATA TIDAK LENGKAP*

Kirim data dalam *4 BARIS* sekaligus:

1. Nama
2. Nomor Kartu (tulis nama kartu di sampingnya jika bukan KJP)
3. Nomor KTP (NIK)
4. Nomor KK

Contoh:
Budi
5049488500001111 LANSIA (Khusus anak KJP, tulisan LANSIA-nya dihapus aja)
3173444455556666
3173555566667777

Ketik *1* untuk panduan daftar.`;
                                await sock.sendMessage(remoteJid, { text: formatGuide });
                            } else {
                                // Input random 2-3 kata/baris tanpa angka panjang
                                await sock.sendMessage(remoteJid, { text: 'Hai! 👋 Mau daftar sembako?\n\nKetik *1* untuk mulai~ 😊' });
                            }
                        } else if (inputLineCount >= 5 && inputLineCount % 4 !== 0 && inputLineCount % 5 !== 0) {
                            // 5+ baris tapi bukan kelipatan 4 atau 5
                            const formatGuide = `⚠️ *DATA TIDAK LENGKAP*

Jumlah baris harus kelipatan:
• 4 baris (Dharmajaya: Nama, Kartu, KTP, KK)
• 5 baris (Pasarjaya: Nama, Kartu, KTP, KK, Tanggal Lahir)

Anda mengirim ${inputLineCount} baris.

Ketik MENU untuk bantuan.`;
                            await sock.sendMessage(remoteJid, { text: formatGuide });
                        } else {
                            // Input lain (mungkin emoji, stiker, dll)
                            await sock.sendMessage(remoteJid, { text: 'Hai! 👋 Mau daftar sembako?\n\nKetik *1* untuk mulai~ 😊' });
                        }
                    }
                    continue;
                }

                await sock.sendMessage(remoteJid, { text: replyText });
                console.log(`📤 Balasan terkirim ke ${senderPhone}`);
            } catch (error) {
                console.error('Error memproses pesan:', error);
            } finally {
                const messageId = msg.key.id || '';
                if (messageId && senderPhoneForLock && processingDayKeyForLock) {
                    const key = buildMessageIdempotencyKey(senderPhoneForLock, processingDayKeyForLock, messageId);
                    inFlightMessageKeys.delete(key);
                }
            }
        }
    });
    } catch (error) {
        lastConnectionState = 'connect_error';
        console.error('❌ Gagal inisialisasi koneksi WA:', error);
        throw error;
    } finally {
        isConnecting = false;
    }
}

// --- HELPER FUNCTION: EXECUTE BROADCAST ---
async function executeBroadcast(sock: any, draft: BroadcastDraft, remoteJid: string, senderPhone: string) {
    const count = draft.targets.length;
    await sock.sendMessage(remoteJid, { text: `⏳ Mengirim pesan ke ${count} kontak...` });

    let successCount = 0;
    for (const phone of draft.targets) {
        try {
            const targetJid = phone + '@s.whatsapp.net';
            await sock.sendMessage(targetJid, { text: draft.message });
            successCount++;
            await new Promise(r => setTimeout(r, 1000)); // Delay aman
        } catch (e) {
            console.error(`Gagal broadcast ke ${phone}`);
        }
    }
    await sock.sendMessage(remoteJid, { text: `✅ Broadcast selesai.\nSukses kirim ke: ${successCount} dari ${count}.` });
}


