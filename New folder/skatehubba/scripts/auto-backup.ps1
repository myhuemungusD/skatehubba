# Automated backup script for Skatehubba project
param(
    [string]$DriveLetterOrPath = "D:", # Default backup drive, change as needed
    [int]$KeepLastN = 5 # Number of backups to keep
)

# Create timestamp for backup folder name
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$projectRoot = $PSScriptRoot | Split-Path
$backupRoot = Join-Path $DriveLetterOrPath "skatehubba_backups"
$backupPath = Join-Path $backupRoot "backup_$timestamp"

# Create exclusions file if it doesn't exist
$exclusionsPath = Join-Path $projectRoot "scripts\backup-exclusions.txt"
if (-not (Test-Path $exclusionsPath)) {
    @"
node_modules\
.expo\
.git\
coverage\
*.log
dist\
build\
"@ | Out-File $exclusionsPath -Encoding UTF8
}

# Create backup directory if it doesn't exist
if (-not (Test-Path $backupRoot)) {
    New-Item -ItemType Directory -Path $backupRoot
}

Write-Host "Starting backup to: $backupPath"

# Perform the backup
xcopy $projectRoot $backupPath /E /H /C /I /Y /EXCLUDE:$exclusionsPath

# Clean up old backups if we have more than KeepLastN
$allBackups = Get-ChildItem $backupRoot -Directory | Sort-Object CreationTime -Descending
if ($allBackups.Count -gt $KeepLastN) {
    $allBackups | Select-Object -Skip $KeepLastN | ForEach-Object {
        Write-Host "Removing old backup: $($_.FullName)"
        Remove-Item $_.FullName -Recurse -Force
    }
}

Write-Host "Backup completed successfully!"
Write-Host "Location: $backupPath"
Write-Host "Keeping last $KeepLastN backups"
