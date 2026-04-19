// src/supabase.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { LogItem, LogJson, DuplicateKind, DuplicateInfo } from './types';
import { getStartOfNextWibMonthUTC, getStartOfWibMonthUTC, getWibParts, getWibTimeHHmm, isLastDayOfWibMonth } from './time';
import { getLocationQuotaLimit } from './services/locationQuota';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_KEY || anonKey;

// Gunakan Service Key jika ada (untuk Admin Delete bypass RLS), jika tidak fallback ke Anon Key
export const supabase = createClient(url, serviceKey);

// --- CACHE USER TERDAFTAR (In-Memory) ---
// Map<PhoneNumber, PushName>
// Map<PhoneNumber, PushName>
const registeredUsersCache = new Map<string, string>();
// Map<LidJid, PhoneNumber> -> Untuk resolusi cepat
const lidToPhoneCache = new Map<string, string>();
let isCacheInitialized = false;

function normalizeWhitelistPhone(phone: string): string {
    return String(phone || '').trim().replace(/\D/g, '');
}

export async function initRegisteredUsersCache() {
    if (isCacheInitialized) return;
    console.log('🔄 Memuat cache pengguna terdaftar...');

    // Ambil semua data dari lid_phone_map
    const { data, error } = await supabase
        .from('lid_phone_map')
        .select('lid_jid, phone_number, push_name');

    if (error) {
        console.error('❌ Gagal memuat cache pengguna:', error.message);
        return;
    }

    if (data) {
        data.forEach(row => {
            // Cache Phone -> Name
            if (row.phone_number) {
                registeredUsersCache.set(row.phone_number, row.push_name || '');
            }
            // Cache LID -> Phone
            if (row.lid_jid && row.phone_number) {
                lidToPhoneCache.set(row.lid_jid, row.phone_number);
            }
        });
        console.log(`✅ Cache pengguna dimuat: ${registeredUsersCache.size} user, ${lidToPhoneCache.size} LID mapping.`);
    }
    isCacheInitialized = true;
}

export function getRegisteredUserNameSync(phoneNumber: string): string | null {
    // Cek dulu apakah key ini sebenarnya adalah LID?
    const mappedPhone = lidToPhoneCache.get(phoneNumber);
    const key = mappedPhone || phoneNumber;

    return registeredUsersCache.get(key) || null;
}

/**
 * FALLBACK: Jika user tidak ditemukan di cache, coba query ke database.
 * Ini mengatasi masalah ketika cache gagal load saat startup.
 * Jika ditemukan, cache akan diupdate.
 */
export async function getRegisteredUserNameWithFallback(phoneNumber: string): Promise<string | null> {
    // 1. Cek cache dulu (cepat)
    const cachedName = getRegisteredUserNameSync(phoneNumber);
    if (cachedName !== null) {
        return cachedName;
    }

    // 2. Fallback: Query database
    try {
        const { data, error } = await supabase
            .from('lid_phone_map')
            .select('phone_number, push_name, lid_jid')
            .eq('phone_number', phoneNumber)
            .limit(1)
            .single();

        if (error || !data) {
            // User memang belum terdaftar
            return null;
        }

        // 3. User ditemukan di DB! Update cache agar tidak query lagi
        if (data.phone_number) {
            registeredUsersCache.set(data.phone_number, data.push_name || '');
            console.log(`🔄 Cache fallback: User ${data.phone_number} dimuat dari database.`);
        }
        if (data.lid_jid && data.phone_number) {
            lidToPhoneCache.set(data.lid_jid, data.phone_number);
        }

        return data.push_name || '';
    } catch (e) {
        console.error('❌ Error getRegisteredUserNameWithFallback:', e);
        return null;
    }
}

export function getPhoneFromLidSync(lid: string): string | null {
    return lidToPhoneCache.get(lid) || null;
}

export async function isPhoneWhitelisted(phoneNumber: string): Promise<boolean> {
    const normalizedPhone = normalizeWhitelistPhone(phoneNumber);
    if (!normalizedPhone) {
        return false;
    }

    const { data, error } = await supabase
        .from('whitelisted_phones')
        .select('phone_number')
        .eq('phone_number', normalizedPhone)
        .maybeSingle();

    if (error) {
        console.error('❌ isPhoneWhitelisted error:', error.message);
        return false;
    }

    return Boolean(data?.phone_number);
}

// --- HITUNG TOTAL DATA HARI INI UNTUK PENGIRIM ---
export async function getTotalDataTodayForSender(
    senderPhone: string,
    processingDayKey: string
): Promise<number> {
    const { count, error } = await supabase
        .from('data_harian')
        .select('*', { count: 'exact', head: true })
        .eq('sender_phone', senderPhone)
        .eq('processing_day_key', processingDayKey);

    if (error) {
        console.error('Error getTotalDataTodayForSender:', error);
        return 0;
    }
    return count ?? 0;
}

export async function checkDuplicateForItem(
    item: LogItem,
    ctx: { processingDayKey: string; senderPhone: string; tanggal: string }
): Promise<LogItem> {
    // Legacy function wrapper for backward compatibility if needed, 
    // but we will use batch version primarily.
    const [result] = await checkDuplicatesBatch([item], ctx);
    return result;
}

export async function checkDuplicatesBatch(
    items: LogItem[],
    ctx: { processingDayKey: string; senderPhone: string; tanggal: string }
): Promise<LogItem[]> {
    const { processingDayKey, senderPhone } = ctx;

    // Filter items yang statusnya OK (hanya ini yang perlu dicek ke DB)
    const activeItems = items.filter(it => it.status === 'OK');
    if (activeItems.length === 0) return items;

    // Collect IDs for Batch Query
    const allKjp = new Set<string>();
    const allKtp = new Set<string>();

    activeItems.forEach(it => {
        if (it.parsed.no_kjp) allKjp.add(it.parsed.no_kjp);
        if (it.parsed.no_ktp) allKtp.add(it.parsed.no_ktp);
    });

    // QUERY 1: GLOBAL DUPLICATES (ID Check) - Single Query
    // Note: Supabase .or() syntax: "col1.in.(val1,val2),col2.in.(val3,val4)"
    const conditions: string[] = [];
    if (allKjp.size > 0) conditions.push(`no_kjp.in.(${Array.from(allKjp).join(',')})`);
    if (allKtp.size > 0) conditions.push(`no_ktp.in.(${Array.from(allKtp).join(',')})`);

    let globalDupes: any[] = [];
    if (conditions.length > 0) {
        const orClause = conditions.join(',');
        const { data, error } = await supabase
            .from('data_harian')
            .select('nama, no_kjp, no_ktp, no_kk, sender_phone')
            .eq('processing_day_key', processingDayKey)
            .or(orClause);

        if (!error && data) {
            globalDupes = data;
        } else if (error) {
            console.error('Error batch global dupes:', error);
        }
    }

    const sameSenderNameMap = new Map<string, { nama: string; no_kjp: string; no_ktp: string; no_kk: string }>();
    const activeCanonicalNames = Array.from(
        new Set(
            activeItems
                .map((it) => it.parsed.name_canonical || normalizeNameForDedup(it.parsed.nama || ''))
                .filter((v) => v.length > 0)
        )
    );

    if (activeCanonicalNames.length > 0) {
        const { data, error } = await supabase
            .from('data_harian')
            .select('nama, no_kjp, no_ktp, no_kk')
            .eq('processing_day_key', processingDayKey)
            .eq('sender_phone', senderPhone)
            .not('nama', 'is', null);

        if (!error && data) {
            for (const row of data as Array<{ nama?: string | null; no_kjp?: string | null; no_ktp?: string | null; no_kk?: string | null }>) {
                const canonical = normalizeNameForDedup(row.nama || '');
                if (!canonical || sameSenderNameMap.has(canonical)) continue;
                sameSenderNameMap.set(canonical, {
                    nama: row.nama || '-',
                    no_kjp: row.no_kjp || '-',
                    no_ktp: row.no_ktp || '-',
                    no_kk: row.no_kk || '-',
                });
            }
        } else if (error) {
            console.error('Error batch same sender names:', error);
        }
    }

    // PROCESS CHECKING IN-MEMORY
    return items.map(item => {
        if (item.status !== 'OK') return item;

        const duplicatedFields: string[] = [];
        let conflictFound = false;
        let firstKind: DuplicateKind | null = null;
        let firstDupData: any = null;

        const getOwnerName = (dupData: any) => {
            return (dupData as any).nama ? (dupData as any).nama.toUpperCase() : 'ORANG LAIN';
        };

        // Check IDs (Global)
        // Find match in globalDupes
        const kjpMatch = globalDupes.find(d => d.no_kjp === item.parsed.no_kjp);
        if (kjpMatch) {
            conflictFound = true;
            firstKind = firstKind || 'NO_KJP';
            firstDupData = firstDupData || kjpMatch;
            duplicatedFields.push('No Kartu');
        }

        const ktpMatch = globalDupes.find(d => d.no_ktp === item.parsed.no_ktp);
        if (ktpMatch) {
            conflictFound = true;
            firstKind = firstKind || 'NO_KTP';
            firstDupData = firstDupData || ktpMatch;
            duplicatedFields.push('KTP');
        }

        if (conflictFound) {
            const matchSource = firstDupData || kjpMatch || ktpMatch;
            const isSameSender = matchSource && matchSource.sender_phone === ctx.senderPhone;
            const owner = matchSource ? getOwnerName(matchSource) : 'ORANG LAIN';
            const fieldText = duplicatedFields.length > 0 ? duplicatedFields.join(', ') : 'No Kartu/KTP';
            
            let finalMsg = '';
            const namaTerkirim = item.parsed.nama || 'Tidak diketahui';
            if (isSameSender) {
                finalMsg = [
                    `Data ini sudah pernah Ibu/Bapak kirim hari ini.`,
                    `Yang sama: ${fieldText}`,
                    `Nama terkirim: ${namaTerkirim}`,
                    `Nama sebelumnya: ${owner}`,
                    `Silakan kirim data lain yang belum terdaftar.`
                ].join('\n');
            } else {
                finalMsg = [
                    `Data ini sudah terdaftar hari ini oleh nomor WA lain.`,
                    `Yang sama: ${fieldText}`,
                    `Nama terkirim: ${namaTerkirim}`,
                    `Nama terdaftar: ${owner}`
                ].join('\n');
            }
            
            const info: DuplicateInfo = {
                kind: firstKind || 'NO_KJP',
                processing_day_key: processingDayKey,
                safe_message: finalMsg,
                first_seen_at: null,
                first_seen_wib_time: null,
                original_data: firstDupData ? {
                    nama: firstDupData.nama || '',
                    no_kjp: firstDupData.no_kjp || '',
                    no_ktp: firstDupData.no_ktp || '',
                    no_kk: firstDupData.no_kk || '',
                } : null,
            };

            return {
                ...item,
                status: 'SKIP_DUPLICATE',
                duplicate_info: info,
            };
        }

        const canonicalName = item.parsed.name_canonical || normalizeNameForDedup(item.parsed.nama || '');
        if (!canonicalName) return item;

        const sameSenderNameHit = sameSenderNameMap.get(canonicalName);
        if (!sameSenderNameHit) return item;

        const info: DuplicateInfo = {
            kind: 'NAME',
            processing_day_key: processingDayKey,
            safe_message: [
                '❌ *Data belum bisa diproses*',
                'Nama ini sudah pernah dikirim hari ini 🙏',
                'Biar bisa lanjut, coba:',
                '- ganti nama lain, atau',
                '- tambahin angka di belakang nama (contoh: *Budi 2*)',
            ].join('\n'),
            first_seen_at: null,
            first_seen_wib_time: null,
            original_data: {
                nama: sameSenderNameHit.nama || '',
                no_kjp: sameSenderNameHit.no_kjp || '',
                no_ktp: sameSenderNameHit.no_ktp || '',
                no_kk: sameSenderNameHit.no_kk || '',
            },
        };

        return {
            ...item,
            status: 'SKIP_DUPLICATE',
            duplicate_info: info,
        };
    });
}

