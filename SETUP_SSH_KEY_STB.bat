@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "STB_USER=root"
set "STB_HOST=192.168.100.104"
set "KEY_PRIV=%USERPROFILE%\.ssh\id_ed25519"
set "KEY_PUB=%USERPROFILE%\.ssh\id_ed25519.pub"

title Setup SSH Key STB (passwordless)
color 0E

where ssh >nul 2>nul || (
    echo [ERROR] SSH tidak ditemukan. Install OpenSSH Client dulu.
    goto :fail
)

where scp >nul 2>nul || (
    echo [ERROR] SCP tidak ditemukan. Install OpenSSH Client dulu.
    goto :fail
)

where ssh-keygen >nul 2>nul || (
    echo [ERROR] ssh-keygen tidak ditemukan. Install OpenSSH Client dulu.
    goto :fail
)

if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"

if not exist "%KEY_PUB%" (
    echo [INFO] SSH key belum ada. Membuat key baru: %KEY_PRIV%
    ssh-keygen -t ed25519 -f "%KEY_PRIV%" -N "" -C "stb-key"
    if errorlevel 1 goto :fail
)

echo [INFO] Mengirim public key ke STB (sekali ini butuh password).
echo        Password STB: openwifi

scp "%KEY_PUB%" %STB_USER%@%STB_HOST%:/tmp/stb_authorized_key.pub || goto :fail
ssh -t %STB_USER%@%STB_HOST% "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && cat /tmp/stb_authorized_key.pub >> ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys && rm -f /tmp/stb_authorized_key.pub" || goto :fail

echo [INFO] Verifikasi login tanpa password...
ssh -i "%KEY_PRIV%" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new %STB_USER%@%STB_HOST% "echo SSH key OK" || goto :fail

echo.
echo ========================================
echo [SUKSES] Passwordless SSH aktif.
echo Gunakan:
echo   ssh -i "%KEY_PRIV%" %STB_USER%@%STB_HOST%
echo ========================================
pause
exit /b 0

:fail
echo.
echo ========================================
echo [GAGAL] Setup SSH key gagal. Cek koneksi/STB.
echo ========================================
pause
exit /b 1
