import { describe, it, expect, mock } from 'bun:test';

// Mock BEFORE importing modules that depend on cardPrefixConfig
mock.module('../utils/cardPrefixConfig', () => ({
    getCardPrefixType: (prefix8: string) => {
        const map: Record<string, string> = { '50494885': 'KJP', '50494886': 'LANSIA' };
        return map[prefix8] || null;
    },
    getCardPrefixMap: () => ({ '50494885': 'KJP', '50494886': 'LANSIA' }),
}));

const { resolveCardTypeLabel } = await import('../utils/cardType');
import { normalizeCardTypeName, getCardTypeChoicesText, CARD_TYPE_CHOICES } from '../utils/cardTypeRules';

describe('normalizeCardTypeName', () => {
    const cases: Array<{ input: string; expected: string | null }> = [
        { input: 'kjp', expected: 'KJP' },
        { input: 'KJP', expected: 'KJP' },
        { input: 'lansia', expected: 'LANSIA' },
        { input: 'klj', expected: 'LANSIA' },
        { input: 'lns', expected: 'LANSIA' },
        { input: 'kartu pekerja jakarta', expected: 'PEKERJA' },
        { input: 'pekerja', expected: 'PEKERJA' },
        { input: 'kpj', expected: 'PEKERJA' },
        { input: 'difabel', expected: 'DISABILITAS' },
        { input: 'disabilitas', expected: 'DISABILITAS' },
        { input: 'cacat', expected: 'DISABILITAS' },
        { input: 'dawis', expected: 'DASAWISMA' },
        { input: 'dasa wisma', expected: 'DASAWISMA' },
        { input: 'guru honorer', expected: 'GURU HONORER' },
        { input: 'guru', expected: 'GURU HONORER' },
        { input: 'honorer', expected: 'GURU HONORER' },
        { input: 'pjlp', expected: 'PJLP' },
        { input: 'kaj', expected: 'KAJ' },
        { input: 'rusun', expected: 'RUSUN' },
    ];

    for (const { input, expected } of cases) {
        it(`maps "${input}" to ${expected}`, () => {
            expect(normalizeCardTypeName(input)).toBe(expected);
        });
    }

    it('returns null for unknown text', () => {
        expect(normalizeCardTypeName('unknown')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(normalizeCardTypeName('')).toBeNull();
    });

    it('returns null for null value', () => {
        // @ts-expect-error testing null input
        expect(normalizeCardTypeName(null)).toBeNull();
    });

    it('detects alias inside longer text with word boundary', () => {
        expect(normalizeCardTypeName('ini kartu lansia saya')).toBe('LANSIA');
    });
});

describe('CARD_TYPE_CHOICES and choices text', () => {
    it('has 9 items', () => {
        expect(CARD_TYPE_CHOICES).toHaveLength(9);
    });

    it('contains all expected types', () => {
        const expected = [
            'KJP',
            'LANSIA',
            'RUSUN',
            'DISABILITAS',
            'DASAWISMA',
            'PEKERJA',
            'GURU HONORER',
            'PJLP',
            'KAJ',
        ];
        for (const item of expected) {
            expect(CARD_TYPE_CHOICES).toContain(item);
        }
    });

    it('returns choices text in expected order', () => {
        expect(getCardTypeChoicesText()).toBe(
            'KJP - LANSIA - RUSUN - DISABILITAS - DASAWISMA - PEKERJA - GURU HONORER - PJLP - KAJ'
        );
    });
});

describe('resolveCardTypeLabel', () => {
    it('uses manual jenis_kartu when provided', () => {
        expect(resolveCardTypeLabel('5049488500001234', 'LANSIA')).toBe('LANSIA');
    });

    it('trims manual jenis_kartu', () => {
        expect(resolveCardTypeLabel('5049488500001234', '  LANSIA  ')).toBe('LANSIA');
    });

    it('resolves KJP from prefix when manual missing', () => {
        expect(resolveCardTypeLabel('5049488500001234', null)).toBe('KJP');
    });

    it('resolves LANSIA from prefix when manual missing', () => {
        expect(resolveCardTypeLabel('5049488600001234', null)).toBe('LANSIA');
    });

    it('falls back to default KJP for unknown prefix', () => {
        expect(resolveCardTypeLabel('5049488700001234', null)).toBe('KJP');
    });

    it('falls back to default KJP for short number', () => {
        expect(resolveCardTypeLabel('12345', null)).toBe('KJP');
    });

    it('falls back to default KJP when number missing', () => {
        expect(resolveCardTypeLabel(undefined, null)).toBe('KJP');
    });

    it('uses prefix when manual is empty string', () => {
        expect(resolveCardTypeLabel('5049488600001234', '')).toBe('LANSIA');
    });
});
