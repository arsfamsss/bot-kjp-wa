import { PasarjayaStatusCheckResult } from './pasarjayaStatusCheck';
import { FoodStationStatusCheckResult } from './foodStationStatusCheck';

export function convertDateToDisplay(isoDate: string): string {
    const parts = isoDate.split('-');
    return parts.reverse().join('-');
}

function formatSourceDate(dateIso: string): string {
    const [year, month, day] = dateIso.split('-').map(Number);
    if (!year || !month || !day) {
        return dateIso;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}

export function buildPasarjayaStatusSummary(
    results: PasarjayaStatusCheckResult[],
    sourceDate: string,
): string {
    const successResults = results.filter((x) => x.state === 'BERHASIL');
    const failedResults = results.filter((x) => x.state === 'GAGAL');
    const errorResults = results.filter((x) => x.state === 'ERROR');
    const formattedDate = formatSourceDate(sourceDate);

    const lines: string[] = [
        `📋 *LAPORAN HASIL PENDAFTARAN PASARJAYA ${formattedDate}*`,
        '',
        `✅ *SUKSES: ${successResults.length} Data*`,
    ];

    if (successResults.length === 0) {
        lines.push('-');
    } else {
        successResults.forEach((entry, idx) => {
            const detail = entry.detail;
            lines.push(`${idx + 1}. ${entry.item.nama} — BERHASIL`);
            if (detail?.lokasi) {
                lines.push(`   📍 Lokasi: ${detail.lokasi}`);
            }
            if (detail?.tanggalPengambilan) {
                lines.push(`   📅 Tgl Pengambilan: ${detail.tanggalPengambilan}`);
            }
            if (detail?.nomorUrut) {
                lines.push(`   🔢 No Urut: ${detail.nomorUrut}`);
            }
        });
    }

    lines.push('', `❌ *GAGAL: ${failedResults.length} Data*`);
    if (failedResults.length === 0) {
        lines.push('-');
    } else {
        failedResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} — Belum terdaftar`);
        });
    }

    if (errorResults.length > 0) {
        lines.push('', `⚠️ *PERLU DI CEK ULANG: ${errorResults.length} Data*`);
        errorResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} — Sedang ada kendala, mohon ulangi dalam beberapa menit.`);
        });
    }

    return lines.join('\n');
}

export function buildPasarjayaFailedCopy(
    results: PasarjayaStatusCheckResult[],
): { header: string; body: string } | null {
    const failedResults = results.filter((x) => x.state === 'GAGAL');
    if (failedResults.length === 0) {
        return null;
    }

    const header = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        '📋 *DATA YANG BELUM BERHASIL*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '❌ Data berikut belum terdaftar.',
        'Silakan copy data di bawah, lalu',
        'kirim ulang ke chat ini untuk',
        'didaftarkan kembali.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        '💾 *Copy Data di Bawah Ini ⬇️*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');

    const body = failedResults
        .map((entry) => {
            const item = entry.item;
            const itemLines = [
                item.nama,
                `KJP ${item.no_kjp}`,
                `KTP ${item.no_ktp}`,
                `KK ${item.no_kk}`,
            ];
            if (item.tanggal_lahir) {
                itemLines.push(`Tanggal Lahir ${convertDateToDisplay(item.tanggal_lahir)}`);
            }
            return itemLines.join('\n');
        })
        .join('\n\n');

    return { header, body };
}

export function buildFoodStationStatusSummary(
    results: FoodStationStatusCheckResult[],
    sourceDate: string,
): string {
    const successResults = results.filter((x) => x.state === 'BERHASIL');
    const failedResults = results.filter((x) => x.state === 'GAGAL');
    const errorResults = results.filter((x) => x.state === 'ERROR');
    const formattedDate = formatSourceDate(sourceDate);

    const lines: string[] = [
        `📋 *LAPORAN HASIL PENDAFTARAN FOODSTATION ${formattedDate}*`,
        '',
        `✅ *SUKSES: ${successResults.length} Data*`,
    ];

    if (successResults.length === 0) {
        lines.push('-');
    } else {
        successResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} (${entry.item.no_kjp})`);
        });
    }

    lines.push('', `❌ *GAGAL: ${failedResults.length} Data*`);
    if (failedResults.length === 0) {
        lines.push('-');
    } else {
        failedResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} - Belum terdaftar`);
        });
    }

    if (errorResults.length > 0) {
        lines.push('', `⚠️ *PERLU DI CEK ULANG: ${errorResults.length} Data*`);
        errorResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} — Sedang ada kendala, mohon ulangi dalam beberapa menit.`);
        });
    }

    return lines.join('\n');
}

export function buildFoodStationFailedCopy(
    results: FoodStationStatusCheckResult[],
): { header: string; body: string } | null {
    const failedResults = results.filter((x) => x.state === 'GAGAL');
    if (failedResults.length === 0) {
        return null;
    }

    const header = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        '📋 *DATA YANG BELUM BERHASIL*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '❌ Data berikut belum terdaftar.',
        'Silakan copy data di bawah, lalu',
        'kirim ulang ke chat ini untuk',
        'didaftarkan kembali.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        '💾 *Copy Data di Bawah Ini ⬇️*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');

    const body = failedResults
        .map((entry) => {
            const item = entry.item;
            return `${item.nama}\nKJP ${item.no_kjp}\nKTP ${item.no_ktp}\nKK ${item.no_kk}`;
        })
        .join('\n\n');

    return { header, body };
}
