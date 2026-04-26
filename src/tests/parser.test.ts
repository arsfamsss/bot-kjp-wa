import { describe, it, expect, mock } from 'bun:test';
import type { LogItem, ParsedFields, ItemError } from '../types';

const ktpMasterResolved = new URL('../services/ktpMasterLookup.ts', import.meta.url).pathname;
const cardPrefixResolved = new URL('../utils/cardPrefixConfig.ts', import.meta.url).pathname;

mock.module('../services/ktpMasterLookup', () => ({
    lookupNikRegionFromMaster: () => ({ status: 'FOUND', region: 'DKI Jakarta' }),
    ensureKtpMasterLoaded: () => {},
}));
mock.module('../services/ktpMasterLookup.ts', () => ({
    lookupNikRegionFromMaster: () => ({ status: 'FOUND', region: 'DKI Jakarta' }),
    ensureKtpMasterLoaded: () => {},
}));
mock.module(ktpMasterResolved, () => ({
    lookupNikRegionFromMaster: () => ({ status: 'FOUND', region: 'DKI Jakarta' }),
    ensureKtpMasterLoaded: () => {},
}));

mock.module('../utils/cardPrefixConfig', () => ({
    getCardPrefixType: (prefix8: string) => prefix8 === '50494885' ? 'KJP' : null,
    getCardPrefixMap: () => ({ '50494885': 'KJP' }),
}));
mock.module('../utils/cardPrefixConfig.ts', () => ({
    getCardPrefixType: (prefix8: string) => prefix8 === '50494885' ? 'KJP' : null,
    getCardPrefixMap: () => ({ '50494885': 'KJP' }),
}));
mock.module(cardPrefixResolved, () => ({
    getCardPrefixType: (prefix8: string) => prefix8 === '50494885' ? 'KJP' : null,
    getCardPrefixMap: () => ({ '50494885': 'KJP' }),
}));

const parser = await import('../parser');

const {
    extractDigits,
    normalizeNameForDedup,
    parseRawMessageToLines,
    groupLinesToBlocks,
    parseBlockToItem,
    validateBlockToItem,
} = parser;

const VALID_KJP = '5049488500001234';
const VALID_KTP = '3171234567890123';
const VALID_KK = '3171234567890456';
const ALT_KJP = '5049488500007777';
const ALT_KTP = '3171234567890999';
const ALT_KK = '3171234567890888';

function makeDharmajayaBlock(overrides?: Partial<[string, string, string, string]>): string[] {
    const base: [string, string, string, string] = ['Budi Santoso', VALID_KJP, VALID_KTP, VALID_KK];
    if (!overrides) return [...base];

    return base.map((value, idx) => overrides[idx] ?? value);
}

function makePasarjayaBlock(overrides?: Partial<[string, string, string, string, string]>): string[] {
    const base: [string, string, string, string, string] = ['Siti Aminah', VALID_KJP, VALID_KTP, VALID_KK, '01-01-2015'];
    if (!overrides) return [...base];

    return base.map((value, idx) => overrides[idx] ?? value);
}

function expectHasError(item: LogItem, field: ItemError['field'], type: ItemError['type']): void {
    const found = item.errors.some((err) => err.field === field && err.type === type);
    expect(found).toBe(true);
}