export type BlockedKtpItem = {
    no_ktp: string;
    reason?: string | null;
    created_at?: string;
};

export type BlockedKkItem = {
    no_kk: string;
    reason?: string | null;
    created_at?: string | null;
};

export type BlockedKjpItem = {
    no_kjp: string;
    reason?: string | null;
    created_at?: string | null;
};

export type BlockedPhoneItem = {
    phone_number: string;
    reason?: string | null;
    created_at?: string | null;
};

export type BlockedLocationItem = {
    location_key: string;
    reason?: string | null;
    is_active?: boolean;
    created_at?: string | null;
    updated_at?: string | null;
};

export type GlobalLocationQuotaItem = {
    location_key: string;
    daily_limit: number;
    is_enabled: boolean;
};

export type GlobalLocationQuotaDecision = {
    location_key: string;
    allowed: boolean;
    limit_value: number | null;
    used_before: number;
    requested_count: number;
    used_after: number;
    reason: string | null;
};

export type GlobalLocationQuotaReservation = {
    processingDayKey: string;
    messageId: string;
    locations: Array<{ locationKey: string; reservedCount: number }>;
};

export type GlobalLocationQuotaReserveResult = {
    success: boolean;
    message?: string;
    decisions: GlobalLocationQuotaDecision[];
    reservation?: GlobalLocationQuotaReservation;
};

function normalizeNameForDedup(raw: string): string {
    if (!raw) return '';

    return raw
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeKk(raw: string): string {
    return (raw || '').replace(/\D/g, '');
}

function normalizeKjp(raw: string): string {
    return (raw || '').replace(/\D/g, '');
}

function normalizePhoneNumber(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    if (digits.startsWith('8')) digits = `62${digits}`;
    return digits;
}

function normalizeLocationKey(raw: string): string {
    return (raw || '').trim().replace(/\s+/g, ' ');
}

type GlobalQuotaUsageDelta = {
    processingDayKey: string;
    locationKey: string;
    delta: number;
};

function groupGlobalQuotaUsageDeltas(deltas: GlobalQuotaUsageDelta[]): GlobalQuotaUsageDelta[] {
    const grouped = new Map<string, number>();

    for (const item of deltas) {
        const dayKey = (item.processingDayKey || '').trim();
        const locationKey = normalizeLocationKey(item.locationKey || '');
        const delta = Number(item.delta) || 0;
        if (!dayKey || !locationKey || delta === 0) continue;

        const key = `${dayKey}||${locationKey}`;
        grouped.set(key, (grouped.get(key) || 0) + delta);
    }

    const result: GlobalQuotaUsageDelta[] = [];
    grouped.forEach((delta, key) => {
        if (delta === 0) return;
        const [processingDayKey, locationKey] = key.split('||');
        result.push({ processingDayKey, locationKey, delta });
    });

    return result;
}

async function applyGlobalQuotaUsageDeltas(deltas: GlobalQuotaUsageDelta[]): Promise<void> {
    const grouped = groupGlobalQuotaUsageDeltas(deltas);
    if (grouped.length === 0) return;

    for (const item of grouped) {
        try {
            const { error } = await supabase.rpc('apply_global_location_quota_delta', {
                p_processing_day_key: item.processingDayKey,
                p_location_key: item.locationKey,
                p_delta: item.delta,
            });

            if (error) {
                if (
                    isMissingTableError(error, 'location_global_quota_usage') ||
                    (error.code === '42883' && (error.message || '').includes('apply_global_location_quota_delta'))
                ) {
                    continue;
                }
                console.error('Error apply quota usage delta via RPC:', error);
            }
        } catch (error) {
            console.error('Exception applyGlobalQuotaUsageDeltas:', error);
        }
    }
}

export async function getTotalDataTodayForSenderByLocation(
    senderPhone: string,
    processingDayKey: string,
    locationKey: string
): Promise<number> {
    const locationNormalized = normalizeLocationKey(locationKey);

    const { count, error } = await supabase
        .from('data_harian')
        .select('id', { count: 'exact', head: true })
        .eq('sender_phone', senderPhone)
        .eq('processing_day_key', processingDayKey)
        .eq('lokasi', locationNormalized);

    if (error) {
        console.error(`Error getTotalDataTodayForSenderByLocation for ${senderPhone}:`, error.message);
        return -1;
    }

    return count || 0;
}

export type GlobalLocationQuotaListEntry = {
    locationKey: string;
    limit: number | null;
    enabled: boolean;
};

type GlobalLocationQuotaRow = {
    location_key: string;
    daily_limit: number;
    is_enabled: boolean;
};

function toGlobalLocationQuotaDecision(row: unknown): GlobalLocationQuotaDecision | null {
    if (!row || typeof row !== 'object') return null;
    const data = row as Record<string, unknown>;
    if (typeof data.location_key !== 'string') return null;

    const limitValue = typeof data.limit_value === 'number' ? data.limit_value : null;
    const usedBefore = typeof data.used_before === 'number' ? data.used_before : 0;
    const requestedCount = typeof data.requested_count === 'number' ? data.requested_count : 0;
    const usedAfter = typeof data.used_after === 'number' ? data.used_after : usedBefore;

    return {
        location_key: data.location_key,
        allowed: Boolean(data.allowed),
        limit_value: limitValue,
        used_before: usedBefore,
        requested_count: requestedCount,
        used_after: usedAfter,
        reason: typeof data.reason === 'string' ? data.reason : null,
    };
}

export async function listGlobalLocationQuotaLimits(locationKeys: string[]): Promise<GlobalLocationQuotaListEntry[]> {
    const normalizedKeys = Array.from(
        new Set(
            locationKeys
                .map(normalizeLocationKey)
                .filter(Boolean)
        )
    );

    if (normalizedKeys.length === 0) return [];

    const { data, error } = await supabase
        .from('location_global_quota_limits')
        .select('location_key, daily_limit, is_enabled')
        .in('location_key', normalizedKeys);

    if (error) {
        if (!isMissingTableError(error, 'location_global_quota_limits')) {
            console.error('Error listGlobalLocationQuotaLimits:', error);
        }
        return normalizedKeys.map(locationKey => ({
            locationKey,
            limit: null,
            enabled: false,
        }));
    }

    const byLocation = new Map<string, GlobalLocationQuotaRow>();
    for (const row of (data || []) as GlobalLocationQuotaRow[]) {
        byLocation.set(normalizeLocationKey(row.location_key), row);
    }

    return normalizedKeys.map(locationKey => {
        const row = byLocation.get(locationKey);
        if (!row || !row.is_enabled) {
            return { locationKey, limit: null, enabled: false };
        }

        const limit = Number.isInteger(row.daily_limit) && row.daily_limit >= 0 ? row.daily_limit : null;
        return {
            locationKey,
            limit,
            enabled: limit !== null,
        };
    });
}

export async function getGlobalLocationQuotaLimit(locationKey: string): Promise<number | null> {
    const normalizedLocationKey = normalizeLocationKey(locationKey);
    if (!normalizedLocationKey) return null;

    const { data, error } = await supabase
        .from('location_global_quota_limits')
        .select('daily_limit, is_enabled')
        .eq('location_key', normalizedLocationKey)
        .maybeSingle();

    if (error) {
        if (!isMissingTableError(error, 'location_global_quota_limits')) {
            console.error(`Error getGlobalLocationQuotaLimit for ${normalizedLocationKey}:`, error);
        }
        return null;
    }

    if (!data || data.is_enabled !== true) return null;
    if (!Number.isInteger(data.daily_limit) || data.daily_limit < 0) return null;

    return data.daily_limit;
}

export async function setGlobalLocationQuotaLimit(locationKey: string, limit: number): Promise<{ success: boolean; message: string }> {
    const normalizedLocationKey = normalizeLocationKey(locationKey);
    if (!normalizedLocationKey) {
        return { success: false, message: 'Lokasi tidak valid.' };
    }

    if (!Number.isInteger(limit) || limit < 0) {
        return { success: false, message: 'Batas harus angka bulat >= 0.' };
    }

    const payload: GlobalLocationQuotaRow = {
        location_key: normalizedLocationKey,
        daily_limit: limit,
        is_enabled: true,
    };

    const { error } = await supabase
        .from('location_global_quota_limits')
        .upsert(payload, { onConflict: 'location_key' });

    if (error) {
        if (isMissingTableError(error, 'location_global_quota_limits')) {
            return { success: false, message: 'Tabel kuota global lokasi belum dibuat di database.' };
        }
        console.error('Error setGlobalLocationQuotaLimit:', error);
        return { success: false, message: 'Gagal menyimpan kuota global lokasi.' };
    }

    return {
        success: true,
        message: `Kuota global untuk *${normalizedLocationKey}* diset ke *${limit}* data total/hari.`,
    };
}

export async function disableGlobalLocationQuotaLimit(locationKey: string): Promise<{ success: boolean; message: string }> {
    const normalizedLocationKey = normalizeLocationKey(locationKey);
    if (!normalizedLocationKey) {
        return { success: false, message: 'Lokasi tidak valid.' };
    }

    const { error } = await supabase
        .from('location_global_quota_limits')
        .upsert(
            {
                location_key: normalizedLocationKey,
                daily_limit: 0,
                is_enabled: false,
            },
            { onConflict: 'location_key' }
        );

    if (error) {
        if (isMissingTableError(error, 'location_global_quota_limits')) {
            return { success: false, message: 'Tabel kuota global lokasi belum dibuat di database.' };
        }
        console.error('Error disableGlobalLocationQuotaLimit:', error);
        return { success: false, message: 'Gagal menonaktifkan kuota global lokasi.' };
    }

    return {
        success: true,
        message: `Kuota global untuk *${normalizedLocationKey}* dinonaktifkan.`,
    };
}

export async function isGlobalLocationQuotaFull(
    processingDayKey: string,
    locationKey: string
): Promise<{ full: boolean; limit: number | null; used: number }> {
    const normalizedLocationKey = normalizeLocationKey(locationKey);
    const limit = await getGlobalLocationQuotaLimit(normalizedLocationKey);
    if (limit === null) {
        return { full: false, limit: null, used: 0 };
    }

    const { data, error } = await supabase
        .from('location_global_quota_usage')
        .select('used_count')
        .eq('processing_day_key', processingDayKey)
        .eq('location_key', normalizedLocationKey)
        .maybeSingle();

    if (error) {
        if (!isMissingTableError(error, 'location_global_quota_usage')) {
            console.error(`Error isGlobalLocationQuotaFull for ${normalizedLocationKey}:`, error);
        }
        return { full: false, limit, used: 0 };
    }

    const used = data && typeof data.used_count === 'number' ? data.used_count : 0;
    return { full: used >= limit, limit, used };
}

export async function reserveGlobalLocationQuota(input: {
    processingDayKey: string;
    messageId: string;
    pendingByLocation: Map<string, number>;
}): Promise<GlobalLocationQuotaReserveResult> {
    const payload = Array.from(input.pendingByLocation.entries())
        .map(([locationKey, pendingCount]) => ({
            location_key: normalizeLocationKey(locationKey),
            pending_count: Number.isInteger(pendingCount) ? pendingCount : 0,
        }))
        .filter(item => item.location_key && item.pending_count > 0)
        .sort((a, b) => a.location_key.localeCompare(b.location_key));

    if (payload.length === 0) {
        return { success: true, decisions: [] };
    }

    const { data, error } = await supabase.rpc('reserve_global_location_quota', {
        p_processing_day_key: input.processingDayKey,
        p_message_id: input.messageId,
        p_payload: payload,
    });

    if (error) {
        if (
            isMissingTableError(error, 'location_global_quota_limits') ||
            isMissingTableError(error, 'location_global_quota_usage') ||
            isMissingTableError(error, 'location_global_quota_reservations') ||
            (error.code === '42883' && (error.message || '').includes('reserve_global_location_quota'))
        ) {
            return {
                success: false,
                message: 'Fitur kuota global belum siap di database.',
                decisions: [],
            };
        }
        console.error('Error reserveGlobalLocationQuota:', error);
        return {
            success: false,
            message: 'Sistem kuota global sedang bermasalah. Coba lagi sebentar.',
            decisions: [],
        };
    }

    const decisions = (Array.isArray(data) ? data : [])
        .map(toGlobalLocationQuotaDecision)
        .filter((item): item is GlobalLocationQuotaDecision => item !== null);

    const denied = decisions.find(item => !item.allowed);
    if (denied) {
        const locationLabel = denied.location_key.replace(/^DHARMAJAYA\s*-\s*/i, '').trim() || denied.location_key;
        const remainingQuota = denied.limit_value !== null
            ? Math.max(0, denied.limit_value - denied.used_before)
            : 0;
        const blockedMessage =
            `⛔ Maaf, kuota pendaftaran untuk lokasi *${locationLabel}* hari ini hampir penuh. ` +
            `Sisa kuota saat ini: *${remainingQuota}*. ` +
            'Silakan kurangi jumlah data atau pilih lokasi lain.';

        return {
            success: false,
            message: blockedMessage,
            decisions,
        };
    }

    return {
        success: true,
        decisions,
        reservation: {
            processingDayKey: input.processingDayKey,
            messageId: input.messageId,
            locations: payload.map(item => ({
                locationKey: item.location_key,
                reservedCount: item.pending_count,
            })),
        },
    };
}

export async function releaseGlobalLocationQuotaReservation(
    reservation: GlobalLocationQuotaReservation
): Promise<boolean> {
    if (!reservation.messageId || !reservation.processingDayKey) return true;

    const { error } = await supabase.rpc('release_global_location_quota_reservation', {
        p_processing_day_key: reservation.processingDayKey,
        p_message_id: reservation.messageId,
    });

    if (error) {
        if (
            isMissingTableError(error, 'location_global_quota_reservations') ||
            isMissingTableError(error, 'location_global_quota_usage') ||
            (error.code === '42883' && (error.message || '').includes('release_global_location_quota_reservation'))
        ) {
            console.warn('Release global quota reservation skipped (DB feature not ready).');
            return false;
        }
        console.error('Error releaseGlobalLocationQuotaReservation:', error);
        return false;
    }

    return true;
}

/**
 * Reconcile: Hitung ulang used_count dari data aktual di data_harian.
 * Gunakan setelah admin delete atau secara periodik untuk memperbaiki drift.
 */
export async function reconcileGlobalLocationQuotaDay(
    processingDayKey: string,
    locationPrefix: string = 'DHARMAJAYA - '
): Promise<void> {
    if (!processingDayKey) return;

    try {
        const { error } = await supabase.rpc('reconcile_global_location_quota_day', {
            p_proc_day: processingDayKey,
            p_location_prefix: locationPrefix,
        });

        if (error) {
            if (
                isMissingTableError(error, 'location_global_quota_usage') ||
                (error.code === '42883' && (error.message || '').includes('reconcile_global_location_quota_day'))
            ) {
                return; // Fitur belum siap, skip
            }
            console.error('Error reconcileGlobalLocationQuotaDay:', error);
        } else {
            console.log(`🔄 Quota reconciled for day: ${processingDayKey}`);
        }
    } catch (err) {
        console.error('Exception reconcileGlobalLocationQuotaDay:', err);
    }
}

function isMissingTableError(error: unknown, tableName: string): boolean {
    if (!error || typeof error !== 'object') return false;

    const err = error as { code?: string; message?: string };
    const msg = (err.message || '').toLowerCase();
    const table = tableName.toLowerCase();

    return (
        err.code === '42P01' ||
        err.code === 'PGRST205' ||
        (msg.includes('could not find the table') && msg.includes(table))
    );
}

function buildPhoneCandidates(raw: string): string[] {
    const base = normalizePhoneNumber(raw);
    if (!base) return [];

    const set = new Set<string>();
    set.add(base);

    if (base.startsWith('62') && base.length > 2) {
        set.add(`0${base.slice(2)}`);
        set.add(base.slice(2));
    }

    if (base.startsWith('0') && base.length > 1) {
        set.add(`62${base.slice(1)}`);
        set.add(base.slice(1));
    }

    if (base.startsWith('8')) {
        set.add(`62${base}`);
        set.add(`0${base}`);
    }

    return Array.from(set).filter(v => v.length >= 9);
}

export async function getBlockedKkList(limit: number = 200): Promise<BlockedKkItem[]> {
    const { data, error } = await supabase
        .from('blocked_kk')
        .select('no_kk, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error getBlockedKkList:', error);
        }
        return [];
    }

    return (data || []) as BlockedKkItem[];
}

