# Simple Test Backup Script
param(
    [string]$BackupDrive = "C:\temp",
    [string]$ProjectName = "skatehubba", 
    [switch]$IncludeNodeModules
)

Write-Host "🛹 SkateHubba Backup Script Starting..." -ForegroundColor Green

# Define exclusion patterns
$ExcludePatterns = @(
    ".expo",
    ".git", 
    "*.log",
    "coverage"
)

if (-not $IncludeNodeModules) {
    Write-Host "⏭️  Excluding node_modules (use -IncludeNodeModules to include)" -ForegroundColor Yellow
    $ExcludePatterns += "node_modules"
} else {
    Write-Host "✅ Including node_modules in backup" -ForegroundColor Green
}

Write-Host "📋 Exclusion patterns:" -ForegroundColor Cyan
$ExcludePatterns | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }

Write-Host "✅ Test completed successfully!" -ForegroundColor Green
Write-Host "📊 Parameters used:" -ForegroundColor Cyan
Write-Host "  BackupDrive: $BackupDrive" -ForegroundColor White
Write-Host "  ProjectName: $ProjectName" -ForegroundColor White  
Write-Host "  IncludeNodeModules: $IncludeNodeModules" -ForegroundColor White
