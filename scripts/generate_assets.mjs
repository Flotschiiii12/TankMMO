import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makePng(width, height, getPixel) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crcBuf = Buffer.concat([Buffer.from(type), data]);
    buf.writeUInt32BE(crc32(crcBuf), 8 + len);
    return buf;
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const px = getPixel(x, y);
      rawData[pxOffset] = px[0];
      rawData[pxOffset + 1] = px[1];
      rawData[pxOffset + 2] = px[2];
      rawData[pxOffset + 3] = px[3];
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const assetsDir = path.resolve('public/assets');
const groundDir = path.join(assetsDir, 'ground');
const propsDir = path.join(assetsDir, 'props');
const landmarksDir = path.join(assetsDir, 'landmarks');
const fxDir = path.join(assetsDir, 'fx');

for (const dir of [groundDir, propsDir, landmarksDir, fxDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const manifestList = [];

function savePng(relPath, width, height, getPixel) {
  const fullPath = path.join(path.resolve('public'), relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const png = makePng(width, height, getPixel);
  fs.writeFileSync(fullPath, png);
  manifestList.push(relPath);
}

// Deterministic fast PRNG
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------------------
// 1. GROUND TILES (512x512 Seamless)
// -------------------------------------------------------------------------

console.log('Generating Ground Textures (512x512)...');

// Helper for seamless simplex-like soft noise
function makeSeamlessNoise(w, h, seed = 42) {
  const prng = sfc32(seed, seed * 2, seed * 3, seed * 4);
  const gridW = 16;
  const gridH = 16;
  const vals = new Float32Array(gridW * gridH);
  for (let i = 0; i < vals.length; i++) vals[i] = prng();

  return (x, y) => {
    const gx = ((x / w) * gridW) % gridW;
    const gy = ((y / h) * gridH) % gridH;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = (x0 + 1) % gridW;
    const y1 = (y0 + 1) % gridH;
    const fx = gx - x0;
    const fy = gy - y0;
    const v00 = vals[y0 * gridW + x0];
    const v10 = vals[y0 * gridW + x1];
    const v01 = vals[y1 * gridW + x0];
    const v11 = vals[y1 * gridW + x1];
    const top = v00 * (1 - fx) + v10 * fx;
    const btm = v01 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + btm * fy;
  };
}

// 1.1 meadow.png (Fresh green summer meadow)
{
  const n1 = makeSeamlessNoise(512, 512, 101);
  const n2 = makeSeamlessNoise(512, 512, 202);
  savePng('/assets/ground/meadow.png', 512, 512, (x, y) => {
    const val = n1(x, y) * 0.7 + n2(x * 2 % 512, y * 2 % 512) * 0.3;
    const r = Math.floor(82 + val * 24);
    const g = Math.floor(146 + val * 38);
    const b = Math.floor(66 + val * 20);
    return [r, g, b, 255];
  });
}

// 1.2 gravel_road.png (Compacted earth and light gravel)
{
  const n1 = makeSeamlessNoise(512, 512, 303);
  const n2 = makeSeamlessNoise(512, 512, 404);
  savePng('/assets/ground/gravel_road.png', 512, 512, (x, y) => {
    const val = n1(x, y) * 0.6 + n2(x * 4 % 512, y * 4 % 512) * 0.4;
    const r = Math.floor(158 + val * 34);
    const g = Math.floor(142 + val * 30);
    const b = Math.floor(124 + val * 26);
    return [r, g, b, 255];
  });
}

// 1.3 coastal_grass.png (Light dune grass / sandy edge)
{
  const n1 = makeSeamlessNoise(512, 512, 505);
  savePng('/assets/ground/coastal_grass.png', 512, 512, (x, y) => {
    const val = n1(x, y);
    const r = Math.floor(130 + val * 30);
    const g = Math.floor(168 + val * 35);
    const b = Math.floor(92 + val * 26);
    return [r, g, b, 255];
  });
}

// 1.4 beach_sand.png (Warm sunlit golden sand)
{
  const n1 = makeSeamlessNoise(512, 512, 606);
  savePng('/assets/ground/beach_sand.png', 512, 512, (x, y) => {
    const val = n1(x, y);
    const r = Math.floor(226 + val * 24);
    const g = Math.floor(202 + val * 22);
    const b = Math.floor(146 + val * 20);
    return [r, g, b, 255];
  });
}

// 1.5 wet_sand.png (Darker damp packed sand)
{
  const n1 = makeSeamlessNoise(512, 512, 707);
  savePng('/assets/ground/wet_sand.png', 512, 512, (x, y) => {
    const val = n1(x, y);
    const r = Math.floor(172 + val * 24);
    const g = Math.floor(150 + val * 22);
    const b = Math.floor(112 + val * 18);
    return [r, g, b, 255];
  });
}

// 1.6 shallow_water.png (Clear azure turquoise water with ripple patterns)
{
  const n1 = makeSeamlessNoise(512, 512, 808);
  const n2 = makeSeamlessNoise(512, 512, 909);
  savePng('/assets/ground/shallow_water.png', 512, 512, (x, y) => {
    const wave = Math.sin((x + y) * 0.05) * 0.15 + n1(x, y) * 0.5 + n2(y, x) * 0.35;
    const r = Math.floor(40 + wave * 30);
    const g = Math.floor(160 + wave * 55);
    const b = Math.floor(215 + wave * 40);
    return [r, g, b, 230];
  });
}

// Biome fallbacks
savePng('/assets/ground/canyon_flats.png', 512, 512, (x, y) => {
  const v = Math.sin(x * 0.04) * 15 + Math.sin(y * 0.06) * 10;
  return [Math.floor(199 + v), Math.floor(132 + v * 0.8), Math.floor(74 + v * 0.5), 255];
});
savePng('/assets/ground/frostline_pass.png', 512, 512, (x, y) => {
  const v = (x * 7 + y * 13) % 25;
  return [Math.floor(220 + v), Math.floor(230 + v), Math.floor(242 + v * 0.5), 255];
});
savePng('/assets/ground/ash_city.png', 512, 512, (x, y) => {
  const v = (x * 11 + y * 17) % 20;
  return [Math.floor(76 + v), Math.floor(80 + v), Math.floor(88 + v), 255];
});

// -------------------------------------------------------------------------
// 2. PROPS (Top-down view, transparent background, no baked shadow)
// -------------------------------------------------------------------------

console.log('Generating Props...');

// Trees 01-05 (256x256)
const treeStyles = [
  { base: [22, 101, 52], mid: [34, 197, 94], hi: [134, 239, 172] }, // Oak
  { base: [6, 78, 59], mid: [16, 185, 129], hi: [110, 231, 183] }, // Pine
  { base: [63, 98, 18], mid: [132, 204, 22], hi: [190, 242, 100] }, // Birch
  { base: [142, 24, 60], mid: [225, 29, 72], hi: [251, 113, 133] }, // Flowering cherry
  { base: [154, 52, 18], mid: [234, 88, 12], hi: [251, 146, 60] }, // Autumn maple
];

treeStyles.forEach((s, idx) => {
  const num = String(idx + 1).padStart(2, '0');
  savePng(`/assets/props/tree_${num}.png`, 128, 128, (x, y) => {
    const cx = 64, cy = 64;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Multi-lobed canopy outline
    const angle = Math.atan2(dy, dx);
    const lobe = Math.sin(angle * (5 + idx)) * 4 + Math.cos(angle * 3) * 3;
    const maxR = 52 + lobe;

    if (dist > maxR) return [0, 0, 0, 0];

    // Top-left lighting
    const lightDist = Math.sqrt((x - 44) ** 2 + (y - 44) ** 2);
    if (lightDist < 26) return [...s.hi, 255];
    if (lightDist < 46) return [...s.mid, 255];
    return [...s.base, 255];
  });
});

// Plants 01-06 (64x64)
for (let p = 1; p <= 6; p++) {
  const num = String(p).padStart(2, '0');
  savePng(`/assets/props/plant_${num}.png`, 64, 64, (x, y) => {
    const dx = x - 32;
    const dy = y - 32;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 24) return [0, 0, 0, 0];
    const light = Math.max(0, 1 - Math.sqrt((x - 24) ** 2 + (y - 24) ** 2) / 28);
    if (p % 2 === 0) {
      // Shrub with yellow/orange flowers
      if (d < 10) return [250, 204, 21, 255];
      return [Math.floor(22 + light * 40), Math.floor(130 + light * 60), Math.floor(50 + light * 30), 255];
    }
    // Fern / green foliage
    return [Math.floor(16 + light * 30), Math.floor(150 + light * 70), Math.floor(70 + light * 40), 255];
  });
}

// Stones 01-06 (64x64 faceted rocks)
for (let s = 1; s <= 6; s++) {
  const num = String(s).padStart(2, '0');
  savePng(`/assets/props/stone_${num}.png`, 64, 64, (x, y) => {
    const dx = x - 32;
    const dy = y - 32;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 22 + (s % 3) * 3) return [0, 0, 0, 0];
    const isTopLeft = (x + y) < 64;
    if (isTopLeft) {
      return [161, 161, 170, 255]; // Lit facet
    }
    return [82, 82, 91, 255]; // Shadow facet
  });
}

// Harbor 01-06 (128x128 crates, docks, buoys, bollards)
for (let h = 1; h <= 6; h++) {
  const num = String(h).padStart(2, '0');
  savePng(`/assets/props/harbor_${num}.png`, 128, 128, (x, y) => {
    const cx = 64, cy = 64;
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (h === 1) {
      // Wooden dock pier section
      if (x < 16 || x > 112 || y < 24 || y > 104) return [0, 0, 0, 0];
      const isPlank = (x % 16 < 2);
      if (isPlank) return [69, 26, 3, 255];
      return [180, 83, 9, 255];
    } else if (h === 2) {
      // Cargo barrel cluster
      if (d > 44) return [0, 0, 0, 0];
      const ring = Math.floor(d / 14);
      if (ring % 2 === 0) return [71, 85, 105, 255];
      return [30, 41, 59, 255];
    } else if (h === 3) {
      // Life buoy / ring
      if (d > 42 || d < 20) return [0, 0, 0, 0];
      const angle = Math.atan2(dy, dx);
      const isRed = Math.sin(angle * 2) > 0;
      return isRed ? [239, 68, 68, 255] : [248, 250, 252, 255];
    } else if (h === 4) {
      // Anchor & mooring chain
      if (d > 40) return [0, 0, 0, 0];
      return [51, 65, 85, 255];
    } else {
      // Wooden cargo crates stacked
      if (Math.abs(dx) > 36 || Math.abs(dy) > 36) return [0, 0, 0, 0];
      if (Math.abs(dx) === Math.abs(dy) || Math.abs(dx) < 4 || Math.abs(dy) < 4) return [120, 53, 15, 255];
      return [202, 138, 4, 255];
    }
  });
}

// Buildings 01-13 (128x128 top-down roofs)
for (let b = 1; b <= 13; b++) {
  const num = String(b).padStart(2, '0');
  savePng(`/assets/props/building_${num}.png`, 128, 128, (x, y) => {
    const w = 46 + (b % 4) * 6;
    const h = 42 + (b % 3) * 8;
    if (Math.abs(x - 64) > w || Math.abs(y - 64) > h) return [0, 0, 0, 0];

    // Border edge
    if (Math.abs(x - 64) >= w - 3 || Math.abs(y - 64) >= h - 3) return [30, 41, 59, 255];

    // Pitched roof ridge
    const isLitSlope = (y - 64) < 0;
    if (b % 3 === 0) {
      // Terracotta red tile roof
      return isLitSlope ? [239, 68, 68, 255] : [185, 28, 28, 255];
    } else if (b % 3 === 1) {
      // Slate blue roof
      return isLitSlope ? [56, 189, 248, 255] : [14, 116, 144, 255];
    } else {
      // Industrial corrugated sheet
      const rib = (x % 8 < 2);
      return rib ? [100, 116, 139, 255] : (isLitSlope ? [148, 163, 184, 255] : [71, 85, 105, 255]);
    }
  });
}

// home_base.png (256x256 Safe Zone Command Center & Hangar)
savePng('/assets/props/home_base.png', 256, 256, (x, y) => {
  const cx = 128, cy = 128;
  const dx = x - cx, dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);

  // Outer fortified perimeter
  if (d > 115) return [0, 0, 0, 0];
  if (d > 105) return [30, 41, 59, 255];

  // Hazard border
  if (d > 95) {
    const angle = Math.atan2(dy, dx);
    const stripe = Math.sin(angle * 16) > 0;
    return stripe ? [234, 179, 8, 255] : [15, 23, 42, 255];
  }

  // Inner landing / repair pad
  if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
    // Cross repair icon
    if ((Math.abs(dx) < 14 && Math.abs(dy) < 45) || (Math.abs(dy) < 14 && Math.abs(dx) < 45)) {
      return [56, 189, 248, 255]; // Luminous cyan medical/repair cross
    }
    return [51, 65, 85, 255];
  }

  return [71, 85, 105, 255];
});

