import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

// CRC32 para el formato PNG
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
}

function createIcon(size) {
  const px = Buffer.alloc(size * size * 4);

  // Fondo: #1a3a2a
  for (let i = 0; i < size * size; i++) {
    px[i*4]   = 26;  // R
    px[i*4+1] = 58;  // G
    px[i*4+2] = 42;  // B
    px[i*4+3] = 255; // A
  }

  // Esquinas redondeadas (~18% radio)
  const r = Math.round(size * 0.18);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x < r ? r - x : x >= size - r ? x - (size - r - 1) : 0;
      const cy = y < r ? r - y : y >= size - r ? y - (size - r - 1) : 0;
      if (cx > 0 && cy > 0 && cx*cx + cy*cy > r*r) {
        px[(y*size + x)*4 + 3] = 0;
      }
    }
  }

  // Dibuja un rectángulo con color #4ade80
  function rect(x, y, w, h) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const i = (ny*size + nx)*4;
          px[i] = 74; px[i+1] = 222; px[i+2] = 128; px[i+3] = 255;
        }
      }
    }
  }

  const sc = size / 192;
  const lh = 100 * sc;   // alto de letra
  const st = 15 * sc;    // grosor de trazo
  const lw = 38 * sc;    // ancho de letra
  const gap = 18 * sc;   // espacio entre letras
  const ox = (size - (lw * 2 + gap)) / 2;  // origen X
  const oy = (size - lh) / 2;              // origen Y

  // Letra "L"
  rect(ox, oy, st, lh);                  // trazo vertical
  rect(ox, oy + lh - st, lw, st);        // trazo horizontal inferior

  // Letra "H"
  const hx = ox + lw + gap;
  rect(hx, oy, st, lh);                  // trazo izquierdo
  rect(hx + lw - st, oy, st, lh);        // trazo derecho
  rect(hx, oy + (lh - st) / 2, lw, st); // trazo del medio

  // Construir PNG (RGBA, 8 bits)
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]));
    rows.push(px.slice(y*size*4, (y+1)*size*4));
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = pngChunk('IHDR', Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])]));
  const idat = pngChunk('IDAT', deflateSync(Buffer.concat(rows)));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', createIcon(192));
writeFileSync('public/icon-512.png', createIcon(512));
console.log('✓ public/icon-192.png');
console.log('✓ public/icon-512.png');
