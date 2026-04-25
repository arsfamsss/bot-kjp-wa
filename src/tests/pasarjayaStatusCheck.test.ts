import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.restore();

const actualHttps = await import('https');
const httpsRequestGuardMock = mock(() => {
    throw new Error('https.request should not be called in pure-function tests');
});

let moduleSeq = 0;

async function loadPasarjayaStatusCheckModule() {
    mock.module('https', () => ({
        ...actualHttps,
        default: {
            ...(actualHttps as any).default,
            request: httpsRequestGuardMock,
        },
        request: httpsRequestGuardMock,
    }));

    moduleSeq += 1;
    return import(`../services/pasarjayaStatusCheck.ts?pasarjaya-status-test=${moduleSeq}`);
}

describe('pasarjayaStatusCheck - pure helpers', () => {
    beforeEach(() => {
        httpsRequestGuardMock.mockReset();
    });

    test('extractCsrfToken extracts token from hidden input', async () => {
        const { extractCsrfToken } = await loadPasarjayaStatusCheckModule();

        const html = '<input type="hidden" name="_token" value="abc123token">';
        expect(extractCsrfToken(html)).toBe('abc123token');
    });

    test('extractCsrfToken extracts token from csrf meta tag', async () => {
        const { extractCsrfToken } = await loadPasarjayaStatusCheckModule();

        const html = '<meta name="csrf-token" content="xyz-token">';
        expect(extractCsrfToken(html)).toBe('xyz-token');
    });

    test('parseDetailFromHtml parses lokasi, tanggalPengambilan, and nomorUrut', async () => {
        const { parseDetailFromHtml } = await loadPasarjayaStatusCheckModule();

        const html = `
            <div>
              <h3>REGISTRASI BERHASIL</h3>
              <p>NOMOR URUT: 42</p>
              <p>TANGGAL PENGAMBILAN: 28-04-2025</p>
              <p>Lokasi: Jakgrosir Kedoya</p>
            </div>
        `;

        expect(parseDetailFromHtml(html)).toEqual({
            lokasi: 'Jakgrosir Kedoya',
            tanggalPengambilan: '28-04-2025',
            nomorUrut: '42',
        });
    });

    test('parseDetailFromHtml returns empty detail for not found html', async () => {
        const { parseDetailFromHtml } = await loadPasarjayaStatusCheckModule();

        const html = '<div><p>data tidak ditemukan</p></div>';
        expect(parseDetailFromHtml(html)).toEqual({});
    });

    test('mergeCookieString merges old and new cookies correctly', async () => {
        const { mergeCookieString } = await loadPasarjayaStatusCheckModule();

        const merged = mergeCookieString('session=old; token=aaa', [
            'token=bbb; Path=/; HttpOnly',
            'xsrf=xyz; Path=/',
        ]);

        expect(merged).toBe('session=old; token=bbb; xsrf=xyz');
    });

    test('mergeCookieString handles empty and null-like cookie inputs', async () => {
        const { mergeCookieString } = await loadPasarjayaStatusCheckModule();

        expect(mergeCookieString('', [])).toBe('');
        expect(mergeCookieString('', ['', 'sid=123; Path=/', ''])).toBe('sid=123');
    });
});
