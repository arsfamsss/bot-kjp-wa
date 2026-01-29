// src/state.ts
// State Manager: Menyimpan semua state yang perlu dibagikan antar handler

// --- TYPE DEFINITIONS ---

// State alur menu user
export type UserFlowState = 'NONE' | 'CHECK_DATA_MENU' | 'CHECK_DATA_SPECIFIC_DATE' | 'DELETE_DATA' | 'SELECT_LOCATION' | 'SELECT_PASARJAYA_SUB' | 'INPUT_MANUAL_LOCATION';

// State alur menu admin
export type AdminFlowState =
    | 'NONE'
    | 'MENU'
    | 'ASK_DATE'
    | 'ASK_RANGE'
    | 'RESET_CONFIRM'
    | 'ADD_CONTACT'
    | 'CHECK_CONTACT'
    | 'EDIT_CONTACT'
    | 'DELETE_CONTACT'
    | 'BROADCAST_SELECT'
    | 'BROADCAST_MSG'
    | 'BROADCAST_PREVIEW'
    | 'BROADCAST_SCHEDULE'
    | 'SEARCH_DATA'
    | 'CHECK_DATA_PERIOD'
    | 'ADMIN_DELETE_SELECT_USER'
    | 'ADMIN_DELETE_USER_DATA'
    | 'EXPORT_SELECT_DATE'
    | 'EXPORT_CUSTOM_DATE'
    | 'SETTING_CLOSE_TIME'
    | 'SETTING_CLOSE_TIME_MENU'
    | 'SETTING_CLOSE_TIME_START'
    | 'SETTING_CLOSE_TIME_END'
    | 'SETTING_CLOSE_MSG'
    | 'SETTING_CLOSE_MSG_MENU';

// Draft broadcast untuk penjadwalan/preview
export type BroadcastDraft = {
    targets: string[];      // List nomor tujuan
    message: string;        // Isi pesan
    isPendingNumbers?: boolean; // Flag jika sedang menunggu input nomor manual
};

// --- STATE MAPS (Singleton) ---

// State per pengirim untuk alur menu User
export const userFlowByPhone = new Map<string, UserFlowState>();

// Pilihan lokasi user (Pasarjaya vs Dharmajaya)
export const userLocationChoice = new Map<string, 'PASARJAYA' | 'DHARMAJAYA'>();

// State per pengirim untuk alur menu Admin
export const adminFlowByPhone = new Map<string, AdminFlowState>();

// Set nomor HP yang sedang dalam proses hapus data (legacy) - akan dihapus
export const pendingDelete = new Set<string>();

// Draft broadcast per admin
export const broadcastDraftMap = new Map<string, BroadcastDraft>();

// Cache snapshot kontak saat admin membuka menu hapus (mencegah race condition)
export const adminContactCache = new Map<string, { phone_number: string; push_name: string | null }[]>();

// Cache user list untuk admin delete data harian
export const adminUserListCache = new Map<string, { phone: string; name: string; count: number }[]>();

// Simpan data pendaftaran sementara sebelum pilih lokasi
export const pendingRegistrationData = new Map<string, string>();
