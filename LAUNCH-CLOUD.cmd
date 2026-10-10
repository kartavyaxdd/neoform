@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="--check" goto check
echo NEOFORM permanent cloud setup -- your own FREE Cloudflare account required.
echo This does not buy anything or upload local QA workouts.
call npm ci
if errorlevel 1 goto failed
call npm run typecheck
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
node scripts/cloud-launch.mjs --login %*
if errorlevel 1 goto failed
pause
exit /b 0
:check
node scripts/cloud-launch.mjs --check
exit /b %errorlevel%
:failed
echo Setup stopped. Read the error above -- no successful launch is being claimed.
pause
exit /b 1
