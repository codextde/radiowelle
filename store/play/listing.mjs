import fs from 'node:fs';
import path from 'node:path';
import { api } from './gplay.mjs';
const PKG = 'de.codext.radiowelle';
const root = new URL('..', import.meta.url).pathname;
const edit = await api('POST', `/applications/${PKG}/edits`, {});
const id = edit.json.id;
const log = (label, r) => console.log(label, r.status, r.status >= 300 ? JSON.stringify(r.json).slice(0, 300) : '');
log('details', await api('PUT', `/applications/${PKG}/edits/${id}/details`, {
  defaultLanguage: 'de-DE',
  contactEmail: 'kontakt@codext.de',
  contactWebsite: 'https://radiowelle.codext.de',
}));
for (const [locale, lang] of [['de-DE', 'de'], ['en-US', 'en']]) {
  const t = JSON.parse(fs.readFileSync(path.join(root, `listing/${lang}.json`), 'utf8'));
  log(`listing ${locale}`, await api('PUT', `/applications/${PKG}/edits/${id}/listings/${locale}`, {
    language: locale, title: t.title, shortDescription: t.shortDescription, fullDescription: t.fullDescription,
  }));
  for (const type of ['icon', 'featureGraphic', 'phoneScreenshots']) {
    log(`clear ${locale} ${type}`, await api('DELETE', `/applications/${PKG}/edits/${id}/listings/${locale}/${type}`));
  }
  log(`icon ${locale}`, await api('POST', `/applications/${PKG}/edits/${id}/listings/${locale}/icon?uploadType=media`, fs.readFileSync(path.join(root, 'icon-512.png')), { upload: true, contentType: 'image/png' }));
  log(`feature ${locale}`, await api('POST', `/applications/${PKG}/edits/${id}/listings/${locale}/featureGraphic?uploadType=media`, fs.readFileSync(path.join(root, `screens/play/${lang}/feature-graphic.png`)), { upload: true, contentType: 'image/png' }));
  const dir = path.join(root, `screens/play/${lang}`);
  for (const f of fs.readdirSync(dir).filter((f) => /^\d\d-/.test(f)).sort()) {
    log(`shot ${locale} ${f}`, await api('POST', `/applications/${PKG}/edits/${id}/listings/${locale}/phoneScreenshots?uploadType=media`, fs.readFileSync(path.join(dir, f)), { upload: true, contentType: 'image/png' }));
  }
}
log('commit', await api('POST', `/applications/${PKG}/edits/${id}:commit`));
