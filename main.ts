// gta6-meme-x-01 — "Waited 13 years for GTA VI"
// A code-rendered meme picture, built with Node 22 and nothing but the
// standard library. No network, no clock, no files outside this repo.
//
// What it does, every run, byte for byte the same:
//   1. Paints the meme (1200x675 PNG) into <OUTPUT_DIR>/meme.png.
//   2. Copies POST.json from the repo root to <OUTPUT_DIR>/POST.json,
//      which is where the gate reads the post's address.
//
// The picture is a Vice City sunset: a purple-to-orange sky, a low gold
// sun, a dark skyline with lit windows, palm silhouettes, a road, and
// the official make.fun ghost mark (vendored press asset
// assets/mark-1024.png, downloaded once while building this repo from
// https://make.fun/press/ — never fetched at runtime) standing in the
// scene with gold coins flying around it. The caption is set in a
// 5x7 bitmap font defined right here in this file as bitmasks; there
// are no system fonts and no image libraries anywhere. The PNG reader
// (for the ghost mark) and writer are hand-rolled on node:zlib.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const REPO_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const PIC_W = 1200;
const PIC_H = 675;
const SKYLINE_Y = 470; // horizon: sky above, road below

// ---------------------------------------------------------------------------
// Seeded random numbers (xorshift32). One fixed seed, so the skyline and
// the lit windows land in exactly the same places on every run.
// ---------------------------------------------------------------------------
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// CRC32, the checksum PNG puts at the end of every chunk.
// ---------------------------------------------------------------------------
function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = buildCrcTable();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// PNG reading. Only what the vendored ghost mark is: 8-bit, RGBA,
// non-interlaced. Anything else is an error, not a guess.
// ---------------------------------------------------------------------------
interface PngImage {
  width: number;
  height: number;
  pixels: Uint8Array; // RGBA, row-major, top to bottom
}

function paethPredict(left: number, up: number, upLeft: number): number {
  const guess = left + up - upLeft;
  const dLeft = Math.abs(guess - left);
  const dUp = Math.abs(guess - up);
  const dUpLeft = Math.abs(guess - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  if (dUp <= dUpLeft) return up;
  return upLeft;
}

function readPng(buf: Buffer): PngImage {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(signature)) {
    throw new Error('readPng: not a PNG file');
  }
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlaced = 0;
  const idatParts: Buffer[] = [];
  let cursor = 8;
  while (cursor + 12 <= buf.length) {
    const chunkLen = buf.readUInt32BE(cursor);
    const kind = buf.toString('ascii', cursor + 4, cursor + 8);
    const payload = buf.subarray(cursor + 8, cursor + 8 + chunkLen);
    if (kind === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      depth = payload[8];
      colour = payload[9];
      interlaced = payload[12];
    } else if (kind === 'IDAT') {
      idatParts.push(Buffer.from(payload));
    } else if (kind === 'IEND') {
      break;
    }
    cursor += 12 + chunkLen;
  }
  if (width === 0 || height === 0) throw new Error('readPng: no IHDR chunk');
  if (depth !== 8 || colour !== 6 || interlaced !== 0) {
    throw new Error(
      `readPng: unsupported PNG (depth=${depth} colour=${colour} interlaced=${interlaced}); need 8-bit RGBA, non-interlaced`,
    );
  }
  const raw = inflateSync(Buffer.concat(idatParts));
  const rowBytes = width * 4;
  if (raw.length !== (rowBytes + 1) * height) {
    throw new Error(`readPng: bad decompressed length ${raw.length}`);
  }
  const pixels = new Uint8Array(rowBytes * height);
  let previous = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)];
    const row = raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1));
    const target = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= 4 ? target[i - 4] : 0;
      const up = previous[i];
      const upLeft = i >= 4 ? previous[i - 4] : 0;
      const v = row[i];
      if (filter === 0) target[i] = v;
      else if (filter === 1) target[i] = (v + left) & 0xff;
      else if (filter === 2) target[i] = (v + up) & 0xff;
      else if (filter === 3) target[i] = (v + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) target[i] = (v + paethPredict(left, up, upLeft)) & 0xff;
      else throw new Error(`readPng: unknown filter ${filter} on row ${y}`);
    }
    previous = new Uint8Array(target);
  }
  return { width, height, pixels };
}

