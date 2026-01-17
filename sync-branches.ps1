# Sync all branches with remote
cd c:\Users\LowAn\skatehubba1

# Fetch all remote updates
Write-Host "Fetching all remote branches..." -ForegroundColor Cyan
git fetch --all --prune

# Get list of remote branches (excluding HEAD)
$branches = git branch -r | Where-Object { $_ -notmatch 'HEAD' -and $_ -match 'origin/' } | ForEach-Object { 
    $_.Trim().Replace('origin/', '') 
}

Write-Host "`nFound $($branches.Count) remote branches" -ForegroundColor Green

foreach ($branch in $branches) {
    Write-Host "`n--- Processing branch: $branch ---" -ForegroundColor Yellow
    
    # Checkout branch
    git checkout $branch 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        # Pull latest
        Write-Host "  Pulling latest changes..." -ForegroundColor White
        git pull origin $branch --rebase
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ $branch synced" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Failed to pull $branch" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✗ Failed to checkout $branch" -ForegroundColor Red
    }
}

# Return to main
Write-Host "`n--- Returning to main branch ---" -ForegroundColor Cyan
git checkout main

Write-Host "`nDone! All branches synced." -ForegroundColor Green
