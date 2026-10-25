import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const iconPaths = [
  ['native App Store icon', path.join('ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')],
  ['Expo project icon', path.join('assets', 'icon.png')],
];

export async function validateAppIcons(projectRoot) {
  for (const [label, relativePath] of iconPaths) {
    const filename = path.join(projectRoot, relativePath);
    const png = await readFile(filename);
    if (png.length < 33 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`${label} must be a valid PNG: ${relativePath}`);
    }
    const headerLength = png.readUInt32BE(8);
    if (headerLength !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error(`${label} is missing a valid PNG IHDR: ${relativePath}`);
    }
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const colorType = png[25];
    if (width !== 1024 || height !== 1024) {
      throw new Error(`${label} must be 1024x1024; found ${width}x${height}: ${relativePath}`);
    }
    if (colorType !== 2) {
      throw new Error(`${label} must use opaque RGB PNG color type 2; found type ${colorType}: ${relativePath}`);
    }

    let offset = 8;
    let foundEnd = false;
    while (offset + 12 <= png.length) {
      const chunkLength = png.readUInt32BE(offset);
      const chunkType = png.toString('ascii', offset + 4, offset + 8);
      const nextOffset = offset + chunkLength + 12;
      if (nextOffset > png.length) throw new Error(`${label} has a truncated PNG chunk: ${relativePath}`);
      if (chunkType === 'tRNS') throw new Error(`${label} must not contain a PNG transparency chunk: ${relativePath}`);
      if (chunkType === 'IEND') { foundEnd = true; break; }
      offset = nextOffset;
    }
    if (!foundEnd) throw new Error(`${label} is missing a PNG IEND chunk: ${relativePath}`);
    console.log(`Validated opaque 1024x1024 RGB app icon: ${relativePath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await validateAppIcons(process.argv[2] ? path.resolve(process.argv[2]) : process.cwd());
}
