import { connect, BASE } from './pw.mjs';
const { browser, page } = await connect();
const out = [];
for (let i = 0; i < 10; i++) {
  await page.goto(BASE + '/app-content/overview');
  await page.waitForTimeout(3500);
  const buttons = page.getByText('Erklärung beginnen');
  const count = await buttons.count();
  if (i >= count) break;
  await buttons.nth(i).click();
  await page.waitForTimeout(2500);
  const h = await page.evaluate(() => document.querySelector('h1, h2')?.innerText ?? '');
  out.push(`${i} ${page.url().replace(BASE, '')} ${h}`);
}
console.log(out.join('\n'));
await browser.close().catch(() => {});
