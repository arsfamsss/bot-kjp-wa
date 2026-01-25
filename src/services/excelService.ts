import XLSX from 'xlsx-js-style';

export const generateKJPExcel = (data: any[]): Buffer => {
    // 1. Prepare Header and Data
    // Header: No, Nama, No KJP, No KTP, No KK, Tgl Lahir
    const headers = ["No", "Nama", "No KJP", "No KTP", "No KK", "Tgl Lahir"];

    // Map data to array of arrays
    const rows = data.map((item, index) => [
        index + 1, // No
        item.nama || "",
        item.no_kjp || "", // Explicitly string to prevent scientific notation
        item.no_ktp || "",
        item.no_kk || "",
        item.tanggal_lahir || "-" // Taken directly from DB, no parsing from NIK
    ]);

    // Combine header and rows for data calculation
    const wsData = [headers, ...rows];

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
