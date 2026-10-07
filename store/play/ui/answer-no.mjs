import { connect } from './pw.mjs';
const { browser, page } = await connect();
for (let round = 0; round < 40; round++) {
  const target = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type=radio]')];
    const groups = new Map();
    for (const input of inputs) {
      const name = input.getAttribute('name');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(input);
    }
    for (const [name, list] of groups) {
      if (list.some((i) => i.getAttribute('aria-checked') === 'true')) continue;
      const no = list.find((i) => (i.closest('material-radio')?.innerText ?? '').trim() === 'Nein');
      if (!no) return { skip: name, labels: list.map((i) => i.closest('material-radio')?.innerText.trim()) };
      no.setAttribute('data-rw-target', '1');
      let el = no.closest('material-radio');
      let question = '';
      for (let p = el; p && !question; p = p.parentElement) {
        const txt = p.innerText.trim();
        if (txt.length > 20) question = txt.split('\n')[0];
      }
      return { name, question };
    }
    return null;
  });
  if (!target) break;
  if (target.skip) { console.log('SKIP group', target.labels); break; }
  await page.locator('[data-rw-target="1"]').first().click({ force: true });
  await page.evaluate(() => document.querySelector('[data-rw-target="1"]')?.removeAttribute('data-rw-target'));
  console.log('Nein:', target.question.slice(0, 110));
  await page.waitForTimeout(900);
}
await browser.close().catch(() => {});
