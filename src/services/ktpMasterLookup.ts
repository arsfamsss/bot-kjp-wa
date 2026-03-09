import * as fs from 'fs';

export type NikRegionLookupStatus = 'FOUND' | 'NOT_FOUND' | 'MASTER_UNAVAILABLE' | 'INVALID_NIK';

export interface NikRegionLookupResult {
    status: NikRegionLookupStatus;
    prefix: string | null;
    wilayah?: string;
}

const VPS_DEFAULT_CSV_PATH = '/root/bot-kjp/data/datamastercekktp.csv';
const LOCAL_DEV_CSV_PATH = 'D:\\BOT\\BOT INPUT DATA KJP DI WA OTOMATIS\\data\\datamastercekktp.csv';

let hasLoaded = false;
let activePath: string | null = null;
let prefixMap = new Map<string, string>();
let validRows = 0;
let loadError: string | null = null;

function parseCsvPair(line: string): [string, string] | null {
    const firstQuote = line.indexOf('"');
    if (firstQuote < 0) return null;

    let current = '';
    const values: string[] = [];
    let inQuotes = false;

    for (let i = firstQuote; i < line.length; i += 1) {
        const ch = line[i];

        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (ch === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    if (current.length > 0) values.push(current.trim());
    if (values.length < 2) return null;

    return [values[0], values[1]];
}

function getCandidatePaths(): string[] {
    const envPath = (process.env.KTP_MASTER_CSV_PATH || '').trim();
    return [envPath, VPS_DEFAULT_CSV_PATH, LOCAL_DEV_CSV_PATH].filter(Boolean);
}

function resolveFirstExistingPath(candidates: string[]): string | null {
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch {
            continue;
        }
    }
    return null;
}

function parseMasterCsvFile(csvPath: string): { map: Map<string, string>; count: number } {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    const map = new Map<string, string>();
    let count = 0;

    for (const line of lines) {
        const [, payload = line] = line.split('|', 2);
        const pair = parseCsvPair(payload);
        if (!pair) continue;

        const [rawId, rawName] = pair;
        const id = (rawId || '').trim();
        const name = (rawName || '').trim();

        if (!id || !name || id.toLowerCase() === 'id') continue;

        const digits = id.replace(/\D/g, '');
        if (digits.length < 6) continue;

        const prefix6 = digits.slice(0, 6);
        if (!map.has(prefix6)) {
            map.set(prefix6, name);
            count += 1;
        }
    }

    return { map, count };
}

function logLoadResult(): void {
    if (!activePath) {
        console.warn(`[KTP_MASTER] CSV tidak ditemukan. Candidate: ${getCandidatePaths().join(' | ')}`);
        if (loadError) console.warn(`[KTP_MASTER] warning: ${loadError}`);
        return;
    }

    console.log(`[KTP_MASTER] path aktif: ${activePath}`);
    console.log(`[KTP_MASTER] baris valid ter-load: ${validRows}`);

    if (loadError) {
        console.warn(`[KTP_MASTER] warning: ${loadError}`);
    }
}

export function warmupKtpMasterCsvLookup(): void {
    ensureKtpMasterLoaded();
}

export function ensureKtpMasterLoaded(): void {
    if (hasLoaded) return;
    hasLoaded = true;

    const candidates = getCandidatePaths();
    activePath = resolveFirstExistingPath(candidates);

    if (!activePath) {
        loadError = 'Semua path fallback tidak tersedia.';
        prefixMap = new Map<string, string>();
        validRows = 0;
        logLoadResult();
        return;
    }

    try {
        const parsed = parseMasterCsvFile(activePath);
        prefixMap = parsed.map;
        validRows = parsed.count;

        if (validRows === 0) {
            loadError = 'File CSV terbaca tapi tidak ada baris valid.';
        }
    } catch (error) {
        loadError = error instanceof Error ? error.message : String(error);
        prefixMap = new Map<string, string>();
        validRows = 0;
    }

    logLoadResult();
}

export function lookupNikRegionFromMaster(nik: string): NikRegionLookupResult {
    const cleanNik = (nik || '').replace(/\D/g, '');
    if (cleanNik.length !== 16) {
        return { status: 'INVALID_NIK', prefix: null };
    }

    ensureKtpMasterLoaded();

    if (!activePath || prefixMap.size === 0) {
        return {
            status: 'MASTER_UNAVAILABLE',
            prefix: cleanNik.slice(0, 6),
        };
    }

    const prefix = cleanNik.slice(0, 6);
    const wilayah = prefixMap.get(prefix);

    if (!wilayah) {
        return {
            status: 'NOT_FOUND',
            prefix,
        };
    }

    return {
        status: 'FOUND',
        prefix,
        wilayah,
    };
}
