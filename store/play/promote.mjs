import { api } from './gplay.mjs';
const PKG = 'de.codext.radiowelle';
const [versionCode = '1', status = 'draft'] = process.argv.slice(2);
const edit = await api('POST', `/applications/${PKG}/edits`, {});
const id = edit.json.id;
const tr = await api('PUT', `/applications/${PKG}/edits/${id}/tracks/production`, {
  track: 'production',
  releases: [{ name: `1.0.0 (${versionCode})`, versionCodes: [versionCode], status, releaseNotes: [
    { language: 'de-DE', text: 'Die erste Version von Radiowelle: über 260 deutsche Sender, weltweite Suche, Songtitel live, Favoriten und Sleep-Timer.' },
    { language: 'en-US', text: 'The first version of Radiowelle: 260+ German stations, worldwide search, live song titles, favorites and a sleep timer.' },
  ] }],
});
console.log('track', tr.status, JSON.stringify(tr.json).slice(0, 300));
const commit = await api('POST', `/applications/${PKG}/edits/${id}:commit`);
console.log('commit', commit.status, JSON.stringify(commit.json).slice(0, 500));
