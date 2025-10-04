@echo off
echo 🛹 SkateHubba Project Restore Script
echo ===================================
echo.

set /p "RestoreLocation=Enter restore location (default: C:\SkateHubba_Restored): "
if "%RestoreLocation%"=="" set "RestoreLocation=C:\SkateHubba_Restored"

echo.
echo 📂 Restoring to: %RestoreLocation%
echo 🔄 Starting restore process...
echo.

:: Copy all files except the restore script itself
robocopy "%~dp0" "%RestoreLocation%" /E /R:3 /W:5 /XF "RESTORE.bat"

if %ERRORLEVEL% LEQ 7 (
    echo.
    echo ✅ Restore completed successfully!
    echo.
    echo 📝 Next steps:
    echo   1. cd "%RestoreLocation%"
    echo   2. npm install
    echo   3. npm start
    echo.
    echo 🚀 Your SkateHubba beta features are ready to test!
    echo    Check BETA_TESTING_GUIDE.md for detailed instructions.
    echo.
) else (
    echo.
    echo ❌ Restore failed with error level %ERRORLEVEL%
    echo    Please check the source and destination paths.
    echo.
)

pause
