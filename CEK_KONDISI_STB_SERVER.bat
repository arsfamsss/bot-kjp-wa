@echo off
title CEK KONDISI STB SERVER
color 0B
cls

echo ==================================================
echo           DASHBOARD KONDISI BOT (STB)
echo ==================================================
echo.
echo [1] Mengambil data dari STB (192.168.100.104)...
echo --------------------------------------------------

ssh -t root@192.168.100.104 "echo '[1] KESEHATAN SISTEM'; printf '   Suhu CPU : '; cat /sys/class/thermal/thermal_zone0/temp | awk '{printf \"%%.1f C\n\", $1/1000}'; printf '   Uptime   : '; uptime -p; echo ''; echo '[2] MEMORI (RAM)'; free -m | awk 'NR==2{printf \"   Total    : %%s MB\n   Terpakai : %%s MB\n   Sisa     : %%s MB\n\", $2, $3, $7}'; echo ''; echo '[3] PENYIMPANAN'; df -h | grep '/$' | awk '{printf \"   Total    : %%s\n   Terpakai : %%s\n   Sisa     : %%s\n\", $2, $3, $4}'; echo ''; echo '[4] STATUS BOT (PM2)'; pm2 list"

echo.
echo ==================================================
echo Selesai.
echo ==================================================
pause
