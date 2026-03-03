@echo off
setlocal EnableExtensions

set "STB_USER=root"
set "STB_HOST=192.168.100.104"
set "SSH_KEY=%USERPROFILE%\.ssh\id_ed25519"
if not exist "%SSH_KEY%" set "SSH_KEY=%USERPROFILE%\.ssh\id_rsa"
set "SSH_OPTS=-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

title CEK KONDISI STB SERVER
color 0B
cls

if not exist "%SSH_KEY%" (
    echo [ERROR] SSH key tidak ditemukan di:
    echo         %USERPROFILE%\.ssh\id_ed25519
    echo         %USERPROFILE%\.ssh\id_rsa
    echo.
    echo Jalankan SETUP_SSH_KEY_STB.bat sekali untuk setup passwordless login.
    goto :fail
)

ssh -i "%SSH_KEY%" %SSH_OPTS% %STB_USER%@%STB_HOST% "echo SSH key ok" >nul 2>nul || (
    echo [ERROR] Login passwordless belum aktif untuk %STB_USER%@%STB_HOST%.
    echo Jalankan SETUP_SSH_KEY_STB.bat sekali, lalu coba lagi.
    goto :fail
)

echo ==================================================
echo           DASHBOARD KONDISI BOT (STB)
echo ==================================================
echo.
echo [1] Mengambil data dari STB (%STB_HOST%)...
echo --------------------------------------------------

ssh -i "%SSH_KEY%" %SSH_OPTS% -t %STB_USER%@%STB_HOST% "echo '[1] KESEHATAN SISTEM'; printf '   Suhu CPU : '; cat /sys/class/thermal/thermal_zone0/temp | awk '{printf \"%%.1f C\n\", $1/1000}'; printf '   Uptime   : '; uptime -p; echo ''; echo '[2] MEMORI (RAM)'; free -m | awk 'NR==2{printf \"   Total    : %%s MB\n   Terpakai : %%s MB\n   Sisa     : %%s MB\n\", $2, $3, $7}'; echo ''; echo '[3] PENYIMPANAN'; df -h | grep '/$' | awk '{printf \"   Total    : %%s\n   Terpakai : %%s\n   Sisa     : %%s\n\", $2, $3, $4}'; echo ''; echo '[4] STATUS BOT (PM2)'; pm2 list" || goto :fail

echo.
echo ==================================================
echo Selesai.
echo ==================================================
pause
exit /b 0

:fail
echo.
echo ==================================================
echo [GAGAL] Gagal akses STB tanpa password.
echo ==================================================
pause
exit /b 1
