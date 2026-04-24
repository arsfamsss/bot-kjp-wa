import { describe, test, expect, mock, beforeEach } from 'bun:test';

const supabaseResolved = new URL('../supabase.ts', import.meta.url).pathname;
const ktpMasterResolved = new URL('../services/ktpMasterLookup.ts', import.meta.url).pathname;
const cardPrefixResolved = new URL('../utils/cardPrefixConfig.ts', import.meta.url).pathname;

const supabaseModuleMock = {
    checkBlockedKjpBatch: async (items: unknown[]) => items,
    checkBlockedKkBatch: async (items: unknown[]) => items,
    checkBlockedKtpBatch: async (items: unknown[]) => items,
    checkBlockedLocationBatch: async (items: unknown[]) => items,
    checkDuplicateForItem: async () => null,
    checkDuplicatesBatch: async (items: unknown[]) => items,
};

mock.module('../supabase', () => supabaseModuleMock);
mock.module('../supabase.ts', () => supabaseModuleMock);
mock.module(supabaseResolved, () => supabaseModuleMock);

const ktpLookupMock = {
    lookupNikRegionFromMaster: () => ({ found: false }),
    ensureKtpMasterLoaded: () => {},
};

mock.module('../services/ktpMasterLookup', () => ktpLookupMock);
mock.module('../services/ktpMasterLookup.ts', () => ktpLookupMock);
mock.module(ktpMasterResolved, () => ktpLookupMock);

const cardPrefixMock = {
    getCardPrefixType: () => null,
    getCardPrefixMap: () => ({}),
};

mock.module('../utils/cardPrefixConfig', () => cardPrefixMock);
mock.module('../utils/cardPrefixConfig.ts', () => cardPrefixMock);
mock.module(cardPrefixResolved, () => cardPrefixMock);

const { processRawMessageToLogJson } = await import('../parser');

let receivedAt: Date;

beforeEach(() => {
    receivedAt = new Date('2026-04-24T03:00:00.000Z');
});

function baseParams(overrides?: Partial<{
    text: string;
    senderPhone: string;
    messageId: string | null;
    tanggal: string;
    processingDayKey: string;
    locationContext: 'PASARJAYA' | 'DHARMAJAYA' | 'FOOD_STATION';
    specificLocation: string;
}>) {
    return {
        text: '',
        senderPhone: '628111111111',
        messageId: 'msg-001',
        receivedAt,
        tanggal: '2026-04-24',
        processingDayKey: '2026-04-24',
        ...overrides,
    };
}

