// src/reply.ts
import type { LogJson } from './types';
import { ValidItemDetail, extractChildName } from './recap'; // Need actual type, not just implicit/dummy interface

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
            `📥 *Data Baru Diterima: ${total} Orang*`
        ];

        if (log.items && log.items.length > 0) {
            log.items.forEach((item) => {
                if (item.status === 'OK') {
                    const jenis = item.parsed.jenis_kartu ? ` (${item.parsed.jenis_kartu})` : '';
                    const koreksiNote = item.parsed.jenis_kartu_sumber === 'koreksi'
                        ? ' ⚠️ _jenis disesuaikan otomatis_'
                        : '';
                    lines.push(`✅ *${extractChildName(item.parsed.nama)}*`);
                    lines.push(`     🆔 ${item.parsed.no_kjp}${jenis}${koreksiNote}`);
                }
            });

            const nameWarnings = log.items
                .filter((item) => item.status === 'OK')
                .flatMap((item) =>
                    item.errors
                        .filter((err) => err.field === 'nama' && err.type === 'duplicate')
                        .map((err) => `⚠️ ${extractChildName(item.parsed.nama)} → ${err.detail}`)
                );

            if (nameWarnings.length > 0) {
                lines.push('');
                lines.push('⚠️ *PERINGATAN CEK NAMA*');
                lines.push(...nameWarnings);
            }
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
                lines.push(`${idx + 1}. *${extractChildName(item.nama)}*`);
                const subLoc = item.lokasi
                    ? item.lokasi.replace(/^(PASARJAYA|DHARMAJAYA|FOOD STATION)\s*-\s*/i, '').trim()
                    : '';
                const jenisLabel = item.jenis_kartu ? ` (${item.jenis_kartu})` : '';
                lines.push(`   └ ${item.no_kjp}${jenisLabel}${subLoc ? ` 📍 ${subLoc}` : ''}`); // Tree style + lokasi + jenis
            });
        } else if (totalDataToday !== undefined && totalDataToday > 0) {
            lines.push(`🔥 Total: *${totalDataToday} Orang*`);
        }

        lines.push('');
        lines.push('👇 *MENU LAINNYA*'); // Diganti dari MENU BOT
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('🔹 Ketik *CEK*   → 🧐 Cek Rekap');
        lines.push('🔹 Ketik *BATAL* → 🔙 Batal Input');
        lines.push('🔹 Ketik *EDIT*  → ✏️ Ubah Data');
        lines.push('🔹 Ketik *HAPUS* → 🗑️ Hapus Data');
        lines.push('🔹 Ketik *MENU*  → 🏠 Menu Utama');
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
            lines.push(`   ${idx + 1}. ${extractChildName(item.parsed.nama)}`);
        });
    } else {
        lines.push(`❌ *Data belum bisa diproses*`);
    }

    if (failed > 0 || hasRemainder) {
        lines.push('');
        lines.push('📝 *Cek data ini ya:*');

        // 1. Tampilkan item yang gagal validasi (format/duplikat)
        const failedItems = log.items.filter((i) => i.status !== 'OK');
        failedItems.forEach((item) => {
            const namaLabel = item.parsed.nama ? extractChildName(item.parsed.nama) : `Data ke-${item.index}`;
            lines.push('');
            lines.push(`❌ *${namaLabel}*`);

            if (item.status === 'SKIP_DUPLICATE') {
                lines.push(item.duplicate_info?.safe_message ?? '   → Sudah terdaftar hari ini');
            } else if (item.status === 'SKIP_FORMAT') {
                item.errors.forEach((err) => {
                    let friendlyMsg = '';
                    if (err.field === 'no_kjp' && err.type === 'invalid_length') {
                        const length = item.parsed.no_kjp?.length || 0;
                        if (length < 16) {
                            friendlyMsg = `Kartu kurang ${16 - length} angka, minimal 16 angka.`;
                        } else if (length > 18) {
                            friendlyMsg = `Kartu lebih ${length - 18} angka, maksimal 18 angka.`;
                        } else {
                            friendlyMsg = 'Kartu harus 16-18 angka.';
                        }
                    } else if (err.field === 'no_ktp' && err.type === 'invalid_length') {
                        const length = item.parsed.no_ktp?.length || 0;
                        if (length < 16) {
                            friendlyMsg = `KTP kurang ${16 - length} angka, harus 16 angka.`;
                        } else if (length > 16) {
                            friendlyMsg = `KTP lebih ${length - 16} angka, harus 16 angka.`;
                        } else {
                            friendlyMsg = 'KTP harus 16 angka.';
                        }
                    } else if (err.field === 'no_kk' && err.type === 'invalid_length') {
                        const length = item.parsed.no_kk?.length || 0;
                        if (length < 16) {
                            friendlyMsg = `KK kurang ${16 - length} angka, harus 16 angka.`;
                        } else if (length > 16) {
                            friendlyMsg = `KK lebih ${length - 16} angka, harus 16 angka.`;
                        } else {
                            friendlyMsg = 'KK harus 16 angka.';
                        }
                    } else if (err.type === 'required') {
                        const fieldName = err.field === 'nama' ? 'Nama' : err.field === 'no_kjp' ? 'Kartu' : err.field === 'no_ktp' ? 'KTP' : 'KK';
                        friendlyMsg = `${fieldName} kosong`;
                    } else if (err.type === 'wrong_order') {
                        friendlyMsg = 'Urutan salah';
                    } else if (err.type === 'same_as_other') {
                        friendlyMsg = 'Nomor ada yang sama';
                    } else if (err.type === 'blocked_kk') {
                        friendlyMsg = 'No KK terblokir. Silakan ganti data KK lain yang valid.';
                    } else if (err.type === 'blocked_kjp') {
                        friendlyMsg = 'No KJP terblokir. Silakan ganti data KJP lain yang valid.';
                    } else if (err.type === 'ktp_blocked') {
                        friendlyMsg = err.detail;
                    } else if (err.type === 'blocked_location') {
                        const locationLabel = item.parsed.lokasi
                            ? item.parsed.lokasi.replace(/^(PASARJAYA|DHARMAJAYA|FOOD STATION)\s*-\s*/i, '').trim()
                            : '';
                        if (isPasarjaya) {
                            friendlyMsg = locationLabel
                                ? `Data belum bisa diproses karena lokasi *${locationLabel}* sedang penuh. Silakan pilih lokasi lain lalu kirim ulang data yang sama.`
                                : 'Data belum bisa diproses karena lokasi Pasarjaya sedang penuh. Silakan pilih lokasi lain lalu kirim ulang data yang sama.';
                        } else {
                            friendlyMsg = locationLabel
                                ? `Data belum bisa diproses karena lokasi *${locationLabel}* sedang penuh. Silakan pilih lokasi lain lalu kirim ulang data yang sama.`
                                : 'Data belum bisa diproses karena lokasi Dharmajaya sedang penuh. Silakan pilih lokasi lain lalu kirim ulang data yang sama.';
                        }
                    } else if (err.type === 'unknown_card_type') {
                        friendlyMsg = err.detail;
                    } else if (err.type === 'duplicate_in_message') {
                        friendlyMsg = err.detail;
                    } else {
                        friendlyMsg = err.detail;
                    }

                    const detailLines = (friendlyMsg || '').split('\n').map((s) => s.trim()).filter(Boolean);
                    if (detailLines.length === 0) {
                        lines.push('   → Data tidak valid');
                    } else {
                        lines.push(`   → ${detailLines[0]}`);
                        for (let i = 1; i < detailLines.length; i++) {
                            lines.push(`     ${detailLines[i]}`);
                        }
                    }
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

    }

    lines.push('');
    lines.push('');

    // Cek apakah ada duplikat dengan ORANG LAIN (pesan mengandung 'nomor WA lain')
    const hasConflictWithOther = log.items.some(i =>
        i.status === 'SKIP_DUPLICATE' &&
        i.duplicate_info?.safe_message &&
        i.duplicate_info.safe_message.includes('nomor WA lain')
    );

    if (hasConflictWithOther) {
        lines.push('Silakan hubungi Admin 📞 08568511113');
    }
    lines.push('Ketik CEK untuk lihat data 👀');

    return lines.join('\n');
}
