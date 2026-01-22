export function parseFlexibleDate(input: string): string | null {
    if (!input) return null;

    const raw = input.trim();
    // Regex Patterns
    // 1. DDMMYYYY or DDMMYY (e.g., 01012025, 010125)
    // Avoid matching if it looks like a phone number or NIK (too long), but here we trust the line context (Line 5)
    const compactMatch = raw.match(/^(\d{1,2})(\d{2})(\d{2,4})$/);

    // 2. DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
    const separatorMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);

    // 3. DD Month YYYY (Indonesian)
    // Matches: 01 Januari 2025, 1 Jan 25, 1-Jan-2025
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

    // Regex for text month: capture DD, MonthName, YYYY
    const textMonthMatch = raw.match(/^(\d{1,2})[\s\-\/]+([a-zA-Z]+)[\s\-\/]+(\d{2,4})$/);

    let day = 0, month = 0, year = 0;

    if (compactMatch) {
        day = parseInt(compactMatch[1]);
        month = parseInt(compactMatch[2]);
        year = parseInt(compactMatch[3]);
    } else if (separatorMatch) {
        day = parseInt(separatorMatch[1]);
        month = parseInt(separatorMatch[2]);
        year = parseInt(separatorMatch[3]);
    } else if (textMonthMatch) {
        day = parseInt(textMonthMatch[1]);
        const monthStr = textMonthMatch[2].toUpperCase().trim();
        year = parseInt(textMonthMatch[3]);

        // Find month index
        month = monthNames[monthStr] || 0;
    } else {
        return null;
    }

    // Date Validation
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    // Year Normalization (Handle 2 digits: 25 -> 2025)
    // Assumption: < 50 is 20xx, >= 50 is 19xx (e.g. 99 -> 1999)
    if (year < 100) {
        if (year < 50) year += 2000;
        else year += 1900;
    }

    if (year < 1900 || year > 2100) return null; // Logic range

    // Format to YYYY-MM-DD
    const yyyy = year.toString();
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
}
