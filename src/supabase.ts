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
    const { processingDayKey, senderPhone, tanggal } = ctx;

    // Filter items yang statusnya OK (hanya ini yang perlu dicek ke DB)
    const activeItems = items.filter(it => it.status === 'OK');
    if (activeItems.length === 0) return items;

    // Collect IDs for Batch Query
    // Kita kumpulkan semua ID unik dari items
    const allKjp = new Set<string>();
    const allKtp = new Set<string>();
    const allKk = new Set<string>();

    activeItems.forEach(it => {
        if (it.parsed.no_kjp) allKjp.add(it.parsed.no_kjp);
        if (it.parsed.no_ktp) allKtp.add(it.parsed.no_ktp);
        if (it.parsed.no_kk) allKk.add(it.parsed.no_kk);
    });

    // QUERY 1: GLOBAL DUPLICATES (ID Check) - Single Query
    // Mencari apakah ada data hari ini yang memiliki KJP/KTP/KK yang sama
    // Filter: (no_kjp IN list OR no_ktp IN list OR no_kk IN list) AND tanggal = today
    // Note: Supabase .or() syntax: "col1.in.(val1,val2),col2.in.(val3,val4)"
    const conditions: string[] = [];
    if (allKjp.size > 0) conditions.push(`no_kjp.in.(${Array.from(allKjp).join(',')})`);
    if (allKtp.size > 0) conditions.push(`no_ktp.in.(${Array.from(allKtp).join(',')})`);
    if (allKk.size > 0) conditions.push(`no_kk.in.(${Array.from(allKk).join(',')})`);

    let globalDupes: any[] = [];
    if (conditions.length > 0) {
        const orClause = conditions.join(',');
        const { data, error } = await supabase
            .from('data_harian')
            .select('nama, no_kjp, no_ktp, no_kk, sender_phone')
            .eq('tanggal', tanggal) // Scope to Today
            .or(orClause);

        if (!error && data) {
            globalDupes = data;
        } else if (error) {
            console.error('Error batch global dupes:', error);
        }
    }

    // QUERY 2: SENDER DUPLICATES (Name Check) - Single Query
    // Mencari apakah SENDER ini sudah pernah kirim nama yang sama hari ini
    // Kita ambil SEMUA data sender hari ini (biasanya tidak banyak, max ratusan)
    // Lalu cek in-memory using fuzzy/exact logic match
    let senderData: any[] = [];
    {
        const { data, error } = await supabase
            .from('data_harian')
            .select('nama, sender_phone')
            .eq('tanggal', tanggal)
            .eq('sender_phone', senderPhone);

        if (!error && data) {
            senderData = data;
        } else if (error) {
            console.error('Error batch sender data:', error);
        }
    }

    // PROCESS CHECKING IN-MEMORY
    return items.map(item => {
        if (item.status !== 'OK') return item;

        const errorMessages: string[] = [];
        let conflictFound = false;
        let firstDupData: any = null;

        const getOwnerName = (dupData: any) => {
            return (dupData as any).nama ? (dupData as any).nama.toUpperCase() : 'ORANG LAIN';
        };

        // 1. Check Name (Scoped to Sender)
        if (item.parsed.nama) {
            const targetName = item.parsed.nama.toUpperCase();
            // Simple includes check as imperfect replacement for ILIKE, but sufficient for exact duplicates
            // Or 'fuzzy' match if needed. For now assume exact/trimmed match which 'cleanName' provides.
            // Using logic: if senderData has row with same Name
            const match = senderData.find(d => d.nama && d.nama.toUpperCase() === targetName);
            if (match) {
                conflictFound = true;
                firstDupData = firstDupData || match;
                const owner = getOwnerName(match);
                errorMessages.push(`• 👤 Nama sudah terdaftar atas nama *${owner}*`);
            }
        }

        // 2. Check IDs (Global)
        // Find match in globalDupes
        const kjpMatch = globalDupes.find(d => d.no_kjp === item.parsed.no_kjp);
        if (kjpMatch) {
            conflictFound = true;
            firstDupData = firstDupData || kjpMatch;
            const owner = getOwnerName(kjpMatch);
            errorMessages.push(`• 💳 No KJP sudah terdaftar atas nama *${owner}*`);
        }

        const ktpMatch = globalDupes.find(d => d.no_ktp === item.parsed.no_ktp);
        if (ktpMatch) {
            conflictFound = true;
            firstDupData = firstDupData || ktpMatch;
            const owner = getOwnerName(ktpMatch);
            errorMessages.push(`• 🪪 No KTP sudah terdaftar atas nama *${owner}*`);
        }

        const kkMatch = globalDupes.find(d => d.no_kk === item.parsed.no_kk);
        if (kkMatch) {
            const existingSender = kkMatch.sender_phone;
            // KK conflict only if DIFFERENT sender
            // Note: If same sender, it will be caught by senderData/Legacy logic? 
            // Wait, previous logic said: "Khusus KK, kita hanya anggap duplikat jika PUNYA ORANG LAIN"
            if (existingSender !== senderPhone) {
                conflictFound = true;
                firstDupData = firstDupData || kkMatch;
                const owner = getOwnerName(kkMatch);
                errorMessages.push(`• 🏠 No KK sudah digunakan oleh *${owner}*`);
            }
        }

        if (conflictFound) {
            const finalMsg = errorMessages.join('\n');
            const info: DuplicateInfo = {
                kind: 'NAME',
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
        .order('received_at', { ascending: true });

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
        .order('received_at', { ascending: true });

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
    close_hour_start: 4,
    close_minute_start: 1,
    close_hour_end: 6,
    close_minute_end: 0,
    close_message_template: `⛔ *MOHON MAAF, SISTEM SEDANG TUTUP*
(Maintenance Harian)

🕒 Jam Tutup: *{JAM_TUTUP}*
✅ Buka Kembali: *Pukul {JAM_BUKA} WIB*

📌 Data yang Anda kirim sekarang *tidak akan diproses*.
Silakan kirim ulang setelah jam buka untuk pendaftaran besok.

_Terima kasih atas pengertiannya._ 🙏`,
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
    // Cek apakah sedang dalam MODE TUTUP PANJANG (Manual Override)?
    // Jika manual_close_end masih berlaku (di masa depan), tampilkan pesan khusus
    if (settings.manual_close_start && settings.manual_close_end) {
        const now = new Date(); // Server Time (Asumsi WIB atau UTC). Better check with proper timezone if possible.
        const end = new Date(settings.manual_close_end);

        // Simple check: if valid dates
        if (!isNaN(end.getTime())) {
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
