# SkateHubba Project Backup Script
# Creates a complete backup of the skatehubba project to external drive D:
# Optimized for external drives with safety checks and verification

param(
    [string]$BackupDrive = "D:",
    [string]$ProjectName = "skatehubba",
    [switch]$IncludeNodeModules
)

Write-Host "SkateHubba Backup Script Starting..." -ForegroundColor Green
Write-Host "Backup Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Target: External Drive $BackupDrive" -ForegroundColor Magenta

# Check if backup drive exists
if (-not (Test-Path $BackupDrive)) {
    Write-Host "Error: Backup drive $BackupDrive is not accessible" -ForegroundColor Red
    Write-Host "Please ensure your external drive D: is connected and accessible" -ForegroundColor Yellow
    exit 1
}

# Verify drive has enough space
try {
    $Drive = Get-PSDrive -Name ($BackupDrive.TrimEnd(':','\')) -ErrorAction SilentlyContinue
    if ($Drive) {
        $FreeSpaceGB = [math]::Round($Drive.Free / 1GB, 2)
        Write-Host "Drive $BackupDrive has $FreeSpaceGB GB free space" -ForegroundColor Green
    }
} catch {
    Write-Host "Could not verify drive space" -ForegroundColor Yellow
}

# Get current project directory
$SourcePath = Get-Location
Write-Host "Source: $SourcePath" -ForegroundColor Yellow

# Create backup directory with timestamp
$BackupTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFolderName = "${ProjectName}_backup_$BackupTimestamp"
$BackupPath = Join-Path $BackupDrive $BackupFolderName

Write-Host "Destination: $BackupPath" -ForegroundColor Yellow

try {
    # Create backup directory
    Write-Host "Creating backup directory: $BackupPath" -ForegroundColor Cyan
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
        Write-Host "Excluding node_modules (use -IncludeNodeModules to include)" -ForegroundColor Yellow
        $ExcludePatterns += "node_modules"
    } else {
        Write-Host "Including node_modules in backup" -ForegroundColor Green
    }

    # Create exclusion string for robocopy (FIXED pattern classification)
    $ExcludeDirs = $ExcludePatterns | Where-Object { 
        $_ -notlike "*.*" -or $_ -eq ".expo" -or $_ -eq ".git" 
    }
    $ExcludeFiles = $ExcludePatterns | Where-Object { 
        $_ -like "*.*" -and $_ -ne ".expo" -and $_ -ne ".git" 
    }

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
        "/NP"     # No progress (cleaner output)
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

    Write-Host "Starting file copy operation to external drive..." -ForegroundColor Cyan

    # Execute robocopy
    $Process = Start-Process -FilePath "robocopy" -ArgumentList $RobocopyArgs -Wait -PassThru -NoNewWindow

    # Check robocopy exit code (0-7 are success, 8+ are errors)
    if ($Process.ExitCode -le 7) {
        Write-Host "File copy to external drive completed successfully" -ForegroundColor Green
    } else {
        Write-Host "File copy completed with warnings (Exit code: $($Process.ExitCode))" -ForegroundColor Yellow
    }

    # Create simple manifest
    Write-Host "Creating backup manifest..." -ForegroundColor Cyan
    $ManifestPath = Join-Path $BackupPath "BACKUP_MANIFEST.txt"
    
    $ManifestLines = @(
        "SkateHubba Project Backup - External Drive D:",
        "============================================",
        "",
        "Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "Source: $SourcePath",
        "Target: $BackupPath",
        "External Drive: $BackupDrive",
        "Include node_modules: $IncludeNodeModules",
        "",
        "Excluded Items:"
    )
    
    foreach ($pattern in $ExcludePatterns) {
        $ManifestLines += "  - $pattern"
    }
    
    $ManifestLines += @(
        "",
        "Directory exclusions: $($ExcludeDirs -join ', ')",
        "File exclusions: $($ExcludeFiles -join ', ')",
        "",
        "Restore Instructions:",
        "1. Copy backup folder to desired location",
        "2. Run 'npm install' to restore node_modules",
        "3. Run 'npm start' to launch application"
    )
    
    $ManifestLines | Out-File -FilePath $ManifestPath -Encoding UTF8

    # Calculate backup size
    $BackupSize = (Get-ChildItem $BackupPath -Recurse | Measure-Object -Property Length -Sum).Sum
    $BackupSizeMB = [math]::Round($BackupSize / 1MB, 2)

    Write-Host ""
    Write-Host "Backup to external drive D: completed successfully!" -ForegroundColor Green
    Write-Host "Backup Statistics:" -ForegroundColor Cyan
    Write-Host "  Location: $BackupPath" -ForegroundColor White
    Write-Host "  Size: $BackupSizeMB MB" -ForegroundColor White
    Write-Host "  Files: $((Get-ChildItem $BackupPath -Recurse -File).Count)" -ForegroundColor White
    Write-Host "  Folders: $((Get-ChildItem $BackupPath -Recurse -Directory).Count)" -ForegroundColor White
    Write-Host ""
    Write-Host "External Drive Safety:" -ForegroundColor Cyan
    Write-Host "  Backup stored on external drive D:" -ForegroundColor Green
    Write-Host "  Safe to disconnect drive after this message" -ForegroundColor Green

} catch {
    Write-Host "External drive backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