// ---------------------------------------------------------------------------
// PNG writing. 8-bit RGBA, filter 0 on every row, one IDAT, zlib level 9:
// the same pixels always compress to the same bytes.
// ---------------------------------------------------------------------------
function writePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter: None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * rowBytes, rowBytes).copy(
      raw,
      y * (rowBytes + 1) + 1,
    );
  }
  const compressed = deflateSync(raw, { level: 9 });

  const makeChunk = (kind: string, payload: Buffer): Buffer => {
    const out = Buffer.alloc(12 + payload.length);
    out.writeUInt32BE(payload.length, 0);
    out.write(kind, 4, 'ascii');
    payload.copy(out, 8);
    const crcInput = Buffer.concat([Buffer.from(kind, 'ascii'), payload]);
    out.writeUInt32BE(crc32(crcInput), 8 + payload.length);
    return out;
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter: adaptive (we use 0)
  header[12] = 0; // interlace: none

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk('IHDR', header),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// The canvas: a plain RGBA buffer plus the few drawing verbs the meme
// needs. Everything blends src-over, so translucent paint (glows,
// shadows, reflections) layers the way paint does.
// ---------------------------------------------------------------------------
type Colour = [number, number, number, number];

interface Frame {
  w: number;
  h: number;
  px: Uint8Array;
}

function makeFrame(w: number, h: number): Frame {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

function putPixel(f: Frame, x: number, y: number, c: Colour): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= f.w || yi >= f.h) return;
  const i = (yi * f.w + xi) * 4;
  if (c[3] >= 255) {
    f.px[i] = c[0];
    f.px[i + 1] = c[1];
    f.px[i + 2] = c[2];
    f.px[i + 3] = 255;
    return;
  }
  if (c[3] <= 0) return;
  const srcA = c[3] / 255;
  const dstA = f.px[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  f.px[i] = Math.round((c[0] * srcA + f.px[i] * dstA * (1 - srcA)) / outA);
  f.px[i + 1] = Math.round((c[1] * srcA + f.px[i + 1] * dstA * (1 - srcA)) / outA);
  f.px[i + 2] = Math.round((c[2] * srcA + f.px[i + 2] * dstA * (1 - srcA)) / outA);
  f.px[i + 3] = Math.round(outA * 255);
}

function paintRect(f: Frame, x: number, y: number, w: number, h: number, c: Colour): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(f.w, Math.ceil(x + w));
  const y1 = Math.min(f.h, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) putPixel(f, xx, yy, c);
  }
}

function paintDisc(f: Frame, cx: number, cy: number, r: number, c: Colour): void {
  const r2 = r * r;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) putPixel(f, xx, yy, c);
    }
  }
}

// A line is a row of overlapping discs along the segment.
function paintLine(
  f: Frame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  c: Colour,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, width / 3)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDisc(f, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, c);
  }
}

// A quadratic bezier, stroked as short line segments.
function paintQuad(
  f: Frame,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  width: number,
  c: Colour,
): void {
  const steps = 24;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    paintLine(f, px, py, x, y, width, c);
    px = x;
    py = y;
  }
}

