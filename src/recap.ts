// src/recap.ts

import { supabase } from './supabase';
import type { ItemStatus, LogItem, LogJson } from './types';
import { getContactName } from './contacts_data';

export type TodayInvalidItem = {
    index: number;
    nama: string;
    status: ItemStatus;
    reason: string;
};

export type ValidItemDetail = {
    nama: string;
    no_kjp: string;
    no_ktp: string;
    no_kk: string;
    lokasi?: string;
    tanggal_lahir?: string;
};

const MAX_DETAIL_ITEMS = 50;

export type TodayRecapResult = {
    validCount: number;
    validItems: ValidItemDetail[];
    totalInvalid: number;
    detailItems: TodayInvalidItem[];
};

export type EditableItemDetail = {
    id: number;
    nama: string;
    no_kjp: string;
    no_ktp: string;
    no_kk: string;
    lokasi?: string;
    tanggal_lahir?: string;
};

export async function getEditableItemsForSender(
    senderPhone: string,
    processingDayKey: string
): Promise<EditableItemDetail[]> {
    const { data, error } = await supabase
        .from('data_harian')
        .select('id, nama, no_kjp, no_ktp, no_kk, lokasi, tanggal_lahir')
        .eq('sender_phone', senderPhone)
        .eq('processing_day_key', processingDayKey)
        .order('received_at', { ascending: true });

    if (error) {
        console.error('Error fetching editable items:', error);
        return [];
    }

    return (data || []) as EditableItemDetail[];
}

// --- BAGIAN 1: REKAP PRIBADI (BERDASARKAN processing_day_key) ---
export async function getTodayRecapForSender(
    senderPhone: string,
    processingDayKey: string
): Promise<TodayRecapResult> {
    // 1. Ambil data VALID (semua detail termasuk lokasi dan tanggal lahir)
    const { data: validData, count: validCount, error: countError } = await supabase
        .from('data_harian')
        .select('nama, no_kjp, no_ktp, no_kk, lokasi, tanggal_lahir', { count: 'exact' })
        .eq('sender_phone', senderPhone)
        .eq('processing_day_key', processingDayKey)
        .order('received_at', { ascending: true });

    if (countError) throw countError;

    const validItems: ValidItemDetail[] = validData ? (validData as any[]).map(d => ({
        nama: d.nama,
        no_kjp: d.no_kjp,
        no_ktp: d.no_ktp,
        no_kk: d.no_kk,
        lokasi: d.lokasi || undefined,
        tanggal_lahir: d.tanggal_lahir || undefined
    })) : [];

    // 2. Ambil data INVALID dari log
    const { data: logs, error: logsError } = await supabase
        .from('log_pesan_wa')
        .select('log_json')
        .eq('sender_phone', senderPhone)
        .eq('processing_day_key', processingDayKey);

    if (logsError) throw logsError;

    const rawInvalidItems: TodayInvalidItem[] = [];
    if (logs && logs.length > 0) {
        for (const row of logs as any[]) {
            const log = row.log_json as LogJson | null;
            if (!log || !log.items) continue;

            for (const item of log.items) {
                if (item.status === 'SKIP_FORMAT' || item.status === 'SKIP_DUPLICATE') {
                    rawInvalidItems.push({
                        index: item.index,
                        nama: item.parsed?.nama ?? '(tanpa nama)',
                        status: item.status,
                        reason: buildReasonForInvalidItem(item),
                    });
                }
            }
        }
    }

    const detailItems = dedupInvalidItems(rawInvalidItems)
        .sort((a, b) => a.index - b.index)
        .slice(0, MAX_DETAIL_ITEMS);

    return {
        validCount: validCount ?? 0,
        validItems,
        totalInvalid: rawInvalidItems.length,
        detailItems,
    };
}