// -------------------------------------------------------------------------
// 3. LANDMARK (Green Valley Lighthouse)
// -------------------------------------------------------------------------

console.log('Generating Landmark (Green Valley Lighthouse 256x256)...');

savePng('/assets/landmarks/green_valley.png', 256, 256, (x, y) => {
  const cx = 128, cy = 128;
  const dx = x - cx, dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (d > 110) return [0, 0, 0, 0];

  // Stone gallery platform base
  if (d > 88) return [100, 116, 139, 255];
  if (d > 82) return [51, 65, 85, 255]; // Metal guard rail

  // Tower concentric rings (White & Red stripes)
  const ring = Math.floor((82 - d) / 14);
  if (d > 35) {
    return ring % 2 === 0 ? [239, 68, 68, 255] : [248, 250, 252, 255];
  }

  // Lantern glass cupola & Fresnel beacon center
  if (d > 16) return [56, 189, 248, 255];
  return [254, 240, 138, 255]; // Golden beacon core
});

// -------------------------------------------------------------------------
// 4. LOOT, GATES, WRECKS & FX (fx_01 to fx_25)
// -------------------------------------------------------------------------

console.log('Generating FX & Items (fx_01 to fx_25)...');

// fx_01: Scrap crate
savePng('/assets/fx/fx_01.png', 64, 64, (x, y) => {
  if (x < 10 || x > 54 || y < 10 || y > 54) return [0, 0, 0, 0];
  if (x === 10 || x === 54 || y === 10 || y === 54) return [120, 53, 15, 255];
  // Riveted metal plate
  return [180, 83, 9, 255];
});