export async function getBlockedKjpList(limit: number = 200): Promise<BlockedKjpItem[]> {
    const { data, error } = await supabase
        .from('blocked_kjp')
        .select('no_kjp, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error getBlockedKjpList:', error);
        }
        return [];
    }

    return (data || []) as BlockedKjpItem[];
}

export async function addBlockedKjp(noKjpRaw: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const noKjp = normalizeKjp(noKjpRaw);
    if (noKjp.length < 16 || noKjp.length > 18) {
        return { success: false, message: 'No KJP harus 16-18 digit.' };
    }

    const payload: any = {
        no_kjp: noKjp,
        reason: (reason || '').trim() || null,
    };

    const { error } = await supabase
        .from('blocked_kjp')
        .upsert(payload, { onConflict: 'no_kjp' });

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_kjp belum dibuat di database.' };
        }
        console.error('Error addBlockedKjp:', error);
        return { success: false, message: 'Gagal menyimpan KJP ke daftar blokir.' };
    }

    return { success: true, message: `No KJP ${noKjp} berhasil diblokir.` };
}

export async function removeBlockedKjp(noKjpRaw: string): Promise<{ success: boolean; message: string }> {
    const noKjp = normalizeKjp(noKjpRaw);
    if (noKjp.length < 16 || noKjp.length > 18) {
        return { success: false, message: 'No KJP harus 16-18 digit.' };
    }

    const { count, error } = await supabase
        .from('blocked_kjp')
        .delete({ count: 'exact' })
        .eq('no_kjp', noKjp);

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_kjp belum dibuat di database.' };
        }
        console.error('Error removeBlockedKjp:', error);
        return { success: false, message: 'Gagal menghapus KJP dari daftar blokir.' };
    }

    if ((count || 0) === 0) {
        return { success: false, message: `No KJP ${noKjp} tidak ditemukan di daftar blokir.` };
    }

    return { success: true, message: `No KJP ${noKjp} berhasil dibuka blokirnya.` };
}

export async function checkBlockedKjpBatch(items: LogItem[]): Promise<LogItem[]> {
    const activeItems = items.filter((it) => it.status === 'OK' && it.parsed.no_kjp);
    if (activeItems.length === 0) return items;

    const kjpValues = Array.from(new Set(activeItems.map((it) => it.parsed.no_kjp)));
    const { data, error } = await supabase
        .from('blocked_kjp')
        .select('no_kjp, reason')
        .in('no_kjp', kjpValues);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error checkBlockedKjpBatch:', error);
        }
        return items;
    }

    const blockedMap = new Map<string, string | null>();
    (data || []).forEach((row: any) => {
        blockedMap.set(row.no_kjp, row.reason || null);
    });

    if (blockedMap.size === 0) return items;

    return items.map((item) => {
        if (item.status !== 'OK') return item;

        const reason = blockedMap.get(item.parsed.no_kjp);
        if (reason === undefined) return item;

        const detail = reason
            ? `Nomor KJP terblokir (${reason}). Silakan ganti data lain.`
            : 'Nomor KJP terblokir. Silakan ganti data lain.';

        return {
            ...item,
            status: 'SKIP_FORMAT',
            errors: [
                ...item.errors,
                {
                    field: 'no_kjp',
                    type: 'blocked_kjp',
                    detail,
                },
            ],
        };
    });
}

export async function addBlockedKk(noKkRaw: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const noKk = normalizeKk(noKkRaw);
    if (noKk.length !== 16) {
        return { success: false, message: 'No KK harus 16 digit.' };
    }

    const payload: any = {
        no_kk: noKk,
        reason: (reason || '').trim() || null,
    };

    const { error } = await supabase
        .from('blocked_kk')
        .upsert(payload, { onConflict: 'no_kk' });

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_kk belum dibuat di database.' };
        }
        console.error('Error addBlockedKk:', error);
        return { success: false, message: 'Gagal menyimpan KK ke daftar blokir.' };
    }

    return { success: true, message: `No KK ${noKk} berhasil diblokir.` };
}

