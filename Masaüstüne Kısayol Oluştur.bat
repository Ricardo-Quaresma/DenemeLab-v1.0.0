@echo off
title DenemeLab - Masaustu Kisayolu Olustur
cls

echo.
echo ======================================================
echo          DenemeLab - Masaustu Kisayolu
echo ======================================================
echo.

cscript //nologo "%~dp0app\kisayol.vbs" "%~dp0"

if %errorlevel% equ 0 (
    echo.
    echo [BASARILI] Masaustunuze "DenemeLab" kisayolu eklendi!
    echo.
    echo Artik masaustunuzdeki DenemeLab simgesine cift tiklayarak
    echo uygulamayi baslatabilirsiniz.
) else (
    echo.
    echo [HATA] Kisayol olusturulamadi.
)

echo.
pause
