@echo off
setlocal EnableExtensions

set "STB_USER=root"
set "STB_HOST=192.168.100.104"
set "SSH_KEY=%USERPROFILE%\.ssh\id_ed25519"
if not exist "%SSH_KEY%" set "SSH_KEY=%USERPROFILE%\.ssh\id_rsa"

title Akses Terminal STB (passwordless)
color 0A

if not exist "%SSH_KEY%" (
    echo [ERROR] SSH key tidak ditemukan.
    echo Jalankan SETUP_SSH_KEY_STB.bat dulu.
    pause
    exit /b 1
)

echo ========================================
echo      TERMINAL STB %STB_HOST%
echo ========================================
echo.
echo Ketik exit untuk keluar.
echo.

ssh -i "%SSH_KEY%" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -t %STB_USER%@%STB_HOST%
if errorlevel 1 (
    echo.
    echo [ERROR] Gagal login tanpa password.
    echo Jalankan SETUP_SSH_KEY_STB.bat untuk aktivasi key.
    pause
    exit /b 1
)

exit /b 0
