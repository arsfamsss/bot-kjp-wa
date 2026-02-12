@echo off
title CEK KESEHATAN STB (192.168.100.104)
color 0A

echo ========================================
echo        CEK STATUS STB SERVER
echo ========================================
echo.

echo [1] Mengambil data RAM, Disk, dan CPU...
echo ----------------------------------------
ssh root@192.168.100.104 "echo '=== RAM ==='; free -h; echo ''; echo '=== DISK ==='; df -h | grep '/$'; echo ''; echo '=== UPTIME ==='; uptime; echo ''; echo '=== SUHU CPU ==='; cat /sys/class/thermal/thermal_zone0/temp | awk '{print \$1/1000 \" C\"}'"

echo.
echo ========================================
echo Selesai.
echo ========================================
pause
