/** Generates PWA icons from the brand SVG (PWA-001). Run: npm run gen:icons */
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";

const svg = readFileSync("src/assets/brand/logo.svg");
mkdirSync("public/icons", { recursive: true });

async function main() {
  for (const size of [192, 512]) {
    await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
  }
  // Maskable: logo scaled into the 80% safe zone on a solid background.
  const inner = await sharp(svg).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0b0d12" } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile("public/icons/maskable-512.png");
  await sharp(svg).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
  await sharp(svg).resize(32, 32).png().toFile("public/icons/favicon-32.png");
  console.log("icons generated");
}
void main();
