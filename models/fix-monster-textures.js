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
