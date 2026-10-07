import { connect, BASE } from './pw.mjs';
const { browser, page } = await connect();
await page.goto(BASE + (process.argv[2] ?? '/app-content/overview'));
await page.waitForTimeout(4000);
const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => `${a.innerText.trim().replace(/\s+/g, ' ').slice(0, 60)} | ${a.getAttribute('href')}`).filter((s) => s.includes('app-content') || s.includes('store') || s.includes('tracks') || s.includes('release')));
console.log([...new Set(links)].join('\n'));
await browser.close().catch(() => {});
