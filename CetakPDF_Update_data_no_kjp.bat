@echo off
chcp 65001 >nul
echo ========================================
echo       CETAK PDF KONTAK ORANG TUA
echo ========================================
echo.
echo Sedang membaca data terbaru dari CSV dan membuat PDF...
echo.

python "D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS\CetakPDF_Update_data_no_kjp.py"

if %errorlevel% equ 0 (
    echo.
    echo ✅ PDF Berhasil Dibuat!
    echo File: D:\BOT\BOT INPUT DATA KJP DI WA OTOMATIS\CetakPDF_Update_data_no_kjp.pdf
) else (
    echo.
    echo ❌ Terjadi kesalahan saat membuat PDF.
)
echo.
pause
