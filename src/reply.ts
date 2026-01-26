// src/reply.ts
import type { LogJson } from './types';
import { ValidItemDetail } from './recap'; // Need actual type, not just implicit/dummy interface

/**
 * Membangun pesan balasan untuk data pendaftaran baru
 * @param log - Data log dari proses parsing
 * @param totalDataToday - Total data valid yang sudah dikirim user hari ini (termasuk data baru)
 * @param locationContext - Konteks lokasi ('PASARJAYA' atau 'DHARMAJAYA')
 */
export function buildReplyForNewData(
    log: LogJson,
    totalDataToday?: number,
    locationContext?: string,
    allDataTodayItems?: ValidItemDetail[]
): string {
    const isPasarjaya = locationContext === 'PASARJAYA';
    const stats = log.stats;
    const total = stats.total_blocks;
    const success = stats.ok_count;
    const failed = total - success;

    // --- KASUS 1: SEMUA DATA SUKSES ---
    const hasRemainder = log.failed_remainder_lines && log.failed_remainder_lines.length > 0;

    if (failed === 0 && !hasRemainder) {
        const lines = [
            '✨ *DATA BERHASIL DISIMPAN!* ✨',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━', // Separator panjang
            `📥 *Data Baru Diterima: ${total} Ord*`
        ];

        if (log.items && log.items.length > 0) {
            log.items.forEach((item) => {
                if (item.status === 'OK') {
                    // Request format: "🟢 Siti Aminah (5049...)" -> Tambah bullet/emoji
                    lines.push(`✅ *${item.parsed.nama}*`);
                    lines.push(`     🆔 ${item.parsed.no_kjp}`); // Indent card
                }
            });
        }

        lines.push('');
        lines.push('📈 *UPDATE TOTAL HARI INI*');

        // Tampilkan total data hari ini jika tersedia
        if (allDataTodayItems && allDataTodayItems.length > 0) {
            const count = allDataTodayItems.length;
            lines.push(`🔥 Total: *${count} Orang*`);
            lines.push('────────────────────────────'); // Separator tipis

            allDataTodayItems.forEach((item, idx) => {
                // Request format: "1. Siti Aminah (5049...)"
                // Bikin bold namanya biar jelas
                lines.push(`${idx + 1}. *${item.nama}*`);
                lines.push(`   └ ${item.no_kjp}`); // Tree style structure
            });
        } else if (totalDataToday !== undefined && totalDataToday > 0) {
            lines.push(`🔥 Total: *${totalDataToday} Orang*`);
        }

        lines.push('');
        lines.push('👇 *MENU LAINNYA*'); // Diganti dari MENU BOT
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('1️⃣ Ketik *CEK*   → 🧐 Cek Rekap');
        lines.push('2️⃣ Ketik *BATAL* → 🔙 Batal Input');
        lines.push('3️⃣ Ketik *HAPUS* → 🗑️ Hapus Data');
        lines.push('');
        lines.push('_Silakan kirim data lagi jika ada..._ 📝');

        return lines.join('\n');
    }

    // --- KASUS 2: ADA YANG GAGAL (Partial / Total gagal) ---
    const lines: string[] = [];

    if (success > 0) {
        lines.push(`⚠️ *Ada yang perlu diperbaiki nih~*`);
        lines.push('');
        lines.push(`✅ Masuk: *${success} orang*`);
        const failCount = failed + (hasRemainder ? 1 : 0);
        lines.push(`❌ Perlu cek: *${failCount} data*`);

        // Tampilkan total data hari ini jika tersedia
        if (totalDataToday !== undefined && totalDataToday > 0) {
            lines.push(`📊 Total hari ini: *${totalDataToday} orang*`);
        }

        lines.push('');
        lines.push('👇 *Yang sudah masuk:*');
        const okItems = log.items.filter((i) => i.status === 'OK');
        okItems.forEach((item, idx) => {
            lines.push(`   ${idx + 1}. ${item.parsed.nama}`);
        });
    } else {
        lines.push(`❌ *Waduh, data belum bisa masuk~*`);
        lines.push('');
        lines.push('Coba kirim ulang ya Bu/Pak 🙏');
    }

    if (failed > 0 || hasRemainder) {
        lines.push('');
        lines.push('📝 *Cek data ini ya:*');

        // 1. Tampilkan item yang gagal validasi (format/duplikat)
        const failedItems = log.items.filter((i) => i.status !== 'OK');
        failedItems.forEach((item) => {
            const namaLabel = item.parsed.nama ? item.parsed.nama : `Data ke-${item.index}`;
            lines.push('');
            lines.push(`❌ *${namaLabel}*`);

            if (item.status === 'SKIP_DUPLICATE') {
                lines.push(`   → Sudah terdaftar hari ini`);
            } else if (item.status === 'SKIP_FORMAT') {
                item.errors.forEach((err) => {
                    let friendlyMsg = '';
                    if (err.field === 'no_kjp' && err.type === 'invalid_length') {
                        friendlyMsg = `Kartu ${item.parsed.no_kjp?.length || 0} digit (harus 16-18)`;
                    } else if (err.field === 'no_ktp' && err.type === 'invalid_length') {
                        friendlyMsg = `KTP ${item.parsed.no_ktp?.length || 0} digit (harus 16)`;
                    } else if (err.field === 'no_kk' && err.type === 'invalid_length') {
                        friendlyMsg = `KK ${item.parsed.no_kk?.length || 0} digit (harus 16)`;
                    } else if (err.type === 'required') {
                        const fieldName = err.field === 'nama' ? 'Nama' : err.field === 'no_kjp' ? 'Kartu' : err.field === 'no_ktp' ? 'KTP' : 'KK';
                        friendlyMsg = `${fieldName} kosong`;
                    } else if (err.type === 'wrong_order') {
                        friendlyMsg = 'Urutan salah';
                    } else if (err.type === 'same_as_other') {
                        friendlyMsg = 'Nomor ada yang sama';
                    } else {
                        friendlyMsg = err.detail;
                    }
                    lines.push(`   → ${friendlyMsg}`);
                });
            }
        });

        // 2. Tampilkan sisa baris (Remainder)
        if (hasRemainder && log.failed_remainder_lines) {
            const expectedLines = isPasarjaya ? 5 : 4;
            lines.push('');
            lines.push(`❌ *Data tidak lengkap*`);
            lines.push(`   → Kurang baris (harus ${expectedLines} baris/orang)`);
        }

        // Contoh format yang benar - sesuai lokasi (lebih simpel)
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━━━');
        lines.push('💡 *Contoh yang bener:*');

        if (isPasarjaya) {
            lines.push('Siti Aminah');
            lines.push('5049488500001234');
            lines.push('3171234567890123');
            lines.push('3171098765432109');
            lines.push('15-08-1975');
        } else {
            lines.push('Siti Aminah');
            lines.push('5049488500001234');
            lines.push('3171234567890123');
            lines.push('3171098765432109');
        }
        lines.push('━━━━━━━━━━━━━━━━━━━━');
    }

    lines.push('');
    lines.push('Ketik *CEK* buat lihat data 👀');

    return lines.join('\n');
}
