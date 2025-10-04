# Schedule automated backups
param(
    [string]$DriveLetterOrPath = "D:", # Default backup drive
    [string]$Time = "23:00", # Default backup time (11 PM)
    [switch]$Daily,
    [switch]$Weekly,
    [switch]$Remove
)

$scriptPath = Join-Path $PSScriptRoot "auto-backup.ps1"
$taskName = "SkatehubbaBackup"

if ($Remove) {
    # Remove existing task if it exists
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled backup task."
    exit
}

# Create the action to run the backup script
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -DriveLetterOrPath `"$DriveLetterOrPath`""

# Create the trigger based on frequency
if ($Weekly) {
    $trigger = New-ScheduledTaskTrigger -Weekly -At $Time -DaysOfWeek Sunday
    Write-Host "Scheduling weekly backup at $Time on Sundays"
} else {
    $trigger = New-ScheduledTaskTrigger -Daily -At $Time
    Write-Host "Scheduling daily backup at $Time"
}

# Create the task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -RunLevel Highest -Force

Write-Host "Backup task scheduled successfully!"
Write-Host "Task details:"
Write-Host "- Name: $taskName"
Write-Host "- Backup location: $DriveLetterOrPath\skatehubba_backups"
Write-Host "- Schedule: $(if ($Weekly) {'Weekly on Sundays'} else {'Daily'}) at $Time"
Write-Host "`nTo remove the scheduled task, run this script with -Remove switch"
