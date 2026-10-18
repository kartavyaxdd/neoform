@echo off
setlocal
cd /d "%~dp0"
set "LAN_IP=%~1"
if not defined LAN_IP set "LAN_IP=192.168.1.2"
set "CI=1"
set "WRANGLER_SEND_METRICS=false"
if not exist node_modules\wrangler\bin\wrangler.js (
 call npm ci
 if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
call npm exec -- wrangler d1 migrations apply neoform --local --persist-to .local-state
if errorlevel 1 goto failed
echo NEOFORM LAN: http://%LAN_IP%:8789
echo Keep this window open and use the same trusted Wi-Fi. No internet hosting.
call npm exec -- wrangler dev --local --ip %LAN_IP% --port 8789 --inspector-ip 127.0.0.1 --inspector-port 9239 --persist-to .local-state --show-interactive-dev-session=false
exit /b %errorlevel%
:failed
echo LAN startup failed. Read the error above.
pause
exit /b 1
