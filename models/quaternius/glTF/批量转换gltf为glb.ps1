# Batch convert .gltf (text) to .glb (binary) with textures embedded.
# Put this script in the SAME folder as the .gltf files.
# Usage: double click the .bat  ->  output: glb_out\*.glb

# NOTE: do NOT set ErrorActionPreference = "Stop".
# npm/npx print harmless warnings to stderr, which PowerShell treats as errors.
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
Set-Location -LiteralPath $PSScriptRoot

$SRCDIR = $PSScriptRoot
$OUTDIR = Join-Path $SRCDIR "glb_out"

if (-not (Test-Path $OUTDIR)) { New-Item -ItemType Directory -Path $OUTDIR | Out-Null }

Write-Host ""
Write-Host "=== gltf -> glb converter ==="
Write-Host "source : $SRCDIR"
Write-Host "output : $OUTDIR"
Write-Host ""

# ---------- 1. find a working gltf-pipeline ----------
# $MODE = "local" | "global" | "npx" | ""
$MODE = ""
$LOCAL_JS = Join-Path $SRCDIR "node_modules\gltf-pipeline\bin\gltf.js"

if (Test-Path -LiteralPath $LOCAL_JS) {
  $MODE = "local"
  Write-Host "[OK] converter: local node_modules"
}
else {
  $g = Get-Command gltf -ErrorAction SilentlyContinue
  if ($g) {
    $MODE = "global"
    Write-Host "[OK] converter: global gltf command"
  }
  else {
    Write-Host "[i] trying npx (first run downloads it, please wait)..."
    $null = & npx --yes gltf-pipeline --version 2>$null 3>$null
    if ($LASTEXITCODE -eq 0) {
      $MODE = "npx"
      Write-Host "[OK] converter: npx gltf-pipeline"
    }
  }
}

if ($MODE -eq "") {
  Write-Host ""
  Write-Host "[X] gltf-pipeline not available."
  Write-Host ""
  Write-Host "    Fix: open PowerShell in this folder and run"
  Write-Host "        npm install gltf-pipeline"
  Write-Host "    then double click the .bat again."
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}

# ---------- 2. list textures sitting next to the .gltf ----------
$tex = @(Get-ChildItem -LiteralPath $SRCDIR -Filter *.png -File -ErrorAction SilentlyContinue)
if ($tex.Count -gt 0) {
  foreach ($t in $tex) { Write-Host "[tex] $($t.Name)" }
} else {
  Write-Host "[!] no .png here - texture may stay external"
}

# ---------- 3. convert ----------
$files = @(Get-ChildItem -LiteralPath $SRCDIR -Filter *.gltf -File -ErrorAction SilentlyContinue)
if ($files.Count -eq 0) {
  Write-Host ""
  Write-Host "[X] no .gltf files found in $SRCDIR"
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
$ok = 0
$fail = @()

foreach ($f in $files) {
  $out = Join-Path $OUTDIR ($f.BaseName + ".glb")
  Write-Host "[->] $($f.Name)"

  switch ($MODE) {
    "local"  { & node $LOCAL_JS -i $f.FullName -o $out -b 2>$null 3>$null }
    "global" { & gltf -i $f.FullName -o $out -b 2>$null 3>$null }
    "npx"    { & npx --yes gltf-pipeline -i $f.FullName -o $out -b 2>$null 3>$null }
  }

  if (Test-Path -LiteralPath $out) {
    $kb = [math]::Round((Get-Item -LiteralPath $out).Length / 1KB)
    Write-Host "    OK -> $($f.BaseName).glb ($kb KB)"
    $ok++
  } else {
    Write-Host "    FAILED: $($f.Name)"
    $fail += $f.Name
  }
}

Write-Host ""
Write-Host "==================================="
Write-Host "  converted: $ok / $($files.Count)"
if ($fail.Count -gt 0) {
  Write-Host "  failed:"
  foreach ($x in $fail) { Write-Host "    - $x" }
}
Write-Host "  output folder: $OUTDIR"
Write-Host "==================================="
Write-Host ""
Write-Host "Cutest picks: GreenBlob / PinkBlob / Cactoro / Birb / Chicken / Pigeon"