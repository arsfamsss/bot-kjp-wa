import { getCardPrefixType } from './cardPrefixConfig';

export function resolveCardTypeLabel(noKjp?: string | null, jenisKartu?: string | null): string {
    const manual = (jenisKartu || '').trim();
    if (manual) return manual;

    const digits = (noKjp || '').replace(/\D/g, '');
    if (digits.length >= 8) {
        const byPrefix = getCardPrefixType(digits.substring(0, 8));
        if (byPrefix) return byPrefix;
    }

    return 'KJP';
}
