@echo off
setlocal
chcp 65001 >nul 2>&1

set "BASE_DIR=%~dp0"
set "PY_SCRIPT=%BASE_DIR%CetakPDF_Update_data_no_kjp.py"
set "PDF_FILE=%BASE_DIR%CetakPDF_Update_data_no_kjp.pdf"

echo ========================================
echo       CETAK PDF KONTAK ORANG TUA
echo ========================================
echo.
echo Sedang membaca data terbaru dari CSV dan membuat PDF...
echo.

if not exist "%PY_SCRIPT%" (
    echo [ERROR] File Python tidak ditemukan:
    echo %PY_SCRIPT%
    echo.
    if not defined CI pause
    exit /b 1
)

python "%PY_SCRIPT%"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo [OK] PDF berhasil dibuat!
    echo File: %PDF_FILE%
) else (
    echo [ERROR] Terjadi kesalahan saat membuat PDF. Exit code: %RC%
)

echo.
if not defined CI pause
exit /b %RC%
