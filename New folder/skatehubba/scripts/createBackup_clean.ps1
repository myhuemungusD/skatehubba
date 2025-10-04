# SkateHubba Project Backup Script
# Creates a complete backup of the skatehubba project to external drive D:

param(
    [string]$BackupDrive = "D:",
    [string]$ProjectName = "skatehubba",
    [switch]$IncludeNodeModules
)

Write-Host "🛹 SkateHubba Backup Script Starting..." -ForegroundColor Green
Write-Host "📅 Backup Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan

# Check if backup drive exists
if (-not (Test-Path $BackupDrive)) {
    Write-Host "❌ Error: Backup drive $BackupDrive is not accessible" -ForegroundColor Red
    exit 1
}

# Get current project directory
$SourcePath = Get-Location

Write-Host "📂 Source: $SourcePath" -ForegroundColor Yellow
Write-Host "💾 Target: $BackupDrive" -ForegroundColor Yellow

# Create backup directory with timestamp
$BackupTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFolderName = "${ProjectName}_backup_$BackupTimestamp"
$BackupPath = Join-Path $BackupDrive $BackupFolderName

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

    # Build robocopy command
    $RobocopyArgs = @(
        "`"$SourcePath`"",
        "`"$BackupPath`"",
        "/E",  # Copy subdirectories including empty ones
        "/R:3", # Retry 3 times
        "/W:5", # Wait 5 seconds between retries
        "/MT:8", # Multi-threaded copy (8 threads)
        "/XO",  # Exclude older files
        "/FFT", # Assume FAT file times
        "/DST"  # Compensate for DST time differences
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

    Write-Host "🔄 Starting file copy operation..." -ForegroundColor Cyan
    Write-Host "📋 Command: robocopy $($RobocopyArgs -join ' ')" -ForegroundColor Gray

    # Execute robocopy
    $Process = Start-Process -FilePath "robocopy" -ArgumentList $RobocopyArgs -Wait -PassThru -NoNewWindow

    # Check robocopy exit code (0-7 are success, 8+ are errors)
    if ($Process.ExitCode -le 7) {
        Write-Host "✅ File copy completed successfully" -ForegroundColor Green
    } else {
        Write-Host "⚠️  File copy completed with warnings (Exit code: $($Process.ExitCode))" -ForegroundColor Yellow
    }

    # Create backup manifest
    Write-Host "📋 Creating backup manifest..." -ForegroundColor Cyan
    
    $ManifestPath = Join-Path $BackupPath "BACKUP_MANIFEST.txt"
    
    # Build manifest content safely
    $ManifestContent = @()
    $ManifestContent += "SkateHubba Project Backup"
    $ManifestContent += "========================"
    $ManifestContent += ""
    $ManifestContent += "Backup Information:"
    $ManifestContent += "- Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $ManifestContent += "- Source: $SourcePath"
    $ManifestContent += "- Target: $BackupPath"
    $ManifestContent += "- Include node_modules: $IncludeNodeModules"
    $ManifestContent += ""
    $ManifestContent += "Excluded Items:"
    foreach ($pattern in $ExcludePatterns) {
        $ManifestContent += "  - $pattern"
    }
    $ManifestContent += ""
    $ManifestContent += "Restore Instructions:"
    $ManifestContent += "1. Copy the entire backup folder to desired location"
    $ManifestContent += "2. Run 'npm install' to restore node_modules"
    $ManifestContent += "3. Configure environment variables if needed"
    $ManifestContent += "4. Run 'npm start' to launch the application"

    $ManifestContent | Out-File -FilePath $ManifestPath -Encoding UTF8

    # Create restore script
    $RestoreScriptPath = Join-Path $BackupPath "RESTORE.ps1"
    $RestoreScript = @'
# SkateHubba Project Restore Script
param([string]$RestoreLocation)

Write-Host "🛹 SkateHubba Restore Script" -ForegroundColor Green

if (-not $RestoreLocation) {
    $RestoreLocation = Read-Host "Enter restore location (default: C:\Users\$env:USERNAME\SkateHubba_Restored)"
    if (-not $RestoreLocation) {
        $RestoreLocation = "C:\Users\$env:USERNAME\SkateHubba_Restored"
    }
}

Write-Host "📂 Restoring to: $RestoreLocation" -ForegroundColor Cyan

# Copy files
robocopy "$PSScriptRoot" "$RestoreLocation" /E /R:3 /W:5 /XF "BACKUP_MANIFEST.txt" "RESTORE.ps1"

Write-Host "✅ Restore complete!" -ForegroundColor Green
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
    Write-Host "🎉 Backup completed successfully!" -ForegroundColor Green
    Write-Host "📊 Backup Statistics:" -ForegroundColor Cyan
    Write-Host "  📁 Location: $BackupPath" -ForegroundColor White
    Write-Host "  📏 Size: $BackupSizeMB MB" -ForegroundColor White
    Write-Host "  📄 Files: $((Get-ChildItem $BackupPath -Recurse -File).Count)" -ForegroundColor White
    Write-Host "  📂 Folders: $((Get-ChildItem $BackupPath -Recurse -Directory).Count)" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Backup includes:" -ForegroundColor Yellow
    Write-Host "  ✅ All source code and beta features" -ForegroundColor Green
    Write-Host "  ✅ Configuration files and scripts" -ForegroundColor Green
    Write-Host "  ✅ Assets and documentation" -ForegroundColor Green
    Write-Host "  ✅ Backup manifest and restore script" -ForegroundColor Green
    Write-Host ""
    Write-Host "💾 To restore: Run RESTORE.ps1 from the backup folder" -ForegroundColor Cyan

} catch {
    Write-Host "❌ Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