// Paste an RGBA picture into the frame, scaled to dw x dh. The source is
// averaged in little boxes, which keeps a big downscale (1024 -> 330)
// smooth instead of crunchy. Transparent source pixels stay transparent.
function pasteImage(f: Frame, src: PngImage, dx: number, dy: number, dw: number, dh: number): void {
  for (let yy = 0; yy < dh; yy++) {
    const sy0 = Math.floor((yy / dh) * src.height);
    const sy1 = Math.max(sy0 + 1, Math.floor(((yy + 1) / dh) * src.height));
    for (let xx = 0; xx < dw; xx++) {
      const sx0 = Math.floor((xx / dw) * src.width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((xx + 1) / dw) * src.width));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sy * src.width + sx) * 4;
          const sa = src.pixels[si + 3] / 255;
          r += src.pixels[si] * sa;
          g += src.pixels[si + 1] * sa;
          b += src.pixels[si + 2] * sa;
          a += src.pixels[si + 3];
          n++;
        }
      }
      if (n === 0 || a === 0) continue;
      const avgA = a / n;
      const unpre = Math.max(1e-6, avgA / 255);
      putPixel(f, dx + xx, dy + yy, [
        Math.round(r / n / unpre),
        Math.round(g / n / unpre),
        Math.round(b / n / unpre),
        Math.round(avgA),
      ]);
    }
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColour(c0: Colour, c1: Colour, t: number): Colour {
  return [
    Math.round(mix(c0[0], c1[0], t)),
    Math.round(mix(c0[1], c1[1], t)),
    Math.round(mix(c0[2], c1[2], t)),
    Math.round(mix(c0[3], c1[3], t)),
  ];
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. One glyph = seven rows, each row a 5-bit number; the
// top bit is the leftmost column. Only the characters the meme uses:
// capitals, digits, space, '.' and '$'.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [14, 16, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 1, 14],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  $: [4, 15, 20, 14, 5, 30, 4],
};

// One glyph cell is 6 units wide (5 + 1 of spacing); the last glyph of a
// run drops its trailing spacing.
function runWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : text.length * 6 * scale - scale;
}

// Paint one run left-aligned at (x, y). The outline is drawn first, in
// eight small offsets around the fill, so the letters read on any
// background. Returns the width painted.
function paintRun(
  f: Frame,
  text: string,
  x: number,
  y: number,
  scale: number,
  ink: Colour,
  edge: Colour,
): number {
  const o = Math.max(2, Math.round(scale * 0.22));
  const offsets: Array<[number, number, Colour]> = [
    [-o, -o, edge],
    [0, -o, edge],
    [o, -o, edge],
    [-o, 0, edge],
    [o, 0, edge],
    [-o, o, edge],
    [0, o, edge],
    [o, o, edge],
    [0, 0, ink],
  ];
  for (const [dx, dy, colour] of offsets) {
    let cx = x + dx;
    const cy = y + dy;
    for (const ch of text) {
      const rows = GLYPHS[ch] ?? GLYPHS[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (rows[row] & (1 << (4 - col))) {
            paintRect(f, cx + col * scale, cy + row * scale, scale, scale, colour);
          }
        }
      }
      cx += 6 * scale;
    }
  }
  return runWidth(text, scale);
}

function paintCentred(
  f: Frame,
  text: string,
  cx: number,
  y: number,
  scale: number,
  ink: Colour,
  edge: Colour,
): void {
  paintRun(f, text, cx - runWidth(text, scale) / 2, y, scale, ink, edge);
}

// One centred line made of several coloured runs laid end to end.
function paintMixedLine(
  f: Frame,
  parts: Array<[string, Colour]>,
  cx: number,
  y: number,
  scale: number,
  edge: Colour,
): void {
  const total = parts.reduce((sum, [t]) => sum + runWidth(t, scale) + scale, 0) - scale;
  let x = cx - total / 2;
  for (const [t, ink] of parts) {
    const w = paintRun(f, t, x, y, scale, ink, edge);
    x += w + scale;
  }
}