function dedupInvalidItems(items: TodayInvalidItem[]): TodayInvalidItem[] {
    const seen = new Set<string>();
    const result: TodayInvalidItem[] = [];
    for (const item of items) {
        const key = `${item.index}||${item.nama}||${item.status}||${item.reason}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }
    return result;
}

function buildReasonForInvalidItem(item: LogItem): string {
    if (item.status === 'SKIP_FORMAT') {
        if (item.errors && item.errors.length > 0) return item.errors[0].detail;
        return 'Format salah.';
    }

    if (item.status === 'SKIP_DUPLICATE') {
        return item.duplicate_info?.safe_message ?? 'Data duplikat (sudah terdaftar hari ini).';
    }

    return 'Gagal.';
}

export function buildReplyForTodayRecap(
    validCount: number,
    totalInvalid: number,
    validItems: ValidItemDetail[],
    processingDayKey: string
): string {
    const displayDate = processingDayKey.split('-').reverse().join('-');

    const lines: string[] = [];
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🔎 *STATUS DATA HARI INI*`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`📅 Periode: *${displayDate}* (06.01–04.00 WIB)`);
    lines.push('');
    lines.push(`✅ *Data Terdaftar: ${validCount} Orang*`);

    if (validItems.length > 0) {
        lines.push('');
        validItems.forEach((item, i) => {
            // Tentukan lokasi pengambilan
            let lokasiLabel = '📍 Duri Kosambi'; // Default lama
            if (item.lokasi) {
                if (item.lokasi.startsWith('PASARJAYA') || item.lokasi.startsWith('DHARMAJAYA')) {
                    lokasiLabel = `📍 ${item.lokasi}`;
                }
            }

            lines.push(`┌── ${i + 1}. *${item.nama}*`);
            lines.push(`│   📇 Kartu : ${item.no_kjp}`);
            lines.push(`│   🪪 KTP   : ${item.no_ktp}`);
            lines.push(`│   🏠 KK    : ${item.no_kk}`);

            // Tampilkan tanggal lahir jika ada (khusus Pasarjaya)
            if (item.tanggal_lahir) {
                const tglLahirDisplay = formatDateDMY(item.tanggal_lahir);
                lines.push(`│   🎂 Lahir : ${tglLahirDisplay}`);
            }

            lines.push(`└── ${lokasiLabel}`);
            if (i < validItems.length - 1) lines.push('');
        });
    } else {
        lines.push('');
        lines.push('_Belum ada data terdaftar hari ini._');
    }

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('💡 _Ketik *MENU* untuk kembali._');

    return lines.join('\n');
}

export function buildReplyForInvalidDetails(
    detailItems: TodayInvalidItem[]
): string {
    const lines: string[] = [];
    lines.push(`_Rincian gagal (max ${MAX_DETAIL_ITEMS}):_`);
    if (detailItems.length === 0) {
        lines.push('- Tidak ada data gagal.');
    } else {
        for (const item of detailItems) {
            lines.push(`❌ *${item.nama}*`);
            // reason sudah berupa multiline string dari logic supabase
            lines.push(item.reason);
            lines.push(''); // Jarak antar item
        }
    }
    return lines.join('\n');
}

