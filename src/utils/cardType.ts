const DHARMAJAYA_PREFIX_MAP: Record<string, string> = {
    '50494885': 'KJP',
    '50494886': 'KJP',
    '50494812': 'KJP',
    '50494837': 'DASAWISMA',
    '50494836': 'PEKERJA',
    '50494835': 'LANSIA',
    '50494827': 'KAJ',
    '50494834': 'DISABILITAS',
    '50494840': 'RUSUN',
};

export function resolveCardTypeLabel(noKjp?: string | null, jenisKartu?: string | null): string {
    const manual = (jenisKartu || '').trim();
    if (manual) return manual;

    const digits = (noKjp || '').replace(/\D/g, '');
    if (digits.length >= 8) {
        const byPrefix = DHARMAJAYA_PREFIX_MAP[digits.substring(0, 8)];
        if (byPrefix) return byPrefix;
    }

    return 'KJP';
}
