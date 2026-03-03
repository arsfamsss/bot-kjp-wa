@echo off
setlocal EnableExtensions
cd /d "%~dp0"

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
echo (Masukkan password: openwifi jika diminta)
scp -r src package.json tsconfig.json root@192.168.100.104:/root/bot-kjp/ || goto :fail

echo.
echo [2/3] Install ^& Build di STB...
echo (Masukkan password lagi jika diminta)
ssh -t root@192.168.100.104 "cd /root/bot-kjp && echo [STB] Installing dependencies... && npm install && echo [STB] Building project... && npm run build && echo [STB] Restarting Bot... && pm2 restart bot-kjp && pm2 save" || goto :fail

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
