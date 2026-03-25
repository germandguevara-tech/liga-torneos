// Genera icon-192.png e icon-512.png con fondo verde llenando el cuadrado completo
// El logo circular queda centrado dentro de la safe zone (80% del área)
// Así el OS puede recortar en círculo, cuadrado redondeado, etc. sin bordes negros

import sharp from "sharp";
import { readFileSync } from "fs";

const GREEN = { r: 26, g: 58, b: 42, alpha: 1 }; // #1a3a2a

async function generarIcono(logoPath, outputPath, size) {
  // Porcentaje del logo respecto al cuadrado (dentro de la safe zone)
  const logoSize = Math.round(size * 0.82);
  const offset   = Math.round((size - logoSize) / 2);

  // Fondo verde sólido cuadrado
  const fondo = await sharp({
    create: { width: size, height: size, channels: 4, background: GREEN },
  }).png().toBuffer();

  // Logo redimensionado al tamaño objetivo
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: "cover", position: "centre" })
    .toBuffer();

  // Componer logo centrado sobre el fondo verde
  await sharp(fondo)
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(outputPath);

  console.log(`✓ ${outputPath} (${size}x${size}px, logo ${logoSize}px)`);
}

const LOGO = "public/logo lifhur.jpeg";

await generarIcono(LOGO, "public/icon-192.png", 192);
await generarIcono(LOGO, "public/icon-512.png", 512);

console.log("Íconos generados correctamente.");