export async function removeBlockedKk(noKkRaw: string): Promise<{ success: boolean; message: string }> {
    const noKk = normalizeKk(noKkRaw);
    if (noKk.length !== 16) {
        return { success: false, message: 'No KK harus 16 digit.' };
    }

    const { count, error } = await supabase
        .from('blocked_kk')
        .delete({ count: 'exact' })
        .eq('no_kk', noKk);

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_kk belum dibuat di database.' };
        }
        console.error('Error removeBlockedKk:', error);
        return { success: false, message: 'Gagal menghapus KK dari daftar blokir.' };
    }

    if ((count || 0) === 0) {
        return { success: false, message: `No KK ${noKk} tidak ditemukan di daftar blokir.` };
    }

    return { success: true, message: `No KK ${noKk} berhasil dibuka blokirnya.` };
}

export async function checkBlockedKkBatch(items: LogItem[]): Promise<LogItem[]> {
    const activeItems = items.filter(it => it.status === 'OK' && it.parsed.no_kk);
    if (activeItems.length === 0) return items;

    const kkValues = Array.from(new Set(activeItems.map(it => it.parsed.no_kk)));
    const { data, error } = await supabase
        .from('blocked_kk')
        .select('no_kk, reason')
        .in('no_kk', kkValues);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error checkBlockedKkBatch:', error);
        }
        return items;
    }

    const blockedMap = new Map<string, string | null>();
    (data || []).forEach((row: any) => {
        blockedMap.set(row.no_kk, row.reason || null);
    });

    if (blockedMap.size === 0) return items;

    return items.map(item => {
        if (item.status !== 'OK') return item;

        const reason = blockedMap.get(item.parsed.no_kk);
        if (reason === undefined) return item;

        const detail = reason
            ? `Nomor KK terblokir (${reason}). Silakan ganti data lain.`
            : 'Nomor KK terblokir. Silakan ganti data lain.';

        return {
            ...item,
            status: 'SKIP_FORMAT',
            errors: [
                ...item.errors,
                {
                    field: 'no_kk',
                    type: 'blocked_kk',
                    detail,
                },
            ],
        };
    });
}

export async function checkBlockedLocationBatch(items: LogItem[]): Promise<LogItem[]> {
    const activeItems = items.filter((it) => it.status === 'OK' && it.parsed.lokasi);
    if (activeItems.length === 0) return items;

    const locationKeys = Array.from(
        new Set(activeItems.map((it) => (it.parsed.lokasi || '').trim()).filter((v) => v.length > 0))
    );

    if (locationKeys.length === 0) return items;

    const { data, error } = await supabase
        .from('blocked_locations')
        .select('location_key, reason')
        .eq('is_active', true)
        .in('location_key', locationKeys);

    if (error) {
        if (!isMissingTableError(error, 'blocked_locations')) {
            console.error('Error checkBlockedLocationBatch:', error);
        }
        return items;
    }

    const blockedMap = new Map<string, string | null>();
    (data || []).forEach((row: { location_key: string; reason?: string | null }) => {
        blockedMap.set(row.location_key, row.reason || null);
    });

    if (blockedMap.size === 0) return items;

    return items.map((item) => {
        if (item.status !== 'OK') return item;

        const locationKey = (item.parsed.lokasi || '').trim();
        if (!locationKey) return item;

        const reason = blockedMap.get(locationKey);
        if (reason === undefined) return item;

        const locationName = locationKey.includes(' - ') ? locationKey.split(' - ').slice(1).join(' - ') : locationKey;
        const detail = reason
            ? `Lokasi ${locationName} sedang penuh/ditutup (${reason}). Silakan pilih lokasi lain.`
            : `Lokasi ${locationName} sedang penuh/ditutup. Silakan pilih lokasi lain.`;

        return {
            ...item,
            status: 'SKIP_FORMAT',
            errors: [
                ...item.errors,
                {
                    field: 'lokasi',
                    type: 'blocked_location',
                    detail,
                },
            ],
        };
    });
}

export async function getBlockedPhoneList(limit: number = 200): Promise<BlockedPhoneItem[]> {
    const { data, error } = await supabase
        .from('blocked_phones')
        .select('phone_number, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error getBlockedPhoneList:', error);
        }
        return [];
    }

    return (data || []) as BlockedPhoneItem[];
}

export async function addBlockedPhone(phoneRaw: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const phoneNumber = normalizePhoneNumber(phoneRaw);
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
        return { success: false, message: 'Nomor HP tidak valid.' };
    }

    const payload: any = {
        phone_number: phoneNumber,
        reason: (reason || '').trim() || null,
    };

    const { error } = await supabase
        .from('blocked_phones')
        .upsert(payload, { onConflict: 'phone_number' });

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_phones belum dibuat di database.' };
        }
        console.error('Error addBlockedPhone:', error);
        return { success: false, message: 'Gagal menyimpan nomor HP ke daftar blokir.' };
    }

    return { success: true, message: `Nomor HP ${phoneNumber} berhasil diblokir.` };
}

export async function removeBlockedPhone(phoneRaw: string): Promise<{ success: boolean; message: string }> {
    const phoneNumber = normalizePhoneNumber(phoneRaw);
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
        return { success: false, message: 'Nomor HP tidak valid.' };
    }

    const { count, error } = await supabase
        .from('blocked_phones')
        .delete({ count: 'exact' })
        .eq('phone_number', phoneNumber);

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_phones belum dibuat di database.' };
        }
        console.error('Error removeBlockedPhone:', error);
        return { success: false, message: 'Gagal menghapus nomor HP dari daftar blokir.' };
    }

    if ((count || 0) === 0) {
        return { success: false, message: `Nomor HP ${phoneNumber} tidak ditemukan di daftar blokir.` };
    }

    return { success: true, message: `Nomor HP ${phoneNumber} berhasil dibuka blokirnya.` };
}

export async function isPhoneBlocked(phoneRaw: string): Promise<{ blocked: boolean; reason?: string | null }> {
    const candidates = buildPhoneCandidates(phoneRaw);
    if (candidates.length === 0) return { blocked: false };

    const { data, error } = await supabase
        .from('blocked_phones')
        .select('phone_number, reason')
        .in('phone_number', candidates)
        .limit(1)
        .maybeSingle();

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error isPhoneBlocked:', error);
        }
        return { blocked: false };
    }

    if (!data) return { blocked: false };
    return { blocked: true, reason: (data as any).reason || null };
}

