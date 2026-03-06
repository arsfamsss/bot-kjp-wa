const STATUS_API_URL = process.env.DHARMAJAYA_STATUS_API_URL || 'https://antreanpangsub.dharmajaya.co.id/api/v1/queues/get';
const STATUS_PAGE_URL = process.env.DHARMAJAYA_STATUS_PAGE_URL || 'https://antreanpangsub.dharmajaya.co.id/queue-status';
const STATUS_ORIGIN = process.env.DHARMAJAYA_STATUS_ORIGIN || 'https://antreanpangsub.dharmajaya.co.id';

function toPositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.floor(value);
}

const REQUEST_TIMEOUT_MS = toPositiveInt(process.env.DHARMAJAYA_API_TIMEOUT_MS, 15000);
const RETRY_LIMIT = toPositiveInt(process.env.DHARMAJAYA_RETRY_LIMIT, 3);
const RETRY_DELAY_MS = toPositiveInt(process.env.DHARMAJAYA_RETRY_DELAY_MS, 1200);
const REQUEST_GAP_MS = toPositiveInt(process.env.DHARMAJAYA_REQUEST_GAP_MS, 350);

function formatLongIndonesianDate(dateIso: string): string {
    const [year, month, day] = dateIso.split('-').map(Number);
    if (!year || !month || !day) {
        return dateIso;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}

export interface StatusCheckItem {
    nama: string;
    no_kjp: string;
    no_ktp: string;
    no_kk: string;
    jenis_kartu?: string | null;
}

export type StatusState = 'BERHASIL' | 'GAGAL' | 'ERROR';

export interface StatusCheckResult {
    item: StatusCheckItem;
    state: StatusState;
    reason?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeProgramLabel(jenisKartu?: string | null): string {
    const value = String(jenisKartu || 'KJP').trim().toUpperCase();
    return value || 'KJP';
}

async function checkSingle(noKjp: string, dateIso: string): Promise<{ state: StatusState; reason?: string }> {
    let lastError = 'unknown_error';

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            const response = await fetch(STATUS_API_URL, {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json',
                    'Origin': STATUS_ORIGIN,
                    'Referer': STATUS_PAGE_URL,
                },
                body: JSON.stringify({
                    no_kjp: noKjp,
                    date: dateIso,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.status === 200) {
                const data = (await response.json()) as {
                    data?: {
                        queues?: unknown;
                    };
                };
                const queues = data?.data?.queues;
                if (Array.isArray(queues) && queues.length > 0) {
                    return { state: 'BERHASIL' };
                }
                return { state: 'GAGAL', reason: 'not_found' };
            }

            lastError = `http_${response.status}`;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'request_failed';
            lastError = errorMessage;
        }

        if (attempt < RETRY_LIMIT) {
            await sleep(RETRY_DELAY_MS);
        }
    }

    return { state: 'ERROR', reason: lastError };
}

export async function checkRegistrationStatuses(items: StatusCheckItem[], dateIso: string): Promise<StatusCheckResult[]> {
    const results: StatusCheckResult[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const checked = await checkSingle(item.no_kjp, dateIso);
        results.push({ item, state: checked.state, reason: checked.reason });

        if (i < items.length - 1) {
            await sleep(REQUEST_GAP_MS);
        }
    }

    return results;
}

export function buildStatusSummaryMessage(results: StatusCheckResult[], dateIso: string): string {
    const successResults = results.filter((x) => x.state === 'BERHASIL');
    const failedResults = results.filter((x) => x.state === 'GAGAL');
    const errorResults = results.filter((x) => x.state === 'ERROR');
    const successCount = successResults.length;
    const failedCount = failedResults.length;
    const errorCount = errorResults.length;
    const displayDate = formatLongIndonesianDate(dateIso);

    const lines: string[] = [
        '📋 *LAPORAN HASIL PENDAFTARAN*',
        `🗓️ ${displayDate}`,
        '',
        `✅ *SUKSES: ${successCount} Data*`,
    ];

    if (successCount === 0) {
        lines.push('-');
    } else {
        successResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} (${entry.item.no_kjp})`);
        });
    }

    lines.push('', `❌ *GAGAL: ${failedCount} Data*`);
    if (failedCount === 0) {
        lines.push('-');
    } else {
        failedResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} - Belum terdaftar`);
        });
    }

    if (errorCount > 0) {
        lines.push('', `⚠️ *PERLU DI CEK ULANG: ${errorCount} Data*`);
        errorResults.forEach((entry, idx) => {
            lines.push(`${idx + 1}. ${entry.item.nama} - Kendala API/jaringan`);
        });
    }

    return lines.join('\n');
}

export function buildFailedDataCopyMessage(results: StatusCheckResult[]): { header: string; body: string } | null {
    const failedResults = results.filter((x) => x.state !== 'BERHASIL');
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
            const programLabel = normalizeProgramLabel(item.jenis_kartu);
            return `${item.nama}\n${programLabel} ${item.no_kjp}\nKTP ${item.no_ktp}\nKK  ${item.no_kk}`;
        })
        .join('\n\n');

    return { header, body };
}
