// Renders the Target Hunter logo set: app icon (PNG, used for the .exe) + standalone SVGs.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const BLUE = '#386ff1';
const ORANGE = '#ff922f';
const mark = (color = BLUE) => `
  <path d="M46.1 18.24A32 32 0 1 0 81.82 53.34" stroke="${color}" stroke-width="17" fill="none"/>
  <path d="M56.65 18.7A32 32 0 0 1 81.69 45.55" stroke="${color === BLUE ? ORANGE : color}" stroke-width="17" fill="none"/>
  <circle cx="50" cy="50" r="11.5" fill="${color}"/>`;

const svg = (body, w = 100, h = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 8}" height="${h * 8}">${body}</svg>`;

const word = (x, y, size, dark) =>
  `<text xml:space="preserve" x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${size}" letter-spacing="-1">` +
  `<tspan fill="${dark}">Target </tspan><tspan fill="${BLUE}">Hunter</tspan></text>`;

const files = {
  'logo/mark.svg': svg(mark()),
  'logo/icon-light.svg': svg(`<rect width="100" height="100" rx="22" fill="#fff"/><g transform="translate(2 2) scale(.96)">${mark()}</g>`),
  'logo/icon-dark.svg': svg(`<rect width="100" height="100" rx="22" fill="#0b1220"/><g transform="translate(2 2) scale(.96)">${mark()}</g>`),
  'logo/logo-horizontal.svg': svg(`${mark()}${word(104, 68, 50, '#17243b')}`, 440, 100),
};

mkdirSync('logo', { recursive: true });
for (const [path, content] of Object.entries(files)) writeFileSync(path, content);

await sharp(Buffer.from(files['logo/icon-light.svg'])).resize(512, 512).png().toFile('electron/icon.png');
// README banner: baked-in white rounded card so the logo stays readable on GitHub's dark theme
const banner = svg(`<rect width="500" height="150" rx="26" fill="#fff"/><g transform="translate(30 25)">${mark()}${word(104, 68, 50, '#17243b')}</g>`, 500, 150);
await sharp(Buffer.from(banner)).resize(1500).png().toFile('logo/logo-horizontal.png');
console.log('icons written');
