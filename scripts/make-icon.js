const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SIZE = 256;
const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d98a6c"/>
      <stop offset="1" stop-color="#b8654a"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="52" fill="url(#bg)"/>
  <text x="50%" y="53%" text-anchor="middle" dominant-baseline="central"
    font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="150" fill="#f2f0e6">D</text>
</svg>
`;

const outDir = path.join(__dirname, '..', 'build-assets');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [256, 128, 64, 48, 32, 16];

async function main() {
  const { default: pngToIco } = await import('png-to-ico');
  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    pngBuffers.push(buf);
    if (size === 256) {
      fs.writeFileSync(path.join(outDir, 'icon.png'), buf);
    }
  }
  const icoBuf = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuf);
  console.log('Wrote build-assets/icon.ico and build-assets/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