describe('parser.ts', () => {
    describe('extractDigits', () => {
        it('extracts all digits from mixed KJP text', () => {
            expect(extractDigits('KJP 5049488500001234')).toBe('5049488500001234');
        });

        it('returns empty for text without digits', () => {
            expect(extractDigits('abc')).toBe('');
        });

        it('returns empty for empty string', () => {
            expect(extractDigits('')).toBe('');
        });

        it('returns empty for null input', () => {
            const nullInput = null as unknown as string;
            expect(extractDigits(nullInput)).toBe('');
        });

        it('returns empty for undefined input', () => {
            const undefinedInput = undefined as unknown as string;
            expect(extractDigits(undefinedInput)).toBe('');
        });

        it('removes separators like dashes', () => {
            expect(extractDigits('12-34-56')).toBe('123456');
        });

        it('removes spaces and punctuation', () => {
            expect(extractDigits('50 49.48-85,0000/1234')).toBe('5049488500001234');
        });

        it('preserves leading zeros', () => {
            expect(extractDigits('No: 00001234')).toBe('00001234');
        });

        it('joins multiple digit groups in order', () => {
            expect(extractDigits('A1 B22 C333')).toBe('122333');
        });

        it('handles only symbols input', () => {
            expect(extractDigits('@#$%^&*')).toBe('');
        });
    });

    describe('normalizeNameForDedup', () => {
        it('normalizes extra spaces and lowercases', () => {
            expect(normalizeNameForDedup('  Budi  Santoso  ')).toBe('budi santoso');
        });

        it('replaces dash with spaces', () => {
            expect(normalizeNameForDedup('BUDI-SANTOSO')).toBe('budi santoso');
        });

        it('removes symbols and keeps words', () => {
            expect(normalizeNameForDedup('Budi@#$Santoso')).toBe('budi santoso');
        });

        it('returns empty for empty string', () => {
            expect(normalizeNameForDedup('')).toBe('');
        });

        it('returns empty for null', () => {
            const nullInput = null as unknown as string;
            expect(normalizeNameForDedup(nullInput)).toBe('');
        });

        it('returns empty for undefined', () => {
            const undefinedInput = undefined as unknown as string;
            expect(normalizeNameForDedup(undefinedInput)).toBe('');
        });

        it('keeps numbers in canonical output', () => {
            expect(normalizeNameForDedup('Budi 01 Santoso')).toBe('budi 01 santoso');
        });

        it('collapses tabs/newlines to single spaces', () => {
            expect(normalizeNameForDedup('Budi\n\tSantoso')).toBe('budi santoso');
        });

        it('trims punctuation-only separators between words', () => {
            expect(normalizeNameForDedup('Budi....Santoso')).toBe('budi santoso');
        });

        it('handles mixed uppercase lowercase input', () => {
            expect(normalizeNameForDedup('BuDi SaNtOsO')).toBe('budi santoso');
        });
    });

    describe('parseRawMessageToLines', () => {
        it('parses a single 4-line block as 4 lines', () => {
            const lines = parseRawMessageToLines('Budi\n5049488500001234\n3171234567890123\n3171234567890456');
            expect(lines).toHaveLength(4);
        });

        it('parses a multi-block 8-line payload as 8 lines', () => {
            const text = [
                'Budi',
                '5049488500001234',
                '3171234567890123',
                '3171234567890456',
                'Siti',
                '5049488500001111',
                '3171234567890222',
                '3171234567890333',
            ].join('\n');

            const lines = parseRawMessageToLines(text);
            expect(lines).toHaveLength(8);
        });

        it('merges label-only line with following number for KTP', () => {
            const lines = parseRawMessageToLines('KTP\n3171234567890123');
            expect(lines).toEqual(['KTP : 3171234567890123']);
        });

        it('merges label-only line with trailing colon and spacing', () => {
            const lines = parseRawMessageToLines('NIK :\n3171234567890123');
            expect(lines).toEqual(['NIK : 3171234567890123']);
        });

        it('trims surrounding whitespace on every line', () => {
            const lines = parseRawMessageToLines('  Budi  \n  5049488500001234  \n  3171234567890123  \n  3171234567890456  ');
            expect(lines).toEqual(['Budi', '5049488500001234', '3171234567890123', '3171234567890456']);
        });

        it('auto-splits merged "name + card" line into 2 lines', () => {
            const lines = parseRawMessageToLines('Agus Dalimin 5049488500001111');
            expect(lines).toEqual(['Agus Dalimin', '5049488500001111']);
        });

        it('does not split label line like NIK + number', () => {
            const lines = parseRawMessageToLines('NIK 3171234567890123');
            expect(lines).toEqual(['NIK 3171234567890123']);
        });

        it('does not split KTP label + number line', () => {
            const lines = parseRawMessageToLines('KTP 3171234567890123');
            expect(lines).toEqual(['KTP 3171234567890123']);
        });

        it('filters out empty lines', () => {
            const lines = parseRawMessageToLines('\n\nBudi\n\n5049488500001234\n\n3171234567890123\n\n3171234567890456\n\n');
            expect(lines).toEqual(['Budi', '5049488500001234', '3171234567890123', '3171234567890456']);
        });

        it('fixes disablitas typo capitalization', () => {
            const lines = parseRawMessageToLines('disablitas 5049488600001234');
            expect(lines).toEqual(['Disabilitas 5049488600001234']);
        });

        it('normalizes repeated colons', () => {
            const lines = parseRawMessageToLines('KTP:::: 3171234567890123');
            expect(lines).toEqual(['KTP: 3171234567890123']);
        });

        it('handles carriage return line endings', () => {
            const lines = parseRawMessageToLines('Budi\r\n5049488500001234\r\n3171234567890123\r\n3171234567890456');
            expect(lines).toHaveLength(4);
        });

        it('keeps plain numeric line unchanged', () => {
            const lines = parseRawMessageToLines('5049488500001234');
            expect(lines).toEqual(['5049488500001234']);
        });

        it('does not merge label-only line when next line has too few digits', () => {
            const lines = parseRawMessageToLines('KTP\n12345');
            expect(lines).toEqual(['KTP', '12345']);
        });

        it('merges KK label-only line with following long number', () => {
            const lines = parseRawMessageToLines('KK\n3171234567890456');
            expect(lines).toEqual(['KK : 3171234567890456']);
        });

        it('parses mixed content while preserving order', () => {
            const text = [
                'NIK',
                '3171234567890123',
                'Agus Dalimin 5049488500001111',
                'KK 3171234567890222',
            ].join('\n');
            const lines = parseRawMessageToLines(text);
            expect(lines).toEqual([
                'NIK : 3171234567890123',
                'Agus Dalimin',
                '5049488500001111',
                'KK 3171234567890222',
            ]);
        });

        describe('split Nama+KJP nyatu (Pola A)', () => {
            it('A1: splits "Bu haji/suha 5049483502922396 lansia"', () => {
                const lines = parseRawMessageToLines('Bu haji/suha 5049483502922396 lansia');
                expect(lines).toEqual(['Bu haji/suha', '5049483502922396 lansia']);
            });

            it('A2: splits "Boru Sinaga3 kjp:5049488508915633"', () => {
                const lines = parseRawMessageToLines('Boru Sinaga3 kjp:5049488508915633');
                expect(lines).toEqual(['Boru Sinaga3', 'kjp:5049488508915633']);
            });

            it('A3: splits "Suwarti kjp504948853150149738"', () => {
                const lines = parseRawMessageToLines('Suwarti kjp504948853150149738');
                expect(lines).toEqual(['Suwarti', 'kjp504948853150149738']);
            });

            it('A4: splits "Tante 2 Kjp 504948120004302883"', () => {
                const lines = parseRawMessageToLines('Tante 2 Kjp 504948120004302883');
                expect(lines).toEqual(['Tante 2', 'Kjp 504948120004302883']);
            });

            it('A5: splits "Lea Irma 5049483501993026 lansia"', () => {
                const lines = parseRawMessageToLines('Lea Irma 5049483501993026 lansia');
                expect(lines).toEqual(['Lea Irma', '5049483501993026 lansia']);
            });
        });

        describe('split KJP+NIK nyatu (Pola B)', () => {
            it('B1: splits "kjp: 5049488507463288 nik:3175065310890022"', () => {
                const lines = parseRawMessageToLines('kjp: 5049488507463288 nik:3175065310890022');
                expect(lines).toEqual(['kjp: 5049488507463288', 'nik:3175065310890022']);
            });

            it('B2: splits "lansia: 5049488507463288 ktp:3175065310890022"', () => {
                const lines = parseRawMessageToLines('lansia: 5049488507463288 ktp:3175065310890022');
                expect(lines).toEqual(['lansia: 5049488507463288', 'ktp:3175065310890022']);
            });

            it('B3: splits glued "kjp:5049488507463288nik:3175065310890022"', () => {
                const lines = parseRawMessageToLines('kjp:5049488507463288nik:3175065310890022');
                expect(lines).toEqual(['kjp:5049488507463288', 'nik:3175065310890022']);
            });
        });

        describe('full message split — kasus nyata user', () => {
            it('3 baris KJP+NIK nyatu jadi 4 baris', () => {
                const input = 'Rakha adiansyah\nkjp: 5049488507463288 nik:3175065310890022\nKK :3175061208160078';
                const lines = parseRawMessageToLines(input);

                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Rakha adiansyah',
                    'kjp: 5049488507463288',
                    'nik:3175065310890022',
                    'KK :3175061208160078',
                ]);
            });

            it('3 baris Nama+KJP nyatu jadi 4 baris', () => {
                const input = 'Bu haji/suha 5049483502922396 lansia\nKtp  3175020206800014\nKk 3175020801090397';
                const lines = parseRawMessageToLines(input);

                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Bu haji/suha',
                    '5049483502922396 lansia',
                    'Ktp  3175020206800014',
                    'Kk 3175020801090397',
                ]);
            });
        });

        describe('regression — existing behavior preserved', () => {
            it('auto-split tetap jalan untuk "Agus Dalimin 5049488500001111"', () => {
                const lines = parseRawMessageToLines('Agus Dalimin 5049488500001111');
                expect(lines).toEqual(['Agus Dalimin', '5049488500001111']);
            });

            it('label-merge tetap jalan untuk "KTP\\n3175065310890022"', () => {
                const lines = parseRawMessageToLines('KTP\n3175065310890022');
                expect(lines).toEqual(['KTP : 3175065310890022']);
            });

            it('single label+number tidak dipecah: "NIK 3175065310890022"', () => {
                const lines = parseRawMessageToLines('NIK 3175065310890022');
                expect(lines).toEqual(['NIK 3175065310890022']);
            });

            it('4 baris benar tetap tidak berubah', () => {
                const input = 'Nama\n5049488507463288\n3175065310890022\n3175061208160078';
                const lines = parseRawMessageToLines(input);
                expect(lines).toEqual(['Nama', '5049488507463288', '3175065310890022', '3175061208160078']);
            });
        });

        describe('KRITIS — format benar TIDAK terganggu', () => {
            it('"KJP 5049488500001234 lansia" tetap 1 elemen', () => {
                const lines = parseRawMessageToLines('KJP 5049488500001234 lansia');
                expect(lines).toHaveLength(1);
                expect(lines).toEqual(['KJP 5049488500001234 lansia']);
            });

            it('"5049488500001234 lansia" tetap 1 elemen', () => {
                const lines = parseRawMessageToLines('5049488500001234 lansia');
                expect(lines).toHaveLength(1);
                expect(lines).toEqual(['5049488500001234 lansia']);
            });

            it('"lansia 5049488500001234" tetap 1 elemen', () => {
                const lines = parseRawMessageToLines('lansia 5049488500001234');
                expect(lines).toHaveLength(1);
                expect(lines).toEqual(['lansia 5049488500001234']);
            });

            it('4 baris format label tetap tidak berubah', () => {
                const input = 'Budi\nKJP 5049488500001234 lansia\nKTP 3175065310890022\nKK 3175061208160078';
                const lines = parseRawMessageToLines(input);
                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Budi',
                    'KJP 5049488500001234 lansia',
                    'KTP 3175065310890022',
                    'KK 3175061208160078',
                ]);
            });

            it('4 baris numeric format tetap tidak berubah', () => {
                const input = 'Budi\n5049488500001234\n3175065310890022\n3175061208160078';
                const lines = parseRawMessageToLines(input);
                expect(lines).toHaveLength(4);
                expect(lines).toEqual(['Budi', '5049488500001234', '3175065310890022', '3175061208160078']);
            });

            it('5 baris Pasarjaya tetap tidak berubah', () => {
                const input = 'Budi\n5049488500001234\n3175065310890022\n3175061208160078\n15-08-1990';
                const lines = parseRawMessageToLines(input);
                expect(lines).toHaveLength(5);
                expect(lines).toEqual(['Budi', '5049488500001234', '3175065310890022', '3175061208160078', '15-08-1990']);
            });
        });

        describe('T3 — multi-field parser baru + regression Atlas', () => {
            it('sanitasi `=` jadi `:` pada label kartu', () => {
                const lines = parseRawMessageToLines('Kjp =5049488504454660');
                expect(lines).toEqual(['Kjp :5049488504454660']);
            });

            it('sanitasi trailing dot pada angka tanpa merusak `Hj.`', () => {
                const linesWithDot = parseRawMessageToLines('5049488500496525.  3173014602790008');
                expect(linesWithDot).toEqual(['5049488500496525', '3173014602790008']);

                const nameWithDot = parseRawMessageToLines('Hj. Siti');
                expect(nameWithDot).toEqual(['Hj. Siti']);
            });

            it('C1 full message -> split 4 baris sesuai output tervalidasi', () => {
                const input = 'Sapia\n5049488507461944 kjp 3175064905830028 nik 3175062511131032 kk';
                const lines = parseRawMessageToLines(input);

                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Sapia',
                    '5049488507461944',
                    'kjp 3175064905830028',
                    'nik 3175062511131032 kk',
                ]);
            });

            it('C2 full message -> split 4 baris sesuai output tervalidasi', () => {
                const input = 'Candra\nKjp =5049488504454660\nNik 3172044111830009                    Kk 3175060802111021';
                const lines = parseRawMessageToLines(input);

                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Candra',
                    'Kjp :5049488504454660',
                    'Nik 3172044111830009',
                    'Kk 3175060802111021',
                ]);
            });

            it('C3 full message -> split 4 baris sesuai output tervalidasi', () => {
                const input = 'Kennan\nKJP 5049488509351119                              KTP 3173015903900013                                KK 3173012011100025';
                const lines = parseRawMessageToLines(input);

                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Kennan',
                    'KJP 5049488509351119',
                    'KTP 3173015903900013',
                    'KK 3173012011100025',
                ]);
            });

            it('C4 full message -> split 4 baris sesuai output tervalidasi', () => {
                const input = 'Abdi\n5049488500496525.                          3173014602790008.                         3173011601094325';
                const lines = parseRawMessageToLines(input);

                expect(lines).toHaveLength(4);
                expect(lines).toEqual([
                    'Abdi',
                    '5049488500496525',
                    '3173014602790008',
                    '3173011601094325',
                ]);
            });

            it('split NIK+KK pada satu baris tanpa KJP', () => {
                const lines = parseRawMessageToLines('Nik 3172044111830009 Kk 3175060802111021');
                expect(lines).toEqual(['Nik 3172044111830009', 'Kk 3175060802111021']);
            });

            it('split 3 bare numbers tanpa label jadi 3 baris', () => {
                const lines = parseRawMessageToLines('5049488500496525 3173014602790008 3173011601094325');
                expect(lines).toEqual(['5049488500496525', '3173014602790008', '3173011601094325']);
            });

            it('regression: 4-baris label utuh tetap tidak berubah', () => {
                const input = 'Budi\nKJP 5049488500001234\nKTP 3173015903900013\nKK 3173012011100025';
                const lines = parseRawMessageToLines(input);
                expect(lines).toEqual([
                    'Budi',
                    'KJP 5049488500001234',
                    'KTP 3173015903900013',
                    'KK 3173012011100025',
                ]);
            });

            it('regression: single `NIK ...` tetap 1 baris', () => {
                const lines = parseRawMessageToLines('NIK 3173015903900013');
                expect(lines).toEqual(['NIK 3173015903900013']);
            });

            it('regression: single `KTP ...` tetap 1 baris', () => {
                const lines = parseRawMessageToLines('KTP 3173015903900013');
                expect(lines).toEqual(['KTP 3173015903900013']);
            });

            it('regression: 5-baris Pasarjaya utuh tetap tidak berubah', () => {
                const input = 'Budi\n5049488500001234\n3175065310890022\n3175061208160078\n15-08-1990';
                const lines = parseRawMessageToLines(input);
                expect(lines).toEqual(['Budi', '5049488500001234', '3175065310890022', '3175061208160078', '15-08-1990']);
            });

            it('regression: auto-split nama+KJP tetap jalan', () => {
                const lines = parseRawMessageToLines('Agus Dalimin 5049488500001111');
                expect(lines).toEqual(['Agus Dalimin', '5049488500001111']);
            });

            it('regression: label-merge `KTP\n317...` tetap jalan', () => {
                const lines = parseRawMessageToLines('KTP\n3175065310890022');
                expect(lines).toEqual(['KTP : 3175065310890022']);
            });
        });
    });

    describe('groupLinesToBlocks', () => {
        it('groups 4 lines into 1 block with 0 remainder (block=4)', () => {
            const { blocks, remainder } = groupLinesToBlocks(['a', 'b', 'c', 'd'], 4);
            expect(blocks).toHaveLength(1);
            expect(remainder).toHaveLength(0);
        });

        it('groups 8 lines into 2 blocks with 0 remainder (block=4)', () => {
            const { blocks, remainder } = groupLinesToBlocks(['1', '2', '3', '4', '5', '6', '7', '8'], 4);
            expect(blocks).toHaveLength(2);
            expect(remainder).toHaveLength(0);
        });

        it('groups 5 lines into 1 block with 1 remainder (block=4)', () => {
            const { blocks, remainder } = groupLinesToBlocks(['1', '2', '3', '4', '5'], 4);
            expect(blocks).toHaveLength(1);
            expect(remainder).toEqual(['5']);
        });

        it('returns no blocks and no remainder for empty input', () => {
            const { blocks, remainder } = groupLinesToBlocks([], 4);
            expect(blocks).toHaveLength(0);
            expect(remainder).toHaveLength(0);
        });

        it('groups 10 lines into 2 blocks with 0 remainder (block=5)', () => {
            const { blocks, remainder } = groupLinesToBlocks(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 5);
            expect(blocks).toHaveLength(2);
            expect(remainder).toHaveLength(0);
        });

        it('groups 7 lines into 1 block with 3 remainder (block=4)', () => {
            const { blocks, remainder } = groupLinesToBlocks(['1', '2', '3', '4', '5', '6', '7'], 4);
            expect(blocks).toHaveLength(1);
            expect(remainder).toEqual(['5', '6', '7']);
        });

        it('uses default linesPerBlock=4 when omitted', () => {
            const { blocks } = groupLinesToBlocks(['1', '2', '3', '4', '5', '6', '7', '8']);
            expect(blocks).toHaveLength(2);
        });

        it('keeps original order inside blocks', () => {
            const { blocks } = groupLinesToBlocks(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 4);
            expect(blocks[0]).toEqual(['A', 'B', 'C', 'D']);
            expect(blocks[1]).toEqual(['E', 'F', 'G', 'H']);
        });

        it('handles linesPerBlock larger than input length', () => {
            const { blocks, remainder } = groupLinesToBlocks(['A', 'B', 'C'], 5);
            expect(blocks).toEqual([]);
            expect(remainder).toEqual(['A', 'B', 'C']);
        });

        it('handles exact single chunk for custom size', () => {
            const { blocks, remainder } = groupLinesToBlocks(['A', 'B', 'C'], 3);
            expect(blocks).toEqual([['A', 'B', 'C']]);
            expect(remainder).toEqual([]);
        });
    });

    describe('parseBlockToItem', () => {
        it('parses valid 4-line DHARMAJAYA block with expected fields', () => {
            const block = makeDharmajayaBlock();
            const item = parseBlockToItem(block, 1, '2026-04-24', 'DHARMAJAYA');

            expect(item.parsed.nama).toBe('Budi Santoso');
            expect(item.parsed.no_kjp).toBe(VALID_KJP);
            expect(item.parsed.no_ktp).toBe(VALID_KTP);
            expect(item.parsed.no_kk).toBe(VALID_KK);
            expect(item.parsed.lokasi).toBe('DHARMAJAYA');
            expect(item.status).toBe('OK');
        });

        it('parses PASARJAYA block with tanggal_lahir from line 5', () => {
            const block = makePasarjayaBlock();
            const item = parseBlockToItem(block, 1, '2026-04-24', 'PASARJAYA');

            expect(item.parsed.tanggal_lahir).toBe('2015-01-01');
            expect(item.parsed.lokasi).toBe('PASARJAYA');
        });

        it('parses FOODSTATION block via same 4-line path as DHARMAJAYA', () => {
            const block = makeDharmajayaBlock(['Dewi', VALID_KJP, VALID_KTP, VALID_KK]);
            const item = parseBlockToItem(block, 2, '2026-04-24', 'FOODSTATION');

            expect(item.parsed.nama).toBe('Dewi');
            expect(item.parsed.tanggal_lahir).toBeUndefined();
            expect(item.parsed.lokasi).toBe('FOODSTATION');
        });

        it('uses specificLocation override when provided', () => {
            const block = makeDharmajayaBlock();
            const item = parseBlockToItem(block, 1, '2026-04-24', 'DHARMAJAYA', 'DHARMAJAYA - Cakung');
            expect(item.parsed.lokasi).toBe('DHARMAJAYA - Cakung');
        });

        it('uses locationContext when specificLocation is absent', () => {
            const block = makeDharmajayaBlock();
            const item = parseBlockToItem(block, 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.lokasi).toBe('DHARMAJAYA');
        });

        it('keeps raw lines in output', () => {
            const block = makeDharmajayaBlock();
            const item = parseBlockToItem(block, 3, '2026-04-24', 'DHARMAJAYA');
            expect(item.raw_lines).toEqual(block);
        });

        it('sets name_canonical from cleaned name', () => {
            const block = makeDharmajayaBlock(['  BUDI---SANTOSO  ', VALID_KJP, VALID_KTP, VALID_KK]);
            const item = parseBlockToItem(block, 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.name_canonical).toBe('budi santoso');
        });

        it('handles missing optional 5th line for non-PASARJAYA context', () => {
            const block = makeDharmajayaBlock();
            const item = parseBlockToItem(block, 1, '2026-04-24', 'FOODSTATION');
            expect(item.parsed.tanggal_lahir).toBeUndefined();
        });

        it('keeps empty fields when lines are missing', () => {
            const item = parseBlockToItem(['Nama Saja'], 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.no_kjp).toBe('');
            expect(item.parsed.no_ktp).toBe('');
            expect(item.parsed.no_kk).toBe('');
        });

        it('preserves provided index value', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(), 9, '2026-04-24', 'DHARMAJAYA');
            expect(item.index).toBe(9);
        });
    });

    describe('validateBlockToItem', () => {
        it('returns status OK with no errors for valid DHARMAJAYA block', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(), 1, 'DHARMAJAYA');
            expect(item.status).toBe('OK');
            expect(item.errors).toHaveLength(0);
        });

        it('returns required error when nama is empty', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['', VALID_KJP, VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'nama', 'required');
        });

        it('returns invalid_length when KJP has fewer than 16 digits', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '504948850001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kjp', 'invalid_length');
        });

        it('returns invalid_prefix when KJP does not start with 504948', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '1234567800001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kjp', 'invalid_prefix');
        });

        it('returns invalid_length when KTP is not 16 digits', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', VALID_KJP, '31712345', VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_ktp', 'invalid_length');
        });

        it('returns invalid_length when KK is not 16 digits', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', VALID_KJP, VALID_KTP, '31712345']), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kk', 'invalid_length');
        });

        it('returns required error for missing tanggal_lahir in PASARJAYA', () => {
            const item = validateBlockToItem(makePasarjayaBlock(['Siti', VALID_KJP, VALID_KTP, VALID_KK, '']), 1, 'PASARJAYA');
            expectHasError(item, 'tanggal_lahir', 'required');
        });

        it('returns same_as_other when KJP and KTP are the same', () => {
            const same = '5049488500001234';
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', same, same, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_ktp', 'same_as_other');
        });

        it('returns same_as_other when KTP and KK are the same', () => {
            const same = '3171234567890123';
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', VALID_KJP, same, same]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kk', 'same_as_other');
        });

        it('returns wrong_order when line3 has KK label and line4 has KTP label', () => {
            const block = ['Budi', VALID_KJP, 'KK 3171234567890123', 'KTP 3171234567890456'];
            const item = validateBlockToItem(block, 1, 'DHARMAJAYA');
            expectHasError(item, 'no_ktp', 'wrong_order');
        });

        it('parses and accepts valid PASARJAYA block with status OK', () => {
            const item = validateBlockToItem(makePasarjayaBlock(), 1, 'PASARJAYA');
            expect(item.status).toBe('OK');
            expect(item.errors).toHaveLength(0);
            expect(item.parsed.tanggal_lahir).toBe('2015-01-01');
        });

        it('returns required for missing no_kjp', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kjp', 'required');
        });

        it('returns required for missing no_ktp', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', VALID_KJP, '', VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_ktp', 'required');
        });

        it('returns required for missing no_kk', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', VALID_KJP, VALID_KTP, '']), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kk', 'required');
        });

        it('returns SKIP_FORMAT status when any error exists', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['', VALID_KJP, VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.status).toBe('SKIP_FORMAT');
        });

        it('keeps raw_lines unchanged in validation output', () => {
            const block = makeDharmajayaBlock(['Budi', VALID_KJP, VALID_KTP, VALID_KK]);
            const item = validateBlockToItem(block, 4, 'DHARMAJAYA');
            expect(item.raw_lines).toEqual(block);
        });

        it('sets parsed lokasi to DHARMAJAYA in validate path', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(), 1, 'DHARMAJAYA');
            expect(item.parsed.lokasi).toBe('DHARMAJAYA');
        });

        it('sets parsed lokasi PASARJAYA in validate path', () => {
            const item = validateBlockToItem(makePasarjayaBlock(), 1, 'PASARJAYA');
            expect(item.parsed.lokasi).toBe('PASARJAYA');
        });

        it('captures jenis_kartu for DHARMAJAYA valid card prefix', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(), 1, 'DHARMAJAYA');
            expect(item.parsed.jenis_kartu).toBe('KJP');
            expect(item.parsed.jenis_kartu_sumber).toBe('prefix');
        });

        it('includes no errors for FOODSTATION valid block', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Ani', VALID_KJP, ALT_KTP, ALT_KK]), 2, 'FOODSTATION');
            expect(item.status).toBe('OK');
            expect(item.errors).toHaveLength(0);
        });
    });

    describe('cleanName (via parseBlockToItem)', () => {
        it('strips standalone "nama" keyword', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(['nama Budi', VALID_KJP, VALID_KTP, VALID_KK]), 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('Budi');
        });

        it('keeps regular name unchanged', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(['Budi Santoso', VALID_KJP, VALID_KTP, VALID_KK]), 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('Budi Santoso');
        });

        it('collapses repeated spaces in name', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(['Budi  Santoso', VALID_KJP, VALID_KTP, VALID_KK]), 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('Budi Santoso');
        });

        it('removes nm keyword case-insensitively', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(['Nm Ani', VALID_KJP, VALID_KTP, VALID_KK]), 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('Ani');
        });

        it('removes punctuation = : ; , from name', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(['Budi:=;,, Santoso', VALID_KJP, VALID_KTP, VALID_KK]), 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('Budi Santoso');
        });

        it('removes blacklisted location terms from name', () => {
            const item = parseBlockToItem(makeDharmajayaBlock(['Budi Kedoya', VALID_KJP, VALID_KTP, VALID_KK]), 1, '2026-04-24', 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('Budi');
        });
    });

    describe('extractCardNumber (via validateBlockToItem)', () => {
        it('extracts card number from "KJP 504948..." text', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', 'KJP 5049488500001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.no_kjp).toBe('5049488500001234');
        });

        it('extracts card number when line is only number', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '5049488500001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.no_kjp).toBe('5049488500001234');
        });

        it('accepts and keeps 18-digit number', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '504948850000123456', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.no_kjp).toBe('504948850000123456');
            expect(item.errors.some((err) => err.type === 'invalid_length')).toBe(false);
        });

        it('extracts prefix-aligned digits from noisy text segment', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', 'ID: 00-50494885 0000 1234 xyz', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.no_kjp).toBe('5049488500001234');
        });

        it('limits extraction to maximum 18 digits from prefix position', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '5049488500001234567899', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.no_kjp).toBe('504948850000123456');
        });
    });

    describe('resolveJenisKartu (via validateBlockToItem)', () => {
        it('sets jenis_kartu=KJP for mocked KJP prefix 50494885', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '5049488500001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.jenis_kartu).toBe('KJP');
        });

        it('uses manual text type when prefix is not recognized by mock', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', 'LANSIA 5049488600001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.jenis_kartu).toBe('LANSIA');
            expect(item.parsed.jenis_kartu_sumber).toBe('manual');
        });

        it('uses koreksi source when manual type differs from forced main KJP prefix', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', 'LANSIA 5049488500001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.jenis_kartu).toBe('KJP');
            expect(item.parsed.jenis_kartu_sumber).toBe('koreksi');
        });

        it('flags invalid_card_type when manual text is unknown and prefix is not 50494885', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', 'XKARTU 5049488600001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kjp', 'invalid_card_type');
        });

        it('flags unknown_card_type when prefix unknown and no manual text', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', '5049488600001234', VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expectHasError(item, 'no_kjp', 'unknown_card_type');
        });
    });

    describe('buildParsedFields (via validateBlockToItem)', () => {
        it('builds PASARJAYA parsed fields with tanggal_lahir', () => {
            const item = validateBlockToItem(makePasarjayaBlock(), 1, 'PASARJAYA');
            const parsed: ParsedFields = item.parsed;
            expect(parsed.tanggal_lahir).toBe('2015-01-01');
            expect(parsed.jenis_kartu).toBeUndefined();
        });

        it('builds DHARMAJAYA parsed fields with jenis_kartu', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(), 1, 'DHARMAJAYA');
            expect(item.parsed.jenis_kartu).toBe('KJP');
            expect(item.parsed.tanggal_lahir).toBeUndefined();
        });

        it('extracts KTP and KK digits from labeled lines in validate path', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['Budi', VALID_KJP, 'KTP: 3171234567890123', 'KK: 3171234567890456']), 1, 'DHARMAJAYA');
            expect(item.parsed.no_ktp).toBe('3171234567890123');
            expect(item.parsed.no_kk).toBe('3171234567890456');
        });

        it('creates canonical name from cleaned name in validate path', () => {
            const item = validateBlockToItem(makeDharmajayaBlock(['nama  BUDI  SANTOSO', VALID_KJP, VALID_KTP, VALID_KK]), 1, 'DHARMAJAYA');
            expect(item.parsed.nama).toBe('BUDI SANTOSO');
            expect(item.parsed.name_canonical).toBe('budi santoso');
        });
    });

    describe('applyDuplicateNameHardBlockInMessage (pipeline precondition, indirect)', () => {
        it('produces same canonical names across two valid blocks for duplicate-name stage', () => {
            const raw = [
                'Budi Santoso',
                ALT_KJP,
                ALT_KTP,
                ALT_KK,
                '  BUDI   SANTOSO  ',
                '5049488500006666',
                '3171234567890777',
                '3171234567890666',
            ].join('\n');

            const lines = parseRawMessageToLines(raw);
            const { blocks, remainder } = groupLinesToBlocks(lines, 4);
            const items = blocks.map((block, idx) => validateBlockToItem(block, idx + 1, 'DHARMAJAYA'));

            expect(remainder).toEqual([]);
            expect(items).toHaveLength(2);
            expect(items[0].status).toBe('OK');
            expect(items[1].status).toBe('OK');
            expect(items[0].parsed.name_canonical).toBe('budi santoso');
            expect(items[1].parsed.name_canonical).toBe('budi santoso');
        });
    });
});