describe('processRawMessageToLogJson pipeline', () => {
    test('single valid DHARMAJAYA 4-line message -> 1 OK item and stats.ok_count=1', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049481234567890',
            '3171234567890123',
            '3171098765432109',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items).toHaveLength(1);
        expect(result.items[0].status).toBe('OK');
        expect(result.stats.ok_count).toBe(1);
        expect(result.stats.skip_format_count).toBe(0);
    });

    test('single valid PASARJAYA 5-line message -> tanggal_lahir parsed', async () => {
        const text = [
            'Siti Aminah',
            '5049482234567890',
            '3171234567891123',
            '3171098765432110',
            '01-01-2000',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'PASARJAYA' }));

        expect(result.items).toHaveLength(1);
        expect(result.items[0].status).toBe('OK');
        expect(result.items[0].parsed.tanggal_lahir).toBe('2000-01-01');
        expect(result.stats.ok_count).toBe(1);
    });

    test('single valid FOOD_STATION 4-line message -> 1 OK item and lokasi FOOD STATION', async () => {
        const text = [
            'Ahmad Wijaya',
            'KJP 5049483234567890',
            '3171234567892123',
            '3171098765432111',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({
            text,
            locationContext: 'FOOD_STATION',
            specificLocation: 'FOOD STATION',
        }));

        expect(result.items).toHaveLength(1);
        expect(result.items[0].status).toBe('OK');
        expect(result.items[0].parsed.lokasi).toBe('FOOD STATION');
        expect(result.lokasi).toBe('FOOD STATION');
    });

    test('multi-person DHARMAJAYA 8-line message -> 2 OK items', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049484234567890',
            '3171234567893123',
            '3171098765432112',
            'Ani Lestari',
            'KJP 5049485234567890',
            '3171234567894123',
            '3171098765432113',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items).toHaveLength(2);
        expect(result.items[0].status).toBe('OK');
        expect(result.items[1].status).toBe('OK');
        expect(result.stats.ok_count).toBe(2);
        expect(result.stats.total_blocks).toBe(2);
    });

    test('invalid KJP too short -> SKIP_FORMAT with invalid_length error', async () => {
        const text = [
            'Budi Santoso',
            'KJP 504948123456789',
            '3171234567890123',
            '3171098765432109',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items[0].status).toBe('SKIP_FORMAT');
        expect(result.items[0].errors.some((e) => e.field === 'no_kjp' && e.type === 'invalid_length')).toBe(true);
        expect(result.stats.skip_format_count).toBe(1);
    });

    test('invalid KTP too short -> SKIP_FORMAT with invalid_length error', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049486234567890',
            '317123456789012',
            '3171098765432109',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items[0].status).toBe('SKIP_FORMAT');
        expect(result.items[0].errors.some((e) => e.field === 'no_ktp' && e.type === 'invalid_length')).toBe(true);
        expect(result.stats.skip_format_count).toBe(1);
    });

    test('mixed valid + invalid blocks -> stats split correctly', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049487234567890',
            '3171234567895123',
            '3171098765432114',
            'Ani Lestari',
            'KJP 5049487234567',
            '3171234567896123',
            '3171098765432115',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items).toHaveLength(2);
        expect(result.stats.ok_count).toBe(1);
        expect(result.stats.skip_format_count).toBe(1);
        expect(result.stats.total_blocks).toBe(2);
    });

    test('remainder lines for 4-line format -> failed_remainder_lines populated', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049488234567890',
            '3171234567897123',
            '3171098765432116',
            'BARIS SISA',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items).toHaveLength(1);
        expect(result.failed_remainder_lines).toEqual(['BARIS SISA']);
    });

    test('duplicate KJP in same message -> second item SKIP_FORMAT duplicate_in_message', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049489234567890',
            '3171234567898123',
            '3171098765432117',
            'Ani Lestari',
            'KJP 5049489234567890',
            '3171234567899123',
            '3171098765432118',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items).toHaveLength(2);
        expect(result.items[0].status).toBe('OK');
        expect(result.items[1].status).toBe('SKIP_FORMAT');
        expect(result.items[1].errors.some((e) => e.field === 'no_kjp' && e.type === 'duplicate_in_message')).toBe(true);
    });

    test('duplicate name in same message -> hard block on second item', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049481334567890',
            '3171234567890223',
            '3171098765432119',
            'Budi Santoso',
            'KJP 5049482334567890',
            '3171234567891223',
            '3171098765432120',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items).toHaveLength(2);
        expect(result.items[1].status).toBe('SKIP_FORMAT');
        expect(result.items[1].errors.some((e) => e.field === 'nama' && e.type === 'duplicate_in_message')).toBe(true);
    });

    test('duplicate KTP in same message -> second item SKIP_FORMAT duplicate_in_message', async () => {
        const text = [
            'Rina Putri',
            'KJP 5049483334567890',
            '3171234567892223',
            '3171098765432121',
            'Dewi Kartika',
            'KJP 5049484334567890',
            '3171234567892223',
            '3171098765432122',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items[0].status).toBe('OK');
        expect(result.items[1].status).toBe('SKIP_FORMAT');
        expect(result.items[1].errors.some((e) => e.field === 'no_ktp' && e.type === 'duplicate_in_message')).toBe(true);
    });

    test('duplicate KK in same message is allowed when other fields differ', async () => {
        const text = [
            'Rina Putri',
            'KJP 5049485334567890',
            '3171234567893223',
            '3171098765432999',
            'Dewi Kartika',
            'KJP 5049486334567890',
            '3171234567894223',
            '3171098765432999',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'DHARMAJAYA' }));

        expect(result.items[0].status).toBe('OK');
        expect(result.items[1].status).toBe('OK');
        expect(result.stats.ok_count).toBe(2);
    });

    test('specificLocation overrides parsed.lokasi for all parsed items', async () => {
        const text = [
            'Rina Putri',
            'KJP 5049487334567890',
            '3171234567895223',
            '3171098765432123',
            'Dewi Kartika',
            'KJP 5049488334567890',
            '3171234567896223',
            '3171098765432124',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({
            text,
            locationContext: 'DHARMAJAYA',
            specificLocation: 'DHARMAJAYA - BLOK A',
        }));

        expect(result.items.every((it) => it.parsed.lokasi === 'DHARMAJAYA - BLOK A')).toBe(true);
        expect(result.lokasi).toBe('DHARMAJAYA - BLOK A');
    });

    test('logJson.lokasi uses locationContext when specificLocation not provided', async () => {
        const text = [
            'Siti Aminah',
            '5049489334567890',
            '3171234567897223',
            '3171098765432125',
            '01-02-2001',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({ text, locationContext: 'PASARJAYA' }));

        expect(result.lokasi).toBe('PASARJAYA');
        expect(result.items[0].parsed.lokasi).toBe('PASARJAYA');
    });

    test('message_id defaults to null when omitted', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049481434567890',
            '3171234567898223',
            '3171098765432126',
        ].join('\n');

        const params = baseParams({ text, locationContext: 'DHARMAJAYA' });
        const { messageId, ...withoutMessageId } = params;
        void messageId;

        const result = await processRawMessageToLogJson(withoutMessageId);

        expect(result.message_id).toBeNull();
    });

    test('maps sender metadata and received_at ISO correctly', async () => {
        const text = [
            'Budi Santoso',
            'KJP 5049482434567890',
            '3171234567899223',
            '3171098765432127',
        ].join('\n');

        const result = await processRawMessageToLogJson(baseParams({
            text,
            senderPhone: '628199999999',
            messageId: 'wa-xyz',
            locationContext: 'DHARMAJAYA',
        }));

        expect(result.sender_phone).toBe('628199999999');
        expect(result.message_id).toBe('wa-xyz');
        expect(result.received_at).toBe(receivedAt.toISOString());
        expect(result.tanggal).toBe('2026-04-24');
        expect(result.processing_day_key).toBe('2026-04-24');
    });
});
