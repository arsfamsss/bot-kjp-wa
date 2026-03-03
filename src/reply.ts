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
                    ? item.lokasi.replace(/^(PASARJAYA|DHARMAJAYA)\s*-\s*/i, '').trim()
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
            const namaLabel = item.parsed.nama ? extractChildName(item.parsed.nama) : `Data ke-${item.index}`;
            lines.push('');
            lines.push(`❌ *${namaLabel}*`);

            if (item.status === 'SKIP_DUPLICATE') {
                lines.push(item.duplicate_info?.safe_message ?? '   → Sudah terdaftar hari ini');
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
                    } else if (err.type === 'blocked_kk') {
                        friendlyMsg = 'No KK terblokir. Silakan ganti data KK lain yang valid.';
                    } else if (err.type === 'blocked_location') {
                        const locationLabel = item.parsed.lokasi
                            ? item.parsed.lokasi.replace(/^(PASARJAYA|DHARMAJAYA)\s*-\s*/i, '').trim()
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

        // CONTOH FORMAT YANG BENAR:
        // HANYA TAMPILKAN JIKA:
        // 1. Ada error FORMAT (bukan cuma duplikat)
        // 2. ATAU ada Data tidak lengkap (remainder)
        const hasFormatError = log.items.some(i => i.status === 'SKIP_FORMAT');
        const showExample = hasFormatError || hasRemainder;

        if (showExample) {
            lines.push('');
            lines.push('━━━━━━━━━━━━━━━━━━━━');
            lines.push('💡 *Contoh yang bener:*');

            if (isPasarjaya) {
                lines.push('Siti Aminah');
                lines.push('KJP 5049488500001234');
                lines.push('KTP 3171234567890123');
                lines.push('KK 3171098765432109');
                lines.push('15-08-1975');
            } else {
                lines.push('Siti Aminah');
                lines.push('LANSIA 504948350000123');
                lines.push('KTP 3171234567890123');
                lines.push('KK 3171098765432109');
            }
            lines.push('━━━━━━━━━━━━━━━━━━━━');
        }
    }

    lines.push('');
    lines.push('');

    // Cek apakah ada duplikat dengan ORANG LAIN (pesan tidak mengandung 'Anda sendiri')
    const hasConflictWithOther = log.items.some(i =>
        i.status === 'SKIP_DUPLICATE' &&
        i.duplicate_info?.safe_message &&
        !i.duplicate_info.safe_message.includes('Anda sendiri')
    );

    if (hasConflictWithOther) {
        lines.push('Silahkan Hub Admin 📞 08568511113');
    } else {
        lines.push('Ketik *CEK* buat lihat data 👀');
    }

    return lines.join('\n');
}
