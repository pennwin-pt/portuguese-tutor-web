# ============================================================
# fix-street-texture.ps1
# One-shot fix: street buildings/trees render white because the
# GLBs reference "Textures/colormap.png" which is missing.
# This script finds the colour map in the GitHub mirror repo and
# puts it exactly where the GLBs expect it.
# Right-click -> "Run with PowerShell", or run inside PowerShell.
# ============================================================

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (texture-fix)' }

# models\street\Textures next to this script (script lives in models\)
$dest = Join-Path $PSScriptRoot 'street\Textures'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$outFile = Join-Path $dest 'colormap.png'

if (Test-Path $outFile) {
    Write-Host "[skip] already exists: $outFile" -ForegroundColor Yellow
} else {
    $repo = 'null3d-engine/sample-assets'
    Write-Host "[info] looking up colour map in $repo ..." -ForegroundColor Cyan

    $branch = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo" -Headers $UA -TimeoutSec 30).default_branch
    $tree = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/trees/${branch}?recursive=1" -Headers $UA -TimeoutSec 60

    # prefer a file literally named *colormap*.png, else any png in the pack
    $pngs = @($tree.tree | Where-Object {
        $_.type -eq 'blob' -and $_.path -like '*kenney-suburban*' -and $_.path -like '*.png'
    })
    $pick = $pngs | Where-Object { $_.path -like '*colormap*' } | Select-Object -First 1
    if (-not $pick) { $pick = $pngs | Select-Object -First 1 }

    if (-not $pick) {
        Write-Host "[FAIL] no png found under kenney-suburban in the repo." -ForegroundColor Red
        Write-Host "       paste this output to the assistant for a manual link" -ForegroundColor Red
    } else {
        $raw = "https://raw.githubusercontent.com/$repo/$branch/" + ($pick.path -replace ' ', '%20')
        Write-Host "[info] downloading $($pick.path) ..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $raw -OutFile $outFile -UseBasicParsing -Headers $UA -TimeoutSec 60
        Write-Host "[OK] saved -> $outFile" -ForegroundColor Green
    }
}

# verify all four street glbs can now find their texture
Write-Host ""
Write-Host "------------------------------------------------------------"
if (Test-Path $outFile) {
    Write-Host " DONE. Now hard-refresh the browser (Ctrl+F5)." -ForegroundColor Green
    Write-Host " Buildings and trees should show colors."
} else {
    Write-Host " NOT fixed yet - paste the output above to the assistant." -ForegroundColor Red
}