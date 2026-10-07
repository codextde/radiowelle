// Curation helper: preview logo candidates as a labelled contact sheet.
//   node scripts/stations/peek.mjs /tmp/out.png label=https://... label2=https://...
import { loadImage, setCacheDir } from './lib/logo.mjs';
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
setCacheDir(new URL('./.cache', import.meta.url).pathname);
const [out, ...pairs] = process.argv.slice(2);
const dir = '/tmp/peek-' + Date.now(); await mkdir(dir);
const files = [];
let i = 0;
for (const p of pairs) {
  const k = p.indexOf('=');
  const label = p.slice(0, k), url = p.slice(k + 1);
  const img = await loadImage(url);
  if (!img || img.error) { console.log(label, 'ERR', img?.error); continue; }
  const f = `${dir}/${String(i++).padStart(2,'0')}.png`;
  await writeFile(f, await sharp(img.buf).resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
  files.push(['-label', `${label} ${img.width}x${img.height}`, f]);
  console.log(label, img.width + 'x' + img.height, img.format, 'alpha=' + img.alpha, 'colors=' + img.uniqueColors);
}
execFileSync('/opt/homebrew/bin/magick', ['montage', '-font', '/System/Library/Fonts/Helvetica.ttc', ...files.flat(), '-background', '#999', '-geometry', '120x120+4+4', '-tile', '8x', out]);
