#!/usr/bin/env node
/**
 * Renders the app's own logo mark into every icon slot app.json declares.
 *
 * The project shipped with the Expo template's blue arrow in all of them, so
 * the launcher, the task switcher and the native splash showed a logo belonging
 * to a different app entirely -- while the JS loading screen showed the real
 * one, because that draws the same vectors this script does.
 *
 * Rasterised here rather than exported from a design tool so the icons cannot
 * drift from `src/components/Logo.tsx`: both are generated from the same two
 * polygons, and this script is re-runnable. It writes PNGs with nothing but
 * Node's own zlib -- sharp is not installed in this project and the icons are
 * flat-colour shapes that do not need it.
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Kept in sync with LOGO_GREEN / LOGO_SLATE in src/components/Logo.tsx.
const GREEN = [0x8f, 0xae, 0x8f];
const SLATE = [0x47, 0x58, 0x6b];
const CREAM = [0xfa, 0xf8, 0xf2];
const INK = [0x26, 0x33, 0x2e];

/**
 * The two house silhouettes, as points in the same 100x100 viewBox the SVG
 * uses. Back house first so the front one overlaps it, exactly as in the
 * component.
 */
const BACK_HOUSE = [
  [8, 46], [34, 20], [52, 38], [52, 84], [30, 84], [30, 64], [20, 64], [20, 84], [8, 84],
];
const FRONT_HOUSE = [
  [46, 48], [66, 28], [66, 16], [76, 16], [76, 28], [92, 44], [92, 84], [58, 84], [58, 60], [46, 60],
];

const VIEWBOX = 100;

/**
 * Per-pixel coverage of a polygon, 0..1.
 *
 * Scanline fill at `ss` samples per pixel in each axis: an edge-intersection
 * pass per sample row is far cheaper than testing every sample against every
 * edge, and 4x4 sampling is enough anti-aliasing for shapes this simple.
 */
function coverage(points, size, scale, offsetX, offsetY, ss = 4) {
  const out = new Float32Array(size * size);
  const samples = ss * ss;
  const toX = (p) => p[0] * scale + offsetX;
  const toY = (p) => p[1] * scale + offsetY;

  for (let sy = 0; sy < size * ss; sy++) {
    const y = (sy + 0.5) / ss;
    const crossings = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const ay = toY(a);
      const by = toY(b);
      if (ay === by) continue;
      // Half-open test on y, so a vertex shared by two edges is counted once.
      if (y >= Math.min(ay, by) && y < Math.max(ay, by)) {
        const t = (y - ay) / (by - ay);
        crossings.push(toX(a) + t * (toX(b) - toX(a)));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p - q);

    const row = Math.floor(sy / ss) * size;
    for (let c = 0; c + 1 < crossings.length; c += 2) {
      const from = Math.max(0, Math.ceil(crossings[c] * ss - 0.5));
      const to = Math.min(size * ss - 1, Math.floor(crossings[c + 1] * ss - 0.5));
      for (let sx = from; sx <= to; sx++) {
        out[row + Math.floor(sx / ss)] += 1 / samples;
      }
    }
  }
  return out;
}

/** Paints `color` over the RGBA buffer wherever `cov` says so. */
function composite(rgba, cov, color) {
  for (let i = 0; i < cov.length; i++) {
    const a = Math.min(1, cov[i]);
    if (a <= 0) continue;
    const o = i * 4;
    const dstA = rgba[o + 3] / 255;
    const outA = a + dstA * (1 - a);
    for (let c = 0; c < 3; c++) {
      const src = color[c] * a;
      const dst = rgba[o + c] * dstA * (1 - a);
      rgba[o + c] = outA === 0 ? 0 : Math.round((src + dst) / outA);
    }
    rgba[o + 3] = Math.round(outA * 255);
  }
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte per scanline; filter 0 (none) compresses these flat shapes
  // as well as anything and keeps this encoder simple.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1);
    raw[at] = 0;
    rgba.copy(raw, at + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param size        output edge in pixels
 * @param background  RGB array, or null for transparent
 * @param inset       fraction of the canvas the mark occupies
 * @param flat        single colour for both houses (the monochrome slot)
 */
function render({ size, background = null, inset = 0.68, flat = null }) {
  const rgba = Buffer.alloc(size * size * 4);
  if (background) {
    for (let i = 0; i < size * size; i++) {
      rgba[i * 4] = background[0];
      rgba[i * 4 + 1] = background[1];
      rgba[i * 4 + 2] = background[2];
      rgba[i * 4 + 3] = 255;
    }
  }

  const scale = (size * inset) / VIEWBOX;
  const offset = (size - VIEWBOX * scale) / 2;

  composite(rgba, coverage(BACK_HOUSE, size, scale, offset, offset), flat ?? GREEN);
  composite(rgba, coverage(FRONT_HOUSE, size, scale, offset, offset), flat ?? SLATE);

  return encodePng(rgba, size);
}

const images = path.join(__dirname, '..', 'assets', 'images');

const outputs = [
  // Full-bleed square; iOS and the Play Store apply their own rounding.
  ['icon.png', { size: 1024, background: CREAM, inset: 0.62 }],
  // Adaptive icons crop hard: Android may mask to a circle, and only the middle
  // ~66% of the foreground is guaranteed visible.
  ['android-icon-foreground.png', { size: 1024, inset: 0.42 }],
  ['android-icon-background.png', { size: 1024, background: CREAM, inset: 0 }],
  // Themed icons are tinted from the alpha channel, so this one is a single
  // flat colour on transparency rather than the two-tone mark.
  ['android-icon-monochrome.png', { size: 1024, inset: 0.42, flat: INK }],
  // Composited over the splash backgroundColor declared in app.json.
  ['splash-icon.png', { size: 512, inset: 0.86 }],
  ['favicon.png', { size: 64, background: CREAM, inset: 0.72 }],
];

for (const [name, options] of outputs) {
  const png = render(options);
  fs.writeFileSync(path.join(images, name), png);
  console.log(`wrote ${name} (${options.size}px, ${png.length} bytes)`);
}