// --- BAGIAN 2: REKAP GLOBAL ADMIN (BERDASARKAN processing_day_key) ---
export async function getGlobalRecap(
    startKey: string,
    endKey?: string,
    nameLookup?: (phone: string) => string | null | undefined
): Promise<string> {
    const displayStart = startKey.split('-').reverse().join('-');
    const displayEnd = endKey ? endKey.split('-').reverse().join('-') : null;
    const dateLabel = displayEnd ? `${displayStart} s/d ${displayEnd}` : displayStart;

    let query = supabase
        .from('data_harian')
        .select('*')
        .order('processing_day_key', { ascending: true })
        .order('sender_phone', { ascending: true })
        .order('received_at', { ascending: true });

    if (endKey) {
        query = query.gte('processing_day_key', startKey).lte('processing_day_key', endKey);
    } else {
        query = query.eq('processing_day_key', startKey);
    }

    const { data, error } = await query;

    if (error || !data) {
        console.error('Error recap global:', error);
        return '❌ Gagal mengambil data database.';
    }

    if (data.length === 0) {
        return `📅 Periode: ${dateLabel}\n📊 Belum ada data masuk pada periode ini.`;
    }

    const grouped: Record<string, any[]> = {};
    for (const row of data as any[]) {
        const phone = row.sender_phone;
        if (!grouped[phone]) grouped[phone] = [];
        grouped[phone].push(row);
    }

    // --- AMBIL NAMA DARI DB (LID MAP) ---
    // Kita kumpulkan semua nomor yg ada di rekap
    const allPhones = Object.keys(grouped);
    const dbNamesMap = new Map<string, string>();

    if (allPhones.length > 0) {
        const { data: mapData } = await supabase
            .from('lid_phone_map')
            .select('phone_number, push_name')
            .in('phone_number', allPhones);

        if (mapData) {
            mapData.forEach((row: any) => {
                if (row.phone_number && row.push_name) {
                    dbNamesMap.set(row.phone_number, row.push_name);
                }
            });
        }
    }

    const lines: string[] = [];
    lines.push(`👑 *LAPORAN DETAIL DATA*`);
    lines.push(`📅 Periode: ${dateLabel} (06.01–04.00 WIB)`);
    lines.push(`📊 Total Keseluruhan: *${data.length}* Data`);
    lines.push('');
    lines.push('👇 *RINCIAN DATA MASUK:*');

    Object.keys(grouped).forEach((phone, idx) => {
        const items = grouped[phone];

        // Lookup name logic:
        // 1. Dari Hardcoded contacts_data.ts (Daftar manual) -> PRIORITAS
        // 2. Dari Store (via callback nameLookup) -> PushName WA
        // 3. Dari DB lid_phone_map

        let contactName: string | null | undefined = getContactName(phone);

        // 2. Cek DB jika tidak ada di kontak manual
        if (!contactName) {
            contactName = dbNamesMap.get(phone) || null;
        }

        // 3. Cek Store WA jika tidak ada di DB
        if (!contactName && nameLookup) {
            contactName = nameLookup(phone);
        }

        const nameDisplay = contactName ? ` ${contactName}` : '';

        lines.push(`----------------------------------------`);
        lines.push(`👤 *PENGIRIM ${idx + 1}:${nameDisplay} WA ${phone}*`);
        lines.push(`📥 Jumlah Data: ${items.length}`);

        // --- GROUPING PER LOKASI ---
        const dharmajayaItems = items.filter((i: any) => !i.lokasi || (!i.lokasi.startsWith('PASARJAYA')));
        const pasarjayaItems = items.filter((i: any) => i.lokasi && i.lokasi.startsWith('PASARJAYA'));

        let globalIndex = 1;

        // Tampilkan Dharmajaya terlebih dahulu
        if (dharmajayaItems.length > 0) {
            lines.push(`*Dharmajaya Duri Kosambi* : ${dharmajayaItems.length}`);
            dharmajayaItems.forEach((item: any) => {
                const itemKey = endKey ? ` (${String(item.processing_day_key).split('-').reverse().join('-')})` : '';
                lines.push(`   ${globalIndex}. ${item.nama}${itemKey}`);
                lines.push(`   KJP ${item.no_kjp}`);
                lines.push(`   KTP ${item.no_ktp}`);
                lines.push(`   KK  ${item.no_kk}`);
                lines.push('');
                globalIndex++;
            });
        }

        // Tampilkan Pasarjaya - Dikelompokkan berdasarkan lokasi spesifik
        if (pasarjayaItems.length > 0) {
            // Group by specific location
            const pasarjayaByLocation: Record<string, any[]> = {};
            for (const item of pasarjayaItems) {
                const locKey = item.lokasi || 'PASARJAYA';
                if (!pasarjayaByLocation[locKey]) pasarjayaByLocation[locKey] = [];
                pasarjayaByLocation[locKey].push(item);
            }

            // Tampilkan per lokasi spesifik
            for (const [locName, locItems] of Object.entries(pasarjayaByLocation)) {
                lines.push(`*${locName}* : ${locItems.length}`);
                locItems.forEach((item: any) => {
                    const itemKey = endKey ? ` (${String(item.processing_day_key).split('-').reverse().join('-')})` : '';
                    const tglLahir = item.tanggal_lahir ? formatDateDMY(item.tanggal_lahir) : '';
                    lines.push(`   ${globalIndex}. ${item.nama}${itemKey}`);
                    lines.push(`   KK  ${item.no_kk}`);
                    lines.push(`   KTP ${item.no_ktp}`);
                    lines.push(`   KJP ${item.no_kjp}`);
                    if (tglLahir) lines.push(`   ${tglLahir}`);
                    lines.push('');
                    globalIndex++;
                });
            }
        }
    });

    lines.push(`_Akhir laporan (${data.length} data)_`);
    return lines.join('\n');
}

