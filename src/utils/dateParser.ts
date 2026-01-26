/**
 * Parse flexible date formats to YYYY-MM-DD
 * Supports:
 * - 20-01-2025, 20/01/2025, 20.01.2025
 * - 20012025, 200125 (compact)
 * - 20 01 2025 (spaces)
 * - 20 Januari 2025, 20-Jan-2025
 * - 20  -  01  -  2025 (messy spacing/separators)
 * - 20 - 01 - 2025
 */
export function parseFlexibleDate(input: string): string | null {
    if (!input) return null;

    // Normalize: trim, collapse multiple spaces, uppercase
    let raw = input.trim().toUpperCase();

    // 0. Remove common labels (TGL, LAHIR, TANGGAL, etc.)
    // Regex: remove "TGL", "TANGGAL", "LAHIR", "LHR", "THN", "TAHUN", "DATE", "BIRTH"
    // and cleanup potential delimiters (: or -) appearing after them
    raw = raw.replace(/\b(TGL|TANGGAL|LAHIR|LHR|THN|TAHUN|DATE|BIRTH)\b/g, '')
        .replace(/[:=]/g, ' ') // remove colons
        .trim();

    // Month names mapping
    const monthNames: { [key: string]: number } = {
        'JAN': 1, 'JANUARI': 1, 'JANUARY': 1,
        'PEB': 2, 'FEB': 2, 'FEBRUARI': 2, 'FEBRUARY': 2,
        'MAR': 3, 'MARET': 3, 'MARCH': 3,
        'APR': 4, 'APRIL': 4,
        'MEI': 5, 'MAY': 5,
        'JUN': 6, 'JUNI': 6, 'JUNE': 6,
        'JUL': 7, 'JULI': 7, 'JULY': 7,
        'AGU': 8, 'AGT': 8, 'AGUSTUS': 8, 'AUGUST': 8,
        'SEP': 9, 'SEPT': 9, 'SEPTEMBER': 9,
        'OKT': 10, 'OCT': 10, 'OKTOBER': 10, 'OCTOBER': 10,
        'NOP': 11, 'NOV': 11, 'NOVEMBER': 11,
        'DES': 12, 'DEC': 12, 'DESEMBER': 12, 'DECEMBER': 12
    };

    let day = 0, month = 0, year = 0;
    let matched = false;

    // Strategy 1: Check for text month first (e.g., "20 Januari 2025", "20-Jan-2025")
    // Remove messy separators around text: "20   -  JANUARI  -  2025" → "20 JANUARI 2025"
    const normalizedForTextMonth = raw.replace(/[\s\-\/\.]+/g, ' ').trim();
    const textMonthMatch = normalizedForTextMonth.match(/^(\d{1,2})\s+([A-Z]+)\s+(\d{2,4})$/);

    if (textMonthMatch) {
        day = parseInt(textMonthMatch[1]);
        const monthStr = textMonthMatch[2];
        year = parseInt(textMonthMatch[3]);
        month = monthNames[monthStr] || 0;
        if (month > 0) matched = true;
    }

    // Strategy 2: Numeric with separators (messy or clean)
    // "20-01-2025", "20 / 01 / 2025", "20  -  01  -  2025", "20 01 2025"
    if (!matched) {
        // Replace all separators (-, /, ., spaces) with single space, then split
        const normalizedNumeric = raw.replace(/[\s\-\/\.]+/g, ' ').trim();
        const parts = normalizedNumeric.split(' ');

        if (parts.length === 3) {
            const d = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const y = parseInt(parts[2]);

            if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                day = d;
                month = m;
                year = y;
                matched = true;
            }
        }
    }

    // Strategy 3: Compact format (DDMMYYYY or DDMMYY)
    // "20012025" → 20-01-2025
    // "200125" → 20-01-2025
    if (!matched) {
        // Remove all non-digits
        const digitsOnly = raw.replace(/\D/g, '');

        // 8 digits: DDMMYYYY
        if (digitsOnly.length === 8) {
            day = parseInt(digitsOnly.substring(0, 2));
            month = parseInt(digitsOnly.substring(2, 4));
            year = parseInt(digitsOnly.substring(4, 8));
            matched = true;
        }
        // 6 digits: DDMMYY
        else if (digitsOnly.length === 6) {
            day = parseInt(digitsOnly.substring(0, 2));
            month = parseInt(digitsOnly.substring(2, 4));
            year = parseInt(digitsOnly.substring(4, 6));
            matched = true;
        }
    }

    if (!matched) return null;

    // Validate day and month
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    // Year normalization (2-digit to 4-digit)
    // < 50 → 20xx, >= 50 → 19xx
    if (year < 100) {
        if (year < 50) year += 2000;
        else year += 1900;
    }

    // Sanity check year range
    if (year < 1900 || year > 2100) return null;

    // Format to YYYY-MM-DD
    const yyyy = year.toString();
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Check if a string looks like it could be a date (for format detection)
 * More lenient than parseFlexibleDate - just checks structure
 */
export function looksLikeDate(input: string): boolean {
    if (!input) return false;

    const raw = input.trim().toUpperCase();

    // Remove common labels first just like in parseFlexibleDate
    const rawClean = raw.replace(/\b(TGL|TANGGAL|LAHIR|LHR|THN|TAHUN|DATE|BIRTH)\b/g, '')
        .replace(/[:=]/g, ' ')
        .trim();

    // Contains month name?
    const monthKeywords = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'MAY', 'JUN', 'JUL',
        'AGU', 'AGT', 'SEP', 'OKT', 'OCT', 'NOV', 'NOP', 'DES', 'DEC'];
    if (monthKeywords.some(m => rawClean.includes(m))) return true;

    // Remove all non-alphanumeric to check patterns
    const cleaned = rawClean.replace(/[\s\-\/\.]+/g, ' ').trim();

    // Pattern: DD MM YYYY (with spaces) - Strict anchors are fine if we cleaned tokens, 
    // BUT better to rely on finding a sequence
    // Check for "DD MM YYYY" sequence
    if (/\b\d{1,2}\s+\d{1,2}\s+\d{2,4}\b/.test(cleaned)) return true;

    // Pattern: DD-MM-YYYY style (original separators) - Search anywhere
    if (/\d{1,2}[\s\-\/\.]+\d{1,2}[\s\-\/\.]+\d{2,4}/.test(rawClean)) return true;

    // Pattern: DDMMYYYY (8 digits) or DDMMYY (6 digits)
    const digitsOnly = rawClean.replace(/\D/g, '');
    if (digitsOnly.length === 6 || digitsOnly.length === 8) {
        // Check if it looks like a valid date
        const d = parseInt(digitsOnly.substring(0, 2));
        const m = parseInt(digitsOnly.substring(2, 4));
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return true;
    }

    return false;
}
