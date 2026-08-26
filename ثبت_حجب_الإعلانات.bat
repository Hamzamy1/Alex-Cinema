@echo off
chcp 65001 >nul
title Ad Blocker Installer
echo ============================
echo   Ad Blocker - تثبيت فلتر الإعلانات
echo ============================
echo.
echo جاري التثبيت (محتاج صلاحيات Admin)...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0ad-blocker.ps1"
echo.
echo اضغط أي زر للإغلاق...
pause >nul
