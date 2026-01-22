// src/reply.ts
import type { LogJson } from './types';

/**
 * Membangun pesan balasan untuk data pendaftaran baru
 * @param log - Data log dari proses parsing
 * @param totalDataToday - Total data valid yang sudah dikirim user hari ini (termasuk data baru)
 */
export function buildReplyForNewData(log: LogJson, totalDataToday?: number): string {
    const stats = log.stats;
    const total = stats.total_blocks;
    const success = stats.ok_count;
    const failed = total - success;

    // --- KASUS 1: SEMUA DATA SUKSES ---
    const hasRemainder = log.failed_remainder_lines && log.failed_remainder_lines.length > 0;

    if (failed === 0 && !hasRemainder) {
        const lines = [
            '✅ *DATA PENDAFTARAN DITERIMA*',
            '',
            `🎯 Diterima: *${total} orang*`,
        ];

        // Tampilkan total data hari ini jika tersedia
        if (totalDataToday !== undefined && totalDataToday > 0) {
            lines.push(`📊 Total Data Anda hari ini: *${totalDataToday} orang*`);
        }

        lines.push('');
        lines.push('Terima kasih 🙏');
        lines.push('Data pendaftaran Anda telah kami terima dan dicatat.');
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('⚠️ *PERHATIAN*');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('• Pastikan data sudah *BENAR* dan *URUT*');
        lines.push('• Kesalahan data dapat menyebabkan penolakan saat pengambilan');
        lines.push('• Kami tidak bertanggung jawab atas kesalahan input');
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('📋 *MENU LANJUTAN*');
        lines.push('━━━━━━━━━━━━━━━━━━━━━━');
        lines.push('💡 Ketik *CEK* → Lihat detail data Anda');
        lines.push('💡 Ketik *BATAL* → Batalkan (dalam 30 menit)');
        lines.push('💡 Ketik *HAPUS* → Hapus data tertentu');
        lines.push('💡 Atau langsung kirim data baru');

        return lines.join('\n');
    }

    // --- KASUS 2: ADA YANG GAGAL (Partial / Total gagal) ---
    const lines: string[] = [];

    if (success > 0) {
        lines.push(`⚠️ *DATA DICATAT SEBAGIAN*`);
        lines.push('');
        lines.push(`✅ Berhasil dicatat: *${success} orang*`);
        const failCount = failed + (hasRemainder ? 1 : 0);
        lines.push(`❌ Perlu diperbaiki: *${failCount} item*`);

        // Tampilkan total data hari ini jika tersedia
        if (totalDataToday !== undefined && totalDataToday > 0) {
            lines.push(`📊 Total data Anda hari ini: *${totalDataToday} orang*`);
        }

        lines.push('');
        lines.push('👇 *YANG BERHASIL DICATAT:*');
        const okItems = log.items.filter((i) => i.status === 'OK');
        okItems.forEach((item, idx) => {
            lines.push(`   ${idx + 1}. ${item.parsed.nama}`);
        });
    } else {
        lines.push(`❌ *MAAF, DATA BELUM BISA DIPROSES*`);
        lines.push('');
        lines.push('Mohon kirim ulang dengan format yang benar ya Bu/Pak 🙏');
    }

    if (failed > 0 || hasRemainder) {
        lines.push('');
        lines.push('📝 *YANG PERLU DIPERBAIKI:*');

        // 1. Tampilkan item yang gagal validasi (format/duplikat)
        const failedItems = log.items.filter((i) => i.status !== 'OK');
        failedItems.forEach((item) => {
            lines.push('┌─────────────────────────────');
            const namaLabel = item.parsed.nama ? item.parsed.nama : `Data ke-${item.index}`;
            lines.push(`│ 👤 *${namaLabel}*`);

            if (item.status === 'SKIP_DUPLICATE') {
                const msg = item.duplicate_info?.safe_message ?? 'Sudah pernah didaftarkan hari ini.';
                lines.push(`│ ⚠️ ${msg}`);

                // Tampilkan data asli yang menyebabkan duplikat
                const orig = item.duplicate_info?.original_data;
                if (orig) {
                    lines.push('│');
                    lines.push('│ 📋 Data yang sudah terdaftar:');
                    lines.push(`│    • Nama  : ${orig.nama}`);
                    lines.push(`│    • Kartu : ${orig.no_kjp}`);
                    lines.push(`│    • KTP   : ${orig.no_ktp}`);
                    lines.push(`│    • KK    : ${orig.no_kk}`);
                }
            } else if (item.status === 'SKIP_FORMAT') {
                item.errors.forEach((err) => {
                    // Simplify error messages
                    let friendlyMsg = err.detail;
                    if (err.field === 'no_kjp' && err.type === 'invalid_length') {
                        friendlyMsg = `No Kartu harus 16-18 digit (saat ini ${item.parsed.no_kjp?.length || 0} digit)`;
                    } else if (err.field === 'no_ktp' && err.type === 'invalid_length') {
                        friendlyMsg = `No KTP harus 16 digit (saat ini ${item.parsed.no_ktp?.length || 0} digit)`;
                    } else if (err.field === 'no_kk' && err.type === 'invalid_length') {
                        friendlyMsg = `No KK harus 16 digit (saat ini ${item.parsed.no_kk?.length || 0} digit)`;
                    } else if (err.type === 'required') {
                        friendlyMsg = `${err.field === 'nama' ? 'Nama' : err.field === 'no_kjp' ? 'No Kartu' : err.field === 'no_ktp' ? 'No KTP' : 'No KK'} kosong atau tidak terbaca`;
                    } else if (err.type === 'wrong_order') {
                        friendlyMsg = 'Urutan salah! Kirim ulang dengan urutan:\n│    1. Nama\n│    2. No Kartu (16-18 digit)\n│    3. No KTP (16 digit)\n│    4. No KK (16 digit)';
                    }
                    lines.push(`│ ⚠️ ${friendlyMsg}`);
                });

                // Untuk error same_as_other, tampilkan data yang dikirim user
                const hasSameAsOther = item.errors.some(e => e.type === 'same_as_other');
                if (hasSameAsOther) {
                    lines.push('│');
                    lines.push('│ 📋 Data yang Anda kirim:');
                    lines.push(`│    • Nama  : ${item.parsed.nama || '-'}`);
                    lines.push(`│    • Kartu : ${item.parsed.no_kjp || '-'}`);
                    lines.push(`│    • KTP   : ${item.parsed.no_ktp || '-'}${item.parsed.no_kjp === item.parsed.no_ktp ? ' ⛔ SAMA!' : ''}`);
                    lines.push(`│    • KK    : ${item.parsed.no_kk || '-'}${(item.parsed.no_kjp === item.parsed.no_kk || item.parsed.no_ktp === item.parsed.no_kk) ? ' ⛔ SAMA!' : ''}`);
                }
            }
            lines.push('└─────────────────────────────');
        });

        // 2. Tampilkan sisa baris (Remainder)
        if (hasRemainder && log.failed_remainder_lines) {
            lines.push('┌─────────────────────────────');
            lines.push(`│ 👤 *Data tidak lengkap*`);
            lines.push(`│ ⚠️ Baris tidak cukup 4 (tiap orang = 4 baris)`);
            lines.push('│');
            lines.push('│ _Coba kirim ulang text ini:_');
            lines.push('│');
            log.failed_remainder_lines.forEach(line => {
                lines.push(`│ ${line}`);
            });
            lines.push('└─────────────────────────────');
        }

        // Contoh format yang benar
        lines.push('');
        lines.push('💡 *CONTOH FORMAT YANG BENAR:*');
        lines.push('');
        lines.push('Budi');
        lines.push('5049488500001111');
        lines.push('3173444455556666');
        lines.push('3173555566667777');
    }

    lines.push('');
    lines.push('💡 _Ketik *CEK* untuk melihat data Anda._');

    return lines.join('\n');
}
