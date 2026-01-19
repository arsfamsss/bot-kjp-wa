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
};

const MAX_DETAIL_ITEMS = 50;

export type TodayRecapResult = {
  validCount: number;
  validItems: ValidItemDetail[];
  totalInvalid: number;
  detailItems: TodayInvalidItem[];
};

// --- BAGIAN 1: REKAP PRIBADI (BERDASARKAN processing_day_key) ---
export async function getTodayRecapForSender(
  senderPhone: string,
  processingDayKey: string
): Promise<TodayRecapResult> {
  // 1. Ambil data VALID (semua detail)
  const { data: validData, count: validCount, error: countError } = await supabase
    .from('data_harian')
    .select('nama, no_kjp, no_ktp, no_kk', { count: 'exact' })
    .eq('sender_phone', senderPhone)
    .eq('processing_day_key', processingDayKey)
    .order('received_at', { ascending: true });

  if (countError) throw countError;

  const validItems: ValidItemDetail[] = validData ? (validData as any[]).map(d => ({
    nama: d.nama,
    no_kjp: d.no_kjp,
    no_ktp: d.no_ktp,
    no_kk: d.no_kk
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
  lines.push(`🔎 *STATUS DATA HARI INI*`);
  lines.push(`📅 Periode: ${displayDate} (06.01–04.00 WIB)`);
  lines.push('');
  lines.push(`✅ *Data Terdaftar: ${validCount} Orang*`);

  if (validItems.length > 0) {
    validItems.forEach((item, i) => {
      lines.push(`   ${i + 1}. ${item.nama}`);
      lines.push(`      No Kartu ${item.no_kjp}`);
      lines.push(`      No Ktp ${item.no_ktp}`);
      lines.push(`      No Kk  ${item.no_kk}`);
    });
  }

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
      lines.push(`- ${item.nama} → ${item.reason}`);
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
    lines.push('');

    items.forEach((item, i) => {
      const itemKey = endKey ? ` (${String(item.processing_day_key).split('-').reverse().join('-')})` : '';
      lines.push(`${i + 1}. ${item.nama}${itemKey}`);
      lines.push(`   KJP ${item.no_kjp}`);
      lines.push(`   KTP ${item.no_ktp}`);
      lines.push(`   KK  ${item.no_kk}`);
      lines.push('');
    });
  });

  lines.push(`_Akhir laporan (${data.length} data)_`);
  return lines.join('\n');
}

// --- GENERATE EXPORT DATA (CSV & TXT) ---
export async function generateExportData(
  processingDayKey: string,
  nameLookup?: (phone: string) => string | undefined
): Promise<{ csv: string; txt: string; filenameBase: string; count: number } | null> {
  // Ambil data hari ini
  const { data, error } = await supabase
    .from('data_harian')
    .select('*')
    .eq('processing_day_key', processingDayKey)
    .order('received_at', { ascending: true }); // Urutkan dari pagi ke sore

  if (error || !data || data.length === 0) {
    return null;
  }

  // --- 1. Generate CSV ---
  // Header CSV
  const csvRows = ['No,Nama,No Kartu (KJP),NIK (KTP),No KK,Pengirim WA,Nama Pengirim,Waktu Input'];
  
  // Isi CSV
  data.forEach((row: any, index: number) => {
    const senderName = nameLookup ? (nameLookup(row.sender_phone) || '') : '';
    const timeStr = new Date(row.received_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    
    // Escape koma dengan tanda kutip jika ada
    const safeNama = `"${(row.nama || '').replace(/"/g, '""')}"`;
    const safeKjp = `"'${row.no_kjp || ''}"`; // Tambah kutip satu biar Excel baca sebagai teks (tidak jadi ilmiah E+)
    const safeKtp = `"'${row.no_ktp || ''}"`;
    const safeKk = `"'${row.no_kk || ''}"`;
    
    csvRows.push(`${index + 1},${safeNama},${safeKjp},${safeKtp},${safeKk},${row.sender_phone},"${senderName}",${timeStr}`);
  });
  
  const csvContent = csvRows.join('\n');

  // --- 2. Generate TXT (Format Laporan Sederhana) ---
  const txtRows = [
    `DATA PENDAFTARAN SEMBAKO - ${processingDayKey.split('-').reverse().join('-')}`,
    `Total Data: ${data.length}`,
    '==================================================',
    ''
  ];

  data.forEach((row: any, index: number) => {
    const senderName = nameLookup ? (nameLookup(row.sender_phone) || '') : '';
    const senderLabel = senderName ? `${senderName} (${row.sender_phone})` : row.sender_phone;
    
    txtRows.push(`Data ke-${index + 1}`);
    txtRows.push(`Nama    : ${row.nama}`);
    txtRows.push(`No Kartu: ${row.no_kjp}`);
    txtRows.push(`NIK     : ${row.no_ktp}`);
    txtRows.push(`No KK   : ${row.no_kk}`);
    txtRows.push(`Pengirim: ${senderLabel}`);
    txtRows.push('--------------------------------------------------');
  });

  const txtContent = txtRows.join('\n');
  const filenameBase = `Data_Sembako_${processingDayKey.split('-').reverse().join('')}`;

  return {
    csv: csvContent,
    txt: txtContent,
    filenameBase,
    count: data.length
  };
}
