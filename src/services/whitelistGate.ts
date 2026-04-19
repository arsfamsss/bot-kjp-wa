import { ADMIN_PHONES_RAW } from '../config/messages';
import { getWhitelistedPhoneEntry } from '../supabase';
import { normalizePhone } from '../utils/contactUtils';

const ADMIN_PHONES = new Set(ADMIN_PHONES_RAW.map(normalizePhone).filter(Boolean));

export type SenderAccessDecision = {
    allowed: boolean;
    via: 'admin' | 'whitelist' | 'rejected';
    phone_number?: string;
    name?: string | null;
};

export function isAdminPhone(phoneRaw: string): boolean {
    const normalized = normalizePhone(phoneRaw);
    return normalized.length > 0 && ADMIN_PHONES.has(normalized);
}

export async function resolveSenderAccess(phoneRaw: string): Promise<SenderAccessDecision> {
    if (isAdminPhone(phoneRaw)) {
        return {
            allowed: true,
            via: 'admin',
            phone_number: normalizePhone(phoneRaw),
            name: null,
        };
    }

    const whitelistEntry = await getWhitelistedPhoneEntry(phoneRaw);
    if (whitelistEntry) {
        return {
            allowed: true,
            via: 'whitelist',
            phone_number: whitelistEntry.phone_number,
            name: whitelistEntry.name,
        };
    }

    return {
        allowed: false,
        via: 'rejected',
    };
}
