# ============================================================
# export_all_monsters.ps1 v3 -- convert ALL 21 Quaternius cute
# monsters to textured GLB, saved as models\monsters_backup\
# v3: also strips VERTEX COLORS (COLOR_0). Quaternius OBJs carry
#     baked dark vertex colors; renderers multiply them with the
#     texture, which keeps models dark even after metallic=0.
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

# ---------- generate fix-monster-textures.js (welder v3) ----------

$fixJsPath = Join-Path $PSScriptRoot 'fix-monster-textures.js'
$fixJs = @'
// fix-monster-textures.js v3 -- weld PNG textures into GLBs,
// repair materials (metallic=0, rough=1, white base) AND strip
// dark vertex colors (COLOR_0) that multiply with the texture.
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

    const notes = [];

    // --- 1) material repair ---
    const mats = doc.getRoot().listMaterials();
    for (const mat of mats) {
      mat.setMetallicFactor(0);
      mat.setRoughnessFactor(1);
      mat.setBaseColorFactor([1, 1, 1, 1]);
      mat.setDoubleSided(true);
    }
    notes.push('material-fixed');

    // --- 2) strip vertex colors (they darken the texture) ---
    let stripped = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const col = prim.getAttribute('COLOR_0');
        if (col) { prim.setAttribute('COLOR_0', null); col.dispose(); stripped++; }
      }
    }
    if (stripped > 0) notes.push('vertex-colors-stripped(' + stripped + ')');

    // --- 3) texture weld (only if missing) ---
    if (doc.getRoot().listTextures().length === 0) {
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
      if (texFile) {
        const mime = texFile.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const tex = doc.createTexture(path.basename(texFile))
          .setImage(fs.readFileSync(texFile))
          .setMimeType(mime);
        for (const mat of mats) { mat.setBaseColorTexture(tex); }
        notes.push('textured <- ' + path.basename(texFile));
      } else {
        notes.push('NO-texture-found');
      }
    }

    await io.write(glb, doc);
    console.log('[FIXED] ' + rel + ' : ' + notes.join(', '));
  }
})().catch(function(e) { console.log('[error] ' + e.message); });
'@
Set-Content -Path $fixJsPath -Value $fixJs -Encoding ASCII

# ---------- generate glb-info.js (zero-dependency diagnostic) ----------

$infoJsPath = Join-Path $PSScriptRoot 'glb-info.js'
$infoJs = @'
// glb-info.js -- dump what makes a glb dark (zero dependencies)
// usage: node glb-info.js <file.glb>
const fs = require('fs');
const file = process.argv[2];
const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.log('not a glb'); process.exit(1); }
const jsonLen = buf.readUInt32LE(12);
const j = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
console.log('file: ' + file);
console.log('images/textures: ' + (j.images || []).length + ' / ' + (j.textures || []).length);
(j.materials || []).forEach(function(m, i) {
  const p = m.pbrMetallicRoughness || {};
  console.log('material[' + i + '] ' + (m.name || ''));
  console.log('  baseColorFactor: ' + JSON.stringify(p.baseColorFactor || [1,1,1,1]));
  console.log('  metallicFactor : ' + (p.metallicFactor !== undefined ? p.metallicFactor : 1));
  console.log('  roughnessFactor: ' + (p.roughnessFactor !== undefined ? p.roughnessFactor : 1));
  console.log('  baseColorTexture: ' + (p.baseColorTexture ? 'yes' : 'NO'));
  if (m.emissiveFactor) console.log('  emissiveFactor: ' + JSON.stringify(m.emissiveFactor));
});
let hasVC = false;
(j.meshes || []).forEach(function(mesh) {
  (mesh.primitives || []).forEach(function(pr) {
    if (pr.attributes && pr.attributes.COLOR_0 !== undefined) hasVC = true;
  });
});
console.log('vertex colors (COLOR_0): ' + (hasVC ? 'YES (multiplies with texture -> darker)' : 'no'));
'@
Set-Content -Path $infoJsPath -Value $infoJs -Encoding ASCII

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
    try {
        Download-Zip-Extract 'https://opengameart.org/sites/default/files/cute_animated_monsters_-_aug_2020.zip' $monDir
        Write-Host "[done] pack downloaded" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] download failed; get it manually:" -ForegroundColor Red
        Write-Host "       https://opengameart.org/content/textured-cute-monster-pack" -ForegroundColor Red
        exit 1
    }
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

# ---------- weld textures + repair materials + strip vertex colors ----------

Write-Host ""
Write-Host "===== weld + brighten + strip vertex colors =====" -ForegroundColor Magenta

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
Write-Host " If STILL dark, run this and paste the output:"
Write-Host "   node `"$infoJsPath`" `"$backup\panda.glb`""
Write-Host "============================================================"