// fx_02: Ore / tech parts crate
savePng('/assets/fx/fx_02.png', 64, 64, (x, y) => {
  if (x < 10 || x > 54 || y < 10 || y > 54) return [0, 0, 0, 0];
  const d = Math.sqrt((x - 32) ** 2 + (y - 32) ** 2);
  if (d < 14) return [56, 189, 248, 255]; // Glowing blue crystal
  return [30, 41, 59, 255];
});

// fx_03: Ammo crate
savePng('/assets/fx/fx_03.png', 64, 64, (x, y) => {
  if (x < 10 || x > 54 || y < 10 || y > 54) return [0, 0, 0, 0];
  if (Math.abs(x - 32) < 4 || Math.abs(y - 32) < 4) return [234, 179, 8, 255];
  return [54, 83, 20, 255]; // Military olive drab
});

// fx_04: Repair kit
savePng('/assets/fx/fx_04.png', 64, 64, (x, y) => {
  if (x < 10 || x > 54 || y < 10 || y > 54) return [0, 0, 0, 0];
  // Red cross on white case
  const isCross = (Math.abs(x - 32) < 5 && Math.abs(y - 32) < 16) || (Math.abs(y - 32) < 5 && Math.abs(x - 32) < 16);
  if (isCross) return [239, 68, 68, 255];
  return [241, 245, 249, 255];
});

