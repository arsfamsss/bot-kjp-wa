import { describe, it, expect } from 'bun:test';
import { parseFlexibleDate, looksLikeDate } from '../utils/dateParser';

describe('parseFlexibleDate', () => {
  const validCases = [
    { input: '20-01-2025', expected: '2025-01-20', description: 'dash separated' },
    { input: '20/01/2025', expected: '2025-01-20', description: 'slash separated' },
    { input: '20.01.2025', expected: '2025-01-20', description: 'dot separated' },
    { input: '20012025', expected: '2025-01-20', description: 'compact 8 digits' },
    { input: '200125', expected: '2025-01-20', description: 'compact 6 digits year < 50' },
    { input: '200190', expected: '1990-01-20', description: 'compact 6 digits year >= 50' },
    { input: '20 01 2025', expected: '2025-01-20', description: 'space separated' },
    { input: '20 Januari 2025', expected: '2025-01-20', description: 'full text month Indonesian' },
    { input: '20-Jan-2025', expected: '2025-01-20', description: 'abbreviated month with dashes' },
    { input: '20  -  01  -  2025', expected: '2025-01-20', description: 'messy separators and spaces' },
    { input: 'TGL LAHIR 20-01-2025', expected: '2025-01-20', description: 'label TGL LAHIR stripped' },
    { input: 'TANGGAL 20-01-2025', expected: '2025-01-20', description: 'label TANGGAL stripped' },
    { input: '01-12-2000', expected: '2000-12-01', description: 'leading zero day and month' },
    { input: '31-12-1999', expected: '1999-12-31', description: 'end of year date' },
    { input: '20 DESEMBER 2025', expected: '2025-12-20', description: 'text month DES' },
    { input: '20 Peb 2025', expected: '2025-02-20', description: 'text month PEB maps to February' },
    { input: '20 Mei 2025', expected: '2025-05-20', description: 'text month MEI maps to May' },
    { input: '20 Agt 2025', expected: '2025-08-20', description: 'text month AGT maps to August' },
  ];

  validCases.forEach(({ input, expected, description }) => {
    it(`returns ${expected} for ${description}`, () => {
      expect(parseFlexibleDate(input)).toBe(expected);
    });
  });

  const invalidCases: Array<{ input: string | null; description: string }> = [
    { input: '32-01-2025', description: 'day above 31' },
    { input: '20-13-2025', description: 'month above 12' },
    { input: '20-00-2025', description: 'month zero' },
    { input: '', description: 'empty string' },
    { input: 'abc', description: 'non-date text' },
    { input: null, description: 'null input' },
    { input: '20-01-1899', description: 'year below 1900' },
    { input: '20-01-2101', description: 'year above 2100' },
  ];

  invalidCases.forEach(({ input, description }) => {
    it(`returns null for ${description}`, () => {
      expect(parseFlexibleDate(input as unknown as string)).toBeNull();
    });
  });
});

describe('looksLikeDate', () => {
  const trueCases = [
    { input: '20-01-2025', description: 'dash separated' },
    { input: '20 Januari 2025', description: 'text month Indonesian' },
    { input: '20012025', description: 'compact 8 digits valid day/month' },
    { input: '200125', description: 'compact 6 digits valid day/month' },
    { input: '20/01/2025', description: 'slash separated' },
    { input: 'TGL 20-01-2025', description: 'label stripped' },
  ];

  trueCases.forEach(({ input, description }) => {
    it(`returns true for ${description}`, () => {
      expect(looksLikeDate(input)).toBeTrue();
    });
  });

  const falseCases = [
    { input: 'Budi Santoso', description: 'regular name' },
    { input: '5049488500001234', description: '16 digit number not 6 or 8' },
    { input: '', description: 'empty string' },
    { input: '99991234', description: 'invalid day and month in 8 digits' },
  ];

  falseCases.forEach(({ input, description }) => {
    it(`returns false for ${description}`, () => {
      expect(looksLikeDate(input)).toBeFalse();
    });
  });
});
