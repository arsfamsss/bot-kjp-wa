import * as XLSX from 'xlsx';

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

    // Combine header and rows
    const wsData = [headers, ...rows];

    // 2. Create Worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 3. Formatting (Auto-width)
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

    // 4. Create Workbook and Append Sheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Harian");

    // 5. Write to Buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
};
