import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.restore();

const actualHttps = await import('https');
const httpsRequestGuardMock = mock(() => {
    throw new Error('https.request should not be called in parse helper tests');
});

let moduleSeq = 0;

async function loadFoodStationStatusCheckModule() {
    mock.module('https', () => ({
        ...actualHttps,
        default: {
            ...(actualHttps as any).default,
            request: httpsRequestGuardMock,
        },
        request: httpsRequestGuardMock,
    }));

    moduleSeq += 1;
    return import(`../services/foodStationStatusCheck.ts?foodstation-status-test=${moduleSeq}`);
}

describe('foodStationStatusCheck - parseDetailFromHtml', () => {
    beforeEach(() => {
        httpsRequestGuardMock.mockReset();
    });

    test('extracts tanggalPengambilan and jamPengambilan from capture-area html', async () => {
        const { parseDetailFromHtml } = await loadFoodStationStatusCheckModule();

        const html = `
            <div id="capture-area">
              <h3>Registration Success</h3>
              <p>Tanggal Pengambilan: 28-04-2025</p>
              <p>Jam: 07.00 - 09.00 WIB</p>
            </div>
        `;

        expect(parseDetailFromHtml(html)).toEqual({
            tanggalPengambilan: '28-04-2025',
            jamPengambilan: '07.00 - 09.00 WIB',
        });
    });

    test('returns undefined detail for not-found html', async () => {
        const { parseDetailFromHtml } = await loadFoodStationStatusCheckModule();

        const html = '<div>Data NIK tidak ditemukan</div>';
        expect(parseDetailFromHtml(html)).toBeUndefined();
    });

    test('returns undefined when html has no capture-area', async () => {
        const { parseDetailFromHtml } = await loadFoodStationStatusCheckModule();

        const html = '<div><p>Registration Success</p><p>Tanggal: 28-04-2025</p></div>';
        expect(parseDetailFromHtml(html)).toBeUndefined();
    });

    test('handles empty html body', async () => {
        const { parseDetailFromHtml } = await loadFoodStationStatusCheckModule();

        expect(parseDetailFromHtml('')).toBeUndefined();
    });
});
