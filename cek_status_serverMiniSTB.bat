@echo off
title Cek Status Bot
color 0B

echo [AUTO] Mengecek status server...
ssh -t root@192.168.100.104 "pm2 list && echo '' && echo [INFO] Storage Usage: && df -h | grep '/dev/root' && echo '' && echo [INFO] RAM Usage: && free -h"

echo.
pause
