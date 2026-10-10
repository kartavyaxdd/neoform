@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules\wrangler\bin\wrangler.js (
 call npm ci
 if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
set "CI=1"
node node_modules\wrangler\bin\wrangler.js d1 migrations apply neoform --local --persist-to .local-state
if errorlevel 1 goto failed
set "CI="
echo NEOFORM LOCAL ONLY: http://127.0.0.1:8788
echo Keep this window open. This is not phone/PC cloud hosting.
node node_modules\wrangler\bin\wrangler.js dev --local --ip 127.0.0.1 --port 8788 --persist-to .local-state
exit /b %errorlevel%
:failed
echo Local startup stopped. Read the error above.
pause
exit /b 1
