import { chromium } from 'playwright-core';
import fs from 'node:fs';

const glyph = fs.readFileSync(new URL('../../design/glyph.svg', import.meta.url), 'utf8');
const glyphData = 'data:image/svg+xml;base64,' + Buffer.from(glyph).toString('base64');
const img = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const copy = {
  de: [
    ['01-player', 'Radio hören.', 'Ohne Werbung in der App.', '#FF5530'],
    ['02-home', 'Alle großen Sender', 'schon drin. Über 260 aus ganz Deutschland.', '#15141A'],
    ['03-search', 'Die ganze Welt.', 'Zehntausende Sender nach Genre, Stadt und Land.', '#2F5D8C'],
    ['04-library', 'Deine Favoriten.', 'Sortieren, durchschalten, wiederfinden.', '#1F9D5C'],
    ['06-sleep', 'Sanft einschlafen.', 'Der Sleep-Timer blendet die Musik leise aus.', '#6C5CE7'],
  ],
  en: [
    ['01-player', 'Just radio.', 'No ads in the app. No account.', '#FF5530'],
    ['02-home', 'Every big station', 'built in. 260+ stations from all over Germany.', '#15141A'],
    ['03-search', 'The whole world.', 'Tens of thousands of stations by genre, city and country.', '#2F5D8C'],
    ['04-library', 'Your favorites.', 'Reorder, skip through, come back anytime.', '#1F9D5C'],
    ['06-sleep', 'Fall asleep gently.', 'The sleep timer fades the music out.', '#6C5CE7'],
  ],
};

function page(w, h, shot, title, sub, bg) {
  const shotW = Math.round(w * 0.78);
  const shotH = Math.round(shotW * 2868 / 1320);
  const radius = Math.round(shotW * 0.12);
  const titleSize = Math.round(w * 0.085);
  const subSize = Math.round(w * 0.04);
  const top = Math.round(h * 0.06);
  return `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg};font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif;">
  <div style="position:absolute;inset:0;background:radial-gradient(120% 60% at 20% 0%, rgba(255,255,255,0.18), rgba(255,255,255,0) 60%)"></div>
  <div style="position:absolute;top:${top}px;left:0;right:0;text-align:center;color:#fff;padding:0 ${Math.round(w * 0.07)}px">
    <div style="font-size:${titleSize}px;font-weight:800;letter-spacing:-0.03em;line-height:1.05">${title}</div>
    <div style="font-size:${subSize}px;font-weight:500;opacity:0.85;margin-top:${Math.round(subSize * 0.5)}px;line-height:1.25">${sub}</div>
  </div>
  <div style="position:absolute;left:50%;transform:translateX(-50%);top:${Math.round(top + titleSize * 1.15 + subSize * 2.9 + h * 0.03)}px;width:${shotW}px;height:${shotH}px;border-radius:${radius}px;overflow:hidden;box-shadow:0 ${Math.round(w * 0.03)}px ${Math.round(w * 0.08)}px rgba(0,0,0,0.35);border:${Math.max(6, Math.round(w * 0.012))}px solid #0E0D12;background:#0E0D12">
    <img src="${img(shot)}" style="width:100%;height:100%;display:block;border-radius:${Math.round(radius * 0.9)}px"/>
  </div>
  </body></html>`;
}

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' });
for (const lang of ['de', 'en']) {
  for (const [i, [name, title, sub, bg]] of copy[lang].entries()) {
    const shot = `raw/ios-${lang}/${name}.png`;
    for (const [target, w, h] of [['appstore', 1320, 2868], ['play', 1080, 1920]]) {
      const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await p.setContent(page(w, h, shot, title, sub, bg));
      await p.waitForTimeout(150);
      fs.writeFileSync(`${target}/${lang}/${String(i + 1).padStart(2, '0')}-${name}.png`, await p.screenshot({ type: 'png' }));
      await p.close();
    }
  }
}
for (const lang of ['de', 'en']) {
  const head = lang === 'de' ? 'Radio ohne Werbung in der App' : 'Radio with no ads in the app';
  const sub = lang === 'de' ? 'Über 260 deutsche Sender und die ganze Welt. Kostenlos.' : '260+ German stations and the whole world. Free.';
  const p = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(120% 120% at 15% 10%, #FF7A4A 0%, #FF5530 45%, #E63B1B 100%);font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif;color:#fff;display:flex;align-items:center;gap:48px;padding:0 70px;box-sizing:border-box">
  <div style="width:200px;height:200px;border-radius:46px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;flex:none"><img src="${glyphData}" style="width:170px"/></div>
  <div><div style="font-size:30px;font-weight:700;opacity:0.85">Radiowelle</div><div style="font-size:54px;font-weight:850;letter-spacing:-0.03em;line-height:1.02;margin-top:6px">${head}</div><div style="font-size:24px;font-weight:500;opacity:0.85;margin-top:16px">${sub}</div></div>
  </body></html>`);
  fs.writeFileSync(`play/${lang}/feature-graphic.png`, await p.screenshot({ type: 'png' }));
  await p.close();
}
await browser.close();
console.log('done');
