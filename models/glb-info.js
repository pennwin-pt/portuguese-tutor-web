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
