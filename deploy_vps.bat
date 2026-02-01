@echo off
title Update Bot Auto
color 0A

echo [AUTO] Connecting to VPS...
ssh -t root@149.28.146.42 "update-bot bot-wa-1 kjp-bot"

echo.
echo [DONE] Selesai.
pause
