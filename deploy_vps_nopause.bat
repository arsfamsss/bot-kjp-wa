@echo off
title Deploy ke STB (192.168.100.104)
color 0A

echo ========================================
echo        DEPLOY BOT KJP KE VPS (NO PAUSE)
echo ========================================
echo.

echo [INFO] Commit Terakhir:
echo ----------------------------------------
git log -1 --format="  Commit : %%h  Tanggal: %%ci  Pesan  : %%s"
echo ----------------------------------------
echo.

echo [INFO] File yang Berubah (vs commit sebelumnya):
echo ----------------------------------------
git diff --name-only HEAD~1 2>nul || echo   (tidak bisa membandingkan)
echo ----------------------------------------
echo.

echo [1/3] Mengirim file terbaru ke STB...
echo (Masukkan password: openwifi jika diminta)
scp -r src package.json tsconfig.json root@192.168.100.104:/root/bot-kjp/

echo.
echo [2/3] Install ^& Build di STB...
echo (Masukkan password lagi jika diminta)
ssh -t root@192.168.100.104 "cd /root/bot-kjp && echo [STB] Installing dependencies... && npm install && echo [STB] Building project... && npm run build && echo [STB] Restarting Bot... && pm2 restart bot-kjp && pm2 save"

echo.
echo ========================================
echo [3/3] SELESAI! Bot sudah di-restart.
echo ========================================
