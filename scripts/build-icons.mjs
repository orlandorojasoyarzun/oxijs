// Regenerates PNG + ICO icon assets from build/icon-source.svg.
// Run via: node scripts/build-icons.mjs
//
// The SVG source must already have its colors pre-injected (the Phosphor
// "file-js-light" path uses currentColor, but we replace that with explicit
// #475569 for the folder and #ffffff for the JS glyph).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const SOURCE = path.join(BUILD_DIR, 'icon-source.svg');

const TARGETS = [
  // [filename, size]
  ['1024x1024.png', 1024],
  ['512x512.png', 512],
  ['128x128@2x.png', 256],
  ['128x128.png', 128],
  ['32x32.png', 32],
];

async function build() {
  const svg = await fs.readFile(SOURCE);
  console.log(`Source: ${SOURCE}`);

  // PNG variants
  for (const [name, size] of TARGETS) {
    const out = path.join(BUILD_DIR, name);
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    const stat = await fs.stat(out);
    console.log(`  ${name.padEnd(20)} ${size}x${size}  ${(stat.size / 1024).toFixed(1)} KB`);
  }

  // Default icon.png — electron-builder reads this. 512x512 covers everything.
  const icon512 = await sharp(svg, { density: 384 })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(BUILD_DIR, 'icon.png'), icon512);
  console.log(`  icon.png             512x512  (default for electron-builder)`);

  // Multi-resolution ICO for Windows (to-ico composes a real .ico from PNGs).
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngs = await Promise.all(
    icoSizes.map((s) =>
      sharp(svg, { density: 384 })
        .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );
  const icoBuffer = await toIco(icoPngs);
  await fs.writeFile(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
  console.log(`  icon.ico             multi    ${(icoBuffer.length / 1024).toFixed(1)} KB  (${icoSizes.join(', ')})`);

  console.log('\nDone.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});