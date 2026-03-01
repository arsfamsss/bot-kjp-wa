import XLSX from 'xlsx-js-style';
import { resolveCardTypeLabel } from '../utils/cardType';

export const generateKJPExcel = (data: any[]): Buffer => {
    // 1. Prepare Header and Data
    // Header: No, Nama, No KJP, No KTP, No KK, Tgl Lahir, Lokasi
    const headers = ["No", "Nama", "Jenis/No Kartu", "No KTP", "No KK", "Tgl Lahir", "Lokasi"];

    // Map data to array of arrays
    const rows = data.map((item, index) => {
        // Logika Penentuan Lokasi:
        // 1. Jika di database sudah ada kolom lokasi dengan format spesifik, pakai itu.
        //    Format: "PASARJAYA - Jakgrosir Kedoya" atau "DHARMAJAYA"
        // 2. Jika tidak, atau format lama, cek apakah ada tanggal lahir?
        //    - Ada Tgl Lahir = PASARJAYA
        //    - Tidak Ada Tgl Lahir = DHARMAJAYA DURI KOSAMBI

        let lokasiFinal = "DHARMAJAYA DURI KOSAMBI"; // Default

        if (item.lokasi && item.lokasi.startsWith('PASARJAYA')) {
            // Gunakan lokasi spesifik dari database (mis: "PASARJAYA - Jakgrosir Kedoya")
            lokasiFinal = item.lokasi;
        } else if (item.lokasi && item.lokasi.startsWith('DHARMAJAYA')) {
            // Handle format baru: "DHARMAJAYA - Kapuk" atau fallback "DHARMAJAYA" saja
            if (item.lokasi === 'DHARMAJAYA') {
                lokasiFinal = "DHARMAJAYA DURI KOSAMBI";
            } else {
                lokasiFinal = item.lokasi; // "DHARMAJAYA - Kapuk", dll
            }
        } else if (!item.lokasi) {
            // Fallback logic jika kolom lokasi kosong (data lama)
            if (item.tanggal_lahir && item.tanggal_lahir.length > 5) {
                lokasiFinal = "PASARJAYA";
            }
        }

        return [
            index + 1, // No
            // Format Nama: "Sender Name (Registered Name)" agar sama dengan TXT
            // Jika sender_name ada dan beda dengan nama terdaftar
            item.sender_name && item.sender_name !== item.nama
                ? `${item.sender_name} (${item.nama})`
                : (item.nama || ""),
            formatCardCell(item.no_kjp, item.jenis_kartu),
            item.no_ktp || "",
            item.no_kk || "",
            formatDateCell(item.tanggal_lahir, item.no_ktp), // Format Date
            lokasiFinal
        ];
    });

    // Combine header and rows for data calculation
    const wsData = [headers, ...rows];

    // Helper functions
    function formatDateCell(dbDate: string | null, nik: string): string {
        // 1. Try DB Date first
        if (dbDate && dbDate.includes('-')) {
            // Assume YYYY-MM-DD from DB -> Convert to DD/MM/YYYY
            try {
                const [y, m, d] = dbDate.split('-');
                return `${d}/${m}/${y}`;
            } catch { return dbDate; }
        }

        // 2. Try Parse NIK if DB Date is missing
        // ONLY parse if date is absolutely missing or "-"
        if ((!dbDate || dbDate === '-') && nik && nik.length >= 12) {
            try {
                // NIK: 31 73 01 [DD] [MM] [YY] ...
                // DD > 40 means Female (Subtract 40)
                let day = parseInt(nik.substring(6, 8));
                const month = parseInt(nik.substring(8, 10));
                let year = parseInt(nik.substring(10, 12));

                if (day > 40) day -= 40;

                // Simple year pivot logic
                // If year > current yy (e.g. 26), assume 19xx, else 20xx
                // Or just assume 20xx for small numbers?
                // Better: 
                // KJP is mostly students (2000+) or parents (1970+).
                // Let's use pivot 30. If > 30 -> 19xx. <= 30 -> 20xx.
                const fullYear = year > 30 ? 1900 + year : 2000 + year;

                const dStr = String(day).padStart(2, '0');
                const mStr = String(month).padStart(2, '0');

                // Validate date validity (e.g. month 1-12, day 1-31)
                if (day > 0 && day <= 31 && month > 0 && month <= 12) {
                    return `${dStr}/${mStr}/${fullYear}`;
                }
            } catch (e) {
                // ignore error
            }
        }

        return dbDate || "-";
    }

    function formatCardCell(cardNumber: string | null, cardType: string | null): string {
        if (!cardNumber) return "";
        const jenis = resolveCardTypeLabel(cardNumber, cardType);
        return `${jenis} ${cardNumber}`;
    }

    // 2. Create Worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 3. Styling Logic (Header Yellow + Border All)
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");

    // Define styles
    const headerStyle = {
        fill: { fgColor: { rgb: "FFFF00" } }, // Red=255, Green=255, Blue=0 -> Yellow
        font: { bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" }
        }
    };

    const dataStyle = {
        border: {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" }
        }
    };

    // Apply styles
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellAddress]) continue;

            if (R === 0) { // Header Row
                ws[cellAddress].s = headerStyle;
            } else { // Data Rows
                ws[cellAddress].s = dataStyle;
            }
        }
    }

    // 4. Formatting (Auto-width)
    // Calculate max width for each column
    const colWidths = headers.map((header, i) => {
        let maxLen = header.length;
        rows.forEach(row => {
            const cellVal = String(row[i] || "");
            if (cellVal.length > maxLen) maxLen = cellVal.length;
        });
        return { wch: maxLen + 2 }; // Add padding
    });

    ws['!cols'] = colWidths;

    // 5. Create Workbook and Append Sheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Harian");

    // 6. Write to Buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
};
