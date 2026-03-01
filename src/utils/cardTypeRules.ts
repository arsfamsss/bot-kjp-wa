const CARD_TYPE_ALIASES: Record<string, string> = {
    kjp: 'KJP',
    'kartu jakarta pintar': 'KJP',
    lansia: 'LANSIA',
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
    return CARD_TYPE_ALIASES[lower] ?? null;
}

export function getCardTypeChoicesText(): string {
    return 'KJP - LANSIA - RUSUN - DISABILITAS - DASAWISMA - PEKERJA - GURU HONORER - PJLP - KAJ';
}
