// src/services/csvContactsSync.ts
// Membaca data_no_kjp.csv dari folder PERSIAPAN HARIAN KJP,
// mengupdate in-memory contactsMap di contacts_data.ts secara langsung.
// Tidak perlu restart bot — aktif langsung saat CSV berubah.

import * as fs from 'fs';
import * as path from 'path';
import { updateContactsMap, getContactsCount } from '../contacts_data';

const CSV_PATH = path.resolve('D:/BOT/PERSIAPAN HARIAN KJP/data_no_kjp.csv');

// Interval polling watchFile (ms) — cek setiap 60 detik
const POLL_INTERVAL_MS = 60_000;

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Normalisasi nomor HP ke format 628xxx
 */
function normalizePhone(raw: string): string {
    let phone = raw.trim().replace(/\D/g, ''); // hapus non-digit
    if (phone.startsWith('0')) phone = '62' + phone.slice(1);
    if (phone.startsWith('+62')) phone = phone.slice(1);
    return phone;
}

/**
 * Extract nama orang tua dari format "NamaOrangTua (NamaAnak)"
 * Kalau tidak ada kurung, pakai nama langsung.
 */
function extractParentName(nama: string): string {
    const idx = nama.indexOf('(');
    return idx > 0 ? nama.slice(0, idx).trim() : nama.trim();
}

/**
 * Parse CSV → Map<phone, namaOrangTua>
 * Satu phone bisa muncul banyak kali (banyak anak) — ambil nama pertama yang valid.
 */
function parseCsv(filePath: string): Map<string, string> {
    const result = new Map<string, string>();

    if (!fs.existsSync(filePath)) {
        console.warn(`[csvContactsSync] ⚠️  File CSV tidak ditemukan: ${filePath}`);
        return result;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split(/\r?\n/);

    let isFirstLine = true;
    for (const line of lines) {
        if (!line.trim()) continue;

        // Skip header
        if (isFirstLine) {
            isFirstLine = false;
            if (line.toLowerCase().startsWith('nama')) continue;
        }

        const parts = line.split(',');
        if (parts.length < 2) continue;

        const namaRaw = parts[0]?.trim();
        const noHpRaw = parts[1]?.trim();
        if (!namaRaw || !noHpRaw) continue;

        const phone = normalizePhone(noHpRaw);
        if (!phone || phone.length < 9) continue;

        // Sudah ada phone ini → skip (ambil yang pertama saja)
        if (result.has(phone)) continue;

        const parentName = extractParentName(namaRaw);
        if (!parentName) continue;

        result.set(phone, parentName);
    }

    return result;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

let lastMtime = 0;

function syncNow(reason: string): void {
    try {
        const parsed = parseCsv(CSV_PATH);
        if (parsed.size === 0) {
            console.warn(`[csvContactsSync] ⚠️  CSV kosong atau tidak bisa dibaca — contacts tidak diubah`);
            return;
        }

        updateContactsMap(parsed);
        console.log(`[csvContactsSync] ✅ ${reason} — ${getContactsCount()} kontak di-load dari CSV`);
    } catch (err) {
        console.error(`[csvContactsSync] ❌ Error saat sync:`, err);
    }
}

// ─── Watcher ──────────────────────────────────────────────────────────────────

function startWatcher(): void {
    if (!fs.existsSync(CSV_PATH)) {
        console.warn(`[csvContactsSync] ⚠️  CSV tidak ditemukan, watcher tidak dijalankan: ${CSV_PATH}`);
        return;
    }

    fs.watchFile(CSV_PATH, { interval: POLL_INTERVAL_MS }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs) {
            console.log(`[csvContactsSync] 📄 CSV berubah (mtime: ${new Date(curr.mtimeMs).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}), sync ulang...`);
            syncNow('CSV berubah');
        }
    });

    console.log(`[csvContactsSync] 👀 Watching: ${CSV_PATH} (poll setiap ${POLL_INTERVAL_MS / 1000}s)`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Dipanggil sekali saat bot startup (dari index.ts).
 * 1. Sync langsung dari CSV
 * 2. Aktifkan watcher — update otomatis saat CSV berubah
 */
export function startCsvContactsSync(): void {
    console.log(`[csvContactsSync] 🚀 Init — sumber: ${CSV_PATH}`);
    syncNow('Startup');
    startWatcher();
}