// fx_05: Rare tech cache
savePng('/assets/fx/fx_05.png', 64, 64, (x, y) => {
  if (x < 8 || x > 56 || y < 8 || y > 56) return [0, 0, 0, 0];
  return [168, 85, 247, 255]; // Purple epic crate
});

// fx_06: Gold bullion crate
savePng('/assets/fx/fx_06.png', 64, 64, (x, y) => {
  if (x < 8 || x > 56 || y < 8 || y > 56) return [0, 0, 0, 0];
  return [234, 179, 8, 255]; // Radiant gold
});

// fx_07: Gate portal vortex (128x128)
savePng('/assets/fx/fx_07.png', 128, 128, (x, y) => {
  const d = Math.sqrt((x - 64) ** 2 + (y - 64) ** 2);
  if (d > 60) return [0, 0, 0, 0];
  const angle = Math.atan2(y - 64, x - 64);
  const spiral = Math.sin(angle * 4 + d * 0.1);
  const alpha = Math.floor(Math.max(0, 1 - d / 60) * 220);
  return [56, Math.floor(189 + spiral * 30), 248, alpha];
});

// fx_08: Gate metallic pylon ring (128x128)
savePng('/assets/fx/fx_08.png', 128, 128, (x, y) => {
  const d = Math.sqrt((x - 64) ** 2 + (y - 64) ** 2);
  if (d > 62 || d < 48) return [0, 0, 0, 0];
  return [30, 41, 59, 255];
});

