// Derives the web assets (favicon, mark, wordmark) from the source art in
// `brand/postwren - logo`. The PNGs there are flattened onto white with a baked
// drop shadow; this script rebuilds an alpha channel from colour saturation so
// the marks sit on any background, crops the empty margin, and resizes.
//
// Run with `pnpm brand:assets` after replacing the source art.
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SOURCE_DIR = 'brand/postwren - logo';
const OUT_DIR = 'packages/webapp/public';
const BRAND = '#1e817c';

function decodePng(buffer) {
   let pos = 8;
   let width = 0;
   let height = 0;
   let channels = 0;
   const idat = [];
   while (pos < buffer.length) {
      const length = buffer.readUInt32BE(pos);
      const type = buffer.toString('ascii', pos + 4, pos + 8);
      const data = buffer.subarray(pos + 8, pos + 8 + length);
      if (type === 'IHDR') {
         width = data.readUInt32BE(0);
         height = data.readUInt32BE(4);
         if (data[8] !== 8) throw new Error('expected an 8-bit PNG');
         if (data[12] !== 0) throw new Error('expected a non-interlaced PNG');
         channels = data[9] === 2 ? 3 : data[9] === 6 ? 4 : 0;
         if (channels === 0) throw new Error(`unsupported colour type ${data[9]}`);
      } else if (type === 'IDAT') {
         idat.push(data);
      } else if (type === 'IEND') {
         break;
      }
      pos += 12 + length;
   }

   const raw = inflateSync(Buffer.concat(idat));
   const stride = width * channels;
   const out = Buffer.alloc(height * stride);
   let src = 0;
   for (let y = 0; y < height; y++) {
      const filter = raw[src++];
      const row = raw.subarray(src, src + stride);
      src += stride;
      const cur = out.subarray(y * stride, (y + 1) * stride);
      const prev = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
      for (let x = 0; x < stride; x++) {
         const a = x >= channels ? cur[x - channels] : 0;
         const b = prev === null ? 0 : prev[x];
         const c = prev === null || x < channels ? 0 : prev[x - channels];
         let v = row[x];
         if (filter === 1) v += a;
         else if (filter === 2) v += b;
         else if (filter === 3) v += (a + b) >> 1;
         else if (filter === 4) {
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
         } else if (filter !== 0) throw new Error(`unsupported filter ${filter}`);
         cur[x] = v & 0xff;
      }
   }
   return { width, height, channels, data: out };
}

const CRC_TABLE = (() => {
   const table = new Int32Array(256);
   for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
   }
   return table;
})();

function crc32(buffer) {
   let c = 0xffffffff;
   for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
   return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
   const length = Buffer.alloc(4);
   length.writeUInt32BE(data.length);
   const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
   const crc = Buffer.alloc(4);
   crc.writeUInt32BE(crc32(body));
   return Buffer.concat([length, body, crc]);
}

/** Encodes straight (non-premultiplied) 8-bit RGBA pixels. */
function encodePng(width, height, rgba) {
   const stride = width * 4;
   const raw = Buffer.alloc(height * (stride + 1));
   for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = 0;
      rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
   }
   const ihdr = Buffer.alloc(13);
   ihdr.writeUInt32BE(width, 0);
   ihdr.writeUInt32BE(height, 4);
   ihdr[8] = 8;
   ihdr[9] = 6;
   return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
   ]);
}

const brandRgb = [1, 3, 5].map((offset) => parseInt(BRAND.slice(offset, offset + 2), 16));

/**
 * Flattens the source art to brand-coloured pixels plus a coverage alpha, then
 * crops the empty margin. Saturation is the coverage signal: the teal glyph has
 * chroma, the neutral grey drop shadow does not, so the shadow disappears.
 */
function loadMark(name) {
   const { width, height, channels, data } = decodePng(readFileSync(`${SOURCE_DIR}/${name}.png`));
   const alpha = new Uint8ClampedArray(width * height);
   let minX = width;
   let minY = height;
   let maxX = -1;
   let maxY = -1;

   for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
         const i = (y * width + x) * channels;
         const chroma =
            Math.max(data[i], data[i + 1], data[i + 2]) -
            Math.min(data[i], data[i + 1], data[i + 2]);
         const coverage = Math.min(1, chroma / 100);
         const a = Math.round(coverage * 255);
         alpha[y * width + x] = a;
         if (a > 4) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
         }
      }
   }

   const cropWidth = maxX - minX + 1;
   const cropHeight = maxY - minY + 1;
   const out = new Uint8ClampedArray(cropWidth * cropHeight * 4);
   for (let y = 0; y < cropHeight; y++) {
      for (let x = 0; x < cropWidth; x++) {
         const target = (y * cropWidth + x) * 4;
         out[target] = brandRgb[0];
         out[target + 1] = brandRgb[1];
         out[target + 2] = brandRgb[2];
         out[target + 3] = alpha[(y + minY) * width + (x + minX)];
      }
   }
   return { width: cropWidth, height: cropHeight, data: out };
}