// A four-point sparkle: a diamond of radius r.
function paintSparkle(f: Frame, cx: number, cy: number, r: number, c: Colour): void {
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      if (Math.abs(xx - cx) / r + Math.abs(yy - cy) / r <= 1) {
        putPixel(f, xx, yy, c);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A palm silhouette: a curving trunk that thins toward the crown, seven
// drooping fronds, and two coconuts. baseX/baseY is where the trunk meets
// the ground; lean bends the crown sideways; s scales the whole tree.
// ---------------------------------------------------------------------------
function paintPalm(f: Frame, baseX: number, baseY: number, lean: number, s: number): void {
  const SIL: Colour = [18, 8, 31, 255];
  const crownX = baseX + lean * s;
  const crownY = baseY - 190 * s;
  // Trunk, in twelve short segments so it bends.
  const steps = 12;
  let px = baseX;
  let py = baseY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = baseX + lean * s * t * t;
    const y = baseY - 190 * s * t;
    paintLine(f, px, py, x, y, Math.max(3, 16 * s * (1 - t * 0.55)), SIL);
    px = x;
    py = y;
  }
  // Fronds fan out from the crown: [control dx, control dy, end dx, end dy].
  const fronds: Array<[number, number, number, number]> = [
    [-140, -60, -205, 45],
    [-105, -105, -185, -25],
    [-45, -125, -85, -55],
    [15, -135, 45, -100],
    [75, -115, 145, -50],
    [125, -75, 200, 20],
    [145, -25, 210, 80],
  ];
  for (const [c1x, c1y, ex, ey] of fronds) {
    paintQuad(
      f,
      crownX,
      crownY,
      crownX + c1x * s,
      crownY + c1y * s,
      crownX + ex * s,
      crownY + ey * s,
      7 * s,
      SIL,
    );
  }
  // Coconuts tucked under the crown.
  paintDisc(f, crownX - 10 * s, crownY + 8 * s, 7 * s, SIL);
  paintDisc(f, crownX + 8 * s, crownY + 12 * s, 6 * s, SIL);
}

// ---------------------------------------------------------------------------
// The meme itself.
// The joke, in one contrast: thirteen years of waiting for GTA VI —
// while my agent didn't wait at all, it already got paid on make.fun.
// ---------------------------------------------------------------------------
const PAPER: Colour = [255, 255, 255, 255];
const GOLD: Colour = [255, 209, 102, 255];
const INK: Colour = [16, 8, 24, 255];

function renderMeme(ghost: PngImage): Frame {
  const f = makeFrame(PIC_W, PIC_H);
  const rng = makeRandom(20261120);

  // Sky: deep purple at the top, through magenta, to sunset orange at
  // the horizon. Painted one horizontal band per row.
  const stops: Array<[number, Colour]> = [
    [0, [27, 15, 59, 255]],
    [0.42, [123, 30, 110, 255]],
    [0.72, [196, 28, 131, 255]],
    [1, [255, 107, 53, 255]],
  ];
  for (let y = 0; y < SKYLINE_Y; y++) {
    const t = y / SKYLINE_Y;
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    paintRect(f, 0, y, PIC_W, 1, mixColour(c0, c1, (t - t0) / (t1 - t0)));
  }

  // The sun, half-sunk behind the skyline: a faint glow first, then the
  // gold disc with a paler centre.
  const sunX = 600;
  const sunY = 415;
  for (let r = 190; r > 120; r -= 6) {
    paintDisc(f, sunX, sunY, r, [255, 150, 80, 14]);
  }
  paintDisc(f, sunX, sunY, 120, [255, 209, 102, 255]);
  paintDisc(f, sunX, sunY, 96, [255, 226, 150, 255]);

  // Skyline: dark blocks of random width and height marching across the
  // horizon, some with a blinking-red rooftop antenna, most with a few
  // warm lit windows.
  const BLOCK: Colour = [23, 10, 42, 255];
  let bx = -20;
  while (bx < PIC_W + 20) {
    const bw = 55 + Math.floor(rng() * 75);
    const bh = 55 + Math.floor(rng() * 130);
    const by = SKYLINE_Y - bh;
    paintRect(f, bx, by, bw, bh, BLOCK);
    if (rng() < 0.3) {
      paintRect(f, bx + bw / 2 - 2, by - 26, 4, 26, BLOCK);
      paintDisc(f, bx + bw / 2, by - 28, 3, [255, 80, 90, 255]);
    }
    for (let wy = 0; wy < 7; wy++) {
      for (let wx = 0; wx < Math.floor(bw / 16); wx++) {
        if (rng() < 0.32) {
          const lit: Colour = rng() < 0.6 ? [255, 209, 102, 255] : [255, 158, 94, 255];
          paintRect(f, bx + 8 + wx * 16, by + 12 + wy * 18, 8, 10, lit);
        }
      }
    }
    bx += bw + 4 + Math.floor(rng() * 14);
  }

  // Road: a dark strip below the horizon, faint orange reflections of
  // the sunset on it, and a dashed gold centre line.
  paintRect(f, 0, SKYLINE_Y, PIC_W, PIC_H - SKYLINE_Y, [20, 13, 31, 255]);
  for (let i = 0; i < 26; i++) {
    const rx = Math.floor(rng() * PIC_W);
    const rw = 30 + Math.floor(rng() * 90);
    paintRect(f, rx, SKYLINE_Y + 8 + Math.floor(rng() * 40), rw, 3, [255, 107, 53, 26]);
  }
  for (let x = 20; x < PIC_W; x += 110) {
    paintRect(f, x, 530, 62, 7, [255, 209, 102, 255]);
  }

  // Palm silhouettes framing the scene, one tall on the left, one
  // shorter on the right.
  paintPalm(f, 92, SKYLINE_Y + 6, -14, 0.95);
  paintPalm(f, 1162, SKYLINE_Y + 6, 8, 0.65);

  // The make.fun ghost, big and unmistakable at the right of the road,
  // like the main character of the scene. Official mark, averaged down
  // from 1024 to 330. A soft dark patch under it grounds it on the road.
  const ghostW = 330;
  const ghostH = 330;
  const ghostX = 822;
  const ghostY = 196;
  paintDisc(f, ghostX + ghostW / 2, ghostY + ghostH - 4, 150, [0, 0, 0, 60]);
  pasteImage(f, ghost, ghostX, ghostY, ghostW, ghostH);

  // Gold coins and sparkles around the ghost: it is getting paid.
  const coin = (cx: number, cy: number, r: number): void => {
    paintDisc(f, cx, cy, r, [196, 28, 131, 255]);
    paintDisc(f, cx, cy, r - 3, [255, 209, 102, 255]);
    const dollar = '$';
    paintRun(
      f,
      dollar,
      cx - runWidth(dollar, 3) / 2,
      cy - 10,
      3,
      [122, 77, 0, 255],
      [122, 77, 0, 255],
    );
  };
  coin(768, 246, 20);
  coin(740, 400, 16);
  paintSparkle(f, 706, 318, 13, [255, 255, 255, 255]);
  paintSparkle(f, 1176, 196, 11, GOLD);
  paintSparkle(f, 806, 512, 9, [255, 255, 255, 220]);

  // Headline (top): the thirteen-year wait.
  paintCentred(f, 'WAITED 13 YEARS', PIC_W / 2, 26, 11, PAPER, INK);
  paintMixedLine(
    f,
    [
      ['FOR ', PAPER],
      ['GTA VI', GOLD],
    ],
    PIC_W / 2,
    122,
    11,
    INK,
  );

  // Punchline (bottom, on the road): the agent did not wait.
  paintCentred(f, 'MY AGENT ALREADY', PIC_W / 2, 544, 8, PAPER, INK);
  paintMixedLine(
    f,
    [
      ['GOT PAID ON ', PAPER],
      ['MAKE.FUN', GOLD],
    ],
    PIC_W / 2,
    606,
    8,
    INK,
  );

  return f;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });

  // The ghost mark, vendored from the official press kit (never fetched
  // here, never read from anywhere outside this repository).
  const ghost = readPng(readFileSync(join(REPO_DIR, 'assets', 'mark-1024.png')));
  const meme = renderMeme(ghost);
  writeFileSync(join(OUT_DIR, 'meme.png'), writePng(PIC_W, PIC_H, meme.px));

  // The post's address, for the gate.
  copyFileSync(join(REPO_DIR, 'POST.json'), join(OUT_DIR, 'POST.json'));
}

main();
