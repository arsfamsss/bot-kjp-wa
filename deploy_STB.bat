@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
:: ===== CONFIG =====
set "BRANCH=main"
set "REMOTE=origin"
set "BOT_NAME=bot-kjp"
set "STB_USER=root"
set "STB_HOST=192.168.100.104"
set "STB_DIR=/root/bot-kjp"
set "SSH_KEY=%USERPROFILE%\.ssh\id_ed25519"
if not exist "%SSH_KEY%" set "SSH_KEY=%USERPROFILE%\.ssh\id_rsa"
set "SSH_OPTS=-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
title Deploy %BOT_NAME% ke STB
color 0A
echo ========================================
echo   DEPLOY %BOT_NAME% KE STB (SAFE MODE)
echo ========================================
echo.
:: ===== Precheck tools =====
where git >nul 2>nul || (echo [ERROR] Git tidak ada di PATH.& goto :fail)
where ssh >nul 2>nul || (echo [ERROR] SSH tidak ada di PATH.& goto :fail)
where scp >nul 2>nul || (echo [ERROR] SCP tidak ada di PATH.& goto :fail)
if not exist "%SSH_KEY%" (
  echo [ERROR] SSH key tidak ditemukan:
  echo         %USERPROFILE%\.ssh\id_ed25519
  echo         %USERPROFILE%\.ssh\id_rsa
  goto :fail
)
git rev-parse --is-inside-work-tree >nul 2>nul || (
  echo [ERROR] Jalankan dari folder repo git.
  goto :fail
)
ssh -i "%SSH_KEY%" %SSH_OPTS% %STB_USER%@%STB_HOST% "echo SSH_OK" >nul 2>nul || (
  echo [ERROR] SSH ke STB gagal. Cek key / host.
  goto :fail
)
:: ===== Show current status =====
echo [INFO] Git status:
git status --short
echo.
echo [GIT] Pull latest (%REMOTE%/%BRANCH%)...
git pull --rebase --autostash %REMOTE% %BRANCH% || goto :fail

:: ===== Stage only safe scope =====
echo [GIT] Menambahkan file deploy scope aman...
git add src package.json package-lock.json tsconfig.json .env 2>nul

:: ===== Commit if there are staged changes =====
git diff --cached --quiet
if errorlevel 1 (
  set /p "commit_msg=Masukkan pesan commit (Indonesia): "
  if "!commit_msg!"=="" set "commit_msg=update bot"

  echo [GIT] Commit...
  git commit -m "!commit_msg!" || goto :fail
  echo [GIT] Push...
  git push %REMOTE% %BRANCH% || goto :fail
) else (
  echo [INFO] Tidak ada staged changes. Lewati commit/push.
)
echo.
  echo [GIT] Push...
  git push %REMOTE% %BRANCH% || goto :fail
) else (
  echo [INFO] Tidak ada staged changes. Lewati commit/push.
)
echo.
echo [DEPLOY] Upload file ke STB...
scp -i "%SSH_KEY%" %SSH_OPTS% -r src package.json package-lock.json tsconfig.json .env %STB_USER%@%STB_HOST%:%STB_DIR%/ || goto :fail
echo.
echo [DEPLOY] Install + Build + Restart hanya %BOT_NAME%...
ssh -i "%SSH_KEY%" %SSH_OPTS% %STB_USER%@%STB_HOST% "cd %STB_DIR% && npm install && npm run build && pm2 restart %BOT_NAME% --update-env && pm2 save" || goto :fail
echo.
echo ========================================
echo [SUKSES] Deploy selesai. Bot lain tidak direstart.
echo ========================================
pause
exit /b 0

:fail
echo.
echo ========================================
echo [GAGAL] Deploy berhenti. Cek error di atas.
echo ========================================
pause
exit /b 1
