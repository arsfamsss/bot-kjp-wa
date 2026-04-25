import https from 'https';
import { StatusCheckItem } from './statusCheckService';

const BASE_URL = 'antrianpanganbersubsidi.pasarjaya.co.id';
const FORM_PATH = '/cetak-qr';
const CHECK_PATH = '/cetak-qr';
const TIMEOUT_MS = Number(process.env.PASARJAYA_STATUS_TIMEOUT_MS) || 15000;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_GAP_MS = 350;

export interface PasarjayaStatusDetail {
    lokasi?: string;
    tanggalPengambilan?: string;
    nomorUrut?: string;
}

export interface PasarjayaStatusResult {
    state: 'BERHASIL' | 'GAGAL' | 'ERROR';
    reason?: string;
    detail?: PasarjayaStatusDetail;
}

export interface PasarjayaStatusCheckResult {
    item: StatusCheckItem;
    state: 'BERHASIL' | 'GAGAL' | 'ERROR';
    reason?: string;
    detail?: PasarjayaStatusDetail;
}

interface HttpsResponse {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    cookie: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_PATTERNS = [
    'TIMEOUT',
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'SOCKET HANG UP',
    'RESPONSE_ABORTED',
    'REQUEST_TIMEOUT_HARD',
];

function isRetryableError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message.toUpperCase() : String(error).toUpperCase();
    return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

export function mergeCookieString(currentCookie: string, setCookieHeaders: string[]): string {
    const jar = new Map<string, string>();

    const appendCookieParts = (cookieString: string): void => {
        cookieString
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => {
                const eqIndex = part.indexOf('=');
                if (eqIndex <= 0) return;
                const name = part.slice(0, eqIndex).trim();
                const value = part.slice(eqIndex + 1).trim();
                if (!name) return;
                jar.set(name, value);
            });
    };

    appendCookieParts(currentCookie);

    for (const setCookie of setCookieHeaders) {
        if (!setCookie) continue;
        const firstPart = setCookie.split(';')[0]?.trim();
        if (!firstPart) continue;
        const eqIndex = firstPart.indexOf('=');
        if (eqIndex <= 0) continue;
        const name = firstPart.slice(0, eqIndex).trim();
        const value = firstPart.slice(eqIndex + 1).trim();
        if (!name) continue;
        jar.set(name, value);
    }

    return Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

function httpsRequest(
    path: string,
    method: string,
    extraHeaders: Record<string, string>,
    body: string | null,
    cookie: string,
): Promise<HttpsResponse> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let req: ReturnType<typeof https.request> | null = null;

        const finish = (err: Error | null, result?: HttpsResponse): void => {
            if (settled) return;
            settled = true;
            clearTimeout(hardTimeout);
            if (err) {
                reject(err);
            } else {
                resolve(result!);
            }
        };

        const headers: Record<string, string> = {
            'Host': BASE_URL,
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9',
            'Connection': 'keep-alive',
            'Referer': `https://${BASE_URL}/`,
            'Origin': `https://${BASE_URL}`,
            'Upgrade-Insecure-Requests': '1',
            'sec-ch-ua': '"Chromium";v="135", "Google Chrome";v="135", "Not.A/Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-User': '?1',
            ...extraHeaders,
        };

        if (cookie) {
            headers['Cookie'] = cookie;
        }

        const options: https.RequestOptions = {
            hostname: BASE_URL,
            port: 443,
            path,
            method,
            headers,
            timeout: TIMEOUT_MS,
            rejectUnauthorized: false,
        };

        const hardTimeout = setTimeout(() => {
            if (req) {
                req.destroy(new Error('REQUEST_TIMEOUT_HARD'));
            } else {
                finish(new Error('REQUEST_TIMEOUT_HARD'));
            }
        }, TIMEOUT_MS + 5000);

        req = https.request(options, (res) => {
            const setCookieRaw = res.headers['set-cookie'] ?? [];
            const mergedCookie = mergeCookieString(cookie, setCookieRaw);

            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('aborted', () => finish(new Error('RESPONSE_ABORTED')));
            res.on('error', (err) => finish(err));
            res.on('end', () => {
                finish(null, {
                    statusCode: res.statusCode ?? 0,
                    headers: res.headers as Record<string, string | string[] | undefined>,
                    body: Buffer.concat(chunks).toString(),
                    cookie: mergedCookie,
                });
            });
        });

