import { describe, it, expect } from 'bun:test';
import { sanitizeInboundText, sanitizeInlineText } from '../utils/textSanitizer';

describe('sanitizeInboundText', () => {
    it('returns normal text unchanged', () => {
        expect(sanitizeInboundText('Hello World')).toBe('Hello World');
    });

    it('removes zero-width spaces', () => {
        expect(sanitizeInboundText('Hello\u200BWorld')).toBe('HelloWorld');
    });

    it('removes BOM characters', () => {
        expect(sanitizeInboundText('\uFEFFHello')).toBe('Hello');
    });

    it('replaces NBSP with regular space', () => {
        expect(sanitizeInboundText('Hello\u00A0World')).toBe('Hello World');
    });

    it('replaces multiple unicode spaces with regular spaces', () => {
        expect(sanitizeInboundText('A\u2000B\u2001C')).toBe('A B C');
    });

    it('normalizes CRLF to LF', () => {
        expect(sanitizeInboundText('Line1\r\nLine2')).toBe('Line1\nLine2');
    });

    it('normalizes CR to LF', () => {
        expect(sanitizeInboundText('Line1\rLine2')).toBe('Line1\nLine2');
    });

    it('handles mixed invisible chars, unicode spaces, and CRLF', () => {
        expect(sanitizeInboundText('Hello\u200B\u00A0World\r\n')).toBe('Hello World\n');
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeInboundText('')).toBe('');
    });

    it('returns empty string for null or undefined', () => {
        expect(sanitizeInboundText(undefined as unknown as string)).toBe('');
        expect(sanitizeInboundText(null as unknown as string)).toBe('');
    });

    it('removes right-to-left marks', () => {
        expect(sanitizeInboundText('\u200FHello')).toBe('Hello');
    });
});

describe('sanitizeInlineText', () => {
    it('collapses multiple spaces', () => {
        expect(sanitizeInlineText('Hello   World')).toBe('Hello World');
    });

    it('trims leading and trailing whitespace', () => {
        expect(sanitizeInlineText('  Hello  ')).toBe('Hello');
    });

    it('normalizes tabs and spaces', () => {
        expect(sanitizeInlineText('Hello\t\tWorld')).toBe('Hello World');
    });

    it('handles combined invisible and extra spaces', () => {
        expect(sanitizeInlineText('  Hello\u200B  World  ')).toBe('Hello World');
    });
});
