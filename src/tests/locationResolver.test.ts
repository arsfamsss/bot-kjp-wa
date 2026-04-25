import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
    LOCATION_INDEX,
    MAX_CANDIDATES,
    resolveLocation,
    type LocationEntry,
} from '../services/locationResolver';

function makeEntry(
    kode: string,
    nama: string,
    wilayah = 'X',
    wilayahNama = 'Wilayah X',
): LocationEntry {
    const normalized = nama.toLowerCase();
    return {
        kode,
        nama,
        wilayah,
        wilayahNama,
        normalized,
        normalizedNospace: normalized.replace(/\s/g, ''),
    };
}

let baselineIndex: LocationEntry[] = [];

beforeEach(() => {
    baselineIndex = LOCATION_INDEX.map(entry => ({ ...entry }));
});

afterEach(() => {
    LOCATION_INDEX.splice(0, LOCATION_INDEX.length, ...baselineIndex);
});

describe('locationResolver', () => {
    test('LOCATION_INDEX punya 97 entries', () => {
        expect(LOCATION_INDEX.length).toBe(97);
    });

    test('single match full phrase: "tanah abang" -> 1 result', () => {
        const result = resolveLocation('tanah abang');
        expect(result.length).toBe(1);
        expect(result[0]?.nama).toBe('Gerai Pasar Tanah Abang Blok G');
    });

    test('multiple match full phrase: "jakmart" -> multiple (capped by MAX_CANDIDATES)', () => {
        const result = resolveLocation('jakmart');
        expect(result.length).toBe(MAX_CANDIDATES);
        expect(result.every(r => r.nama.toLowerCase().includes('jakmart'))).toBe(true);
    });

    test('exact match tiebreaker: exact wins over substring variant as single result', () => {
        LOCATION_INDEX.splice(
            0,
            LOCATION_INDEX.length,
            makeEntry('1', 'Pasar Senen'),
            makeEntry('2', 'Pasar Senen Blok III'),
            makeEntry('3', 'Pasar Gembrong'),
        );

        const result = resolveLocation('pasar senen');
        expect(result).toHaveLength(1);
        expect(result[0]?.nama).toBe('Pasar Senen');
    });

    test('no-space match: "tanahabang" -> match', () => {
        const result = resolveLocation('tanahabang');
        expect(result).toHaveLength(1);
        expect(result[0]?.nama).toBe('Gerai Pasar Tanah Abang Blok G');
    });

    test('no-space skip short input: "dc" -> skip stage2, falls to token and returns []', () => {
        LOCATION_INDEX.splice(
            0,
            LOCATION_INDEX.length,
            makeEntry('1', 'Alpha Beta'),
            makeEntry('2', 'Gamma Delta'),
        );

        const result = resolveLocation('dc');
        expect(result).toEqual([]);
    });

    test('token fallback with stopwords: "jl pasar di senen" filters jl/di', () => {
        const result = resolveLocation('jl pasar di senen');
        expect(result.length).toBeGreaterThan(0);
        expect(result.every(r => r.nama.toLowerCase().includes('senen'))).toBe(true);
    });

    test('all stopwords: "di jalan kec" -> []', () => {
        expect(resolveLocation('di jalan kec')).toEqual([]);
    });

    test('token < 3 chars filtered: "ab cd" -> []', () => {
        expect(resolveLocation('ab cd')).toEqual([]);
    });

    test('no match: "xyzabc123" -> []', () => {
        expect(resolveLocation('xyzabc123')).toEqual([]);
    });

    test('case insensitive: "KEDOYA" matches "Jakgrosir Kedoya"', () => {
        const result = resolveLocation('KEDOYA');
        expect(result.length).toBeGreaterThan(0);
        expect(result.some(r => r.nama === 'Jakgrosir Kedoya')).toBe(true);
    });

    test('entry has all required fields including normalized variants', () => {
        const entry = LOCATION_INDEX[0];

        expect(entry).toBeDefined();
        expect(typeof entry.kode).toBe('string');
        expect(typeof entry.nama).toBe('string');
        expect(typeof entry.wilayah).toBe('string');
        expect(typeof entry.wilayahNama).toBe('string');
        expect(typeof entry.normalized).toBe('string');
        expect(typeof entry.normalizedNospace).toBe('string');
        expect(entry.normalized).toBe(entry.nama.toLowerCase());
        expect(entry.normalizedNospace).toBe(entry.normalized.replace(/\s/g, ''));
    });
});
