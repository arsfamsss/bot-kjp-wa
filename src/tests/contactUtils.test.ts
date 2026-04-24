import { describe, it, expect } from 'bun:test';
import { normalizePhone, normalizeManualPhone, extractManualPhone, isLidJid } from '../utils/contactUtils';

describe('normalizePhone', () => {
  it('converts leading 0 to 62', () => {
    expect(normalizePhone('08123456789')).toBe('628123456789');
  });

  it('keeps number starting with 62', () => {
    expect(normalizePhone('628123456789')).toBe('628123456789');
  });

  it('keeps number without 0 or 62 prefix', () => {
    expect(normalizePhone('8123456789')).toBe('8123456789');
  });

  it('strips plus sign for 62-prefixed number', () => {
    expect(normalizePhone('+628123456789')).toBe('628123456789');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePhone('')).toBe('');
  });

  it('returns empty string for non-digit input', () => {
    expect(normalizePhone('abc')).toBe('');
  });

  it('handles null as empty string', () => {
    expect(normalizePhone(null as unknown as string)).toBe('');
  });

  it('handles undefined as empty string', () => {
    expect(normalizePhone(undefined as unknown as string)).toBe('');
  });
});

describe('normalizeManualPhone', () => {
  it('normalizes +62 prefix', () => {
    expect(normalizeManualPhone('+628123456789')).toBe('628123456789');
  });

  it('normalizes leading 0 to 62', () => {
    expect(normalizeManualPhone('08123456789')).toBe('628123456789');
  });

  it('adds 62 for numbers starting with 8', () => {
    expect(normalizeManualPhone('8123456789')).toBe('628123456789');
  });

  it('keeps number already starting with 62', () => {
    expect(normalizeManualPhone('628123456789')).toBe('628123456789');
  });

  it('returns null when digits shorter than 9', () => {
    expect(normalizeManualPhone('12345')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeManualPhone('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizeManualPhone(null as unknown as string)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeManualPhone(undefined as unknown as string)).toBeNull();
  });

  it('strips non-digit separators and normalizes', () => {
    expect(normalizeManualPhone('0812-3456-789')).toBe('628123456789');
  });
});

describe('extractManualPhone', () => {
  it('extracts from explicit nohp command', () => {
    expect(extractManualPhone('nohp: 08123456789')).toBe('628123456789');
  });

  it('extracts from explicit hp command without spaces', () => {
    expect(extractManualPhone('hp:08123456789')).toBe('628123456789');
  });

  it('extracts from nomor command with +62 prefix', () => {
    expect(extractManualPhone('nomor: +628123456789')).toBe('628123456789');
  });

  it('extracts from nowa command', () => {
    expect(extractManualPhone('nowa:08123456789')).toBe('628123456789');
  });

  it('extracts embedded number with 08 prefix in sentence', () => {
    expect(extractManualPhone('kirim ke 08123456789 ya')).toBe('628123456789');
  });

  it('extracts embedded number with 62 prefix in sentence', () => {
    expect(extractManualPhone('tolong kirim ke 628123456789 ya')).toBe('628123456789');
  });

  it('finds number embedded in sentence with +62 prefix', () => {
    expect(extractManualPhone('kirim ke +628123456789 ya')).toBe('628123456789');
  });

  it('returns null when no number is present', () => {
    expect(extractManualPhone('tidak ada nomor')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractManualPhone('')).toBeNull();
  });
});

describe('isLidJid', () => {
  it('returns true for lid jid', () => {
    expect(isLidJid('12345@lid')).toBe(true);
  });

  it('returns false for regular whatsapp jid', () => {
    expect(isLidJid('628123456789@s.whatsapp.net')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLidJid('')).toBe(false);
  });

  it('handles null as false', () => {
    expect(isLidJid(null as unknown as string)).toBe(false);
  });
});