// fx_09: Burnt vehicle wreck (128x128)
savePng('/assets/fx/fx_09.png', 128, 128, (x, y) => {
  const dx = Math.abs(x - 64), dy = Math.abs(y - 64);
  if (dx > 42 || dy > 34) return [0, 0, 0, 0];
  return [41, 37, 36, 255]; // Charred stone/metal
});

// fx_10: Smoking wreck with amber embers (128x128)
savePng('/assets/fx/fx_10.png', 128, 128, (x, y) => {
  const dx = Math.abs(x - 64), dy = Math.abs(y - 64);
  if (dx > 44 || dy > 36) return [0, 0, 0, 0];
  if ((x + y) % 19 === 0) return [249, 115, 22, 255]; // Glowing ember
  return [28, 25, 23, 255];
});

// fx_12: Campfire prop (64x64)
savePng('/assets/fx/fx_12.png', 64, 64, (x, y) => {
  const d = Math.sqrt((x - 32) ** 2 + (y - 32) ** 2);
  if (d > 28) return [0, 0, 0, 0];
  if (d > 18) return [113, 113, 122, 255]; // Stone ring
  if (d > 8) return [234, 88, 12, 255]; // Fire flame
  return [254, 240, 138, 255]; // White-hot fire center
});

// fx_13 to fx_17: Muzzle flash variations (64x64)
for (let m = 13; m <= 17; m++) {
  savePng(`/assets/fx/fx_${m}.png`, 64, 64, (x, y) => {
    const dx = x - 32, dy = y - 32;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 30) return [0, 0, 0, 0];
    const angle = Math.atan2(dy, dx);
    const spike = Math.abs(Math.sin(angle * (2 + (m % 3))));
    const maxR = 12 + spike * 18;
    if (d > maxR) return [0, 0, 0, 0];
    if (d < 8) return [255, 255, 255, 255];
    return [251, 191, 36, 230];
  });
}

// fx_18: Cannon shell (32x32)
savePng('/assets/fx/fx_18.png', 32, 32, (x, y) => {
  const dx = Math.abs(x - 16), dy = Math.abs(y - 16);
  if (dx > 5 || dy > 11) return [0, 0, 0, 0];
  return [251, 146, 60, 255];
});

// fx_19: Tracer (32x32)
savePng('/assets/fx/fx_19.png', 32, 32, (x, y) => {
  const dx = Math.abs(x - 16), dy = Math.abs(y - 16);
  if (dx > 3 || dy > 13) return [0, 0, 0, 0];
  return [254, 240, 138, 255];
});

// fx_20 to fx_23: Explosions (small to large: 64, 96, 128, 160)
const expSizes = [64, 96, 128, 160];
expSizes.forEach((sz, idx) => {
  const num = 20 + idx;
  const half = sz / 2;
  savePng(`/assets/fx/fx_${num}.png`, sz, sz, (x, y) => {
    const d = Math.sqrt((x - half) ** 2 + (y - half) ** 2);
    if (d > half * 0.9) return [0, 0, 0, 0];
    const norm = d / (half * 0.9);
    if (norm < 0.25) return [255, 255, 255, 255];
    if (norm < 0.55) return [251, 146, 60, 240];
    return [239, 68, 68, Math.floor((1 - norm) * 255)];
  });
});

// fx_24 to fx_25: Smoke / dust puffs (64x64)
for (let sm = 24; sm <= 25; sm++) {
  savePng(`/assets/fx/fx_${sm}.png`, 64, 64, (x, y) => {
    const d = Math.sqrt((x - 32) ** 2 + (y - 32) ** 2);
    if (d > 30) return [0, 0, 0, 0];
    const alpha = Math.floor(Math.max(0, 1 - d / 30) * (sm === 24 ? 160 : 120));
    return [113, 113, 122, alpha];
  });
}

// Write the complete manifest.json with all generated sprites!
fs.writeFileSync(
  path.join(assetsDir, 'manifest.json'),
  JSON.stringify({ sprites: manifestList }, null, 2)
);

console.log(`Generated ${manifestList.length} assets and wrote manifest.json successfully!`);
