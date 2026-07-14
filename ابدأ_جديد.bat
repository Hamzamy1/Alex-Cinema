@echo off
chcp 65001 >nul
title Alex Cinema
echo ============================
echo Alex Cinema - تشغيل الموقع
echo ============================
echo.
echo جاري إيقاف أي سيرفر قديم...
taskkill /f /im node.exe 2>nul
timeout /t 2 >nul
echo.
echo جاري تشغيل السيرفر...
start /min node server.js
timeout /t 4 >nul
start http://localhost:3000
echo تم فتح الموقع في المتصفح
exit
