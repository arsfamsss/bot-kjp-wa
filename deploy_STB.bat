@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "STB_USER=root"
set "STB_HOST=192.168.100.104"
set "STB_DIR=/root/bot-kjp"
set "SSH_KEY=%USERPROFILE%\.ssh\id_ed25519"
if not exist "%SSH_KEY%" set "SSH_KEY=%USERPROFILE%\.ssh\id_rsa"
set "SSH_OPTS=-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new"

title Deploy ke STB (192.168.100.104)
color 0A

echo ========================================
echo        DEPLOY BOT KJP KE VPS
echo ========================================
echo.

where git >nul 2>nul || (
    echo [ERROR] Git tidak ditemukan di PATH.
    goto :fail
)

where scp >nul 2>nul || (
    echo [ERROR] SCP tidak ditemukan. Install OpenSSH Client dulu.
    goto :fail
)

where ssh >nul 2>nul || (
    echo [ERROR] SSH tidak ditemukan. Install OpenSSH Client dulu.
    goto :fail
)

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
    echo Jalankan SETUP_SSH_KEY_STB.bat sekali, lalu coba deploy lagi.
    goto :fail
)

git rev-parse --is-inside-work-tree >nul 2>nul || (
    echo [ERROR] File ini harus dijalankan dari folder repo git.
    goto :fail
)

echo [GIT] Mempersiapkan Commit...
set /p "commit_msg=Masukkan Pesan Commit: "

if "%commit_msg%"=="" (
    echo [WARNING] Pesan commit kosong! Menggunakan default: "update bot"
    set "commit_msg=update bot"
)

echo [GIT] Menambahkan semua perubahan...
git add . || goto :fail

echo [GIT] Melakukan commit...
git commit -m "%commit_msg%"
if errorlevel 1 (
    echo [ERROR] Commit gagal atau tidak ada perubahan untuk di-commit.
    git status --short
    goto :fail
)

echo [GIT] Mengirim ke GitHub...
git push origin main || goto :fail

echo [GIT] Selesai push! Lanjut deploy...
echo.

echo [INFO] Commit Terakhir:
echo ----------------------------------------
git --no-pager log -1 --format="  Commit : %%h  Tanggal: %%ci  Pesan  : %%s"
echo ----------------------------------------
echo.

echo [INFO] File yang Berubah (vs commit sebelumnya):
echo ----------------------------------------
git --no-pager diff --name-only HEAD~1 2>nul || echo   (tidak bisa membandingkan)
echo ----------------------------------------
echo.

echo [1/3] Mengirim file terbaru ke STB...
scp -i "%SSH_KEY%" %SSH_OPTS% -r src package.json tsconfig.json %STB_USER%@%STB_HOST%:%STB_DIR%/ || goto :fail

echo.
echo [2/3] Install ^& Build di STB...
ssh -i "%SSH_KEY%" %SSH_OPTS% -t %STB_USER%@%STB_HOST% "cd %STB_DIR% && echo [STB] Installing dependencies... && npm install && echo [STB] Building project... && npm run build && echo [STB] Restarting Bot... && pm2 restart bot-kjp && pm2 save" || goto :fail

echo.
echo ========================================
echo [3/3] SELESAI! Bot sudah di-restart.
echo ========================================
pause
exit /b 0

:fail
echo.
echo ========================================
echo [GAGAL] Deploy berhenti. Baca pesan ERROR di atas.
echo ========================================
pause
exit /b 1
