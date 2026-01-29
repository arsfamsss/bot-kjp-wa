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
    ctx: { processingDayKey: string; senderPhone: string }
): Promise<LogItem> {
    if (item.status !== 'OK') return item;

    const { processingDayKey, senderPhone } = ctx;

    const markDup = (args: {
        kind: DuplicateKind;
        safe_message: string;
        first_seen_at?: string | null;
        first_seen_wib_time?: string | null;
        original_data?: { nama: string; no_kjp: string; no_ktp: string; no_kk: string } | null;
    }): LogItem => {
        const info: DuplicateInfo = {
            kind: args.kind,
            processing_day_key: processingDayKey,
            safe_message: args.safe_message,
            first_seen_at: args.first_seen_at ?? null,
            first_seen_wib_time: args.first_seen_wib_time ?? null,
            original_data: args.original_data ?? null,
        };

        return {
            ...item,
            status: 'SKIP_DUPLICATE',
            duplicate_info: info,
        };
    };

    // PARALLEL CHECK: Jalankan semua cek duplikat secara bersamaan
    const [nameDup, kjpDup, ktpDup, kkDup] = await Promise.all([
        // (1) Cek Duplikat NAMA
        (async () => {
            if (!item.parsed.nama) return null;
            const { data, error } = await supabase
                .from('data_harian')
                .select('nama, no_kjp, no_ktp, no_kk, sender_phone') // +sender_phone
                .eq('processing_day_key', processingDayKey)
                .ilike('nama', item.parsed.nama)
                .limit(1);
            if (!error && data && data.length > 0) return data[0];
            return null;
        })(),

        // (2) Cek Duplikat No Kartu
        (async () => {
            if (!item.parsed.no_kjp) return null;
            const { data, error } = await supabase
                .from('data_harian')
                .select('nama, no_kjp, no_ktp, no_kk, sender_phone') // +sender_phone
                .eq('processing_day_key', processingDayKey)
                .eq('no_kjp', item.parsed.no_kjp)
                .limit(1);
            if (!error && data && data.length > 0) return data[0];
            return null;
        })(),

        // (3) Cek Duplikat KTP
        (async () => {
            if (!item.parsed.no_ktp) return null;
            const { data, error } = await supabase
                .from('data_harian')
                .select('nama, no_kjp, no_ktp, no_kk, sender_phone') // +sender_phone
                .eq('processing_day_key', processingDayKey)
                .eq('no_ktp', item.parsed.no_ktp)
                .limit(1);
            if (!error && data && data.length > 0) return data[0];
            return null;
        })(),

        // (4) Cek Duplikat KK
        (async () => {
            if (!item.parsed.no_kk) return null;
            const { data, error } = await supabase
                .from('data_harian')
                .select('received_at, sender_phone, nama, no_kjp, no_ktp, no_kk')
                .eq('processing_day_key', processingDayKey)
                .eq('no_kk', item.parsed.no_kk)
                .order('received_at', { ascending: true })
                .limit(1);
            if (!error && data && data.length > 0) return data[0];
            return null;
        })(),
    ]);

    // EVALUASI HASIL (Aggregate All Errors)
    const errorMessages: string[] = [];
    let conflictFound = false;
    let firstDupData: any = null; // Untuk mengisi original_data (sekadar representasi salah satu)

    // Helper untuk ambil nama owner
    // Jika sender_phone sama dengan current user, berarti dia double input sendiri
    const getOwnerName = (dupData: any) => {
        if ((dupData as any).sender_phone === senderPhone) {
            return 'Anda sendiri';
        }
        // Jika beda orang, tampilkan namanya
        return (dupData as any).nama ? (dupData as any).nama.toUpperCase() : 'ORANG LAIN';
    };

    // 1. Name
    if (nameDup) {
        conflictFound = true;
        firstDupData = firstDupData || nameDup;
        const owner = getOwnerName(nameDup);
        errorMessages.push(`• 👤 Nama sudah terdaftar atas nama *${owner}*`);
    }

    // 2. KJP
    if (kjpDup) {
        conflictFound = true;
        firstDupData = firstDupData || kjpDup;
        const owner = getOwnerName(kjpDup);
        errorMessages.push(`• 💳 No KJP sudah terdaftar atas nama *${owner}*`);
    }

    // 3. KTP
    if (ktpDup) {
        conflictFound = true;
        firstDupData = firstDupData || ktpDup;
        const owner = getOwnerName(ktpDup);
        errorMessages.push(`• 🪪 No KTP sudah terdaftar atas nama *${owner}*`);
    }

    // 4. KK
    if (kkDup) {
        // Khusus KK, kita hanya anggap duplikat jika PUNYA ORANG LAIN
        // (Satu keluarga boleh pakai KK sama, tapi kalau beda sender_phone berarti aneh/double input keluarga)
        const existingSender = (kkDup as any).sender_phone;
        if (existingSender !== senderPhone) {
            conflictFound = true;
            firstDupData = firstDupData || kkDup;
            const owner = getOwnerName(kkDup);
            errorMessages.push(`• 🏠 No KK sudah digunakan oleh *${owner}*`);
        }
    }

    if (conflictFound) {
        // Gabungkan semua pesan error
        const finalMsg = errorMessages.join('\n');

        return markDup({
            kind: 'NAME', // Default kind, tidak terlalu ngefek karena kita pakai safe_message
            safe_message: finalMsg,
            original_data: firstDupData ? {
                nama: firstDupData.nama || '',
                no_kjp: firstDupData.no_kjp || '',
                no_ktp: firstDupData.no_ktp || '',
                no_kk: firstDupData.no_kk || '',
            } : null,
        });
    }

    return item;
}

