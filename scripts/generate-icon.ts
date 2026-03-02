/**
 * One-off script to generate images/icon.png for the extension marketplace.
 * Uses pngjs (already a dependency) to produce a 128x128 PNG.
 * Run once: bun run scripts/generate-icon.ts
 */
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'fs';

const SIZE = 128;
const png = new PNG({ width: SIZE, height: SIZE });

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (SIZE * y + x) * 4;

    // Deep blue-purple gradient background
    const r = Math.round(20 + (x / SIZE) * 30);
    const g = Math.round(10 + (y / SIZE) * 20);
    const b = Math.round(60 + ((x + y) / (SIZE * 2)) * 80);

    // Draw a simple camera aperture / sparkle shape
    const cx = x - SIZE / 2;
    const cy = y - SIZE / 2;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const angle = Math.atan2(cy, cx);

    // Outer ring
    const onRing = dist > 44 && dist < 52;
    // Inner lens circle
    const inLens = dist < 22;
    // Sparkle blades (8-pointed star via |sin(4*angle)| gating)
    const blade = dist > 24 && dist < 44 && Math.abs(Math.sin(4 * angle)) > 0.55;
    // Corner rounding: mask everything outside a rounded square
    const rx = Math.abs(cx) - 48;
    const ry = Math.abs(cy) - 48;
    const outsideRounded = rx > 0 && ry > 0 && Math.sqrt(rx * rx + ry * ry) > 12;

    if (outsideRounded) {
      png.data[idx] = 0;
      png.data[idx + 1] = 0;
      png.data[idx + 2] = 0;
      png.data[idx + 3] = 0; // transparent corners
    } else if (onRing || blade || inLens) {
      // White/light blue icon elements
      png.data[idx] = 220;
      png.data[idx + 1] = 230;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = 255;
    } else {
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
}

mkdirSync('images', { recursive: true });
const buffer = PNG.sync.write(png);
writeFileSync('images/icon.png', buffer);
console.log('Generated images/icon.png (128x128)');
