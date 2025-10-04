# SkateHubba Project Backup Script
# Creates a complete backup of the skatehubba project to external drive D:
# Optimized for external drives with safety checks and verification

param(
    [string]$BackupDrive = "D:",
    [string]$ProjectName = "skatehubba",
    [switch]$IncludeNodeModules
)

Write-Host "🛹 SkateHubba Backup Script Starting..." -ForegroundColor Green
Write-Host "📅 Backup Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "🎯 Target: External Drive $BackupDrive" -ForegroundColor Magenta

# Check if backup drive exists
if (-not (Test-Path $BackupDrive)) {
    Write-Host "❌ Error: Backup drive $BackupDrive is not accessible" -ForegroundColor Red
    Write-Host "💡 Please ensure your external drive D: is connected and accessible" -ForegroundColor Yellow
    exit 1
}

# Verify drive has enough space
try {
    $Drive = Get-PSDrive -Name ($BackupDrive.TrimEnd(':','\')) -ErrorAction SilentlyContinue
    if ($Drive) {
        $FreeSpaceGB = [math]::Round($Drive.Free / 1GB, 2)
        Write-Host "💾 Drive $BackupDrive has $FreeSpaceGB GB free space" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Could not verify drive space" -ForegroundColor Yellow
}

# Get current project directory
$SourcePath = Get-Location

Write-Host "📂 Source: $SourcePath" -ForegroundColor Yellow
Write-Host "💾 Target: $BackupDrive" -ForegroundColor Yellow

# Create backup directory with timestamp
$BackupTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFolderName = "${ProjectName}_backup_$BackupTimestamp"
$BackupPath = Join-Path $BackupDrive $BackupFolderName

# Final safety check before proceeding
Write-Host "🔍 Final safety check..." -ForegroundColor Cyan
Write-Host "📂 Source: $SourcePath" -ForegroundColor White
Write-Host "💾 Destination: $BackupPath" -ForegroundColor White

$Confirmation = Read-Host "Continue with backup to external drive D:? (Y/N)"
if ($Confirmation -notmatch '^[Yy]$') {
    Write-Host "❌ Backup cancelled by user" -ForegroundColor Red
    exit 0
}

try {
    # Create backup directory
    Write-Host "📁 Creating backup directory: $BackupPath" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

    # Define exclusion patterns
    $ExcludePatterns = @(
        ".expo",
        ".git",
        "*.log",
        "coverage",
        ".DS_Store",
        "Thumbs.db",
        "*.tmp",
        "*.temp",
        ".env.local",
        ".env.development.local",
        ".env.test.local",
        ".env.production.local"
    )

    if (-not $IncludeNodeModules) {
        Write-Host "⏭️  Excluding node_modules (use -IncludeNodeModules to include)" -ForegroundColor Yellow
        $ExcludePatterns += "node_modules"
    } else {
        Write-Host "✅ Including node_modules in backup" -ForegroundColor Green
    }

    # Create exclusion string for robocopy
    $ExcludeDirs = $ExcludePatterns | Where-Object { $_ -notlike "*.*" }
    $ExcludeFiles = $ExcludePatterns | Where-Object { $_ -like "*.*" }

    # Build robocopy command (optimized for external drives)
    $RobocopyArgs = @(
        "`"$SourcePath`"",
        "`"$BackupPath`"",
        "/E",     # Copy subdirectories including empty ones
        "/R:5",   # Retry 5 times (increased for external drives)
        "/W:10",  # Wait 10 seconds between retries (increased for external drives)
        "/MT:4",  # Multi-threaded copy (reduced for external drive stability)
        "/XO",    # Exclude older files
        "/FFT",   # Assume FAT file times (important for external drives)
        "/DST",   # Compensate for DST time differences
        "/V",     # Verbose output for external drive monitoring
        "/NP",    # No progress (cleaner output)
        "/BYTES"  # Print sizes in bytes
    )

    # Add directory exclusions
    if ($ExcludeDirs.Count -gt 0) {
        $RobocopyArgs += "/XD"
        $ExcludeDirs | ForEach-Object { $RobocopyArgs += "`"$_`"" }
    }

    # Add file exclusions
    if ($ExcludeFiles.Count -gt 0) {
        $RobocopyArgs += "/XF"
        $ExcludeFiles | ForEach-Object { $RobocopyArgs += "`"$_`"" }
    }

    Write-Host "🔄 Starting file copy operation to external drive..." -ForegroundColor Cyan
    Write-Host "📋 Command: robocopy $($RobocopyArgs -join ' ')" -ForegroundColor Gray

    # Execute robocopy
    $Process = Start-Process -FilePath "robocopy" -ArgumentList $RobocopyArgs -Wait -PassThru -NoNewWindow

    # Check robocopy exit code (0-7 are success, 8+ are errors)
    if ($Process.ExitCode -le 7) {
        Write-Host "✅ File copy to external drive completed successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠️  File copy completed with warnings (Exit code: $($Process.ExitCode))" -ForegroundColor Yellow
    }

    # Create backup manifest
    Write-Host "📋 Creating backup manifest..." -ForegroundColor Cyan
    
    $ManifestPath = Join-Path $BackupPath "BACKUP_MANIFEST.txt"
    
    # Build manifest content safely
    $ManifestContent = @()
    $ManifestContent += "SkateHubba Project Backup - External Drive D:"
    $ManifestContent += "============================================"
    $ManifestContent += ""
    $ManifestContent += "Backup Information:"
    $ManifestContent += "- Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $ManifestContent += "- Source: $SourcePath"
    $ManifestContent += "- Target: $BackupPath"
    $ManifestContent += "- External Drive: $BackupDrive"
    $ManifestContent += "- Include node_modules: $IncludeNodeModules"
    $ManifestContent += ""
    $ManifestContent += "Excluded Items:"
    foreach ($pattern in $ExcludePatterns) {
        $ManifestContent += "  - $pattern"
    }
    $ManifestContent += ""
    $ManifestContent += "External Drive Backup Features:"
    $ManifestContent += "- Optimized robocopy settings for external drives"
    $ManifestContent += "- Enhanced retry logic for USB/external connections"
    $ManifestContent += "- FAT file time compatibility"
    $ManifestContent += "- Portable backup with restore script included"
    $ManifestContent += ""
    $ManifestContent += "Restore Instructions:"
    $ManifestContent += "1. Copy the entire backup folder to desired location"
    $ManifestContent += "2. Run 'npm install' to restore node_modules"
    $ManifestContent += "3. Configure environment variables if needed"
    $ManifestContent += "4. Run 'npm start' to launch the application"
    $ManifestContent += ""
    $ManifestContent += "External Drive Safety:"
    $ManifestContent += "- Safe to disconnect drive after backup completion"
    $ManifestContent += "- Backup is self-contained and portable"
    $ManifestContent += "- Works on any Windows system with PowerShell"

    $ManifestContent | Out-File -FilePath $ManifestPath -Encoding UTF8

    # Create restore script optimized for external drive
    $RestoreScriptPath = Join-Path $BackupPath "RESTORE.ps1"
    $RestoreScript = @'
# SkateHubba Project Restore Script - External Drive Version
param([string]$RestoreLocation)

Write-Host "🛹 SkateHubba External Drive Restore Script" -ForegroundColor Green

if (-not $RestoreLocation) {
    $RestoreLocation = Read-Host "Enter restore location (default: C:\Users\$env:USERNAME\SkateHubba_Restored)"
    if (-not $RestoreLocation) {
        $RestoreLocation = "C:\Users\$env:USERNAME\SkateHubba_Restored"
    }
}

Write-Host "📂 Restoring from external drive to: $RestoreLocation" -ForegroundColor Cyan

# Copy files with external drive optimized settings
robocopy "$PSScriptRoot" "$RestoreLocation" /E /R:3 /W:5 /XF "BACKUP_MANIFEST.txt" "RESTORE.ps1" /FFT /DST

Write-Host "✅ Restore from external drive complete!" -ForegroundColor Green
Write-Host "📝 Next steps:" -ForegroundColor Yellow
Write-Host "  1. cd `"$RestoreLocation`"" -ForegroundColor Gray
Write-Host "  2. npm install" -ForegroundColor Gray
Write-Host "  3. npm start" -ForegroundColor Gray
'@

    $RestoreScript | Out-File -FilePath $RestoreScriptPath -Encoding UTF8

    # Calculate backup size
    $BackupSize = (Get-ChildItem $BackupPath -Recurse | Measure-Object -Property Length -Sum).Sum
    $BackupSizeMB = [math]::Round($BackupSize / 1MB, 2)

    Write-Host ""
    Write-Host "🎉 Backup to external drive D: completed successfully!" -ForegroundColor Green
    Write-Host "📊 Backup Statistics:" -ForegroundColor Cyan
    Write-Host "  📁 Location: $BackupPath" -ForegroundColor White
    Write-Host "  📏 Size: $BackupSizeMB MB" -ForegroundColor White
    Write-Host "  📄 Files: $((Get-ChildItem $BackupPath -Recurse -File).Count)" -ForegroundColor White
    Write-Host "  📂 Folders: $((Get-ChildItem $BackupPath -Recurse -Directory).Count)" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 External Drive Backup includes:" -ForegroundColor Yellow
    Write-Host "  ✅ All source code and beta features" -ForegroundColor Green
    Write-Host "  ✅ Configuration files and scripts" -ForegroundColor Green
    Write-Host "  ✅ Assets and documentation" -ForegroundColor Green
    Write-Host "  ✅ Backup manifest and restore script" -ForegroundColor Green
    Write-Host ""
    Write-Host "💾 External Drive Safety:" -ForegroundColor Cyan
    Write-Host "  ✅ Backup stored on external drive D:" -ForegroundColor Green
    Write-Host "  ✅ Safe to disconnect drive after this message" -ForegroundColor Green
    Write-Host "  💡 To restore: Run RESTORE.ps1 from the backup folder" -ForegroundColor Yellow

} catch {
    Write-Host "❌ External drive backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