export async function getBlockedLocationList(limit: number = 200): Promise<BlockedLocationItem[]> {
    const { data, error } = await supabase
        .from('blocked_locations')
        .select('location_key, reason, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('location_key', { ascending: true })
        .limit(limit);

    if (error) {
        if (!isMissingTableError(error, 'blocked_locations')) {
            console.error('Error getBlockedLocationList:', error);
        }
        return [];
    }

    return (data || []) as BlockedLocationItem[];
}

export async function closeLocation(
    locationRaw: string,
    reason?: string
): Promise<{ success: boolean; message: string }> {
    const locationKey = normalizeLocationKey(locationRaw);
    if (!locationKey) {
        return { success: false, message: 'Nama lokasi wajib diisi.' };
    }

    const payload = {
        location_key: locationKey,
        reason: (reason || '').trim() || null,
        is_active: true,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('blocked_locations')
        .upsert(payload, { onConflict: 'location_key' });

    if (error) {
        if (isMissingTableError(error, 'blocked_locations')) {
            return { success: false, message: 'Tabel blocked_locations belum dibuat di database.' };
        }
        console.error('Error closeLocation:', error);
        return { success: false, message: `Gagal menutup lokasi (${(error as { message?: string }).message || 'unknown error'}).` };
    }

    return { success: true, message: `Lokasi ${locationKey} ditandai penuh.` };
}

export async function openLocation(locationRaw: string): Promise<{ success: boolean; message: string }> {
    const locationKey = normalizeLocationKey(locationRaw);
    if (!locationKey) {
        return { success: false, message: 'Nama lokasi wajib diisi.' };
    }

    const { count, error } = await supabase
        .from('blocked_locations')
        .delete({ count: 'exact' })
        .eq('location_key', locationKey);

    if (error) {
        if (isMissingTableError(error, 'blocked_locations')) {
            return { success: false, message: 'Tabel blocked_locations belum dibuat di database.' };
        }
        console.error('Error openLocation:', error);
        return { success: false, message: `Gagal membuka lokasi (${(error as { message?: string }).message || 'unknown error'}).` };
    }

    if ((count || 0) === 0) {
        return { success: false, message: `Lokasi ${locationKey} tidak ada di daftar penuh.` };
    }

    return { success: true, message: `Lokasi ${locationKey} dibuka kembali.` };
}

export async function isLocationBlocked(locationRaw: string): Promise<{ blocked: boolean; reason?: string | null }> {
    const locationKey = normalizeLocationKey(locationRaw);
    if (!locationKey) return { blocked: false };

    const { data, error } = await supabase
        .from('blocked_locations')
        .select('location_key, reason')
        .eq('location_key', locationKey)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

    if (error) {
        if (!isMissingTableError(error, 'blocked_locations')) {
            console.error('Error isLocationBlocked:', error);
        }
        return { blocked: false };
    }

    if (!data) return { blocked: false };
    return { blocked: true, reason: (data as { reason?: string | null }).reason || null };
}

export async function hasProcessedMessageById(params: {
    senderPhone: string;
    processingDayKey: string;
    messageId: string;
}): Promise<boolean> {
    const { senderPhone, processingDayKey, messageId } = params;
    if (!messageId) return false;

    const { data, error } = await supabase
        .from('log_pesan_wa')
        .select('id')
        .eq('sender_phone', senderPhone)
        .eq('processing_day_key', processingDayKey)
        .eq('wa_message_id', messageId)
        .limit(1);

    if (error) {
        if (!isMissingTableError(error, 'log_pesan_wa')) {
            console.error('Error hasProcessedMessageById:', error);
        }
        return false;
    }

    return Array.isArray(data) && data.length > 0;
}

export async function saveLogAndOkItems(log: LogJson, rawText: string): Promise<{ success: boolean; dataError?: any; logError?: any }> {
    // Fungsi helper untuk insert log
    async function insertLog(): Promise<any> {
        const { error: logError } = await supabase.from('log_pesan_wa').insert([
            {
                tanggal: log.tanggal,
                processing_day_key: log.processing_day_key,
                received_at: log.received_at,
                sumber: 'wa',
                sender_phone: log.sender_phone,
                wa_message_id: log.message_id,
                stats_total_blocks: log.stats.total_blocks,
                stats_ok_count: log.stats.ok_count,
                stats_skip_format_count: log.stats.skip_format_count,
                stats_skip_duplicate_count: log.stats.skip_duplicate_count,
                raw_text: rawText,
                log_json: log,
            },
        ]);
        if (logError) {
            console.error('Error insert log_pesan_wa:', logError);
        }
        return logError;
    }

    // Fungsi helper untuk insert data harian
    async function insertData(): Promise<{ error: any; insertedRows: number; usageDeltas: GlobalQuotaUsageDelta[] }> {
        const okItems = log.items.filter((it) => it.status === 'OK');
        if (okItems.length === 0) {
            return { error: null, insertedRows: 0, usageDeltas: [] };
        }

        const rows = okItems.map((it) => ({
            tanggal: log.tanggal,
            processing_day_key: log.processing_day_key,
            received_at: log.received_at,
            sumber: 'wa',
            sender_phone: log.sender_phone,
            sender_name: log.sender_name || null,
            nama: it.parsed.nama,
            no_kjp: it.parsed.no_kjp,
            jenis_kartu: it.parsed.jenis_kartu || null,
            no_ktp: it.parsed.no_ktp,
            no_kk: it.parsed.no_kk,
            tanggal_lahir: it.parsed.tanggal_lahir || null,
            lokasi: it.parsed.lokasi || null,
            meta: {
                message_id: log.message_id,
                index: it.index,
                received_at: log.received_at,
            },
        }));

        const { error: dataError } = await supabase.from('data_harian').insert(rows);
        if (dataError) {
            console.error('❌ Error insert data_harian:', dataError);
        } else {
            console.log(`✅ Berhasil simpan ${rows.length} item OK ke data_harian.`);
            // CATATAN: Tidak perlu applyGlobalQuotaUsageDeltas(+1) di sini.
            // reserve_global_location_quota RPC sudah menaikkan used_count saat reservasi.
            // Double-counting (reserve + delta) adalah penyebab desync kuota.
        }
        return {
            error: dataError,
            insertedRows: rows.length,
            usageDeltas: [],
        };
    }

    // PARALLEL INSERT: Log dan Data Harian berbarengan dengan proper error capture
    const [logErrorResult, dataErrorResult] = await Promise.all([
        insertLog(),
        insertData()
    ]);

    // Return status - only consider failure if data insert failed (log error is less critical)
    const success = dataErrorResult?.error === null;

    // DEBUG LOG: Pastikan status success benar
    if (!success) {
        console.error('⚠️ saveLogAndOkItems: Returning success=false due to dataError');
    }

    return {
        success,
        dataError: dataErrorResult?.error,
        logError: logErrorResult
    };
}

// --- HAPUS DATA (HANYA MILIK PENGIRIM) ---
export async function deleteDataByNameOrCard(
    senderPhone: string,
    processingDayKey: string,
    query: string
): Promise<{ success: boolean; count: number; mode: 'name' | 'number'; error: any }> {
    try {
        const raw = (query || '').trim();
        const digits = raw.replace(/\D/g, '');

        // Jika user mengirim nomor (ada digit minimal 4), kita asumsi cari nomor
        // (minimal 4 digit untuk menghindari salah hapus data pendek 123)
        if (digits.length >= 4) {
            const { data: candidates, error: selectError } = await supabase
                .from('data_harian')
                .select('id, lokasi')
                .eq('processing_day_key', processingDayKey)
                .eq('sender_phone', senderPhone)
                .or(`no_kjp.eq.${digits},no_ktp.eq.${digits},no_kk.eq.${digits}`);

            if (selectError) {
                console.error('Error select data by number before delete:', selectError);
                return { success: false, count: 0, mode: 'number', error: selectError };
            }

            const rows = (candidates || []) as Array<{ id: number; lokasi?: string | null }>;
            const idsToDelete = rows.map((row) => row.id);
            if (idsToDelete.length === 0) {
                return { success: true, count: 0, mode: 'number', error: null };
            }

            const { count, error } = await supabase
                .from('data_harian')
                .delete({ count: 'exact' })
                .in('id', idsToDelete);

            if (error) {
                console.error('Error delete data by number:', error);
                return { success: false, count: 0, mode: 'number', error };
            }

            await applyGlobalQuotaUsageDeltas(
                rows
                    .filter((row) => row.lokasi)
                    .map((row) => ({
                        processingDayKey,
                        locationKey: (row.lokasi || '').toString(),
                        delta: -1,
                    }))
            );

            return { success: true, count: count ?? 0, mode: 'number', error: null };
        }

        // Selain itu, anggap nama
        const nameQ = raw;
        if (!nameQ) return { success: true, count: 0, mode: 'name', error: null };

        const norm = nameQ.trim().toUpperCase();

        const { data: candidates, error: selectError } = await supabase
            .from('data_harian')
            .select('id, lokasi')
            .eq('processing_day_key', processingDayKey)
            .eq('sender_phone', senderPhone)
            .ilike('nama', `%${norm}%`);

        if (selectError) {
            console.error('Error select data by name before delete:', selectError);
            return { success: false, count: 0, mode: 'name', error: selectError };
        }

        const rows = (candidates || []) as Array<{ id: number; lokasi?: string | null }>;
        const idsToDelete = rows.map((row) => row.id);
        if (idsToDelete.length === 0) {
            return { success: true, count: 0, mode: 'name', error: null };
        }

        const { count, error } = await supabase
            .from('data_harian')
            .delete({ count: 'exact' })
            .in('id', idsToDelete);

        if (error) {
            console.error('Error delete data by name:', error);
            return { success: false, count: 0, mode: 'name', error };
        }

        await applyGlobalQuotaUsageDeltas(
            rows
                .filter((row) => row.lokasi)
                .map((row) => ({
                    processingDayKey,
                    locationKey: (row.lokasi || '').toString(),
                    delta: -1,
                }))
        );

        return { success: true, count: count ?? 0, mode: 'name', error: null };
    } catch (error) {
        console.error('Error during deleteDataByNameOrCard:', error);
        return { success: false, count: 0, mode: 'name', error: null };
    }
}

export async function deleteDailyDataByIndex(
    senderPhone: string,
    processingDayKey: string,
    targetIndex: number // 1-based index
): Promise<{ success: boolean; deletedName?: string }> {
    // 1. Ambil data dengan urutan yang SAMA PERSIS dengan REKAP
    const { data, error } = await supabase
        .from('data_harian')
        .select('id, nama, lokasi')
        .eq('processing_day_key', processingDayKey)
        .eq('sender_phone', senderPhone)
        .order('nama', { ascending: true }) // HARUS SAMA dengan urutan tampilan HAPUS menu (A-Z)
        .order('id', { ascending: true }); // Secondary sort: tiebreaker untuk nama duplikat

    if (error || !data || data.length === 0) return { success: false };

    // 2. Ambil item berdasarkan index
    const item = data[targetIndex - 1]; // convert to 0-based

    if (!item) return { success: false };

    // 3. Hapus by ID
    const { error: delError } = await supabase
        .from('data_harian')
        .delete()
        .eq('id', item.id);

    if (delError) return { success: false };

    await applyGlobalQuotaUsageDeltas(
        item.lokasi
            ? [{ processingDayKey, locationKey: (item.lokasi || '').toString(), delta: -1 }]
            : []
    );

    return { success: true, deletedName: item.nama };
}

export async function deleteDailyDataByIndices(
    senderPhone: string,
    processingDayKey: string,
    indices: number[]
): Promise<{ success: boolean; deletedCount: number; deletedNames: string[] }> {
    // 1. Ambil data untuk mapping index ke ID
    const { data, error } = await supabase
        .from('data_harian')
        .select('id, nama, lokasi')
        .eq('processing_day_key', processingDayKey)
        .eq('sender_phone', senderPhone)
        .order('nama', { ascending: true }) // HARUS SAMA dengan urutan tampilan HAPUS menu (A-Z)
        .order('id', { ascending: true }); // Secondary sort: tiebreaker untuk nama duplikat

    if (error || !data || data.length === 0) return { success: false, deletedCount: 0, deletedNames: [] };

    // 2. Filter ID berdasarkan index yang diminta
    // Ingat: indices dari user adalah 1-based
    const idsToDelete: number[] = [];
    const namesToDelete: string[] = [];
    indices.forEach(idx => {
        if (idx > 0 && idx <= data.length) {
            idsToDelete.push(data[idx - 1].id);
            namesToDelete.push(data[idx - 1].nama);
        }
    });

    if (idsToDelete.length === 0) return { success: false, deletedCount: 0, deletedNames: [] };

    // 3. Hapus by IDs
    const { error: delError, count } = await supabase
        .from('data_harian')
        .delete({ count: 'exact' })
        .in('id', idsToDelete);

    if (delError) return { success: false, deletedCount: 0, deletedNames: [] };

    await applyGlobalQuotaUsageDeltas(
        indices
            .filter((idx) => idx > 0 && idx <= data.length)
            .map((idx) => data[idx - 1])
            .filter((row) => row?.lokasi)
            .map((row) => ({
                processingDayKey,
                locationKey: (row.lokasi || '').toString(),
                delta: -1,
            }))
    );

    return { success: true, deletedCount: count ?? 0, deletedNames: namesToDelete };
}

export async function deleteAllDailyDataForSender(
    senderPhone: string,
    processingDayKey: string
): Promise<{ success: boolean; deletedCount: number; deletedNames: string[] }> {
    // 1. Ambil nama dulu sebelum hapus
    const { data } = await supabase
        .from('data_harian')
        .select('nama, lokasi')
        .eq('processing_day_key', processingDayKey)
        .eq('sender_phone', senderPhone);

    const names = data ? data.map((d: any) => d.nama) : [];

    // 2. Hapus
    const { error, count } = await supabase
        .from('data_harian')
        .delete({ count: 'exact' })
        .eq('processing_day_key', processingDayKey)
        .eq('sender_phone', senderPhone);

    if (error) return { success: false, deletedCount: 0, deletedNames: [] };

    await applyGlobalQuotaUsageDeltas(
        (data || [])
            .filter((row: any) => row?.lokasi)
            .map((row: any) => ({
                processingDayKey,
                locationKey: (row.lokasi || '').toString(),
                delta: -1,
            }))
    );

    return { success: true, deletedCount: count ?? 0, deletedNames: names };
}
// --- HAPUS DATA TERAKHIR (UNTUK FITUR BATAL/UNDO) ---
export async function deleteLastSubmission(
    senderPhone: string,
    processingDayKey: string,
    maxAgeMinutes: number = 5
): Promise<{ success: boolean; count: number; names: string[] }> {
    try {
        // Ambil data terakhir yang dikirim user hari ini
        const { data, error: selectError } = await supabase
            .from('data_harian')
            .select('id, nama, received_at, lokasi')
            .eq('processing_day_key', processingDayKey)
            .eq('sender_phone', senderPhone)
            .order('received_at', { ascending: false })
            .limit(50); // Ambil beberapa untuk cek waktu

        if (selectError || !data || data.length === 0) {
            return { success: false, count: 0, names: [] };
        }

        // Filter data yang masih dalam batas waktu (maxAgeMinutes)
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);

        // Cari semua data yang received_at >= cutoff (berarti baru dikirim dalam X menit terakhir)
        // dan yang memiliki received_at yang sama (dikirim dalam 1 batch pesan)
        const recentData = data.filter((row: any) => {
            const receivedAt = new Date(row.received_at);
            return receivedAt >= cutoffTime;
        });

        if (recentData.length === 0) {
            return { success: false, count: 0, names: [] };
        }

        // Ambil batch terakhir (semua data dengan received_at yang sama persis atau sangat dekat)
        const lastReceivedAt = new Date((recentData[0] as any).received_at);
        const batchData = recentData.filter((row: any) => {
            const receivedAt = new Date(row.received_at);
            // Toleransi 2 detik untuk 1 batch
            return Math.abs(receivedAt.getTime() - lastReceivedAt.getTime()) < 2000;
        });

        if (batchData.length === 0) {
            return { success: false, count: 0, names: [] };
        }

        // Hapus data batch tersebut
        const idsToDelete = batchData.map((row: any) => row.id);
        const namesToDelete = batchData.map((row: any) => row.nama);

        const { error: deleteError, count } = await supabase
            .from('data_harian')
            .delete({ count: 'exact' })
            .in('id', idsToDelete);

        if (deleteError) {
            console.error('Error delete last submission:', deleteError);
            return { success: false, count: 0, names: [] };
        }

        await applyGlobalQuotaUsageDeltas(
            batchData
                .filter((row: any) => row?.lokasi)
                .map((row: any) => ({
                    processingDayKey,
                    locationKey: (row.lokasi || '').toString(),
                    delta: -1,
                }))
        );

        return { success: true, count: count ?? batchData.length, names: namesToDelete };
    } catch (error) {
        console.error('Error during deleteLastSubmission:', error);
        return { success: false, count: 0, names: [] };
    }
}

// --- STATISTIK DASHBOARD ---
export interface DashboardStats {
    todayCount: number;
    weekCount: number;
    monthCount: number;
    activeUsersToday: number;
    activeUsersWeek: number;
    totalRegisteredUsers: number;
    topUsers: { phone: string; name: string; count: number }[];
}

export async function getStatistics(processingDayKey: string): Promise<DashboardStats> {
    const today = processingDayKey;

    // Hitung 7 hari dan 30 hari ke belakang
    const weekAgo = shiftDateString(today, -6);
    const monthAgo = shiftDateString(today, -29);

    // Query data hari ini
    const { count: todayCount } = await supabase
        .from('data_harian')
        .select('*', { count: 'exact', head: true })
        .eq('processing_day_key', today);

    // Query data 7 hari
    const { count: weekCount } = await supabase
        .from('data_harian')
        .select('*', { count: 'exact', head: true })
        .gte('processing_day_key', weekAgo)
        .lte('processing_day_key', today);

    // Query data 30 hari
    const { count: monthCount } = await supabase
        .from('data_harian')
        .select('*', { count: 'exact', head: true })
        .gte('processing_day_key', monthAgo)
        .lte('processing_day_key', today);

    // Active users hari ini
    const { data: todayUsers } = await supabase
        .from('data_harian')
        .select('sender_phone')
        .eq('processing_day_key', today);
    const activeUsersToday = new Set(todayUsers?.map(r => r.sender_phone) || []).size;

    // Active users minggu ini
    const { data: weekUsers } = await supabase
        .from('data_harian')
        .select('sender_phone')
        .gte('processing_day_key', weekAgo)
        .lte('processing_day_key', today);
    const activeUsersWeek = new Set(weekUsers?.map(r => r.sender_phone) || []).size;

    // Total registered users
    const totalRegisteredUsers = registeredUsersCache.size;

    // Top 10 users hari ini (by data count)
    const userCounts = new Map<string, number>();
    todayUsers?.forEach(r => {
        userCounts.set(r.sender_phone, (userCounts.get(r.sender_phone) || 0) + 1);
    });

    const topUsers = Array.from(userCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([phone, count]) => ({
            phone,
            name: registeredUsersCache.get(phone) || phone,
            count
        }));

    return {
        todayCount: todayCount ?? 0,
        weekCount: weekCount ?? 0,
        monthCount: monthCount ?? 0,
        activeUsersToday,
        activeUsersWeek,
        totalRegisteredUsers,
        topUsers
    };
}

// Helper untuk geser tanggal
function shiftDateString(isoDate: string, days: number): string {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// --- RESET DATABASE TOTAL ---
export async function clearAllDatabase(): Promise<boolean> {
    try {
        const { error: errLog } = await supabase.from('log_pesan_wa').delete().neq('id', -1);
        const { error: errData } = await supabase.from('data_harian').delete().neq('id', -1);
        const { error: errUsage } = await supabase.from('location_global_quota_usage').delete().neq('id', -1);

        if (errLog || errData || (errUsage && !isMissingTableError(errUsage, 'location_global_quota_usage'))) {
            console.error('Gagal reset DB:', errLog, errData, errUsage);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error reset DB:', error);
        return false;
    }
}

// --- RESET HARIAN (BERDASARKAN processing_day_key) ---
export async function clearDatabaseForProcessingDayKey(processingDayKey: string): Promise<boolean> {
    try {
        const { error: errLog } = await supabase.from('log_pesan_wa').delete().eq('processing_day_key', processingDayKey);
        const { error: errData } = await supabase.from('data_harian').delete().eq('processing_day_key', processingDayKey);
        const { error: errUsage } = await supabase.from('location_global_quota_usage').delete().eq('processing_day_key', processingDayKey);

        if (errLog || errData || (errUsage && !isMissingTableError(errUsage, 'location_global_quota_usage'))) {
            console.error('Gagal reset harian:', errLog, errData, errUsage);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error reset harian:', error);
        return false;
    }
}

export const clearDatabaseForDate = clearDatabaseForProcessingDayKey;

// --- LID -> Phone mapping (untuk akun yang tampil @lid) ---
export async function getPhoneByLidJid(lidJid: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('lid_phone_map')
        .select('phone_number')
        .eq('lid_jid', lidJid)
        .maybeSingle();

    if (error) {
        console.error('❌ getPhoneByLidJid error:', error.message);
        return null;
    }
    return (data?.phone_number as string) || null;
}

export async function getNameFromLidPhoneMap(phoneNumber: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('lid_phone_map')
        .select('push_name')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

    if (error) {
        return null;
    }
    return (data?.push_name as string) || null;
}

export async function upsertLidPhoneMap(params: {
    lid_jid: string;
    phone_number: string;
    push_name?: string | null;
}) {
    // LOGIC BARU: Cek dulu apakah nomor HP ini sudah ada?
    // Jika sudah ada, PERBARUI NAMA-nya saja (jangan buat row baru dg lid dummy)
    const existing = await getRegisteredUserByPhone(params.phone_number);

    if (existing && existing.push_name !== params.push_name) {
        // Update Nama Existing (tanpa mengubah LID JID yg mungkin sudah valid)
        const { error } = await supabase
            .from('lid_phone_map')
            .update({
                push_name: params.push_name,
                updated_at: new Date().toISOString()
            })
            .eq('phone_number', params.phone_number);

        if (error) console.error('❌ Gagal update nama kontak:', error.message);
        else {
            // Update Cache
            registeredUsersCache.set(params.phone_number, params.push_name || '');
        }
        return;
    }

    // Jika belum ada, atau nama sama, jalankan logika insert/upsert normal by LID
    const payload = {
        lid_jid: params.lid_jid,
        phone_number: params.phone_number,
        push_name: params.push_name ?? null,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('lid_phone_map')
        .upsert(payload, { onConflict: 'lid_jid' });

    if (error) {
        console.error('❌ upsertLidPhoneMap error:', error.message);
        // Silent error agar bot tidak crash
    }

    // Update Cache
    if (params.phone_number) {
        registeredUsersCache.set(params.phone_number, params.push_name || '');
        if (params.lid_jid) {
            // Update cache LID juga (siapa tahu ini first time insert)
            lidToPhoneCache.set(params.lid_jid, params.phone_number);
        }
    }
}

export async function deleteLidPhoneMap(phoneNumber: string): Promise<boolean> {
    const { error } = await supabase
        .from('lid_phone_map')
        .delete()
        .eq('phone_number', phoneNumber);

    if (error) {
        console.error('❌ deleteLidPhoneMap error:', error.message);
        return false;
    }

    // Update Cache
    registeredUsersCache.delete(phoneNumber);

    return true;
}

export async function getAllLidPhoneMap(): Promise<{ phone_number: string; push_name: string | null }[]> {
    const { data, error } = await supabase
        .from('lid_phone_map')
        .select('phone_number, push_name')
        .order('push_name', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('❌ getAllLidPhoneMap error:', error.message);
        return [];
    }

    // Sort manual case-insensitive di level aplikasi untuk hasil yang lebih rapi
    const sortedData = (data || []).sort((a, b) => {
        const nameA = (a.push_name || '').toLowerCase();
        const nameB = (b.push_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return sortedData;
}

// --- LOOKUP BY PHONE NUMBER (untuk fix setelah ganti nomor bot) ---
// Cek apakah phone_number sudah terdaftar di database (langsung query, bypass cache)
// FIXED: Sekarang juga update cache jika user ditemukan
export async function getRegisteredUserByPhone(phoneNumber: string): Promise<{ push_name: string | null; lid_jid: string | null } | null> {
    const { data, error } = await supabase
        .from('lid_phone_map')
        .select('push_name, lid_jid, phone_number')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

    if (error) {
        console.error('❌ getRegisteredUserByPhone error:', error.message);
        return null;
    }

    if (data) {
        // UPDATE CACHE agar tidak perlu query ulang
        if (data.phone_number) {
            registeredUsersCache.set(data.phone_number, data.push_name || '');
        }
        if (data.lid_jid && data.phone_number) {
            lidToPhoneCache.set(data.lid_jid, data.phone_number);
        }
        console.log(`🔄 Cache updated via DB lookup: ${phoneNumber} -> ${data.push_name || '(no name)'}`);
        return { push_name: data.push_name, lid_jid: data.lid_jid };
    }

    return null;
}

// Update LID untuk phone number yang sudah terdaftar (ketika bot ganti nomor, LID berubah)
export async function updateLidForPhone(phoneNumber: string, newLidJid: string): Promise<boolean> {
    const { error } = await supabase
        .from('lid_phone_map')
        .update({ lid_jid: newLidJid, updated_at: new Date().toISOString() })
        .eq('phone_number', phoneNumber);

    if (error) {
        console.error('❌ updateLidForPhone error:', error.message);
        return false;
    }
    console.log(`✅ LID updated for ${phoneNumber}: ${newLidJid}`);
    return true;
}

// ============================================
// BOT SETTINGS (Pengaturan Bot - Jam Tutup, Template, dll)
// ============================================

export interface BotSettings {
    close_hour_start: number;    // Jam mulai tutup (0-23)
    close_minute_start: number;  // Menit mulai tutup (0-59)
    close_hour_end: number;      // Jam selesai tutup (0-23)
    close_minute_end: number;    // Menit selesai tutup (0-59)
    close_message_template: string; // Template pesan saat bot tutup
    manual_close_start?: string | null; // ISO Date String (Null if not active)
    manual_close_end?: string | null;   // ISO Date String
}

// Default settings jika belum ada di database
const DEFAULT_BOT_SETTINGS: BotSettings = {
    close_hour_start: 0,
    close_minute_start: 0,
    close_hour_end: 6,
    close_minute_end: 5,
    close_message_template: `⛔ *MOHON MAAF, Layanan Sedang Tutup ⛔*

🕒 Jam Tutup: *00.00 - 06.05 WIB*
✅ Buka Kembali: *Pukul 06.05 WIB*

📌 Data yang Anda kirim sekarang *tidak akan diproses*. Silakan kirim ulang setelah jam buka untuk pendaftaran besok.

Terima kasih atas pengertiannya. 🙏`,
    // NOTE: Template di atas adalah DEFAULT jika database kosong.
    // Pesan aktual diambil dari database (bot_settings.close_message_template).
    manual_close_start: null,
    manual_close_end: null
};

// Cache untuk settings (agar tidak query terus)
let botSettingsCache: BotSettings | null = null;

export async function getBotSettings(): Promise<BotSettings> {
    // Return cache jika ada
    if (botSettingsCache) return botSettingsCache;

    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('❌ getBotSettings error:', error.message);
            return DEFAULT_BOT_SETTINGS;
        }

        if (!data) {
            // Belum ada settings, gunakan default
            return DEFAULT_BOT_SETTINGS;
        }

        botSettingsCache = {
            close_hour_start: data.close_hour_start ?? DEFAULT_BOT_SETTINGS.close_hour_start,
            close_minute_start: data.close_minute_start ?? DEFAULT_BOT_SETTINGS.close_minute_start,
            close_hour_end: data.close_hour_end ?? DEFAULT_BOT_SETTINGS.close_hour_end,
            close_minute_end: data.close_minute_end ?? DEFAULT_BOT_SETTINGS.close_minute_end,
            close_message_template: data.close_message_template ?? DEFAULT_BOT_SETTINGS.close_message_template,
            manual_close_start: data.manual_close_start || null,
            manual_close_end: data.manual_close_end || null
        };

        return botSettingsCache;
    } catch (err) {
        console.error('❌ getBotSettings exception:', err);
        return DEFAULT_BOT_SETTINGS;
    }
}

export async function updateBotSettings(settings: Partial<BotSettings>): Promise<boolean> {
    try {
        // Upsert ke database
        const payload = {
            id: 1, // Single row untuk settings
            ...settings,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from('bot_settings')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            console.error('❌ updateBotSettings error:', error.message);
            return false;
        }

        // Clear cache agar di-refresh
        botSettingsCache = null;

        console.log('✅ Bot settings updated');
        return true;
    } catch (err) {
        console.error('❌ updateBotSettings exception:', err);
        return false;
    }
}

// Helper untuk mendapatkan string jam tutup (format: "04.01 - 06.00 WIB")
export function formatCloseTimeString(settings: BotSettings): string {
    const start = `${String(settings.close_hour_start).padStart(2, '0')}.${String(settings.close_minute_start).padStart(2, '0')}`;
    const end = `${String(settings.close_hour_end).padStart(2, '0')}.${String(settings.close_minute_end).padStart(2, '0')}`;
    return `${start} - ${end} WIB`;
}

// Helper untuk mendapatkan string jam buka
export function formatOpenTimeString(settings: BotSettings): string {
    return `${String(settings.close_hour_end).padStart(2, '0')}.${String(settings.close_minute_end).padStart(2, '0')}`;
}

function stripLegacyCloseNote(template: string): string {
    const withoutLegacyLines = template
        .replace(/(?:^|\n)\s*Catatan:\s*Saat tutup,\s*yang bisa diakses hanya menu\s*\*?5\*?\.\s*(?=\n|$)/gi, '')
        .replace(/(?:^|\n)\s*Silakan ketik\s*\*?5\*?\s*untuk Cek Status Pendaftaran\.\s*(?=\n|$)/gi, '');

    return withoutLegacyLines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Render template pesan tutup dengan placeholder
// Render template pesan tutup dengan placeholder
export function renderCloseMessage(settings: BotSettings): string {
    const applyCloseTemplate = (template: string, jamTutup: string, jamBuka: string): string => {
        return template
            .split('{JAM_TUTUP}').join(jamTutup)
            .split('{JAM_BUKA}').join(jamBuka);
    };

    const rawTemplate = (settings.close_message_template || DEFAULT_BOT_SETTINGS.close_message_template || '').trim() || DEFAULT_BOT_SETTINGS.close_message_template;
    const effectiveTemplate = stripLegacyCloseNote(rawTemplate);

    // Cek apakah sedang dalam MODE TUTUP PANJANG (Manual Override).
    // Pesan manual hanya dipakai jika waktu sekarang benar-benar berada
    // di rentang [manual_close_start, manual_close_end].
    if (settings.manual_close_start && settings.manual_close_end) {
        const now = new Date();
        const start = new Date(settings.manual_close_start);
        const end = new Date(settings.manual_close_end);

        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && now.getTime() >= start.getTime() && now.getTime() <= end.getTime()) {
            // Format End Date: DD MMM YYYY Jam HH:mm
            // Gunakan Intl untuk WIB
            const dateStr = end.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' });
            const timeStr = end.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');

            const jamBuka = `${dateStr} Pukul ${timeStr} WIB`;
            const jamTutup = formatCloseTimeString(settings);

            // Custom Message for Long Term Close
            return applyCloseTemplate(effectiveTemplate, jamTutup, jamBuka);
        }
    }

    // Default Harian
    const jamTutup = formatCloseTimeString(settings);
    const jamBuka = formatOpenTimeString(settings);

    return applyCloseTemplate(effectiveTemplate, jamTutup, jamBuka);
}

// Refresh cache settings (dipanggil setelah admin update)
export function clearBotSettingsCache(): void {
    botSettingsCache = null;
}

// --- PATCH 2: UPDATE FIELD DATA ---
export async function updateDailyDataField(
    id: number,
    field: string,
    value: string,
    options?: {
        senderPhone?: string;
        processingDayKey?: string;
    }
): Promise<{ success: boolean; error: any }> {
    try {
        let previousLocation: string | null = null;
        let processingDayKey: string | null = null;
        let dbSenderPhone: string | null = null;
        let quotaCheckTargetLocation: string | null = null;
        let quotaCheckLimitTarget: number | null = null;
        const requestedSenderPhone = normalizePhoneNumber(options?.senderPhone || '');
        const requestedProcessingDayKey = (options?.processingDayKey || '').trim();

        if (field === 'lokasi') {
            const { data: existing, error: readError } = await supabase
                .from('data_harian')
                .select('processing_day_key, lokasi, sender_phone')
                .eq('id', id)
                .maybeSingle();

            if (readError) {
                console.error('Error read existing row before updateDailyDataField:', readError);
                return { success: false, error: readError };
            }

            if (!existing) {
                return { success: false, error: new Error('Data tidak ditemukan untuk update lokasi.') };
            }

            previousLocation = (existing as { lokasi?: string | null }).lokasi || null;
            processingDayKey = (existing as { processing_day_key?: string | null }).processing_day_key || null;
            dbSenderPhone = normalizePhoneNumber((existing as { sender_phone?: string | null }).sender_phone || '');

            if (requestedProcessingDayKey && processingDayKey && requestedProcessingDayKey !== processingDayKey) {
                return {
                    success: false,
                    error: { code: 'PROCESSING_DAY_MISMATCH', message: 'Sesi edit kedaluwarsa. Silakan ulangi dari menu EDIT.' },
                };
            }

            if (requestedSenderPhone && dbSenderPhone && requestedSenderPhone !== dbSenderPhone) {
                return {
                    success: false,
                    error: { code: 'EDIT_OWNER_MISMATCH', message: 'Data tidak dapat diedit oleh nomor ini.' },
                };
            }

            const previousLocationNormalized = normalizeLocationKey(previousLocation || '');
            const nextLocation = normalizeLocationKey(value || '');
            const effectiveSenderPhone = requestedSenderPhone || dbSenderPhone;
            const effectiveProcessingDayKey = (processingDayKey || '').trim();

            if (nextLocation && previousLocationNormalized !== nextLocation) {
                const limitTarget = getLocationQuotaLimit(nextLocation);
                if (limitTarget !== null) {
                    if (!effectiveSenderPhone || !effectiveProcessingDayKey) {
                        return {
                            success: false,
                            error: { code: 'LOCATION_QUOTA_CONTEXT_MISSING', message: 'Konteks kuota tidak lengkap untuk edit lokasi.' },
                        };
                    }

                    const usedTarget = await getTotalDataTodayForSenderByLocation(
                        effectiveSenderPhone,
                        effectiveProcessingDayKey,
                        nextLocation
                    );

                    if (usedTarget < 0) {
                        return {
                            success: false,
                            error: {
                                code: 'LOCATION_QUOTA_CHECK_FAILED',
                                message: 'Sistem kuota sedang bermasalah. Silakan coba lagi beberapa saat.',
                            },
                        };
                    }

                    if (usedTarget >= limitTarget) {
                        const locationLabel = nextLocation.replace(/^DHARMAJAYA\s*-\s*/i, '').trim() || nextLocation;
                        return {
                            success: false,
                            error: {
                                code: 'LOCATION_QUOTA_EXCEEDED',
                                message: `⛔ Limit Kirim Data ${locationLabel} sudah penuh (${limitTarget}).`,
                            },
                        };
                    }

                    quotaCheckTargetLocation = nextLocation;
                    quotaCheckLimitTarget = limitTarget;
                }
            }
        }

        const updatePayload: Record<string, string> = { [field]: value };
        let updateQuery = supabase
            .from('data_harian')
            .update(updatePayload)
            .eq('id', id);

        if (field === 'lokasi' && requestedProcessingDayKey) {
            updateQuery = updateQuery.eq('processing_day_key', requestedProcessingDayKey);
        } else if (field === 'lokasi' && processingDayKey) {
            updateQuery = updateQuery.eq('processing_day_key', processingDayKey);
        }

        if (field === 'lokasi' && requestedSenderPhone) {
            updateQuery = updateQuery.eq('sender_phone', requestedSenderPhone);
        } else if (field === 'lokasi' && dbSenderPhone) {
            updateQuery = updateQuery.eq('sender_phone', dbSenderPhone);
        }

        if (field === 'lokasi') {
            if (previousLocation === null) {
                updateQuery = updateQuery.is('lokasi', null);
            } else {
                updateQuery = updateQuery.eq('lokasi', previousLocation);
            }
        }

        const { data: updatedRows, error } = await updateQuery
            .select('id')
            .limit(1);

        if (error) {
            console.error('Error updateDailyDataField:', error);
            return { success: false, error };
        }

        if (!updatedRows || updatedRows.length === 0) {
            return {
                success: false,
                error: {
                    code: 'UPDATE_CONFLICT',
                    message: 'Data berubah saat diproses. Silakan cek ulang lalu coba edit lagi.',
                },
            };
        }

        if (field === 'lokasi' && quotaCheckTargetLocation && quotaCheckLimitTarget !== null) {
            const effectiveSenderPhone = requestedSenderPhone || dbSenderPhone;
            const effectiveProcessingDayKey = (processingDayKey || '').trim();

            if (!effectiveSenderPhone || !effectiveProcessingDayKey) {
                return {
                    success: false,
                    error: {
                        code: 'LOCATION_QUOTA_CONTEXT_MISSING',
                        message: 'Konteks kuota tidak lengkap untuk edit lokasi.',
                    },
                };
            }

            const usedAfterUpdate = await getTotalDataTodayForSenderByLocation(
                effectiveSenderPhone,
                effectiveProcessingDayKey,
                quotaCheckTargetLocation
            );

            if (usedAfterUpdate < 0) {
                return {
                    success: false,
                    error: {
                        code: 'LOCATION_QUOTA_CHECK_FAILED',
                        message: 'Sistem kuota sedang bermasalah. Silakan coba lagi beberapa saat.',
                    },
                };
            }

            if (usedAfterUpdate > quotaCheckLimitTarget) {
                let rollbackQuery = supabase
                    .from('data_harian')
                    .update({ lokasi: previousLocation })
                    .eq('id', id)
                    .eq('processing_day_key', effectiveProcessingDayKey)
                    .eq('sender_phone', effectiveSenderPhone)
                    .eq('lokasi', quotaCheckTargetLocation);

                const { error: rollbackError } = await rollbackQuery;
                if (rollbackError) {
                    console.error('Error rollback updateDailyDataField after quota race:', rollbackError);
                    return {
                        success: false,
                        error: {
                            code: 'UPDATE_CONFLICT',
                            message: 'Terjadi bentrok data saat update. Silakan cek ulang lalu coba lagi.',
                        },
                    };
                }

                const locationLabel = quotaCheckTargetLocation.replace(/^DHARMAJAYA\s*-\s*/i, '').trim() || quotaCheckTargetLocation;
                return {
                    success: false,
                    error: {
                        code: 'LOCATION_QUOTA_EXCEEDED',
                        message: `⛔ Limit Kirim Data ${locationLabel} sudah penuh (${quotaCheckLimitTarget}).`,
                    },
                };
            }
        }

        if (field === 'lokasi' && processingDayKey) {
            const nextLocation = normalizeLocationKey(value || '');
            const prevLocationNormalized = normalizeLocationKey(previousLocation || '');
            const deltas: GlobalQuotaUsageDelta[] = [];

            if (prevLocationNormalized) {
                deltas.push({
                    processingDayKey,
                    locationKey: prevLocationNormalized,
                    delta: -1,
                });
            }

            if (nextLocation) {
                deltas.push({
                    processingDayKey,
                    locationKey: nextLocation,
                    delta: 1,
                });
            }

            await applyGlobalQuotaUsageDeltas(deltas);
        }

        return { success: true, error: null };
    } catch (err) {
        console.error('Exception updateDailyDataField:', err);
        return { success: false, error: err };
    }
}

// ============================================
// FITUR DAFTAR ULANG (REREGISTER) — Registration Results
// ============================================

/**
 * Cek apakah fitur daftar ulang aktif di bot_settings
 * Selalu query fresh (tidak pakai cache) agar bisa toggle realtime
 */
export async function isFeatureDaftarUlangEnabled(): Promise<boolean> {
    // FITUR DAFTAR ULANG DINONAKTIFKAN SEMENTARA HARI INI
    return false;
    /*
    try {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('fitur_daftar_ulang')
            .eq('id', 1)
            .maybeSingle();

        if (error || !data) return false;
        return data.fitur_daftar_ulang === true;
    } catch (err) {
        console.error('❌ isFeatureDaftarUlangEnabled error:', err);
        return false;
    }
    */
}

/**
 * Ambil data pendaftaran yang GAGAL untuk user tertentu
 * Cari berdasarkan sender_phone (utama) atau no_kjp yang cocok dengan data hari ini
 * @param senderPhone - Nomor HP pengirim (format 628xxx)
 * @returns Array of failed registration data
 */
export async function getFailedRegistrations(senderPhone: string): Promise<any[]> {
    try {
        // Query data FAILED yang belum ditawari ulang, berdasarkan sender_phone
        const { data, error } = await supabase
            .from('registration_results')
            .select('*')
            .eq('status', 'FAILED')
            .eq('sender_phone', senderPhone)
            .eq('offered_reregister', false)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ getFailedRegistrations error:', error.message);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('❌ getFailedRegistrations exception:', err);
        return [];
    }
}

/**
 * Update status data gagal menjadi RE_REGISTERED (setelah user pilih daftar ulang)
 * @param ids - Array of registration_results IDs to mark
 */
export async function markAsReRegistered(ids: number[]): Promise<boolean> {
    if (ids.length === 0) return true;

    try {
        const { error } = await supabase
            .from('registration_results')
            .update({ status: 'RE_REGISTERED', offered_reregister: true })
            .in('id', ids);

        if (error) {
            console.error('❌ markAsReRegistered error:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('❌ markAsReRegistered exception:', err);
        return false;
    }
}

/**
 * Auto-match: Ketika user kirim data baru yang no_kjp-nya cocok dengan data FAILED,
 * otomatis update status jadi RE_REGISTERED
 * @param noKjpList - Array of no_kjp dari data baru yang baru disimpan
 * @returns Jumlah data yang berhasil di-match
 */
export async function autoMatchReRegistered(noKjpList: string[]): Promise<number> {
    if (noKjpList.length === 0) return 0;

    try {
        const { data, error } = await supabase
            .from('registration_results')
            .update({ status: 'RE_REGISTERED', offered_reregister: true })
            .eq('status', 'FAILED')
            .in('no_kjp', noKjpList)
            .select('id');

        if (error) {
            console.error('❌ autoMatchReRegistered error:', error.message);
            return 0;
        }

        return data?.length || 0;
    } catch (err) {
        console.error('❌ autoMatchReRegistered exception:', err);
        return 0;
    }
}

/**
 * Tandai data gagal sebagai sudah ditawari (agar tidak ditawari lagi)
 * @param senderPhone - Nomor HP pengirim
 */
export async function markOfferedReregister(senderPhone: string): Promise<void> {
    try {
        await supabase
            .from('registration_results')
            .update({ offered_reregister: true })
            .eq('status', 'FAILED')
            .eq('sender_phone', senderPhone);
    } catch (err) {
        console.error('❌ markOfferedReregister error:', err);
    }
}


export function getStartOfCurrentMonthUTC(): string {
    return getStartOfWibMonthUTC(new Date());
}

let lastBlockedKtpCleanupMonthKey: string | null = null;

function getWibMonthKey(date: Date): string {
    const p = getWibParts(date);
    return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}`;
}

async function cleanupBlockedKtpAtEndOfMonthWib(): Promise<void> {
    const now = new Date();
    if (!isLastDayOfWibMonth(now)) return;

    const monthKey = getWibMonthKey(now);
    if (lastBlockedKtpCleanupMonthKey === monthKey) return;

    const startOfNextMonth = getStartOfNextWibMonthUTC(now);
    const { count, error } = await supabase
        .from('blocked_ktp')
        .delete({ count: 'exact' })
        .lt('created_at', startOfNextMonth);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Auto-cleanup blocked KTP (EOM WIB) error:', error);
        }
        return;
    }

    lastBlockedKtpCleanupMonthKey = monthKey;
    console.log(`🧹 Cleanup blocked KTP EOM WIB selesai (${monthKey}), terhapus: ${count || 0}`);
}

export async function getBlockedKtpList(limit: number = 50): Promise<BlockedKtpItem[]> {
    const startOfMonth = getStartOfCurrentMonthUTC();
    await cleanupBlockedKtpAtEndOfMonthWib();

    const { data, error } = await supabase
        .from('blocked_ktp')
        .select('no_ktp, reason, created_at')
        .gte('created_at', startOfMonth)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error getBlockedKtpList:', error);
        }
        return [];
    }

    return (data || []) as BlockedKtpItem[];
}

export async function addBlockedKtp(noKtpRaw: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const noKtp = noKtpRaw.replace(/\D/g, '');
    if (noKtp.length !== 16) {
        return { success: false, message: 'No KTP harus 16 digit.' };
    }

    const payload: any = {
        no_ktp: noKtp,
        reason: (reason || '').trim() || null,
    };

    const { error } = await supabase
        .from('blocked_ktp')
        .upsert(payload, { onConflict: 'no_ktp' });

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_ktp belum dibuat di database.' };
        }
        console.error('Error addBlockedKtp:', error);
        return { success: false, message: 'Gagal database: ' + error.message };
    }

    return { success: true, message: `No KTP ${noKtp} berhasil diblokir.` };
}

export async function removeBlockedKtp(noKtpRaw: string): Promise<{ success: boolean; message: string }> {
    const noKtp = noKtpRaw.replace(/\D/g, '');
    if (noKtp.length !== 16) {
        return { success: false, message: 'No KTP harus 16 digit.' };
    }

    const { count, error } = await supabase
        .from('blocked_ktp')
        .delete({ count: 'exact' })
        .eq('no_ktp', noKtp);

    if (error) {
        if (error.code === '42P01') {
            return { success: false, message: 'Tabel blocked_ktp belum dibuat di database.' };
        }
        console.error('Error removeBlockedKtp:', error);
        return { success: false, message: 'Gagal database: ' + error.message };
    }

    if ((count || 0) === 0) {
        return { success: false, message: `No KTP ${noKtp} tidak ditemukan di daftar blokir.` };
    }

    return { success: true, message: `No KTP ${noKtp} berhasil dibuka blokirnya.` };
}

export async function checkBlockedKtpBatch(items: LogItem[]): Promise<LogItem[]> {
    await cleanupBlockedKtpAtEndOfMonthWib();

    const activeItems = items.filter(it => it.status === 'OK' && it.parsed.no_ktp);
    if (activeItems.length === 0) return items;

    const startOfMonth = getStartOfCurrentMonthUTC();
    const ktpValues = Array.from(new Set(activeItems.map(it => it.parsed.no_ktp)));
    const { data, error } = await supabase
        .from('blocked_ktp')
        .select('no_ktp, reason')
        .in('no_ktp', ktpValues)
        .gte('created_at', startOfMonth);

    if (error) {
        if (error.code !== '42P01') {
            console.error('Error checkBlockedKtpBatch:', error);
        }
        return items;
    }

    const blockedMap = new Map<string, string | null>();
    (data || []).forEach((row: any) => {
        blockedMap.set(row.no_ktp, row.reason || null);
    });

    if (blockedMap.size === 0) return items;

    return items.map(item => {
        if (item.status !== 'OK') return item;

        const reason = blockedMap.get(item.parsed.no_ktp);
        if (reason === undefined) return item;

        return {
            ...item,
            status: 'SKIP_FORMAT',
            errors: [
                ...item.errors,
                {
                    field: 'no_ktp',
                    type: 'ktp_blocked',
                    detail: 'KTP Telah Mencapai Batas 5x Pendaftaran Bulan ini'
                }
            ]
        };
    });
}