function weights(sourceLength, targetLength) {
   const spans = [];
   const scale = sourceLength / targetLength;
   for (let i = 0; i < targetLength; i++) {
      const start = i * scale;
      const end = (i + 1) * scale;
      const span = [];
      for (let s = Math.floor(start); s < Math.min(sourceLength, Math.ceil(end)); s++) {
         const overlap = Math.min(end, s + 1) - Math.max(start, s);
         if (overlap > 0) span.push([s, overlap / scale]);
      }
      spans.push(span);
   }
   return spans;
}

/** Area-average resample; colour is uniform so only alpha needs weighting. */
function resize(image, targetWidth, targetHeight) {
   const { width, height, data } = image;
   const horizontal = new Float32Array(targetWidth * height);
   const xSpans = weights(width, targetWidth);
   for (let y = 0; y < height; y++) {
      for (let x = 0; x < targetWidth; x++) {
         let sum = 0;
         for (const [sx, w] of xSpans[x]) sum += (data[(y * width + sx) * 4 + 3] / 255) * w;
         horizontal[y * targetWidth + x] = sum;
      }
   }

   const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
   const ySpans = weights(height, targetHeight);
   for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
         let sum = 0;
         for (const [sy, w] of ySpans[y]) sum += horizontal[sy * targetWidth + x] * w;
         const target = (y * targetWidth + x) * 4;
         out[target] = brandRgb[0];
         out[target + 1] = brandRgb[1];
         out[target + 2] = brandRgb[2];
         out[target + 3] = Math.round(Math.min(1, sum) * 255);
      }
   }
   return { width: targetWidth, height: targetHeight, data: out };
}

/** Places the mark inside a square tile, optionally over a background colour. */
function square(image, size, background = null, fill = 0.94) {
   const out = new Uint8ClampedArray(size * size * 4);
   if (background !== null) {
      for (let i = 0; i < size * size; i++) {
         out[i * 4] = background[0];
         out[i * 4 + 1] = background[1];
         out[i * 4 + 2] = background[2];
         out[i * 4 + 3] = 255;
      }
   }

   const scale = Math.min((size * fill) / image.width, (size * fill) / image.height);
   const width = Math.max(1, Math.round(image.width * scale));
   const height = Math.max(1, Math.round(image.height * scale));
   const scaled = resize(image, width, height);
   const offsetX = Math.round((size - width) / 2);
   const offsetY = Math.round((size - height) / 2);

   for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
         const source = (y * width + x) * 4;
         const target = ((y + offsetY) * size + (x + offsetX)) * 4;
         const a = scaled.data[source + 3] / 255;
         const under = background === null ? [0, 0, 0] : out.slice(target, target + 3);
         out[target] = Math.round(brandRgb[0] * a + under[0] * (1 - a));
         out[target + 1] = Math.round(brandRgb[1] * a + under[1] * (1 - a));
         out[target + 2] = Math.round(brandRgb[2] * a + under[2] * (1 - a));
         out[target + 3] = background === null ? scaled.data[source + 3] : 255;
      }
   }
   return { width: size, height: size, data: out };
}

function encodeIco(images) {
   const header = Buffer.alloc(6 + images.length * 16);
   header.writeUInt16LE(0, 0);
   header.writeUInt16LE(1, 2);
   header.writeUInt16LE(images.length, 4);
   let offset = header.length;
   images.forEach((image, index) => {
      const entry = 6 + index * 16;
      header[entry] = image.width >= 256 ? 0 : image.width;
      header[entry + 1] = image.height >= 256 ? 0 : image.height;
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(image.png.length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += image.png.length;
   });
   return Buffer.concat([header, ...images.map((image) => image.png)]);
}

function write(path, buffer) {
   mkdirSync(dirname(path), { recursive: true });
   writeFileSync(path, buffer);
   console.log(`wrote ${path} (${(buffer.length / 1024).toFixed(1)} kB)`);
}

const mark = loadMark('icon-only');
const wordmark = loadMark('default-long');

const markAsset = resize(mark, Math.round((mark.width / mark.height) * 120), 120);
const wordmarkAsset = resize(wordmark, Math.round((wordmark.width / wordmark.height) * 120), 120);

write(
   `${OUT_DIR}/brand/postwren-mark.png`,
   encodePng(markAsset.width, markAsset.height, Buffer.from(markAsset.data.buffer)),
);
write(
   `${OUT_DIR}/brand/postwren-wordmark.png`,
   encodePng(wordmarkAsset.width, wordmarkAsset.height, Buffer.from(wordmarkAsset.data.buffer)),
);

const faviconSizes = [16, 32, 48].map((size) => {
   const tile = square(mark, size);
   return { width: size, height: size, png: encodePng(size, size, Buffer.from(tile.data.buffer)) };
});
write(`${OUT_DIR}/favicon.ico`, encodeIco(faviconSizes));
write(`${OUT_DIR}/favicon-32.png`, faviconSizes[1].png);

const touch = square(mark, 180, [0xf6, 0xf4, 0xef]);
write(`${OUT_DIR}/apple-touch-icon.png`, encodePng(180, 180, Buffer.from(touch.data.buffer)));
