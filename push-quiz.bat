@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM  Stage + Commit + Push the quiz folder in one click.
REM  Usage:
REM    1) Put new .json files into the quizzes\ folder
REM    2) Double-click this file (push-quiz.bat)
REM       Optional custom message:  push-quiz.bat "my message"
REM ============================================================

cd /d "%~dp0"

echo.
echo [1/4] Updating manifest.json ...
powershell -NoProfile -ExecutionPolicy Bypass -File ".\update-manifest.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to update manifest.json. See messages above.
    goto :end
)

echo.
echo [2/4] Staging changes ...
git add -A

git diff --cached --quiet
if not errorlevel 1 (
    echo.
    echo No changes to commit. Exiting.
    goto :end
)

set "MSG=%~1"
if "%MSG%"=="" (
    for /f "delims=" %%a in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm\""') do set "NOW=%%a"
    set "MSG=quiz: update quizzes !NOW!"
)

echo.
echo [3/4] Committing ...  ("!MSG!")
git commit -m "!MSG!"
if errorlevel 1 (
    echo.
    echo [ERROR] Commit failed.
    goto :end
)

echo.
echo [4/4] Pushing ...
git push
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Check network or remote settings.
    goto :end
)

echo.
echo ============================================
echo  Done! Stage + Commit + Push completed.
echo ============================================

:end
echo.
pause
endlocal
