import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const glyph = readFileSync(new URL('./glyph.svg', import.meta.url), 'utf8');
const glyphData = 'data:image/svg+xml;base64,' + Buffer.from(glyph).toString('base64');
const out = new URL('../assets/images/', import.meta.url).pathname;
const store = new URL('../store/', import.meta.url).pathname;
mkdirSync(store, { recursive: true });

const bg = `radial-gradient(120% 90% at 30% 15%, #FF7A4A 0%, #FF5530 45%, #E63B1B 100%)`;

const pages = [
  { file: out + 'icon.png', size: 1024, html: `<div style="width:1024px;height:1024px;background:${bg};display:flex;align-items:center;justify-content:center"><img src="${glyphData}" style="width:${1024 * 0.78}px"/></div>` },
  { file: out + 'android-icon-background.png', size: 1024, html: `<div style="width:1024px;height:1024px;background:${bg}"></div>` },
  { file: out + 'android-icon-foreground.png', size: 1024, transparent: true, html: `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><img src="${glyphData}" style="width:${1024 * 0.56}px"/></div>` },
  { file: out + 'android-icon-monochrome.png', size: 1024, transparent: true, html: `<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><img src="${glyphData}" style="width:${1024 * 0.56}px"/></div>` },
  { file: out + 'splash-icon.png', size: 512, transparent: true, html: `<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center"><div style="width:512px;height:512px;border-radius:115px;background:${bg};display:flex;align-items:center;justify-content:center"><img src="${glyphData}" style="width:${512 * 0.78}px"/></div></div>` },
  { file: out + 'favicon.png', size: 192, html: `<div style="width:192px;height:192px;background:${bg};display:flex;align-items:center;justify-content:center"><img src="${glyphData}" style="width:${192 * 0.78}px"/></div>` },
  { file: store + 'icon-512.png', size: 512, html: `<div style="width:512px;height:512px;background:${bg};display:flex;align-items:center;justify-content:center"><img src="${glyphData}" style="width:${512 * 0.78}px"/></div>` },
];

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
for (const p of pages) {
  const page = await browser.newPage({ viewport: { width: p.size, height: p.size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${p.html}</body></html>`);
  await page.waitForTimeout(100);
  const buf = await page.screenshot({ omitBackground: !!p.transparent, clip: { x: 0, y: 0, width: p.size, height: p.size } });
  writeFileSync(p.file, buf);
  await page.close();
  console.log('wrote', p.file);
}
await browser.close();
