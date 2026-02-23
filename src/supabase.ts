// src/supabase.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { LogItem, LogJson, DuplicateKind, DuplicateInfo } from './types';
import { getWibTimeHHmm } from './time';

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
    const { processingDayKey } = ctx;

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

    // PROCESS CHECKING IN-MEMORY
    return items.map(item => {
        if (item.status !== 'OK') return item;

        const errorMessages: string[] = [];
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
            const owner = getOwnerName(kjpMatch);
            errorMessages.push(`• 💳 No KJP sudah terdaftar atas nama *${owner}*`);
        }

        const ktpMatch = globalDupes.find(d => d.no_ktp === item.parsed.no_ktp);
        if (ktpMatch) {
            conflictFound = true;
            firstKind = firstKind || 'NO_KTP';
            firstDupData = firstDupData || ktpMatch;
            const owner = getOwnerName(ktpMatch);
            errorMessages.push(`• 🪪 No KTP sudah terdaftar atas nama *${owner}*`);
        }

        if (conflictFound) {
            const finalMsg = errorMessages.join('\n');
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

        return item;
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

export type BlockedPhoneItem = {
    phone_number: string;
    reason?: string | null;
    created_at?: string | null;
};

function normalizeKk(raw: string): string {
    return (raw || '').replace(/\D/g, '');
}

function normalizePhoneNumber(raw: string): string {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    if (digits.startsWith('8')) digits = `62${digits}`;
    return digits;
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
    async function insertData(): Promise<any> {
        const okItems = log.items.filter((it) => it.status === 'OK');
        if (okItems.length === 0) return null; // No data to insert, not an error

        const rows = okItems.map((it) => ({
            tanggal: log.tanggal,
            processing_day_key: log.processing_day_key,
            received_at: log.received_at,
            sumber: 'wa',
            sender_phone: log.sender_phone,
            sender_name: log.sender_name || null,
            nama: it.parsed.nama,
            no_kjp: it.parsed.no_kjp,
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
        }
        return dataError;
    }

    // PARALLEL INSERT: Log dan Data Harian berbarengan dengan proper error capture
    const [logErrorResult, dataErrorResult] = await Promise.all([
        insertLog(),
        insertData()
    ]);

    // Return status - only consider failure if data insert failed (log error is less critical)
    const success = dataErrorResult === null;

    // DEBUG LOG: Pastikan status success benar
    if (!success) {
        console.error('⚠️ saveLogAndOkItems: Returning success=false due to dataError');
    }

    return {
        success,
        dataError: dataErrorResult,
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
            const { count, error } = await supabase
                .from('data_harian')
                .delete({ count: 'exact' })
                .eq('processing_day_key', processingDayKey) // Pastikan hari yg sama
                .eq('sender_phone', senderPhone)            // Pastikan milik dia
                .or(`no_kjp.eq.${digits},no_ktp.eq.${digits},no_kk.eq.${digits}`);

            if (error) {
                console.error('Error delete data by number:', error);
                return { success: false, count: 0, mode: 'number', error };
            }

            return { success: true, count: count ?? 0, mode: 'number', error: null };
        }

        // Selain itu, anggap nama
        const nameQ = raw;
        if (!nameQ) return { success: true, count: 0, mode: 'name', error: null };

        const norm = nameQ.trim().toUpperCase();

        const { count, error } = await supabase
            .from('data_harian')
            .delete({ count: 'exact' })
            .eq('processing_day_key', processingDayKey)
            .eq('sender_phone', senderPhone)
            .ilike('nama', `%${norm}%`);

        if (error) {
            console.error('Error delete data by name:', error);
            return { success: false, count: 0, mode: 'name', error };
        }

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
        .select('id, nama')
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
        .select('id, nama') // Fetch Nama too
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

    return { success: true, deletedCount: count ?? 0, deletedNames: namesToDelete };
}

export async function deleteAllDailyDataForSender(
    senderPhone: string,
    processingDayKey: string
): Promise<{ success: boolean; deletedCount: number; deletedNames: string[] }> {
    // 1. Ambil nama dulu sebelum hapus
    const { data } = await supabase
        .from('data_harian')
        .select('nama')
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
            .select('id, nama, received_at')
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
        .slice(0, 10)
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

        if (errLog || errData) {
            console.error('Gagal reset DB:', errLog, errData);
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

        if (errLog || errData) {
            console.error('Gagal reset harian:', errLog, errData);
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
    close_minute_end: 0,
    close_message_template: `⛔ *MOHON MAAF, SISTEM SEDANG TUTUP*
(Maintenance Harian)

🕒 Jam Tutup: *{JAM_TUTUP}*
✅ Buka Kembali: *Pukul {JAM_BUKA} WIB*

📌 Data yang Anda kirim sekarang *tidak akan diproses*.
Silakan kirim ulang setelah jam buka untuk pendaftaran besok.

_Terima kasih atas pengertiannya._ 🙏`,
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
    // FIX: Menit 60 Bug
    // Logic lama: settings.close_minute_end + 1
    // Logic baru: gunakan Date object atau aritmatika sederhana
    let m = settings.close_minute_end + 1;
    let h = settings.close_hour_end;

    if (m >= 60) {
        m = 0;
        h = (h + 1) % 24;
    }

    return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

// Render template pesan tutup dengan placeholder
export function renderCloseMessage(settings: BotSettings): string {
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

            // Custom Message for Long Term Close
            return settings.close_message_template
                .replace(/{JAM_TUTUP}/g, 'LIBUR SEMENTARA')
                .replace(/{JAM_BUKA}/g, jamBuka)
                .replace('(Maintenance Harian)', '(Sedang Libur/Tutup)');
        }
    }

    // Default Harian
    const jamTutup = formatCloseTimeString(settings);
    const jamBuka = formatOpenTimeString(settings);

    return settings.close_message_template
        .replace(/{JAM_TUTUP}/g, jamTutup)
        .replace(/{JAM_BUKA}/g, jamBuka);
}

// Refresh cache settings (dipanggil setelah admin update)
export function clearBotSettingsCache(): void {
    botSettingsCache = null;
}

// --- PATCH 2: UPDATE FIELD DATA ---
export async function updateDailyDataField(
    id: number,
    field: string,
    value: string
): Promise<{ success: boolean; error: any }> {
    try {
        const { error } = await supabase
            .from('data_harian')
            .update({ [field]: value })
            .eq('id', id);

        if (error) {
            console.error('Error updateDailyDataField:', error);
            return { success: false, error };
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
    const now = new Date();
    const wibYear = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(now));
    const wibMonth = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', month: 'numeric' }).format(now));
    const isoStringWIB = `${wibYear}-${String(wibMonth).padStart(2, '0')}-01T00:00:00.000+07:00`;
    return new Date(isoStringWIB).toISOString();
}

export async function getBlockedKtpList(limit: number = 50): Promise<BlockedKtpItem[]> {
    const startOfMonth = getStartOfCurrentMonthUTC();

    // Auto-cleanup fire and forget
    supabase.from('blocked_ktp').delete().lt('created_at', startOfMonth).then(({error}) => {
        if(error && error.code !== '42P01') console.error('Auto-cleanup blocked KTP error:', error);
    });

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
