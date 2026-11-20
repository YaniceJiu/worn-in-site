// 把「植物拼贴制作」所需的所有文件打成一个 zip 包（纯 Node.js，无第三方依赖）
// 用法：node tools/pack_collage_kit.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'botanical-collage-kit.zip');

function collectFiles() {
  const files = [
    'wix/botanical-builder.html',
    'wix/README.md',
    'editors/botanical-plant-editor.html',
    'assets/botanicals/plant-layout.json',
    'assets/botanicals/perfume-bottle.png',
    'assets/botanicals/fabric-vanilla.jpg',
    // Python 参考实现（可选，主程序已换成上面的 JavaScript 版）
    'tools/generate_recipe_collages_from_layout.py',
    'tools/render_plant_layout.py',
    'tools/pack_collage_kit.js',
  ];
  const plantDir = path.join(ROOT, 'assets', 'botanicals', 'plants');
  for (const name of fs.readdirSync(plantDir).sort()) {
    if (name.toLowerCase().endsWith('.png')) {
      files.push(path.join('assets', 'botanicals', 'plants', name));
    }
  }
  return files;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  return { time, date };
}

function buildZip() {
  const files = collectFiles();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const rel of files) {
    const full = path.join(ROOT, rel);
    const data = fs.readFileSync(full);
    const nameBuf = Buffer.from(rel.replace(/\\/g, '/'), 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const { time, date } = dosDateTime(fs.statSync(full).mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local header signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // UTF-8 name flag
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);      // central directory signature
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);              // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);              // extra len
    cd.writeUInt16LE(0, 32);              // comment len
    cd.writeUInt16LE(0, 34);              // disk number
    cd.writeUInt16LE(0, 36);              // internal attrs
    cd.writeUInt32LE(0, 38);              // external attrs
    cd.writeUInt32LE(offset, 42);         // local header offset

    central.push(Buffer.concat([cd, nameBuf]));
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // end of central directory
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(OUT, Buffer.concat([...chunks, centralBuf, eocd]));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`打包完成: ${OUT}`);
  console.log(`共 ${files.length} 个文件，${kb} KB`);
}

buildZip();