// Helper: Format tanggal dari YYYY-MM-DD ke DD-MM-YYYY
function formatDateDMY(isoDate: string | null): string {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// --- GENERATE EXPORT DATA (TXT ONLY - Format Laporan Detail Per Gerai + Pengirim) ---
export async function generateExportData(
    processingDayKey: string,
    nameLookup?: (phone: string) => string | undefined
): Promise<{ txt: string; filenameBase: string; count: number } | null> {
    // Ambil data hari ini
    const { data, error } = await supabase
        .from('data_harian')
        .select('*')
        .eq('processing_day_key', processingDayKey)
        .order('sender_phone', { ascending: true })
        .order('received_at', { ascending: true });

    if (error || !data || data.length === 0) {
        return null;
    }

    // Ambil nama dari database untuk semua pengirim
    const allPhones = [...new Set((data as any[]).map(r => r.sender_phone))];
    const dbNamesMap = new Map<string, string>();

    if (allPhones.length > 0) {
        const { data: mapData } = await supabase
            .from('lid_phone_map')
            .select('phone_number, push_name')
            .in('phone_number', allPhones);

        if (mapData) {
            mapData.forEach((row: any) => {
                if (row.phone_number && row.push_name) {
                    dbNamesMap.set(row.phone_number, row.push_name);
                }
            });
        }
    }

    // Helper untuk lookup nama
    const getSenderName = (phone: string): string => {
        let name = dbNamesMap.get(phone) || null;
        if (!name && nameLookup) {
            name = nameLookup(phone) || null;
        }
        return name || 'Unknown';
    };

    const displayDate = processingDayKey.split('-').reverse().join('-');

    // --- Group by Lokasi terlebih dahulu, lalu by Sender ---
    const dharmajayaData = (data as any[]).filter((i: any) => !i.lokasi || (!i.lokasi.startsWith('PASARJAYA')));
    const pasarjayaData = (data as any[]).filter((i: any) => i.lokasi && i.lokasi.startsWith('PASARJAYA'));

    // Group Dharmajaya by sender
    const dharmajayaBySender: Record<string, any[]> = {};
    for (const row of dharmajayaData) {
        const phone = row.sender_phone;
        if (!dharmajayaBySender[phone]) dharmajayaBySender[phone] = [];
        dharmajayaBySender[phone].push(row);
    }

    // Group Pasarjaya by sender
    const pasarjayaBySender: Record<string, any[]> = {};
    for (const row of pasarjayaData) {
        const phone = row.sender_phone;
        if (!pasarjayaBySender[phone]) pasarjayaBySender[phone] = [];
        pasarjayaBySender[phone].push(row);
    }

    // --- Generate TXT (Format Baru: Per Gerai > Per Pengirim) ---
    const txtRows: string[] = [];
    txtRows.push('👑 *LAPORAN DETAIL DATA*');
    txtRows.push(`📅 Periode: ${displayDate} (06.01–04.00 WIB)`);
    txtRows.push(`📊 Total Keseluruhan: *${data.length}* Data`);
    txtRows.push('');
    txtRows.push('👇 *RINCIAN DATA MASUK:*');
    txtRows.push('────────────────────────────────────');

    // === GERAI DHARMAJAYA ===
    if (Object.keys(dharmajayaBySender).length > 0) {
        txtRows.push('*Gerai Dharmajaya Duri Kosambi*');
        txtRows.push('');

        // SORTING BY NAME
        const sortedPhones = Object.keys(dharmajayaBySender).sort((a, b) => {
            const nameA = getSenderName(a).toUpperCase();
            const nameB = getSenderName(b).toUpperCase();
            return nameA.localeCompare(nameB);
        });

        for (const phone of sortedPhones) {
            const items = dharmajayaBySender[phone];
            const senderName = getSenderName(phone);

            // TIDAK ADA HEADER PENGIRIM, LANGSUNG ITEM
            items.forEach((item: any) => {
                txtRows.push(`${senderName} (${item.nama})`);
                txtRows.push(`   📇 KJP ${item.no_kjp}`);
                txtRows.push(`   🪪 KTP ${item.no_ktp}`);
                txtRows.push(`   🏠 KK  ${item.no_kk}`);
                txtRows.push('');
            });
        }
    }

    // === GERAI PASARJAYA (DIGABUNG SATU HEADER) ===
    if (Object.keys(pasarjayaBySender).length > 0) {
        txtRows.push('*Gerai PASARJAYA*');
        txtRows.push('');

        // SORTING BY NAME
        const sortedPhones = Object.keys(pasarjayaBySender).sort((a, b) => {
            const nameA = getSenderName(a).toUpperCase();
            const nameB = getSenderName(b).toUpperCase();
            return nameA.localeCompare(nameB);
        });

        for (const phone of sortedPhones) {
            const items = pasarjayaBySender[phone];
            const senderName = getSenderName(phone);

            items.forEach((item: any) => {
                const tglLahir = item.tanggal_lahir ? formatDateDMY(item.tanggal_lahir) : '';
                txtRows.push(`${senderName} (${item.nama})`);
                txtRows.push(`KJP ${item.no_kjp}`);
                txtRows.push(`KTP ${item.no_ktp}`);
                txtRows.push(`KK ${item.no_kk}`);
                if (tglLahir) txtRows.push(`${tglLahir}`);
                // LINE 6: Lokasi spesifik (Wajib ada)
                const cleanLokasi = (item.lokasi || 'PASARJAYA').replace(/^PASARJAYA\s*-\s*/i, '');
                txtRows.push(cleanLokasi);
                txtRows.push('');
            });
        }
    }

    // === GENERATE SUMMARY PER PENGIRIM (RINCIAN LOKASI) ===
    txtRows.push('────────────────────────────────────');
    txtRows.push('📊 *RINGKASAN DATA MASUK:*');
    txtRows.push('');

    // Gabungkan semua data untuk perhitungan ringkasan
    const summaryMap = new Map<string, {
        name: string,
        total: number,
        locations: Map<string, number>
    }>();

    for (const row of (data as any[])) {
        const phone = row.sender_phone;
        if (!summaryMap.has(phone)) {
            summaryMap.set(phone, {
                name: getSenderName(phone),
                total: 0,
                locations: new Map<string, number>()
            });
        }
        const stats = summaryMap.get(phone)!;
        stats.total++;

        let locationName = '';
        if (row.lokasi && row.lokasi.startsWith('PASARJAYA')) {
            // Hilangkan prefix "PASARJAYA - "
            locationName = row.lokasi.replace(/^PASARJAYA\s*-\s*/i, '').trim();
            if (!locationName) locationName = 'PASARJAYA';
        } else {
            locationName = 'Dharmajaya Duri Kosambi';
        }

        const currentCount = stats.locations.get(locationName) || 0;
        stats.locations.set(locationName, currentCount + 1);
    }

    summaryMap.forEach((stats) => {
        txtRows.push(`👤 *${stats.name}* (${stats.total} data)`);

        // Urutkan lokasi agar Dharmajaya di atas jika ada? Atau alphabetical?
        // User example doesn't specify order, but let's keep it tidy.
        // Convert map to array and sort?
        const sortedLocs = Array.from(stats.locations.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        for (const [locName, count] of sortedLocs) {
            txtRows.push(`   • ${locName}: ${count}`);
        }
        txtRows.push('');
    });
    txtRows.push('✅ *Laporan selesai.*');

    const txtContent = txtRows.join('\n');
    const filenameBase = `Laporan_Data_${processingDayKey.split('-').reverse().join('')}`;

    return {
        txt: txtContent,
        filenameBase,
        count: data.length
    };
}
