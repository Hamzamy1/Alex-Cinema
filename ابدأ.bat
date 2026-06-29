@echo off
echo تشغيل سينما...
start /min /b node server.js
timeout /t 3 /nobreak >nul
start http://localhost:3000
exit
