# Debug Test Script for createBackup.ps1
param(
    [string]$BackupDrive = "C:\temp\debug_test",
    [string]$ProjectName = "skatehubba_test",
    [switch]$IncludeNodeModules
)

Write-Host "DEBUG: Full Component Test" -ForegroundColor Magenta

# Test 1: Parameter Validation
Write-Host "TEST 1: Parameter Validation" -ForegroundColor Cyan
Write-Host "  BackupDrive: $BackupDrive" -ForegroundColor White
Write-Host "  ProjectName: $ProjectName" -ForegroundColor White  
Write-Host "  IncludeNodeModules: $IncludeNodeModules" -ForegroundColor White

# Test 2: Drive Detection
Write-Host "TEST 2: Drive Detection" -ForegroundColor Cyan
if (-not (Test-Path $BackupDrive)) {
    Write-Host "  Creating test directory: $BackupDrive" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $BackupDrive -Force | Out-Null
}
Write-Host "  Drive/Path accessible: $BackupDrive" -ForegroundColor Green

# Test 3: Exclusion Patterns
Write-Host "TEST 3: Exclusion Patterns" -ForegroundColor Cyan
$ExcludePatterns = @(".expo", ".git", "*.log", "coverage", ".DS_Store", "Thumbs.db", "*.tmp", "*.temp")

if (-not $IncludeNodeModules) {
    Write-Host "  Excluding node_modules" -ForegroundColor Yellow
    $ExcludePatterns += "node_modules"
} else {
    Write-Host "  Including node_modules" -ForegroundColor Green
}

# Test 4: Pattern Classification
Write-Host "TEST 4: Pattern Classification" -ForegroundColor Cyan
$ExcludeDirs = $ExcludePatterns | Where-Object { $_ -notlike "*.*" }
$ExcludeFiles = $ExcludePatterns | Where-Object { $_ -like "*.*" }

Write-Host "  Directory exclusions: $($ExcludeDirs.Count)" -ForegroundColor White
$ExcludeDirs | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }

Write-Host "  File exclusions: $($ExcludeFiles.Count)" -ForegroundColor White  
$ExcludeFiles | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }

# Test 5: Backup Path Generation
Write-Host "TEST 5: Backup Path Generation" -ForegroundColor Cyan
$SourcePath = Get-Location
$BackupTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupFolderName = "${ProjectName}_backup_$BackupTimestamp"
$BackupPath = Join-Path $BackupDrive $BackupFolderName

Write-Host "  Source: $SourcePath" -ForegroundColor White
Write-Host "  Target: $BackupPath" -ForegroundColor White

Write-Host "SUCCESS: All components tested!" -ForegroundColor Green
