import https from 'https';
import { StatusCheckItem } from './statusCheckService';

const BASE_URL = 'pmb.foodstation.co.id';
const CETAK_ULANG_PATH = '/KJPRegister/cetakUlang';
const TIMEOUT_MS = Number(process.env.FOODSTATION_STATUS_TIMEOUT_MS) || 15000;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_GAP_MS = 350;

export interface FoodStationStatusResult {
    state: 'BERHASIL' | 'GAGAL' | 'ERROR';
    reason?: string;
    detail?: {
        tanggalPengambilan?: string;
        jamPengambilan?: string;
    };
}

export interface FoodStationStatusCheckResult {
    item: StatusCheckItem;
    state: 'BERHASIL' | 'GAGAL' | 'ERROR';
    reason?: string;
    detail?: {
        tanggalPengambilan?: string;
        jamPengambilan?: string;
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function postCetakUlang(nik: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
        const postData = 'nik=' + encodeURIComponent(nik);

        const options: https.RequestOptions = {
            hostname: BASE_URL,
            port: 443,
            path: CETAK_ULANG_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: TIMEOUT_MS,
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk: Buffer | string) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode ?? 0, body });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('TIMEOUT'));
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

/**
 * Regex patterns for #capture-area HTML:
 *   Tanggal: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD
 *   Jam:     HH.MM - HH.MM WIB  or  HH:MM - HH:MM WIB
 */
export function parseDetailFromHtml(
    html: string,
): { tanggalPengambilan?: string; jamPengambilan?: string } | undefined {
    const captureIdx = html.indexOf('capture-area');
    if (captureIdx === -1) {
        return undefined;
    }
    const section = html.slice(captureIdx);

    const tanggalMatch = section.match(
        /(\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})/,
    );
    const jamMatch = section.match(
        /(\d{2}[.:]\d{2})\s*[-–]\s*(\d{2}[.:]\d{2})\s*(?:WIB)?/,
    );

    const tanggalPengambilan = tanggalMatch ? tanggalMatch[1] : undefined;
    const jamPengambilan = jamMatch
        ? `${jamMatch[1]} - ${jamMatch[2]} WIB`
        : undefined;

    if (!tanggalPengambilan && !jamPengambilan) {
        return undefined;
    }

    return { tanggalPengambilan, jamPengambilan };
}

export async function checkFoodStationStatus(
    nik: string,
): Promise<FoodStationStatusResult> {
    let lastError = 'unknown_error';

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
        try {
            const res = await postCetakUlang(nik);

            // Definitive — no retry
            if (res.body.includes('Data NIK tidak ditemukan')) {
                return { state: 'GAGAL', reason: 'not_found' };
            }

            if (
                res.body.includes('#capture-area') ||
                res.body.includes('Registration Success')
            ) {
                // Validasi H+1: tanggal berlaku harus = besok (data hari ini)
                const dateMatch = res.body.match(
                    /Hanya berlaku pada\s*:\s*<strong[^>]*>\s*(\d{1,2}-\w{3}-\d{4})/i,
                );
                if (dateMatch) {
                    const MONTH_MAP: Record<string, number> = {
                        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
                        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
                    };
                    const parts = dateMatch[1].split('-');
                    const day = parseInt(parts[0], 10);
                    const mon = MONTH_MAP[parts[1].toUpperCase()] ?? -1;
                    const year = parseInt(parts[2], 10);

                    if (mon >= 0 && !isNaN(day) && !isNaN(year)) {
                        const berlakuDate = new Date(year, mon, day);
                        const now = new Date();
                        const tomorrow = new Date(
                            now.getFullYear(), now.getMonth(), now.getDate() + 1,
                        );
                        const toStr = (d: Date) =>
                            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                        if (toStr(berlakuDate) !== toStr(tomorrow)) {
                            return {
                                state: 'GAGAL',
                                reason: 'data_lama',
                            };
                        }
                    }
                }
                const detail = parseDetailFromHtml(res.body);
                return { state: 'BERHASIL', detail };
            }

            // Unknown response — transient, retry
            lastError = `unknown_response_http_${res.statusCode}`;
        } catch (error) {
            lastError =
                error instanceof Error ? error.message : 'request_failed';
        }

        if (attempt < RETRY_LIMIT) {
            await sleep(RETRY_DELAY_MS);
        }
    }

    return { state: 'ERROR', reason: lastError };
}

// Food Station uses NIK (no_ktp) as identifier, NOT no_kjp
export async function checkFoodStationStatuses(
    items: StatusCheckItem[],
): Promise<FoodStationStatusCheckResult[]> {
    const results: FoodStationStatusCheckResult[] = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const checked = await checkFoodStationStatus(item.no_ktp);
        results.push({
            item,
            state: checked.state,
            reason: checked.reason,
            detail: checked.detail,
        });

        if (i < items.length - 1) {
            await sleep(REQUEST_GAP_MS);
        }
    }

    return results;
}
