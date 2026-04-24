import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetWhitelistedPhoneEntry = mock(() => Promise.resolve(null));

mock.module('../supabase', () => ({
    getWhitelistedPhoneEntry: mockGetWhitelistedPhoneEntry,
}));

import { isAdminPhone, resolveSenderAccess } from '../services/whitelistGate';

describe('whitelistGate - isAdminPhone', () => {
    it('returns true for known admin numbers', () => {
        expect(isAdminPhone('085641411818')).toBe(true);
        expect(isAdminPhone('08568511113')).toBe(true);
    });

    it('returns true for admin number with 62 prefix', () => {
        expect(isAdminPhone('6285641411818')).toBe(true);
    });

    it('returns false for non-admin numbers and empty input', () => {
        expect(isAdminPhone('081234567890')).toBe(false);
        expect(isAdminPhone('')).toBe(false);
    });
});

describe('whitelistGate - resolveSenderAccess', () => {
    beforeEach(() => {
        mockGetWhitelistedPhoneEntry.mockReset();
        mockGetWhitelistedPhoneEntry.mockImplementation(() => Promise.resolve(null));
    });

    it('returns admin access for admin phone', async () => {
        const result = await resolveSenderAccess('085641411818');

        expect(result).toEqual({
            allowed: true,
            via: 'admin',
            phone_number: '6285641411818',
            name: null,
        });
    });

    it('returns whitelist access when phone is in whitelist', async () => {
        const whitelistEntry = { phone_number: '081234567890', name: 'John Doe' };
        mockGetWhitelistedPhoneEntry.mockImplementation(() => Promise.resolve(whitelistEntry));

        const result = await resolveSenderAccess('081234567890');

        expect(mockGetWhitelistedPhoneEntry).toHaveBeenCalledWith('081234567890');
        expect(result).toEqual({
            allowed: true,
            via: 'whitelist',
            phone_number: '081234567890',
            name: 'John Doe',
        });
    });

    it('rejects non-admin, non-whitelisted phone', async () => {
        const result = await resolveSenderAccess('081111111111');

        expect(mockGetWhitelistedPhoneEntry).toHaveBeenCalledWith('081111111111');
        expect(result).toEqual({ allowed: false, via: 'rejected' });
    });
});
