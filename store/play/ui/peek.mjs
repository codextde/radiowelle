import { connect, text } from './pw.mjs';
const { browser, page } = await connect();
if (process.argv[2]) { await page.goto(process.argv[2]); await page.waitForTimeout(4000); }
console.log(page.url());
console.log((await text(page)).slice(0, Number(process.argv[3] ?? 4000)));
await browser.close().catch(() => {});
