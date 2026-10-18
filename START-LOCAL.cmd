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
set "WRANGLER_SEND_METRICS=false"
call npm.cmd exec -- wrangler d1 migrations apply neoform --config wrangler.single-user.jsonc --local --persist-to .local-state
if errorlevel 1 goto failed
echo NEOFORM SINGLE-USER / THIS PC: http://127.0.0.1:8788
echo Opens the existing account without sign-in. Do not share or tunnel this server.
echo Keep this window open. This is not phone/PC cloud hosting.
node scripts\local-gateway.mjs
exit /b %errorlevel%
:failed
echo Local startup stopped. Read the error above.
pause
exit /b 1