export async function saveLogAndOkItems(log: LogJson, rawText: string): Promise<void> {
    // PARALLEL INSERT: Log dan Data Harian berbarengan
    const insertLogPromise = (async () => {
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
        if (logError) console.error('Error insert log_pesan_wa:', logError);
    })();

    const insertDataPromise = (async () => {
        const okItems = log.items.filter((it) => it.status === 'OK');
        if (okItems.length === 0) return;

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
            console.error('Error insert data_harian:', dataError);
        } else {
            console.log(`Berhasil simpan ${rows.length} item OK ke data_harian.`);
        }
    })();

    await Promise.all([insertLogPromise, insertDataPromise]);
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
): Promise<{ success: boolean; deletedCount: number }> {
    // 1. Ambil data untuk mapping index ke ID
    const { data, error } = await supabase
        .from('data_harian')
        .select('id')
        .eq('processing_day_key', processingDayKey)
        .eq('sender_phone', senderPhone)
        .order('received_at', { ascending: true });

    if (error || !data || data.length === 0) return { success: false, deletedCount: 0 };

    // 2. Filter ID berdasarkan index yang diminta
    // Ingat: indices dari user adalah 1-based
    const idsToDelete: number[] = [];
    indices.forEach(idx => {
        if (idx > 0 && idx <= data.length) {
            idsToDelete.push(data[idx - 1].id);
        }
    });

    if (idsToDelete.length === 0) return { success: false, deletedCount: 0 };

    // 3. Hapus by IDs
    const { error: delError, count } = await supabase
        .from('data_harian')
        .delete({ count: 'exact' })
        .in('id', idsToDelete);

    if (delError) return { success: false, deletedCount: 0 };

    return { success: true, deletedCount: count ?? 0 };
}

export async function deleteAllDailyDataForSender(
    senderPhone: string,
    processingDayKey: string
): Promise<{ success: boolean; deletedCount: number }> {
    const { error, count } = await supabase
        .from('data_harian')
        .delete({ count: 'exact' })
        .eq('processing_day_key', processingDayKey)
        .eq('sender_phone', senderPhone);

    if (error) return { success: false, deletedCount: 0 };
    return { success: true, deletedCount: count ?? 0 };
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
    return data || [];
}

// --- LOOKUP BY PHONE NUMBER (untuk fix setelah ganti nomor bot) ---
// Cek apakah phone_number sudah terdaftar di database (langsung query, bypass cache)
export async function getRegisteredUserByPhone(phoneNumber: string): Promise<{ push_name: string | null; lid_jid: string | null } | null> {
    const { data, error } = await supabase
        .from('lid_phone_map')
        .select('push_name, lid_jid')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

    if (error) {
        console.error('❌ getRegisteredUserByPhone error:', error.message);
        return null;
    }
    return data ? { push_name: data.push_name, lid_jid: data.lid_jid } : null;
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

_Terima kasih atas pengertiannya._ 🙏`
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
    return `${String(settings.close_hour_end).padStart(2, '0')}.${String(settings.close_minute_end + 1).padStart(2, '0')}`;
}

// Render template pesan tutup dengan placeholder
export function renderCloseMessage(settings: BotSettings): string {
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
