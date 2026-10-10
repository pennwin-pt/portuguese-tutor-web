# ============================================================
# export_all_monsters.ps1 -- convert ALL 21 Quaternius cute
# monsters to textured GLB, saved as models\monsters_backup\
#   panda.glb, pig.glb, bee.glb, yellowdragon.glb, ...
# To use one later: copy it over e.g. characters\me.glb
# All CC0 (Quaternius). Run via the .bat next to this file.
# Put this script in the same models folder as characters\.
# ============================================================

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (monster-export)' }

if ((Split-Path $PSScriptRoot -Leaf) -ieq 'models') {
    $modelsRoot = $PSScriptRoot
} else {
    $modelsRoot = Join-Path $PSScriptRoot 'models'
}
$work = Join-Path $env:TEMP 'kenney_downloads'
$backup = Join-Path $modelsRoot 'monsters_backup'
New-Item -ItemType Directory -Force -Path $backup | Out-Null
Write-Host "[OK] backup folder: $backup" -ForegroundColor Green

$hasNode = $null -ne (Get-Command npx -ErrorAction SilentlyContinue)
if (-not $hasNode) {
    Write-Host "[FAIL] Node.js (npx) is required for conversion" -ForegroundColor Red
    exit 1
}

# ---------- generate fix-monster-textures.js (welder) ----------

$fixJsPath = Join-Path $PSScriptRoot 'fix-monster-textures.js'
$fixJs = @'
// fix-monster-textures.js -- weld PNG textures into GLBs
// args: <toolDir> <modelsRoot> <cacheRoot> <mapFile>
const fs = require('fs');
const path = require('path');
const toolDir = process.argv[2];
const modelsRoot = process.argv[3];
const cacheRoot = process.argv[4];
const mapFile = process.argv[5];
const { NodeIO } = require(path.join(toolDir, 'node_modules', '@gltf-transform', 'core'));

function walk(dir, exts, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.indexOf(path.extname(e.name).toLowerCase()) >= 0) out.push(p);
  }
  return out;
}

const cacheFiles = walk(cacheRoot, ['.mtl', '.png', '.jpg', '.jpeg']);
const byName = new Map();
for (const f of cacheFiles) {
  const n = path.basename(f).toLowerCase();
  if (!byName.has(n)) byName.set(n, f);
}

const io = new NodeIO();
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

(async function() {
  for (const rel of Object.keys(map)) {
    const base = map[rel];
    const glb = path.join(modelsRoot, rel);
    if (!fs.existsSync(glb)) { console.log('[skip] ' + rel); continue; }
    let doc;
    try { doc = await io.read(glb); } catch (e) { console.log('[skip] ' + rel + ': ' + e.message); continue; }
    if (doc.getRoot().listTextures().length > 0) { console.log('[ok] ' + rel + ' already textured'); continue; }
    let texFile = null;
    const mtl = byName.get((base + '.mtl').toLowerCase());
    if (mtl) {
      const c = fs.readFileSync(mtl, 'utf8');
      const m = c.match(/^\s*map_Kd\s+(.+)$/mi);
      if (m) {
        const want = path.basename(m[1].trim()).toLowerCase();
        texFile = byName.get(want) || null;
      }
    }
    if (!texFile) {
      for (const entry of byName) {
        const n = entry[0];
        if ((n.endsWith('.png') || n.endsWith('.jpg')) && n.indexOf(base.toLowerCase()) >= 0) { texFile = entry[1]; break; }
      }
    }
    if (!texFile) { console.log('[MISS] ' + rel + ': no texture found for ' + base); continue; }
    const mime = texFile.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const tex = doc.createTexture(path.basename(texFile))
      .setImage(fs.readFileSync(texFile))
      .setMimeType(mime);
    const mats = doc.getRoot().listMaterials();
    for (const mat of mats) { mat.setBaseColorTexture(tex); }
    await io.write(glb, doc);
    console.log('[FIXED] ' + rel + ' <- ' + path.basename(texFile));
  }
})().catch(function(e) { console.log('[error] ' + e.message); });
'@
Set-Content -Path $fixJsPath -Value $fixJs -Encoding ASCII

# ---------- download the monster pack (uses cache if present) ----------

function Download-Zip-Extract($url, $dir) {
    $zip = Join-Path $env:TEMP ((Split-Path $dir -Leaf) + '.zip')
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -Headers $UA
    Expand-Archive -Path $zip -DestinationPath $dir -Force
    Remove-Item $zip -Force
}

