# SkateHubba External Drive Backup Test
param(
    [string]$BackupDrive = "D:",
    [string]$ProjectName = "skatehubba",
    [switch]$IncludeNodeModules
)

Write-Host "🛹 SkateHubba External Drive Backup Test" -ForegroundColor Green
Write-Host "🎯 Target: External Drive $BackupDrive" -ForegroundColor Magenta

# Check if backup drive exists
if (-not (Test-Path $BackupDrive)) {
    Write-Host "❌ Error: Backup drive $BackupDrive is not accessible" -ForegroundColor Red
    Write-Host "💡 Please ensure your external drive D: is connected and accessible" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ External drive $BackupDrive is accessible" -ForegroundColor Green

# Test drive space
try {
    $Drive = Get-PSDrive -Name ($BackupDrive.TrimEnd(':','\')) -ErrorAction SilentlyContinue
    if ($Drive) {
        $FreeSpaceGB = [math]::Round($Drive.Free / 1GB, 2)
        Write-Host "💾 Drive $BackupDrive has $FreeSpaceGB GB free space" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Could not verify drive space" -ForegroundColor Yellow
}

# Test exclusion logic
$ExcludePatterns = @(".expo", ".git", "*.log", "coverage")

if (-not $IncludeNodeModules) {
    Write-Host "⏭️  Excluding node_modules (use -IncludeNodeModules to include)" -ForegroundColor Yellow
    $ExcludePatterns += "node_modules"
} else {
    Write-Host "✅ Including node_modules in backup" -ForegroundColor Green
}

Write-Host "📋 Exclusion patterns for external backup:" -ForegroundColor Cyan
$ExcludePatterns | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }

# Test backup path creation
$BackupTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFolderName = "${ProjectName}_backup_$BackupTimestamp"
$BackupPath = Join-Path $BackupDrive $BackupFolderName

Write-Host "📁 Backup would be created at: $BackupPath" -ForegroundColor Cyan
Write-Host "✅ External drive backup test completed successfully!" -ForegroundColor Green