        req.setTimeout(TIMEOUT_MS);
        req.on('socket', (socket) => {
            socket.setTimeout(TIMEOUT_MS);
        });
        req.on('error', (err) => finish(err));
        req.on('timeout', () => {
            req!.destroy(new Error('TIMEOUT'));
        });

        if (body) req.write(body);
        req.end();
    });
}

export function extractCsrfToken(html: string): string | null {
    const match =
        html.match(/<input[^>]*name=["']_token["'][^>]*value=["']([^"']+)["']/i) ??
        html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

export function parseDetailFromHtml(html: string): PasarjayaStatusDetail {
    const detail: PasarjayaStatusDetail = {};

    const cleanHtmlText = (value: string): string =>
        value
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const extractDateString = (value: string): string | null => {
        const src = cleanHtmlText(value);
        const dateMatch = src.match(/(\d{4}-\d{2}-\d{2}|\d{2}[/\-]\d{2}[/\-]\d{4})/);
        return dateMatch ? dateMatch[1].trim() : null;
    };

    const tglDatang = html.match(
        /TANGGAL\s*(?:DATANG|PENGAMBILAN)[^\d]*(\d{4}-\d{2}-\d{2}|\d{2}[/\-]\d{2}[/\-]\d{4})/i,
    );
    if (tglDatang) {
        detail.tanggalPengambilan = tglDatang[1].trim();
    }

    if (!detail.tanggalPengambilan) {
        const tglRow = html.match(
            /<td[^>]*>\s*TANGGAL\s*(?:DATANG|PENGAMBILAN)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i,
        );
        const rowDate = extractDateString(tglRow ? tglRow[1] : '');
        if (rowDate) detail.tanggalPengambilan = rowDate;
    }

    if (!detail.tanggalPengambilan) {
        const tglLabel = html.match(/TANGGAL[^:]*:\s*([^<\n]+)/i);
        if (tglLabel) {
            const labelDate = extractDateString(tglLabel[1]);
            if (labelDate) detail.tanggalPengambilan = labelDate;
        }
    }

    if (!detail.tanggalPengambilan) {
        const tglAny = html.match(/(\d{4}-\d{2}-\d{2})/);
        if (tglAny) detail.tanggalPengambilan = tglAny[1];
    }

    const lokasiPatterns: RegExp[] = [
        /Jakgrosir[^<]*/i,
        /Pasar[^<]*/i,
        /<td[^>]*>([^<]*(?:Jakgrosir|Pasar|Kramat|Cipinang|Jatinegara|Kebayoran|Tebet|Cempaka|Senen|Tanah Abang)[^<]*)<\/td>/i,
    ];
    for (const pattern of lokasiPatterns) {
        const match = html.match(pattern);
        if (match) {
            detail.lokasi = (match[1] || match[0]).trim();
            break;
        }
    }

    if (!detail.lokasi) {
        const lokasiLabel = html.match(/LOKASI[^:]*:\s*([^<\n]+)/i);
        if (lokasiLabel) detail.lokasi = lokasiLabel[1].trim();
    }

    const nomorMatch =
        html.match(/<td[^>]*>(\d{1,4})<\/td>\s*<td[^>]*>[\s\S]*?[Cc]etak/) ??
        html.match(/NOMOR[^:]*:\s*(\d+)/i);
    if (nomorMatch) detail.nomorUrut = nomorMatch[1];

    return detail;
}

async function getCookieAndCsrf(): Promise<{ cookie: string; csrfToken: string } | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const res = await httpsRequest(
                FORM_PATH,
                'GET',
                { 'Referer': `https://${BASE_URL}/` },
                null,
                '',
            );

            const csrfToken = extractCsrfToken(res.body);
            if (csrfToken || res.cookie) {
                return { cookie: res.cookie, csrfToken: csrfToken ?? '' };
            }
        } catch {
        }
        await sleep(500);
    }
    return null;
}

export async function checkPasarjayaStatus(
    noKjp: string,
    cookie: string,
    csrfToken: string,
): Promise<PasarjayaStatusResult & { cookie: string }> {
    const cleanedNomor = (noKjp || '').toString().trim();
    if (!cleanedNomor) {
        return { state: 'ERROR', reason: 'empty_identifier', cookie };
    }

    if (!csrfToken) {
        return { state: 'ERROR', reason: 'missing_csrf', cookie };
    }

    let lastError = 'unknown_error';

    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
        try {
            const postData = `_token=${encodeURIComponent(csrfToken)}&nomor=${encodeURIComponent(cleanedNomor)}`;

            const res = await httpsRequest(
                CHECK_PATH,
                'POST',
                {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': String(Buffer.byteLength(postData)),
                    'Origin': `https://${BASE_URL}`,
                    'Referer': `https://${BASE_URL}/cetak-qr`,
                },
                postData,
                cookie,
            );

            cookie = res.cookie;

            const bodyLower = res.body.toLowerCase();

            if (
                bodyLower.includes('tidak ditemukan') ||
                bodyLower.includes('data tidak ditemukan') ||
                bodyLower.includes('belum ada data')
            ) {
                return { state: 'GAGAL', reason: 'not_found', cookie };
            }

            if (res.statusCode === 302 || res.statusCode === 303) {
                const location = (res.headers['location'] as string) || '';
                let normalizedLocation = location;

                if (location.startsWith('http')) {
                    try {
                        const parsedUrl = new URL(location);
                        normalizedLocation = `${parsedUrl.pathname}${parsedUrl.search || ''}`;
                    } catch {
                        normalizedLocation = location.replace(`https://${BASE_URL}`, '');
                    }
                }

                const normalizedLower = normalizedLocation.toLowerCase();

                if (normalizedLower.includes('/list-cetak') || normalizedLower.includes('/berhasil')) {
                    const followRes = await httpsRequest(normalizedLocation, 'GET', {}, null, cookie);
                    cookie = followRes.cookie;

                    if (
                        followRes.body.includes('NOMOR URUT') ||
                        followRes.body.includes('TANGGAL PENGAMBILAN') ||
                        followRes.body.includes('Cetak QR') ||
                        followRes.body.includes('REGISTRASI BERHASIL')
                    ) {
                        const detail = parseDetailFromHtml(followRes.body);
                        return { state: 'BERHASIL', detail, cookie };
                    }
                    return { state: 'GAGAL', reason: 'redirect_no_data', cookie };
                }

                if (normalizedLower.includes('/cetak-qr')) {
                    return { state: 'GAGAL', reason: 'redirect_to_form', cookie };
                }
            }

            if (
                res.body.includes('Daftar Cetak Ulang') ||
                res.body.includes('list-cetak') ||
                res.body.includes('NOMOR URUT') ||
                res.body.includes('Cetak QR') ||
                res.body.includes('TANGGAL PENGAMBILAN')
            ) {
                const detail = parseDetailFromHtml(res.body);
                return { state: 'BERHASIL', detail, cookie };
            }

            if (res.body.includes('REGISTRASI BERHASIL') || res.body.includes('Nomor Antrian')) {
                const detail = parseDetailFromHtml(res.body);
                return { state: 'BERHASIL', detail, cookie };
            }

            return { state: 'GAGAL', reason: 'unknown', cookie };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);

            if (attempt >= RETRY_LIMIT || !isRetryableError(error)) {
                return { state: 'ERROR', reason: lastError, cookie };
            }

            await sleep(RETRY_DELAY_MS);
        }
    }

    return { state: 'ERROR', reason: lastError, cookie };
}

export async function checkPasarjayaStatuses(
    items: StatusCheckItem[],
): Promise<PasarjayaStatusCheckResult[]> {
    const results: PasarjayaStatusCheckResult[] = [];

    const session = await getCookieAndCsrf();
    if (!session) {
        return items.map((item) => ({
            item,
            state: 'ERROR' as const,
            reason: 'cookie_fetch_failed',
        }));
    }

    let { cookie, csrfToken } = session;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const result = await checkPasarjayaStatus(item.no_kjp, cookie, csrfToken);

        cookie = result.cookie;

        results.push({
            item,
            state: result.state,
            reason: result.reason,
            detail: result.detail,
        });

        if (i < items.length - 1) {
            await sleep(REQUEST_GAP_MS);
        }
    }

    return results;
}
