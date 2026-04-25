import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocationEntry {
    kode: string;
    nama: string;
    wilayah: string;
    wilayahNama: string;
    normalized: string;
    normalizedNospace: string;
}

export type LocationMatch = LocationEntry;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_CANDIDATES = 10;

const STOPWORDS = new Set([
    'jakut', 'jakpus', 'jakbar', 'jaktim', 'jaksel',
    'kec', 'kel', 'jl', 'jalan', 'di', 'dan',
]);

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

interface RawLokasi {
    kode: string;
    nama: string;
}

interface RawWilayah {
    nama: string;
    lokasi: RawLokasi[];
}

function loadPasarjayaLocations(): LocationEntry[] {
    const jsonPath = path.join(__dirname, '..', 'data', 'locations-pasarjaya.json');
    const raw: Record<string, RawWilayah> = JSON.parse(
        fs.readFileSync(jsonPath, 'utf-8'),
    );

    const entries: LocationEntry[] = [];
    for (const [wilayahKey, wilayah] of Object.entries(raw)) {
        for (const lok of wilayah.lokasi) {
            entries.push({
                kode: lok.kode,
                nama: lok.nama,
                wilayah: wilayahKey,
                wilayahNama: wilayah.nama,
                normalized: lok.nama.toLowerCase(),
                normalizedNospace: lok.nama.toLowerCase().replace(/\s/g, ''),
            });
        }
    }
    return entries;
}

export const LOCATION_INDEX: LocationEntry[] = loadPasarjayaLocations();

// ---------------------------------------------------------------------------
// Resolver — 3-stage algorithm
// ---------------------------------------------------------------------------

export function resolveLocation(input: string): LocationMatch[] {
    if (!input || !input.trim()) return [];

    const normalizedInput = input.toLowerCase().trim();

    // --- Stage 1: Full phrase substring match ---
    const stage1 = LOCATION_INDEX.filter(e => e.normalized.includes(normalizedInput));

    if (stage1.length > 0) {
        const exact = stage1.filter(e => e.normalized === normalizedInput);
        if (exact.length > 0) return exact.slice(0, MAX_CANDIDATES);
        return stage1.slice(0, MAX_CANDIDATES);
    }

    // --- Stage 2: No-space substring match ---
    const nospaceInput = normalizedInput.replace(/\s/g, '');
    if (nospaceInput.length >= 4) {
        const stage2 = LOCATION_INDEX.filter(e => e.normalizedNospace.includes(nospaceInput));

        if (stage2.length > 0) {
            const exact = stage2.filter(e => e.normalizedNospace === nospaceInput);
            if (exact.length > 0) return exact.slice(0, MAX_CANDIDATES);
            return stage2.slice(0, MAX_CANDIDATES);
        }
    }

    // --- Stage 3: Token fallback (least-ambiguous token) ---
    const tokens = normalizedInput
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOPWORDS.has(t));

    if (tokens.length === 0) return [];

    let bestMatches: LocationEntry[] | null = null;
    let smallestCount = Infinity;

    for (const token of tokens) {
        const matches = LOCATION_INDEX.filter(e => e.normalized.includes(token));
        if (matches.length > 0 && matches.length < smallestCount) {
            smallestCount = matches.length;
            bestMatches = matches;
        }
    }

    if (!bestMatches) return [];
    return bestMatches.slice(0, MAX_CANDIDATES);
}
