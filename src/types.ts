// src/types.ts

export type ItemStatus = "OK" | "SKIP_FORMAT" | "SKIP_DUPLICATE";

export interface ParsedFields {
    nama: string;
    no_kjp: string;
    no_ktp: string;
    no_kk: string;
    tanggal_lahir?: string | null; // Format YYYY-MM-DD
    lokasi?: string; // Full location string: "PASARJAYA - Jakgrosir Kedoya" or "DHARMAJAYA"
}

export interface ItemError {
    field: "nama" | "no_kjp" | "no_ktp" | "no_kk" | "tanggal_lahir";
    type:
    | "required"
    | "invalid_length"
    | "invalid_prefix"
    | "duplicate"
    | "duplicate_in_message"
    | "blocked_kk"
    | "same_as_other"
    | "wrong_order";
    detail: string;
}

export type DuplicateKind = "NAME" | "NO_KJP" | "NO_KTP" | "NO_KK_OTHER";

/**
 * Informasi duplikat aman untuk customer (tidak mengandung nama/no WA orang lain).
 */
export interface DuplicateInfo {
    kind: DuplicateKind;
    processing_day_key: string; // YYYY-MM-DD
    safe_message: string;
    first_seen_at?: string | null; // ISO timestamptz (UTC)
    first_seen_wib_time?: string | null; // 'HH.mm'
    // Data asli yang menyebabkan duplikat (untuk ditampilkan ke user)
    original_data?: {
        nama: string;
        no_kjp: string;
        no_ktp: string;
        no_kk: string;
    } | null;
}

export interface LogItem {
    index: number; // urutan blok di pesan
    raw_lines: string[]; // 4 baris mentah
    parsed: ParsedFields;
    status: ItemStatus;
    errors: ItemError[];
    duplicate_info: DuplicateInfo | null;
}

export interface LogStats {
    total_blocks: number;
    ok_count: number;
    skip_format_count: number;
    skip_duplicate_count: number;
}

export interface LogJson {
    message_id: string | null; // wa_message_id, bisa null
    sender_phone: string;
    sender_name?: string; // Nama pengirim WA (pushName/contactName)
    received_at: string; // ISO string (UTC)
    tanggal: string; // YYYY-MM-DD (kalender WIB)
    processing_day_key: string; // YYYY-MM-DD (periode operasional 06:01–05:30 WIB)
    stats: LogStats;
    items: LogItem[];
    failed_remainder_lines?: string[]; // Sisa baris yang tidak lengkap/gagal
    lokasi?: string; // Untuk menyimpan context lokasi di level log
}
