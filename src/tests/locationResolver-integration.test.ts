import { beforeEach, describe, expect, test } from 'bun:test';
import { MAX_CANDIDATES, resolveLocation } from '../services/locationResolver';
import { pendingLocationCandidates } from '../state';

type Candidate = {
    kode: string;
    nama: string;
    wilayah: string;
    wilayahNama: string;
    normalized: string;
    normalizedNospace: string;
};

type SelectionResult =
    | { status: 'selected'; selected: Candidate }
    | { status: 'cancelled' }
    | { status: 'error'; message: string };

function startLocationDisambiguationFlow(phone: string, input: string): Candidate[] {
    const matches = resolveLocation(input);
    if (matches.length > 1) {
        pendingLocationCandidates.set(phone, matches);
    }
    return matches;
}

function pickPendingLocation(phone: string, pick: string): SelectionResult {
    const candidates = pendingLocationCandidates.get(phone);
    if (!candidates || candidates.length === 0) {
        return { status: 'error', message: 'Sesi kandidat lokasi tidak ditemukan.' };
    }

    const choice = Number.parseInt(pick, 10);
    if (!Number.isFinite(choice)) {
        return { status: 'error', message: 'Pilihan harus berupa angka.' };
    }

    if (choice === 0) {
        pendingLocationCandidates.delete(phone);
        return { status: 'cancelled' };
    }

    if (choice < 1 || choice > candidates.length) {
        return {
            status: 'error',
            message: `Pilihan tidak valid. Pilih 1-${candidates.length} atau 0 untuk batal.`,
        };
    }

    const selected = candidates[choice - 1]!;
    pendingLocationCandidates.delete(phone);
    return { status: 'selected', selected };
}

describe('integration - Pasarjaya location resolver flow', () => {
    beforeEach(() => {
        pendingLocationCandidates.clear();
    });

    test('flow kedoya -> single match -> returns Jakgrosir Kedoya', () => {
        const phone = '628111000001';
        const matches = startLocationDisambiguationFlow(phone, 'kedoya');

        expect(matches).toHaveLength(1);
        expect(matches[0]?.nama).toBe('Jakgrosir Kedoya');
        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });

    test('flow jakmart -> multiple matches -> store map -> pick number -> get correct nama + cleanup', () => {
        const phone = '628111000002';
        const matches = startLocationDisambiguationFlow(phone, 'jakmart');

        expect(matches.length).toBeGreaterThan(1);
        expect(matches.length).toBeLessThanOrEqual(MAX_CANDIDATES);
        expect(pendingLocationCandidates.has(phone)).toBe(true);

        const fromMap = pendingLocationCandidates.get(phone);
        expect(fromMap).toBeDefined();
        expect(fromMap).toHaveLength(matches.length);

        const result = pickPendingLocation(phone, '2');
        expect(result.status).toBe('selected');

        if (result.status === 'selected') {
            expect(result.selected.nama).toBe(matches[1]?.nama);
        }

        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });

    test('flow xyzabc -> no match -> retry kedoya -> single match success', () => {
        const phone = '628111000003';
        const firstTry = startLocationDisambiguationFlow(phone, 'xyzabc');

        expect(firstTry).toEqual([]);
        expect(pendingLocationCandidates.has(phone)).toBe(false);

        const retry = startLocationDisambiguationFlow(phone, 'kedoya');
        expect(retry).toHaveLength(1);
        expect(retry[0]?.nama).toBe('Jakgrosir Kedoya');
        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });

    test('flow pasar overflow (capped at MAX_CANDIDATES) -> retry pasar senen -> narrow success', () => {
        const phone = '628111000004';
        const broadMatches = startLocationDisambiguationFlow(phone, 'pasar');

        expect(broadMatches).toHaveLength(MAX_CANDIDATES);
        expect(pendingLocationCandidates.has(phone)).toBe(true);

        pendingLocationCandidates.delete(phone);

        const narrowedMatches = startLocationDisambiguationFlow(phone, 'pasar senen');
        expect(narrowedMatches.length).toBeGreaterThanOrEqual(1);
        expect(narrowedMatches.length).toBeLessThanOrEqual(MAX_CANDIDATES);
        expect(narrowedMatches[0]?.nama).toContain('Pasar Senen');
        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });

    test('flow disambiguation -> pick 0 cancels and cleans pending map', () => {
        const phone = '628111000005';
        const matches = startLocationDisambiguationFlow(phone, 'jakmart');

        expect(matches.length).toBeGreaterThan(1);
        expect(pendingLocationCandidates.has(phone)).toBe(true);

        const cancelResult = pickPendingLocation(phone, '0');
        expect(cancelResult).toEqual({ status: 'cancelled' });
        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });

    test('flow invalid pick -> error keeps session -> valid pick succeeds and cleans map', () => {
        const phone = '628111000006';
        const matches = startLocationDisambiguationFlow(phone, 'jakmart');

        expect(matches.length).toBeGreaterThan(1);
        expect(pendingLocationCandidates.has(phone)).toBe(true);

        const invalidPick = pickPendingLocation(phone, String(matches.length + 10));
        expect(invalidPick.status).toBe('error');
        expect(pendingLocationCandidates.has(phone)).toBe(true);

        const validPick = pickPendingLocation(phone, '1');
        expect(validPick.status).toBe('selected');

        if (validPick.status === 'selected') {
            expect(validPick.selected.nama).toBe(matches[0]?.nama);
        }

        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });

    test('stale session handling: selecting with empty pending map returns error', () => {
        const phone = '628111000007';
        expect(pendingLocationCandidates.has(phone)).toBe(false);

        const result = pickPendingLocation(phone, '1');
        expect(result.status).toBe('error');

        if (result.status === 'error') {
            expect(result.message).toContain('Sesi kandidat lokasi tidak ditemukan');
        }

        expect(pendingLocationCandidates.has(phone)).toBe(false);
    });
});
