// frame-metrics — per-frame luminance / magenta / black-fraction stats for A/B
// comparisons (the 12.4 look review: default vs contrast=1 vs facadeDetail=0).
// Usage: node frame-metrics.mjs <frame.png> [more frames...]
// Prints mean luminance (0-255), magenta-pixel fraction (missing-texture tell),
// and near-black pixel fraction, sampled every 2nd pixel.

import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
for (const f of files) {
  const png = PNG.sync.read(readFileSync(f));
  let lum = 0,
    n = 0,
    mag = 0,
    dark = 0;
  const W = png.width,
    H = png.height;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) << 2;
      const r = png.data[i],
        g = png.data[i + 1],
        b = png.data[i + 2];
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++;
      if (r > 180 && g < 90 && b > 120) mag++;
      if (r < 12 && g < 12 && b < 12) dark++;
    }
  }
  console.log(
    `${f.split('/').pop().padEnd(34)} meanL=${(lum / n).toFixed(1)} magenta=${((mag / n) * 100).toFixed(2)}% black=${((dark / n) * 100).toFixed(1)}%`,
  );
}
