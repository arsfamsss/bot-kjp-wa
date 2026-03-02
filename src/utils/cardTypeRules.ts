const CARD_TYPE_ALIASES: Record<string, string> = {
    kjp: 'KJP',
    'kartu jakarta pintar': 'KJP',
    lansia: 'LANSIA',
    klj: 'LANSIA',
    lns: 'LANSIA',
    ls: 'LANSIA',
    'lanjut usia': 'LANSIA',
    rusun: 'RUSUN',
    'rumah susun': 'RUSUN',
    disabilitas: 'DISABILITAS',
    difabel: 'DISABILITAS',
    cacat: 'DISABILITAS',
    dasawisma: 'DASAWISMA',
    dawis: 'DASAWISMA',
    pekerja: 'PEKERJA',
    pkja: 'PEKERJA',
    'guru honorer': 'GURU HONORER',
    guru: 'GURU HONORER',
    honorer: 'GURU HONORER',
    pjlp: 'PJLP',
    kaj: 'KAJ',
};

export const CARD_TYPE_CHOICES = [
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

export function normalizeCardTypeName(text: string): string | null {
    if (!text) return null;
    const lower = text.toLowerCase().trim().replace(/\s+/g, ' ');
    const exact = CARD_TYPE_ALIASES[lower];
    if (exact) return exact;

    const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let bestAlias: string | null = null;
    let bestIndex = -1;
    let bestLength = -1;

    for (const alias of Object.keys(CARD_TYPE_ALIASES)) {
        const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'g');

        for (;;) {
            const match = re.exec(lower);
            if (!match) break;
            const currentIndex = match.index;
            const currentLength = alias.length;
            const isBetter =
                currentIndex > bestIndex ||
                (currentIndex === bestIndex && currentLength > bestLength);

            if (isBetter) {
                bestAlias = alias;
                bestIndex = currentIndex;
                bestLength = currentLength;
            }
        }
    }

    return bestAlias ? CARD_TYPE_ALIASES[bestAlias] : null;
}

export function getCardTypeChoicesText(): string {
    return 'KJP - LANSIA - RUSUN - DISABILITAS - DASAWISMA - PEKERJA - GURU HONORER - PJLP - KAJ';
}