$monDir = Join-Path $work 'quaternius-cute-monsters'
if (-not (Test-Path $monDir)) {
    Write-Host "[ downloading ] quaternius-cute-monsters ..." -ForegroundColor Cyan
    $ok = $false
    foreach ($u in @(
        'https://opengameart.org/sites/default/files/cute_animated_monsters_-_aug_2020.zip'
    )) {
        try { Download-Zip-Extract $u $monDir; $ok = $true; break } catch {}
    }
    if (-not $ok) {
        Write-Host "[FAIL] download failed; get it manually:" -ForegroundColor Red
        Write-Host "       https://opengameart.org/content/textured-cute-monster-pack" -ForegroundColor Red
        exit 1
    }
    Write-Host "[done] pack downloaded" -ForegroundColor Green
} else {
    Write-Host "[skip] pack already cached" -ForegroundColor Yellow
}

# ---------- convert every monster ----------

$monsters = @(Get-ChildItem -Path $monDir -Recurse -Filter '*.fbx' | Sort-Object Name)
if ($monsters.Count -eq 0) {
    $monsters = @(Get-ChildItem -Path $monDir -Recurse -Filter '*.obj' | Sort-Object Name)
}
Write-Host "[info] found $($monsters.Count) monster(s)" -ForegroundColor Cyan

$monMap = @{}
$done = 0
foreach ($f in $monsters) {
    $name = $f.BaseName.ToLower()
    $rel = "monsters_backup/$name.glb"
    $dest = Join-Path $backup "$name.glb"
    $okConv = $false
    if ($f.Extension -ieq '.fbx') {
        Push-Location $f.DirectoryName
        & npx --yes fbx2gltf -i $f.FullName -o $dest -b 2>&1 | Out-Null
        Pop-Location
        if ((Test-Path "$dest.glb") -and -not (Test-Path $dest)) { Move-Item "$dest.glb" $dest -Force }
        $okConv = Test-Path $dest
        if (-not $okConv) {
            $objAlt = Get-ChildItem -Path $work -Recurse -Filter ($f.BaseName + '.obj') -ErrorAction SilentlyContinue |
                      Select-Object -First 1
            if ($objAlt) {
                Push-Location $objAlt.DirectoryName
                & npx --yes obj2gltf -i $objAlt.FullName -o $dest 2>&1 | Out-Null
                Pop-Location
                $okConv = Test-Path $dest
            }
        }
    } else {
        Push-Location $f.DirectoryName
        & npx --yes obj2gltf -i $f.FullName -o $dest 2>&1 | Out-Null
        Pop-Location
        $okConv = Test-Path $dest
    }
    if ($okConv) {
        $done++
        $monMap[$rel] = $f.BaseName
        Write-Host "[OK] $rel" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $name (conversion)" -ForegroundColor Red
    }
}

# ---------- weld textures ----------

Write-Host ""
Write-Host "===== welding textures =====" -ForegroundColor Magenta

if ($monMap.Count -eq 0) {
    Write-Host "[info] nothing converted" -ForegroundColor Yellow
} elseif (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[info] npm not found, skipping texture weld" -ForegroundColor Yellow
} else {
    $toolDir = Join-Path $work '_glbtool'
    if (-not (Test-Path (Join-Path $toolDir 'node_modules\@gltf-transform\core\package.json'))) {
        Write-Host "[setup] installing @gltf-transform/core (one time) ..." -ForegroundColor Cyan
        New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
        Push-Location $toolDir
        if (-not (Test-Path 'package.json')) { & npm init -y 2>&1 | Out-Null }
        & npm i @gltf-transform/core --no-fund --no-audit --loglevel=error 2>&1 | Out-Null
        Pop-Location
    }
    $mapFile = Join-Path $work 'monmap_backup.json'
    ($monMap | ConvertTo-Json) | Set-Content $mapFile -Encoding ASCII
    & node $fixJsPath $toolDir $modelsRoot $work $mapFile
}

# ---------- summary ----------

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " EXPORT DONE: $done / $($monsters.Count) monsters"
Write-Host " Backup folder: $backup"
Write-Host "------------------------------------------------------------"
Get-ChildItem $backup -Filter '*.glb' | ForEach-Object { Write-Host "   $($_.Name)" }
Write-Host "------------------------------------------------------------"
Write-Host " Usage: copy e.g. panda.glb over characters\me.glb, Ctrl+F5"
Write-Host "============================================================"