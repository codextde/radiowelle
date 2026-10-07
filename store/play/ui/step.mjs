import { connect, BASE, text } from './pw.mjs';
const [path, ...actions] = process.argv.slice(2);
const { browser, page } = await connect();
if (path && path !== '-') {
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}
for (const action of actions) {
  const [kind, ...rest] = action.split(':');
  const arg = rest.join(':');
  try {
    if (kind === 'click') await page.getByText(arg, { exact: true }).first().click({ timeout: 8000 });
    else if (kind === 'clickc') await page.getByText(arg).first().click({ timeout: 8000 });
    else if (kind === 'radio') await page.locator('material-radio', { hasText: arg }).first().click({ timeout: 8000 });
    else if (kind === 'radionth') {
      const [label, n] = arg.split('#');
      await page.locator('material-radio').filter({ hasText: new RegExp('^\\s*' + label + '\\s*$') }).nth(Number(n)).click({ timeout: 8000 });
    } else if (kind === 'checkx') {
      const cb = page.locator('material-checkbox').filter({ hasText: new RegExp('^\\s*' + arg + '\\s*$') }).first();
      if ((await cb.getAttribute('aria-checked')) !== 'true') await cb.click({ timeout: 8000 });
    }
    else if (kind === 'check') {
      const cb = page.locator('material-checkbox', { hasText: arg }).first();
      const checked = await cb.getAttribute('aria-checked');
      if (checked !== 'true') await cb.click({ timeout: 8000 });
    } else if (kind === 'uncheck') {
      const cb = page.locator('material-checkbox', { hasText: arg }).first();
      if ((await cb.getAttribute('aria-checked')) === 'true') await cb.click({ timeout: 8000 });
    } else if (kind === 'button') await page.getByRole('button', { name: arg, exact: true }).first().click({ timeout: 8000 });
    else if (kind === 'fill') {
      const [label, value] = arg.split('=>');
      await page.getByLabel(label).first().fill(value, { timeout: 8000 });
    } else if (kind === 'fillsel') {
      const [sel, value] = arg.split('=>');
      await page.locator(sel).first().fill(value, { timeout: 8000 });
    } else if (kind === 'wait') await page.waitForTimeout(Number(arg));
    console.log('OK', action);
  } catch (e) {
    console.log('FAIL', action, String(e).split('\n')[0]);
  }
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1500);
const t = await text(page);
const start = t.indexOf(process.env.FROM ?? 'App-Inhalte\n');
console.log('-----', page.url());
console.log(t.slice(Math.max(0, start), Math.max(0, start) + Number(process.env.LEN ?? 3000)));
await browser.close().catch(() => {});
