import { connect, BASE } from './pw.mjs';
const { browser, page } = await connect();
await page.goto(BASE + '/app-content/overview');
await page.waitForFunction(() => document.body.innerText.includes('Abgeschlossen') || document.body.innerText.includes('Erklärung beginnen'), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
const t = await page.evaluate(() => document.body.innerText);
const i = t.indexOf('Überprüfungen erforderlich');
console.log(t.slice(i, i + 3000).split('\n').filter((l) => !/Warum dies|Alle Entwickler|Weitere Informationen/.test(l)).join('\n'));
await browser.close().catch(() => {});
