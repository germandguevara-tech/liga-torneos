import sharp from 'sharp';
import { readdirSync } from 'fs';

// Buscar el logo en la carpeta public
const files = readdirSync('public');
const logo = files.find(f => {
  const l = f.toLowerCase();
  return (l.endsWith('.jpeg') || l.endsWith('.jpg') || l.endsWith('.png'))
    && !l.startsWith('icon-');
});

if (!logo) {
  console.error('No se encontró ninguna imagen (jpeg/jpg/png) en public/');
  process.exit(1);
}

const src = `public/${logo}`;
console.log(`Usando: ${src}`);

await sharp(src).resize(192, 192, { fit: 'cover' }).png().toFile('public/icon-192.png');
console.log('✓ public/icon-192.png');

await sharp(src).resize(512, 512, { fit: 'cover' }).png().toFile('public/icon-512.png');
console.log('✓ public/icon-512.png');
