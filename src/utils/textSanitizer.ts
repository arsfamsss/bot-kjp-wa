// src/utils/textSanitizer.ts

const INVISIBLE_UNICODE_REGEX = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const UNICODE_SPACE_REGEX = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

export function sanitizeInboundText(raw: string): string {
    return (raw || '')
        .toString()
        .normalize('NFKC')
        .replace(INVISIBLE_UNICODE_REGEX, '')
        .replace(UNICODE_SPACE_REGEX, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

export function sanitizeInlineText(raw: string): string {
    return sanitizeInboundText(raw)
        .replace(/\s+/g, ' ')
        .trim();
}
