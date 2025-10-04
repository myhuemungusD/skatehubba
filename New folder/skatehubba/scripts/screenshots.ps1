# Script to generate and open app screenshots
param(
    [switch]$UpdateSnapshots,
    [switch]$ViewOnly
)

$screenshotsDir = Join-Path $PSScriptRoot "../__screenshots__"

if (-not $ViewOnly) {
    # Run the tests to generate screenshots
    $jestArgs = "__tests__/screenshots.test.js"
    if ($UpdateSnapshots) {
        $jestArgs += " -u"
    }
    
    Write-Host "Generating screenshots..."
    npm test -- $jestArgs
}

# Create an HTML viewer for the screenshots
$htmlContent = @"
<!DOCTYPE html>
<html>
<head>
    <title>Skatehubba App Screenshots</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .screenshot { margin-bottom: 40px; }
        .screenshot img { max-width: 100%; border: 1px solid #ccc; border-radius: 8px; }
        h2 { color: #333; }
    </style>
</head>
<body>
    <h1>Skatehubba App Screenshots</h1>
    <div id="screenshots">
"@

# Add screenshots to the HTML
Get-ChildItem $screenshotsDir -Filter *.png | ForEach-Object {
    $name = $_.BaseName -replace 'App-Screenshots-captures-|-screen-1-snap', ''
    $htmlContent += @"
    <div class="screenshot">
        <h2>$name Screen</h2>
        <img src="$($_.Name)" alt="$name screenshot">
    </div>
"@
}

$htmlContent += @"
    </div>
</body>
</html>
"@

# Save and open the HTML viewer
$viewerPath = Join-Path $screenshotsDir "viewer.html"
$htmlContent | Out-File $viewerPath -Encoding UTF8
Start-Process $viewerPath

Write-Host "Screenshots viewer opened in your default browser!"
