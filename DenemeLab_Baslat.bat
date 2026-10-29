@echo off
title DenemeLab Baslatici
cls

echo.
echo ======================================================
echo                 DENEMELAB BASLATILIYOR
echo ======================================================
echo.

cd /d "%~dp0app"

:: Python sunucusu kontrolu
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Python tespit edildi, yerel sunucu baslatiliyor...
    echo [OK] Tarayicinizda aciliyor: http://localhost:8000
    echo.
    echo (Uygulama acikken bu pencereyi simge durumuna kucultebilirsiniz)
    echo.
    timeout /t 2 /nobreak >nul
    start http://localhost:8000
    python -m http.server 8000
) else (
    echo [BILGI] Python bulunamadi, uygulama dogrudan tarayicinizda aciliyor...
    start "" "index.html"
)
